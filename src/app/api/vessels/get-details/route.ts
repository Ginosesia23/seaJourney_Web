import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { VESSEL_PUBLIC_IDENTITY_SELECT } from '@/lib/vessels/public-identity';

/**
 * Public-ish vessel details for claim/select flows.
 * Does not return stamp, company contacts, or vessel_manager_id.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await req.json();
    const { vesselId } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Vessel ID is required' },
        { status: 400 },
      );
    }

    const { data: vessel, error } = await supabase
      .from('vessels_public_identity')
      .select(VESSEL_PUBLIC_IDENTITY_SELECT)
      .eq('id', vesselId)
      .single();

    if (error || !vessel) {
      console.error('[API /api/vessels/get-details] Error fetching vessel:', error);
      return NextResponse.json(
        {
          error: error?.message || 'Vessel not found',
          code: error?.code,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      vessel: {
        id: vessel.id,
        name: vessel.name,
        type: vessel.type,
        imo: vessel.imo,
        mmsi: vessel.mmsi,
        callSign: vessel.call_sign,
        flag: vessel.flag,
        lengthMeters: vessel.length_m ?? null,
        beamMeters: vessel.beam ?? null,
        grossTonnage: vessel.gross_tonnage,
        buildYear: vessel.build_year,
        isOfficial: vessel.is_official || false,
      },
    });
  } catch (error: unknown) {
    console.error('[API /api/vessels/get-details] Unexpected error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 },
    );
  }
}
