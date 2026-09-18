import { NextRequest, NextResponse } from 'next/server';
import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';
import {
  enrichVesselFromAisAutofill,
  findCanonicalVessel,
  insertVesselRaceSafe,
  normalizeImo,
  normalizeMmsi,
} from '@/lib/vessels/find-existing-vessel';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const autofill = body.autofill as VesselRegistrationAutofill | undefined;
    const existingId =
      typeof body.existingVesselId === 'string' ? body.existingVesselId : null;

    if (!autofill?.name?.trim()) {
      return NextResponse.json({ error: 'Vessel autofill data is required.' }, { status: 400 });
    }

    if (existingId) {
      const { data: byId } = await supabaseAdmin
        .from('vessels')
        .select('id, name, type, imo, mmsi')
        .eq('id', existingId)
        .maybeSingle();

      if (byId) {
        await enrichVesselFromAisAutofill(supabaseAdmin, byId.id, autofill);
        return NextResponse.json({
          vesselId: byId.id,
          vesselName: byId.name,
          created: false,
          linkedExisting: true,
        });
      }
    }

    const canonical = await findCanonicalVessel(supabaseAdmin, {
      mmsi: autofill.mmsi,
      imo: autofill.officialNumber,
      name: autofill.name,
      allowNameMatch: !(normalizeMmsi(autofill.mmsi) || normalizeImo(autofill.officialNumber)),
    });

    if (canonical.status === 'conflict') {
      console.warn('[RESOLVE FROM AIS] identity conflict', canonical.conflict.message);
      return NextResponse.json(
        {
          error: 'Vessel identity conflict',
          message: canonical.conflict.message,
        },
        { status: 409 },
      );
    }

    if (canonical.status === 'found') {
      await enrichVesselFromAisAutofill(supabaseAdmin, canonical.vessel.id, autofill);
      return NextResponse.json({
        vesselId: canonical.vessel.id,
        vesselName: canonical.vessel.name,
        created: false,
        linkedExisting: true,
      });
    }

    const normalizedMmsi = normalizeMmsi(autofill.mmsi);
    const normalizedImo = normalizeImo(autofill.officialNumber);

    const insertData: Record<string, unknown> = {
      name: autofill.name.trim(),
      type: autofill.type,
      imo: normalizedImo,
      mmsi: normalizedMmsi,
      is_official: false,
    };

    if (autofill.call_sign) insertData.call_sign = autofill.call_sign;
    if (autofill.flag) insertData.flag = autofill.flag.toUpperCase();
    if (autofill.length_m != null) insertData.length_m = autofill.length_m;
    if (autofill.beam != null) insertData.beam = autofill.beam;
    if (autofill.draft != null) insertData.draft = autofill.draft;
    if (autofill.gross_tonnage != null) insertData.gross_tonnage = autofill.gross_tonnage;
    if (autofill.build_year != null) insertData.build_year = autofill.build_year;

    const inserted = await insertVesselRaceSafe(
      supabaseAdmin,
      insertData,
      'id, name, type, imo, mmsi',
    );

    if (!inserted.ok) {
      console.error('[RESOLVE FROM AIS] Insert error:', inserted.error);
      return NextResponse.json(
        {
          error: inserted.conflict ? 'Vessel identity conflict' : 'Failed to create vessel',
          message: inserted.error,
        },
        { status: inserted.conflict ? 409 : 500 },
      );
    }

    return NextResponse.json({
      vesselId: inserted.vessel.id,
      vesselName: inserted.vessel.name,
      created: inserted.created,
      linkedExisting: !inserted.created,
    });
  } catch (error) {
    console.error('[RESOLVE FROM AIS] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
