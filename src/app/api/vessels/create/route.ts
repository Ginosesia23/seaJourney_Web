import { NextRequest, NextResponse } from 'next/server';
import {
  findCanonicalVessel,
  insertVesselRaceSafe,
  normalizeImo,
  normalizeMmsi,
} from '@/lib/vessels/find-existing-vessel';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      type,
      officialNumber,
      isOfficial,
      vesselManagerId,
      mmsi,
      call_sign,
      flag,
      length_m,
      beam,
      draft,
      gross_tonnage,
      build_year,
    } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: name and type' },
        { status: 400 },
      );
    }

    const trimmedName = name.trim();
    const normalizedMmsi = normalizeMmsi(mmsi);
    const normalizedImo = normalizeImo(officialNumber);

    const canonical = await findCanonicalVessel(supabaseAdmin, {
      mmsi: normalizedMmsi,
      imo: normalizedImo,
      name: trimmedName,
      allowNameMatch: !(normalizedMmsi || normalizedImo),
    });

    if (canonical.status === 'conflict') {
      console.warn('[CREATE VESSEL API] identity conflict', canonical.conflict.message);
      return NextResponse.json(
        {
          error: 'Vessel identity conflict',
          message: canonical.conflict.message,
        },
        { status: 409 },
      );
    }

    if (canonical.status === 'found') {
      return respondWithExistingVessel(
        canonical.vessel,
        isOfficial,
        vesselManagerId,
      );
    }

    const isOfficialValue = isOfficial === true;
    const insertData: Record<string, unknown> = {
      name: trimmedName,
      type,
      imo: normalizedImo,
      mmsi: normalizedMmsi,
    };

    if (call_sign !== undefined) insertData.call_sign = call_sign?.trim() || null;
    if (flag !== undefined) insertData.flag = flag?.trim().toUpperCase() || null;
    if (length_m !== undefined && length_m !== null) insertData.length_m = length_m;
    if (beam !== undefined && beam !== null) insertData.beam = beam;
    if (draft !== undefined && draft !== null) insertData.draft = draft;
    if (gross_tonnage !== undefined && gross_tonnage !== null) {
      insertData.gross_tonnage = gross_tonnage;
    }
    if (build_year !== undefined && build_year !== null) insertData.build_year = build_year;
    if (isOfficialValue !== undefined) insertData.is_official = isOfficialValue;
    if (vesselManagerId) insertData.vessel_manager_id = vesselManagerId;

    const inserted = await insertVesselRaceSafe(
      supabaseAdmin,
      insertData,
      'id, name, type, imo, is_official, mmsi',
    );

    if (!inserted.ok) {
      console.error('[CREATE VESSEL API] Insert error:', inserted.error);
      return NextResponse.json(
        {
          error: inserted.conflict ? 'Vessel identity conflict' : 'Failed to create vessel',
          message: inserted.error,
        },
        { status: inserted.conflict ? 409 : 500 },
      );
    }

    if (!inserted.created) {
      return respondWithExistingVessel(
        inserted.vessel,
        isOfficial,
        vesselManagerId,
      );
    }

    return NextResponse.json({
      success: true,
      vessel: {
        id: inserted.vessel.id,
        name: inserted.vessel.name,
        type: inserted.vessel.type,
        officialNumber: inserted.vessel.imo,
      },
      alreadyExists: false,
      isOfficial: (inserted.vessel as { is_official?: boolean }).is_official ?? false,
    });
  } catch (error: unknown) {
    console.error('[CREATE VESSEL API] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

async function respondWithExistingVessel(
  existingVessel: {
    id: string;
    name: string;
    type: string;
    imo: string | null;
    is_official?: boolean | null;
  },
  isOfficial: boolean | undefined,
  vesselManagerId: string | undefined,
) {
  if (isOfficial === true) {
    const updateData: Record<string, unknown> = { is_official: true };
    if (vesselManagerId) {
      updateData.vessel_manager_id = vesselManagerId;
    }

    const { error: updateError } = await supabaseAdmin
      .from('vessels')
      .update(updateData)
      .eq('id', existingVessel.id);

    if (updateError) {
      console.error('[CREATE VESSEL API] Error updating is_official:', updateError);
    }
  }

  const { data: finalVessel } = await supabaseAdmin
    .from('vessels')
    .select('id, name, type, imo, is_official')
    .eq('id', existingVessel.id)
    .single();

  return NextResponse.json({
    success: true,
    vessel: {
      id: finalVessel?.id || existingVessel.id,
      name: finalVessel?.name || existingVessel.name,
      type: finalVessel?.type || existingVessel.type,
      officialNumber: finalVessel?.imo || existingVessel.imo,
    },
    alreadyExists: true,
    isOfficial: finalVessel?.is_official || false,
  });
}
