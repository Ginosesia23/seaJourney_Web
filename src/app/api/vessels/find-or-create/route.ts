import { NextRequest, NextResponse } from 'next/server';
import {
  findCanonicalVessel,
  insertVesselRaceSafe,
  normalizeImo,
  normalizeMmsi,
} from '@/lib/vessels/find-existing-vessel';
import { toPublicVesselIdentity } from '@/lib/vessels/public-identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, type, officialNumber, isOfficial, mmsi, call_sign, flag, length_m, beam, draft, gross_tonnage, build_year } =
      body;

    if (!name?.trim() || !type) {
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
      console.warn('[FIND OR CREATE VESSEL] identity conflict', canonical.conflict.message);
      return NextResponse.json(
        {
          error: 'Vessel identity conflict',
          message: canonical.conflict.message,
          conflict: {
            kind: canonical.conflict.kind,
            mmsiVesselId: canonical.conflict.mmsiVessel.id,
            imoVesselId: canonical.conflict.imoVessel.id,
          },
        },
        { status: 409 },
      );
    }

    if (canonical.status === 'found') {
      const pub = toPublicVesselIdentity(canonical.vessel as unknown as Record<string, unknown>);
      return NextResponse.json({
        success: true,
        vessel: {
          id: pub.id,
          name: pub.name,
          type: pub.type,
          officialNumber: pub.imo,
          mmsi: pub.mmsi,
        },
        alreadyExists: true,
      });
    }

    const insertData: Record<string, unknown> = {
      name: trimmedName,
      type,
      imo: normalizedImo,
      mmsi: normalizedMmsi,
      is_official: isOfficial === true,
    };

    if (call_sign !== undefined) insertData.call_sign = call_sign?.trim() || null;
    if (flag !== undefined) insertData.flag = flag?.trim().toUpperCase() || null;
    if (length_m != null) insertData.length_m = length_m;
    if (beam != null) insertData.beam = beam;
    if (draft != null) insertData.draft = draft;
    if (gross_tonnage != null) insertData.gross_tonnage = gross_tonnage;
    if (build_year != null) insertData.build_year = build_year;

    const inserted = await insertVesselRaceSafe(supabaseAdmin, insertData);
    if (!inserted.ok) {
      console.error('[FIND OR CREATE VESSEL] Insert error:', inserted.error);
      return NextResponse.json(
        {
          error: inserted.conflict ? 'Vessel identity conflict' : 'Failed to create vessel',
          message: inserted.error,
        },
        { status: inserted.conflict ? 409 : 500 },
      );
    }

    const pub = toPublicVesselIdentity(inserted.vessel as unknown as Record<string, unknown>);
    return NextResponse.json({
      success: true,
      vessel: {
        id: pub.id,
        name: pub.name,
        type: pub.type,
        officialNumber: pub.imo,
        mmsi: pub.mmsi,
      },
      alreadyExists: !inserted.created,
    });
  } catch (error) {
    console.error('[FIND OR CREATE VESSEL] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
