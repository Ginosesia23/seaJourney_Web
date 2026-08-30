import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

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
      .select(
        'id, name, type, imo, mmsi, flag, length_m, beam, gross_tonnage, build_year, vessel_manager_id',
      )
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
    const vesselIds = vessels.map((v) => v.id);

    // Managers linked via vessels.vessel_manager_id
    const managerIds = [
      ...new Set(
        vessels
          .map((v) => v.vessel_manager_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    // Also treat vessel-role users with active_vessel_id as managers
    const managersByActiveVessel = new Map<
      string,
      { id: string; email: string | null; firstName: string | null; lastName: string | null }
    >();
    if (vesselIds.length > 0) {
      const { data: activeManagers } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name, active_vessel_id')
        .eq('role', 'vessel')
        .in('active_vessel_id', vesselIds);

      for (const user of activeManagers || []) {
        if (user.active_vessel_id) {
          managersByActiveVessel.set(user.active_vessel_id, {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
          });
        }
      }
    }

    const managersById = new Map<
      string,
      { id: string; email: string | null; firstName: string | null; lastName: string | null }
    >();
    if (managerIds.length > 0) {
      const { data: linkedManagers } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name')
        .in('id', managerIds);

      for (const user of linkedManagers || []) {
        managersById.set(user.id, {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
      }
    }

    const formatManagerLabel = (manager: {
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null) => {
      if (!manager) return null;
      const name = [manager.firstName, manager.lastName].filter(Boolean).join(' ').trim();
      return name || manager.email || null;
    };

    return NextResponse.json({
      success: true,
      vessels: vessels.map((v) => {
        const linked = v.vessel_manager_id
          ? managersById.get(v.vessel_manager_id) || null
          : null;
        const byActive = managersByActiveVessel.get(v.id) || null;
        const manager = linked || byActive;
        const hasManager = Boolean(v.vessel_manager_id || byActive);

        return {
          id: v.id,
          name: v.name,
          type: v.type,
          officialNumber: v.imo,
          mmsi: v.mmsi,
          flag: v.flag,
          length_m: v.length_m,
          beam: v.beam,
          gross_tonnage: v.gross_tonnage,
          build_year: v.build_year,
          hasManager,
          managerLabel: formatManagerLabel(manager),
        };
      }),
    });
  } catch (error: any) {
    console.error('[SEARCH VESSELS API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 },
    );
  }
}
