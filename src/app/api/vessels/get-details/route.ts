import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';

/**
 * API endpoint to get full vessel details by ID
 * Used to fetch complete vessel data when user selects a vessel to claim
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json();

    const { vesselId } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Vessel ID is required' },
        { status: 400 },
      );
    }

    console.log('[API /api/vessels/get-details] Fetching vessel details:', vesselId);

    const { data: vessel, error } = await supabase
      .from('vessels')
      .select('*')
      .eq('id', vesselId)
      .single();

    if (error) {
      console.error('[API /api/vessels/get-details] Error fetching vessel:', error);
      return NextResponse.json(
        {
          error: error.message || 'Vessel not found',
          code: error.code,
        },
        { status: 404 },
      );
    }

    if (!vessel) {
      return NextResponse.json(
        { error: 'Vessel not found' },
        { status: 404 },
      );
    }

    console.log('[API /api/vessels/get-details] Vessel found:', vessel.name);

    // Return vessel data in the format expected by the form
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
        lengthMeters: vessel.length_meters,
        grossTonnage: vessel.gross_tonnage,
        buildYear: vessel.build_year,
        launchYear: vessel.launch_year,
        numberOfCrew: vessel.number_of_crew,
        engineType: vessel.engine_type,
        hullMaterial: vessel.hull_material,
        classificationSociety: vessel.classification_society,
        portOfRegistry: vessel.port_of_registry,
        builderName: vessel.builder_name,
        designerName: vessel.designer_name,
        isOfficial: vessel.is_official || false,
        claimedBy: vessel.claimed_by,
      },
    });
  } catch (error: any) {
    console.error('[API /api/vessels/get-details] Unexpected error:', error);
    return NextResponse.json(
      {
        error: error.message || 'An unexpected error occurred',
      },
      { status: 500 },
    );
  }
}
