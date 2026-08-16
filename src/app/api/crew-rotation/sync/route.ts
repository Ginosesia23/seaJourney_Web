import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

import {
  getRotationStatus,
  normaliseRotation,
  ONBOARD_TOGGLE_LEAVE_MARKER,
  type CrewRotationRow,
} from '@/lib/crew-rotation';
import { ensureTodayOnLeaveForOpenToggleLeaves } from '@/lib/crew-rotation/onboard-leave-side-effects';

/**
 * POST /api/crew-rotation/sync
 * Body: { vesselId: string }
 *
 * For every active assignment on the vessel, computes whether today
 * falls in an ON or OFF period (using the per-crew rotation override
 * if present, otherwise the vessel-wide default). Then writes the
 * `onboard` flag back to `vessel_assignments` so the crew page and
 * the rotation page always agree.
 *
 * This route is BIDIRECTIONAL — it flips `onboard` to true when the
 * rotation says ON and to false when it says OFF. (The earlier
 * version only flipped to false to preserve manual control, but that
 * caused the very inconsistency we're fixing: the rotation editor
 * would say "Off" while the crew page still said "Onboard".)
 *
 * Manual override path: the vessel manager can still toggle a crew
 * member on/off from the crew page; the next sync (page reload or
 * visit to the rotation page) will reconcile that toggle with the
 * rotation pattern. If a manager wants to keep someone permanently
 * onboard, they should edit or remove their rotation.
 *
 * Returns:
 *   { updated: [{ userId, assignmentId, from, to }] }
 *
 * `from`/`to` are the previous and new `onboard` boolean values, so
 * callers can show a "X moved on, Y moved off" toast.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required field: vesselId' },
        { status: 400 },
      );
    }

    // ----- Fetch rotations for this vessel ---------------------------------
    const { data: rotations, error: rotErr } = await supabaseAdmin
      .from('crew_rotations')
      .select(
        'id, crew_user_id, on_unit, on_value, off_unit, off_value, start_date, end_date',
      )
      .eq('vessel_id', vesselId);

    if (rotErr) {
      console.error('[CREW ROTATION SYNC] Error fetching rotations:', rotErr);
      return NextResponse.json({ error: rotErr.message }, { status: 500 });
    }

    const rotationList = (rotations ?? []) as Array<
      CrewRotationRow & { id: string; crew_user_id: string | null }
    >;
    const defaultRotation = rotationList.find((r) => r.crew_user_id === null) ?? null;
    const perCrewMap = new Map<string, (typeof rotationList)[number]>();
    for (const r of rotationList) {
      if (r.crew_user_id) perCrewMap.set(r.crew_user_id, r);
    }

    // No rotations configured — nothing to sync.
    if (!defaultRotation && perCrewMap.size === 0) {
      return NextResponse.json({ updated: [] });
    }

    // ----- Fetch active assignments ----------------------------------------
    // We also pull `onboard_override_until` so we can respect manual
    // overrides set from the Onboard Tracker. While that timestamp is
    // in the future, the manager wants the manual flag to stand and
    // the sync should leave it alone. Once it passes, the rotation
    // pattern takes back over — and we clear the column on the same
    // write to keep the schema tidy.
    const { data: assignments, error: asgErr } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id, user_id, onboard, onboard_override_until')
      .eq('vessel_id', vesselId)
      .is('end_date', null);

    if (asgErr) {
      console.error('[CREW ROTATION SYNC] Error fetching assignments:', asgErr);
      return NextResponse.json({ error: asgErr.message }, { status: 500 });
    }

    // ----- Exclude vessel accounts -----------------------------------------
    // A vessel account can have its own self-assignment row, but it's
    // not real crew and shouldn't be flipped on/off by the rotation —
    // it's logically always on board.
    const assignmentList = assignments ?? [];
    const vesselUserIds = new Set<string>();
    if (assignmentList.length > 0) {
      const userIds = assignmentList.map((a: any) => a.user_id);
      const { data: profiles } = await supabaseAdmin
        .from('users')
        .select('id, role')
        .in('id', userIds);
      for (const p of profiles ?? []) {
        if ((p as any).role === 'vessel') vesselUserIds.add((p as any).id);
      }
    }

    // ----- Active manual sign-offs -----------------------------------------
    // When a manager toggles someone off-board from the Onboard Tracker,
    // we record an open leave period tagged with ONBOARD_TOGGLE_LEAVE_MARKER.
    // While that period is open the crew member is signed off the boat and
    // the rotation sync must not flip them back on-board.
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const { data: signOffLeaves } = await supabaseAdmin
      .from('crew_leave_periods')
      .select('crew_user_id')
      .eq('vessel_id', vesselId)
      .gte('end_date', todayIso)
      .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`);

    const signedOffUserIds = new Set<string>(
      (signOffLeaves ?? []).map((row: { crew_user_id: string }) => row.crew_user_id),
    );

    // ----- Reconcile -------------------------------------------------------
    const nowIso = today.toISOString();

    type Update = {
      assignmentId: string;
      userId: string;
      from: boolean;
      to: boolean;
    };

    const updates: Update[] = [];
    const writes: Promise<unknown>[] = [];

    for (const assignment of assignmentList) {
      // Skip the vessel account's own assignment row.
      if (vesselUserIds.has(assignment.user_id as string)) continue;

      const rotationRow =
        perCrewMap.get(assignment.user_id as string) ?? defaultRotation;
      if (!rotationRow) continue;

      const status = getRotationStatus(normaliseRotation(rotationRow), today);
      if (status === 'not-started') continue;

      const shouldBeOnboard = status === 'on';
      const currentOnboard = assignment.onboard === true;
      const overrideRaw = assignment.onboard_override_until as string | null;
      const overrideUntil = overrideRaw ? new Date(overrideRaw) : null;
      const overrideActive = !!overrideUntil && overrideUntil > today;

      // Active override: respect the manager's manual choice and
      // skip writing. (Don't even clear the column here — it'll
      // expire naturally on the next sync after the timestamp.)
      if (overrideActive) continue;

      // Signed off via Onboard Tracker — leave the manual off-board
      // flag alone until the manager toggles them back on-board.
      if (signedOffUserIds.has(assignment.user_id as string)) continue;

      // Override has expired (or was never set) — reconcile.
      const needsWrite = shouldBeOnboard !== currentOnboard;
      const needsClearOverride = !!overrideRaw && !overrideActive;

      if (needsWrite || needsClearOverride) {
        if (needsWrite) {
          updates.push({
            assignmentId: assignment.id as string,
            userId: assignment.user_id as string,
            from: currentOnboard,
            to: shouldBeOnboard,
          });
        }
        const patch: Record<string, unknown> = { updated_at: nowIso };
        if (needsWrite) patch.onboard = shouldBeOnboard;
        if (needsClearOverride) patch.onboard_override_until = null;
        writes.push(
          Promise.resolve(
            supabaseAdmin
              .from('vessel_assignments')
              .update(patch)
              .eq('id', assignment.id),
          ),
        );
      }
    }

    if (writes.length > 0) {
      await Promise.all(writes);
    }

    // Keep crew daily_state_logs in sync for open Onboard Tracker leave
    // periods when the crew member has approved sea-time access.
    let leaveLogsTouched = 0;
    try {
      leaveLogsTouched = await ensureTodayOnLeaveForOpenToggleLeaves(vesselId);
    } catch (leaveErr) {
      console.warn('[CREW ROTATION SYNC] leave-log fill failed', leaveErr);
    }

    return NextResponse.json({ updated: updates, leaveLogsTouched });
  } catch (err: any) {
    console.error('[CREW ROTATION SYNC] Exception:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 },
    );
  }
}
