import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, action, rejectionReason, preserveCrewLogs } = body; // action: 'approve' | 'reject', preserveCrewLogs: when true, do not overwrite days crew has already logged (e.g. leave periods)

    if (!requestId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: requestId, action' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the request
    const { data: request, error: requestError } = await supabaseAdmin
      .from('sea_time_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return NextResponse.json(
        { error: 'Request not found or already processed' },
        { status: 404 }
      );
    }

    // Update request status
    const updateData: any = {
      status: action === 'approve' ? 'approved' : 'rejected',
      updated_at: new Date().toISOString(),
    };

    if (action === 'reject' && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from('sea_time_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      console.error('[SEA TIME REQUEST] Error updating request:', updateError);
      return NextResponse.json(
        { error: 'Failed to update request', details: updateError.message },
        { status: 500 }
      );
    }

    // If approved, copy vessel's state logs to crew member
    if (action === 'approve') {
      try {
        // Get vessel manager's user_id
        const { data: vessel, error: vesselError } = await supabaseAdmin
          .from('vessels')
          .select('vessel_manager_id')
          .eq('id', request.vessel_id)
          .single();

        if (vesselError || !vessel?.vessel_manager_id) {
          console.error('[SEA TIME REQUEST] Error fetching vessel or no manager:', vesselError);
          return NextResponse.json({
            success: true,
            request: updatedRequest,
            warning: 'Request approved but vessel has no manager to copy logs from',
          });
        }

        // Get vessel manager's state logs for the date range
        // Try 'date' column first, fall back to 'log_date' if needed
        let vesselLogs: any[] = [];
        let logsError: any = null;

        const { data: logsWithDate, error: dateError } = await supabaseAdmin
          .from('daily_state_logs')
          .select('date, state')
          .eq('vessel_id', request.vessel_id)
          .eq('user_id', vessel.vessel_manager_id)
          .gte('date', request.start_date)
          .lte('date', request.end_date)
          .order('date', { ascending: true });

        if (dateError && (dateError.message?.includes('column "date"') || dateError.code === '42703')) {
          // Try with log_date column
          const { data: logsWithLogDate, error: logDateError } = await supabaseAdmin
            .from('daily_state_logs')
            .select('log_date, state')
            .eq('vessel_id', request.vessel_id)
            .eq('user_id', vessel.vessel_manager_id)
            .gte('log_date', request.start_date)
            .lte('log_date', request.end_date)
            .order('log_date', { ascending: true });

          if (logDateError) {
            logsError = logDateError;
          } else {
            vesselLogs = logsWithLogDate || [];
          }
        } else if (dateError) {
          logsError = dateError;
        } else {
          vesselLogs = logsWithDate || [];
        }

        if (logsError) {
          console.error('[SEA TIME REQUEST] Error fetching vessel logs:', logsError);
          return NextResponse.json({
            success: true,
            request: updatedRequest,
            warning: 'Request approved but logs could not be fetched',
          });
        } else if (vesselLogs && vesselLogs.length > 0) {
          let logsToInsert: { user_id: string; vessel_id: string; date: string; state: string }[];

          if (preserveCrewLogs) {
            // Fetch crew member's existing logs for this vessel and date range so we don't overwrite them (e.g. leave periods)
            let existingDates = new Set<string>();
            const { data: existingByDate, error: existingDateError } = await supabaseAdmin
              .from('daily_state_logs')
              .select('date')
              .eq('user_id', request.crew_user_id)
              .eq('vessel_id', request.vessel_id)
              .gte('date', request.start_date)
              .lte('date', request.end_date);

            if (!existingDateError && existingByDate?.length) {
              existingDates = new Set((existingByDate as any[]).map((row: any) => String(row.date)));
            } else if (existingDateError && (existingDateError.code === '42703' || existingDateError.message?.includes('column "date"'))) {
              const { data: existingByLogDate } = await supabaseAdmin
                .from('daily_state_logs')
                .select('log_date')
                .eq('user_id', request.crew_user_id)
                .eq('vessel_id', request.vessel_id)
                .gte('log_date', request.start_date)
                .lte('log_date', request.end_date);
              if (existingByLogDate?.length) {
                existingDates = new Set((existingByLogDate as any[]).map((row: any) => String(row.log_date)));
              }
            }
            // Only include vessel log entries for dates the crew has not already logged
            logsToInsert = vesselLogs
              .filter((log: any) => {
                const d = log.date || log.log_date;
                return d && !existingDates.has(String(d));
              })
              .map(log => ({
                user_id: request.crew_user_id,
                vessel_id: request.vessel_id,
                date: log.date || log.log_date,
                state: log.state,
              }));
          } else {
            logsToInsert = vesselLogs.map((log: any) => ({
              user_id: request.crew_user_id,
              vessel_id: request.vessel_id,
              date: log.date || log.log_date,
              state: log.state,
            }));
          }

          if (logsToInsert.length === 0 && preserveCrewLogs) {
            return NextResponse.json({
              success: true,
              request: updatedRequest,
              logsCopied: 0,
              message: 'Request approved. No new days copied because the crew member already has logs for all dates in this range (e.g. leave periods were preserved).',
            });
          }

          // Use upsert when not preserving (overwrite); use insert when preserving (no conflict, but safer to upsert with same behaviour: only insert new rows would require raw insert and skip conflict dates - upsert with filtered list achieves same)
          const { error: insertError } = await supabaseAdmin
            .from('daily_state_logs')
            .upsert(logsToInsert, {
              onConflict: 'user_id,vessel_id,date',
            });

          if (insertError) {
            console.error('[SEA TIME REQUEST] Error copying logs:', insertError);
            // Request is still approved, but logs weren't copied
            return NextResponse.json({
              success: true,
              request: updatedRequest,
              warning: 'Request approved but some logs could not be copied',
            });
          }

          return NextResponse.json({
            success: true,
            request: updatedRequest,
            logsCopied: logsToInsert.length,
          });
        } else {
          // No vessel logs found for this date range
          return NextResponse.json({
            success: true,
            request: updatedRequest,
            warning: 'Request approved but no vessel logs found for this date range',
          });
        }
      } catch (logError: any) {
        console.error('[SEA TIME REQUEST] Exception copying logs:', logError);
        // Request is still approved
        return NextResponse.json({
          success: true,
          request: updatedRequest,
          warning: 'Request approved but logs could not be copied',
        });
      }
    }

    // If rejected, just return success
    return NextResponse.json({
      success: true,
      request: updatedRequest,
    });
  } catch (error: any) {
    console.error('[SEA TIME REQUEST] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

