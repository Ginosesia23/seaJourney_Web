import { NextRequest, NextResponse } from 'next/server';
import { findExistingVessel, normalizeImo, normalizeMmsi } from '@/lib/vessels/find-existing-vessel';
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
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const normalizedMmsi = normalizeMmsi(mmsi);
    const normalizedImo = normalizeImo(officialNumber);

    const existingVessel = await findExistingVessel(supabaseAdmin, {
      mmsi: normalizedMmsi,
      imo: normalizedImo,
      name: trimmedName,
    });

    if (existingVessel) {
      return respondWithExistingVessel(existingVessel, isOfficial, vesselManagerId);
    }

    // Vessel doesn't exist, create it
    const isOfficialValue = isOfficial === true; // Explicitly convert to boolean
    console.log('[CREATE VESSEL API] Creating new vessel with is_official:', isOfficialValue, 'isOfficial param:', isOfficial);
    
    const insertData: Record<string, unknown> = {
      name: trimmedName,
      type: type,
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
    
    // Only set is_official if the column exists and we have a value
    if (isOfficialValue !== undefined) {
      insertData.is_official = isOfficialValue;
    }
    
    // Set vessel_manager_id if provided (when vessel role user creates the vessel)
    if (vesselManagerId) {
      insertData.vessel_manager_id = vesselManagerId;
    }
    
    const { data: newVessel, error: insertError } = await supabaseAdmin
      .from('vessels')
      .insert(insertData)
      .select('id, name, type, imo, is_official')
      .single();

    if (insertError) {
      console.error('[CREATE VESSEL API] Insert error:', insertError);
      console.error('[CREATE VESSEL API] Insert data was:', insertData);
      return NextResponse.json(
        {
          error: 'Failed to create vessel',
          message: insertError.message,
        },
        { status: 500 }
      );
    }

    console.log('[CREATE VESSEL API] Created vessel with is_official:', newVessel?.is_official);

    return NextResponse.json({
      success: true,
      vessel: {
        id: newVessel.id,
        name: newVessel.name,
        type: newVessel.type,
        officialNumber: newVessel.imo,
      },
      alreadyExists: false,
      isOfficial: newVessel.is_official,
    });
  } catch (error: any) {
    console.error('[CREATE VESSEL API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
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
    vessel_manager_id?: string | null;
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
    } else {
      console.log('[CREATE VESSEL API] Updated is_official to true for vessel:', existingVessel.id);
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

