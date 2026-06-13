import { NextRequest, NextResponse } from 'next/server';
import { findExistingVessel, normalizeImo, normalizeMmsi } from '@/lib/vessels/find-existing-vessel';
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

    const existing = await findExistingVessel(supabaseAdmin, {
      mmsi: normalizedMmsi,
      imo: normalizedImo,
      name: trimmedName,
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        vessel: {
          id: existing.id,
          name: existing.name,
          type: existing.type,
          officialNumber: existing.imo,
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

    const { data: newVessel, error } = await supabaseAdmin
      .from('vessels')
      .insert(insertData)
      .select('id, name, type, imo')
      .single();

    if (error) {
      console.error('[FIND OR CREATE VESSEL] Insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create vessel', message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      vessel: {
        id: newVessel.id,
        name: newVessel.name,
        type: newVessel.type,
        officialNumber: newVessel.imo,
      },
      alreadyExists: false,
    });
  } catch (error) {
    console.error('[FIND OR CREATE VESSEL] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
