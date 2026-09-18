import { NextRequest, NextResponse } from 'next/server';
import {
  VESSEL_PUBLIC_IDENTITY_SELECT,
  toPublicVesselIdentity,
} from '@/lib/vessels/public-identity';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Vessel name search for attach/claim flows.
 * Returns public identity only — never manager emails, stamp, or company data.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { searchTerm } = body;

    if (!searchTerm || searchTerm.trim().length < 2) {
      return NextResponse.json({
        success: true,
        vessels: [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from('vessels')
      .select(`${VESSEL_PUBLIC_IDENTITY_SELECT}, vessel_manager_id`)
      .ilike('name', `%${searchTerm.trim()}%`)
      .limit(10)
      .order('name', { ascending: true });

    if (error) {
      console.error('[SEARCH VESSELS API] Error:', error);
      return NextResponse.json(
        {
          error: 'Failed to search vessels',
          message: error.message,
        },
        { status: 500 },
      );
    }

    const vessels = data || [];
    const vesselIds = vessels.map((v) => v.id as string);

    // Only expose whether a manager exists — never identity/email.
    const managedByActive = new Set<string>();
    if (vesselIds.length > 0) {
      const { data: activeManagers } = await supabaseAdmin
        .from('users')
        .select('active_vessel_id')
        .eq('role', 'vessel')
        .in('active_vessel_id', vesselIds);
      for (const user of activeManagers || []) {
        if (user.active_vessel_id) managedByActive.add(user.active_vessel_id as string);
      }
    }

    return NextResponse.json({
      success: true,
      vessels: vessels.map((v) => {
        const pub = toPublicVesselIdentity(v as Record<string, unknown>);
        return {
          id: pub.id,
          name: pub.name,
          type: pub.type,
          officialNumber: pub.imo,
          mmsi: pub.mmsi,
          flag: pub.flag,
          length_m: pub.length_m,
          beam: pub.beam,
          gross_tonnage: pub.gross_tonnage,
          build_year: pub.build_year,
          hasManager: Boolean(
            (v as { vessel_manager_id?: string | null }).vessel_manager_id ||
              managedByActive.has(pub.id),
          ),
        };
      }),
    });
  } catch (error: unknown) {
    console.error('[SEARCH VESSELS API] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
