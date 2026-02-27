import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { StateLog } from '@/lib/types';

function transformStateLog(dbLog: Record<string, unknown>): StateLog {
  const dateValue = (dbLog.date as string) || (dbLog.log_date as string);
  return {
    id: dbLog.id as string,
    userId: dbLog.user_id as string,
    vesselId: dbLog.vessel_id as string,
    state: dbLog.state as StateLog['state'],
    date: dateValue,
    isPartOfActivePassage: (dbLog.is_part_of_active_passage as boolean) ?? false,
    notes: dbLog.notes as string | undefined,
    createdAt: dbLog.created_at as string | undefined,
    updatedAt: dbLog.updated_at as string | undefined,
  };
}

/**
 * GET: Fetch all vessel state logs for a vessel (for crew breakdown / vessel data view).
 * Uses service role so vessel managers see all logs regardless of RLS.
 * Caller must be authenticated and allowed to view this vessel (vessel manager, or has assignment, or admin).
 * Query params: vesselId
 */
export async function GET(req: NextRequest) {
  try {
    // Prefer Bearer token (sent by client) so auth works reliably in Route Handlers; fall back to cookie session
    const authHeader = req.headers.get('authorization');
    let user: { id: string } | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user: u }, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && u) user = u;
    }
    if (!user) {
      const supabase = await createSupabaseServerClient();
      const { data: { session } } = await supabase.auth.getSession();
      user = session?.user ?? null;
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const vesselId = req.nextUrl.searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required query param: vesselId' },
        { status: 400 }
      );
    }

    // Requester must be vessel manager for this vessel, or have an assignment to it, or be admin
    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, vessel_manager_id')
      .eq('id', vesselId)
      .maybeSingle();

    if (vesselError || !vessel) {
      return NextResponse.json(
        { error: 'Vessel not found' },
        { status: 404 }
      );
    }

    const isVesselManager = vessel.vessel_manager_id === user.id;

    if (!isVesselManager) {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = profile?.role === 'admin';

      const { data: assignment } = await supabaseAdmin
        .from('vessel_assignments')
        .select('id')
        .eq('vessel_id', vesselId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isAdmin && !assignment) {
        return NextResponse.json(
          { error: 'You do not have permission to view this vessel\'s logs' },
          { status: 403 }
        );
      }
    }

    // Fetch all logs for the vessel (no user filter) using admin so RLS does not block
    let logsData: Record<string, unknown>[] = [];
    let logsError: { message?: string; code?: string } | null = null;

    const { data: withDate, error: dateError } = await supabaseAdmin
      .from('daily_state_logs')
      .select('*')
      .eq('vessel_id', vesselId)
      .order('date', { ascending: true });

    if (dateError && (dateError.message?.includes('column "date"') || dateError.code === '42703')) {
      const { data: withLogDate, error: logDateError } = await supabaseAdmin
        .from('daily_state_logs')
        .select('*')
        .eq('vessel_id', vesselId)
        .order('log_date', { ascending: true });
      logsData = withLogDate ?? [];
      logsError = logDateError;
    } else {
      logsData = withDate ?? [];
      logsError = dateError;
    }

    if (logsError) {
      console.error('[VESSEL-LOGS] Error fetching logs:', logsError);
      return NextResponse.json(
        { error: 'Failed to fetch vessel logs', details: logsError.message },
        { status: 500 }
      );
    }

    const logs: StateLog[] = logsData.map((row) => transformStateLog(row));
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[VESSEL-LOGS] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
