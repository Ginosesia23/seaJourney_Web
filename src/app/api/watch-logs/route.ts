import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * API route to fetch watch logs for a user
 * Uses supabaseAdmin to bypass RLS for captains viewing crew member watch logs
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const vesselId = searchParams.get('vessel_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('watch_logs')
      .select('watch_start, vessel_id')
      .eq('user_id', userId);

    if (vesselId) {
      query = query.eq('vessel_id', vesselId);
    }

    if (startDate && endDate) {
      query = query
        .gte('watch_start', `${startDate}T00:00:00`)
        .lte('watch_start', `${endDate}T23:59:59`);
    }

    const { data: watchLogs, error } = await query.order('watch_start', { ascending: true });

    if (error) {
      console.error('[API] Error fetching watch logs:', error);
      return NextResponse.json(
        { error: 'Failed to fetch watch logs', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ watchLogs: watchLogs || [] });
  } catch (error: any) {
    console.error('[API] Exception fetching watch logs:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
