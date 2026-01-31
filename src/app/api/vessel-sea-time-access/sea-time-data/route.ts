import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { format } from 'date-fns';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import type { StateLog } from '@/lib/types';

/**
 * GET: Fetch sea time data for a crew member (vessel manager must have approved access)
 * Query params: crewUserId, vesselUserId
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const crewUserId = searchParams.get('crewUserId');
    const vesselUserId = searchParams.get('vesselUserId');

    if (!crewUserId || !vesselUserId) {
      return NextResponse.json(
        { error: 'Missing required query params: crewUserId, vesselUserId' },
        { status: 400 }
      );
    }

    // Verify that the vessel manager has an approved access request
    const { data: accessRequest, error: accessError } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .select('id, status, vessel_id')
      .eq('vessel_user_id', vesselUserId)
      .eq('crew_user_id', crewUserId)
      .eq('status', 'approved')
      .maybeSingle();

    if (accessError) {
      console.error('[VESSEL SEA TIME ACCESS] Error checking access:', accessError);
      return NextResponse.json(
        { error: 'Failed to verify access', details: accessError.message },
        { status: 500 }
      );
    }

    if (!accessRequest) {
      return NextResponse.json(
        { error: 'Access not approved or request not found' },
        { status: 403 }
      );
    }

    // Get all vessels the crew member has assignments for
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from('vessel_assignments')
      .select('vessel_id')
      .eq('user_id', crewUserId);

    if (assignmentsError) {
      console.error('[VESSEL SEA TIME ACCESS] Error fetching assignments:', assignmentsError);
      return NextResponse.json(
        { error: 'Failed to fetch vessel assignments', details: assignmentsError.message },
        { status: 500 }
      );
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({
        seaTimeData: {
          totalDays: 0,
          atSeaDays: 0,
          standbyDays: 0,
          underwayDays: 0,
          atAnchorDays: 0,
          inPortDays: 0,
          onLeaveDays: 0,
          inYardDays: 0,
        },
      });
    }

    // Fetch state logs for all vessels (using admin client to bypass RLS)
    const allLogs: StateLog[] = [];
    for (const assignment of assignments) {
      try {
        // Query daily_state_logs directly with admin client
        let query = supabaseAdmin
          .from('daily_state_logs')
          .select('*')
          .eq('vessel_id', assignment.vessel_id)
          .eq('user_id', crewUserId);

        // Try 'date' column first
        const { data: logs, error: logsError } = await query.order('date', { ascending: true });

        if (logsError) {
          // If 'date' column doesn't exist, try 'log_date'
          if (logsError.message?.includes('column "date"') || logsError.code === '42703') {
            const retryQuery = supabaseAdmin
              .from('daily_state_logs')
              .select('*')
              .eq('vessel_id', assignment.vessel_id)
              .eq('user_id', crewUserId);
            
            const { data: retryLogs, error: retryError } = await retryQuery.order('log_date', { ascending: true });
            
            if (retryError) {
              console.error(`[VESSEL SEA TIME ACCESS] Error fetching logs for vessel ${assignment.vessel_id}:`, retryError);
              continue;
            }
            
            // Transform logs
            const transformedLogs = (retryLogs || []).map((log: any) => ({
              id: log.id,
              userId: log.user_id,
              vesselId: log.vessel_id,
              date: log.log_date || log.date,
              state: log.state,
              isPartOfActivePassage: log.is_part_of_active_passage || false,
              createdAt: log.created_at,
              updatedAt: log.updated_at,
            }));
            
            allLogs.push(...transformedLogs);
          } else {
            console.error(`[VESSEL SEA TIME ACCESS] Error fetching logs for vessel ${assignment.vessel_id}:`, logsError);
            continue;
          }
        } else {
          // Transform logs
          const transformedLogs = (logs || []).map((log: any) => ({
            id: log.id,
            userId: log.user_id,
            vesselId: log.vessel_id,
            date: log.date || log.log_date,
            state: log.state,
            isPartOfActivePassage: log.is_part_of_active_passage || false,
            createdAt: log.created_at,
            updatedAt: log.updated_at,
          }));
          
          allLogs.push(...transformedLogs);
        }
      } catch (error) {
        console.error(`[VESSEL SEA TIME ACCESS] Exception fetching logs for vessel ${assignment.vessel_id}:`, error);
        continue;
      }
    }

    // Fetch watch logs for officers
    let watchDates = new Set<string>();
    
    // Get crew member's position to determine if they're an officer
    const { data: crewProfile } = await supabaseAdmin
      .from('users')
      .select('position')
      .eq('id', crewUserId)
      .single();

    const position = (crewProfile?.position || '').toLowerCase();
    const isOfficer = position.includes('officer') || position.includes('captain') || position.includes('engineer') || position.includes('mate');

    if (isOfficer) {
      const { data: watchLogs, error: watchError } = await supabaseAdmin
        .from('watch_logs')
        .select('watch_start')
        .eq('user_id', crewUserId);

      if (!watchError && watchLogs) {
        watchLogs.forEach(log => {
          const dateStr = format(new Date(log.watch_start), 'yyyy-MM-dd');
          watchDates.add(dateStr);
        });
      }
    }

    // Extract part of active passage dates
    const partOfActivePassageDates = new Set<string>();
    allLogs.forEach(log => {
      if (log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });

    // Calculate sea time stats
    const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(allLogs, watchDates, partOfActivePassageDates);

    const seaTimeData = {
      totalDays: allLogs.length,
      atSeaDays: totalSeaDays,
      standbyDays: totalStandbyDays,
      underwayDays: allLogs.filter(log => log.state === 'underway').length,
      atAnchorDays: allLogs.filter(log => log.state === 'at-anchor').length,
      inPortDays: allLogs.filter(log => log.state === 'in-port').length,
      onLeaveDays: allLogs.filter(log => log.state === 'on-leave').length,
      inYardDays: allLogs.filter(log => log.state === 'in-yard').length,
    };

    return NextResponse.json({ seaTimeData });
  } catch (error: any) {
    console.error('[VESSEL SEA TIME ACCESS] Exception fetching sea time data:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
