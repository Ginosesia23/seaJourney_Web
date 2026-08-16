import { NextRequest, NextResponse } from 'next/server';
import { format, parseISO, startOfDay } from 'date-fns';

import {
  applyOnboardToggleToCrewLogs,
  closeOnboardToggleLeave,
  notifyCrewOnboardChange,
  openOrExtendOnboardToggleLeave,
} from '@/lib/crew-rotation/onboard-leave-side-effects';
import { manualSignOffOverrideUntil } from '@/lib/crew-rotation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/crew-rotation/onboard-status
 *
 * Vessel manager marks a crew member on/off board. Updates the assignment,
 * opens/closes tagged leave periods, mirrors on-leave onto the crew member's
 * daily_state_logs when they have approved sea-time access, and notifies them.
 *
 * Body:
 *   assignmentId, vesselId, crewUserId, onboard,
 *   overrideUntil?: ISO string | null,
 *   leaveEndDate?: ISO date (yyyy-MM-dd) | null,
 *   skipSignOffLeave?: boolean  // days-owed path: skip leave period
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      assignmentId,
      vesselId,
      crewUserId,
      onboard,
      overrideUntil,
      leaveEndDate,
      skipSignOffLeave = false,
    } = body as {
      assignmentId?: string;
      vesselId?: string;
      crewUserId?: string;
      onboard?: boolean;
      overrideUntil?: string | null;
      leaveEndDate?: string | null;
      skipSignOffLeave?: boolean;
    };

    if (!assignmentId || !vesselId || !crewUserId || typeof onboard !== 'boolean') {
      return NextResponse.json(
        {
          error:
            'Missing required fields: assignmentId, vesselId, crewUserId, onboard',
        },
        { status: 400 },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAdmin = profile.role === 'admin';
    const isVesselManager =
      profile.role === 'vessel' && profile.active_vessel_id === vesselId;

    if (!isAdmin && !isVesselManager) {
      const { data: vessel } = await supabaseAdmin
        .from('vessels')
        .select('id, vessel_manager_id')
        .eq('id', vesselId)
        .maybeSingle();
      if (!vessel || vessel.vessel_manager_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: assignment, error: asgErr } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id, user_id, vessel_id, onboard')
      .eq('id', assignmentId)
      .eq('vessel_id', vesselId)
      .eq('user_id', crewUserId)
      .maybeSingle();

    if (asgErr || !assignment) {
      return NextResponse.json(
        { error: 'Assignment not found for this vessel / crew member' },
        { status: 404 },
      );
    }

    const previousOnboard = assignment.onboard === true;
    const today = startOfDay(new Date());
    const todayIso = format(today, 'yyyy-MM-dd');

    const effectiveOverride = onboard
      ? null
      : overrideUntil
        ? overrideUntil
        : manualSignOffOverrideUntil(today).toISOString();

    const leaveEndIso = onboard
      ? null
      : leaveEndDate
        ? leaveEndDate.slice(0, 10)
        : format(
            startOfDay(
              overrideUntil
                ? parseISO(overrideUntil)
                : manualSignOffOverrideUntil(today),
            ),
            'yyyy-MM-dd',
          );

    const { error: updateErr } = await supabaseAdmin
      .from('vessel_assignments')
      .update({
        onboard,
        onboard_override_until: effectiveOverride,
      })
      .eq('id', assignmentId);

    if (updateErr) {
      return NextResponse.json(
        { error: 'Failed to update onboard status', details: updateErr.message },
        { status: 500 },
      );
    }

    let leaveAction: string | null = null;
    let logsResult: Awaited<ReturnType<typeof applyOnboardToggleToCrewLogs>> | null =
      null;

    if (previousOnboard !== onboard) {
      if (!(skipSignOffLeave && !onboard)) {
        if (!onboard && leaveEndIso) {
          const leave = await openOrExtendOnboardToggleLeave({
            crewUserId,
            vesselId,
            vesselUserId: user.id,
            leaveEndIso,
            startIso: todayIso,
          });
          leaveAction = leave.action;
        } else if (onboard) {
          const leave = await closeOnboardToggleLeave({
            crewUserId,
            vesselId,
            asOfIso: todayIso,
          });
          leaveAction = leave.action;
        }
      }

      logsResult = await applyOnboardToggleToCrewLogs({
        crewUserId,
        vesselId,
        onboard,
        leaveEndIso,
      });

      // Always notify on a real status flip — fire-and-forget style.
      void notifyCrewOnboardChange({
        crewUserId,
        vesselId,
        onboard,
      });
    }

    return NextResponse.json({
      ok: true,
      previousOnboard,
      onboard,
      leaveAction,
      logs: logsResult,
      notified: previousOnboard !== onboard,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[onboard-status] exception', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
