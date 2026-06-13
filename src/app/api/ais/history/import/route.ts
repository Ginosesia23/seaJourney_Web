import { NextRequest, NextResponse } from 'next/server';

import { resolveAisImportAssignmentBounds } from '@/lib/ais/import-assignment-bounds';
import { buildAisHistoryImportNote } from '@/lib/ais/historical-import';
import {
  isDateWithinAnyAssignmentPeriod,
  todayDateKey,
} from '@/lib/vessel-assignment-dates';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assertAisHistoryVesselAccess,
  authenticateAisHistoryUser,
} from '@/lib/vessel-ais-access';

type ImportEntry = {
  date: string;
  state: DailyStatus;
  navStatus?: string | null;
  speed?: number | null;
};

/**
 * POST /api/ais/history/import
 * Body: { vesselId, entries: ImportEntry[], overwriteConflicts?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateAisHistoryUser(req, supabaseAdmin);
    if ('error' in authResult) return authResult.error;

    const body = await req.json();
    const vesselId = body.vesselId as string | undefined;
    const entries = body.entries as ImportEntry[] | undefined;
    const overwriteConflicts = !!body.overwriteConflicts;

    if (!vesselId || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'vesselId and a non-empty entries array are required' },
        { status: 400 },
      );
    }

    if (entries.length > 500) {
      return NextResponse.json(
        { error: 'Cannot import more than 500 days at once' },
        { status: 400 },
      );
    }

    const vesselResult = await assertAisHistoryVesselAccess(
      authResult.auth,
      vesselId,
      supabaseAdmin,
    );
    if ('error' in vesselResult) return vesselResult.error;

    const sortedDates = [...entries.map((e) => e.date)].sort();
    const boundsResult = await resolveAisImportAssignmentBounds(
      authResult.auth,
      vesselId,
      sortedDates[0],
      sortedDates[sortedDates.length - 1],
      supabaseAdmin,
    );
    if (!boundsResult.ok) {
      return NextResponse.json(
        { error: boundsResult.error },
        { status: boundsResult.status ?? 400 },
      );
    }

    const { bounds } = boundsResult;
    const role = (authResult.auth.profile.role || '').toString().toLowerCase();
    const today = todayDateKey();
    const userId = authResult.auth.userId;
    const dates = entries.map((e) => e.date);

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('daily_state_logs')
      .select('date, state')
      .eq('user_id', userId)
      .eq('vessel_id', vesselId)
      .in('date', dates);

    if (existingError) throw existingError;

    const existingByDate = new Map<string, DailyStatus>();
    for (const row of existingRows ?? []) {
      existingByDate.set(row.date as string, row.state as DailyStatus);
    }

    const toUpsert: Array<{
      user_id: string;
      vessel_id: string;
      date: string;
      state: DailyStatus;
      is_part_of_active_passage: boolean;
      notes: string;
    }> = [];

    let skippedSame = 0;
    let skippedConflict = 0;

    for (const entry of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return NextResponse.json(
          { error: `Invalid date: ${entry.date}` },
          { status: 400 },
        );
      }

      if (entry.date > today) {
        return NextResponse.json(
          { error: `Cannot import future dates (${entry.date}).` },
          { status: 400 },
        );
      }

      if (role === 'crew' || role === 'captain') {
        if (!isDateWithinAnyAssignmentPeriod(entry.date, bounds.assignments)) {
          return NextResponse.json(
            {
              error: `Cannot import ${entry.date} — it falls outside your assignment period on this vessel.`,
            },
            { status: 400 },
          );
        }
      } else if (role === 'vessel') {
        if (entry.date < bounds.earliestDate || entry.date > bounds.latestDate) {
          return NextResponse.json(
            {
              error: `Cannot import ${entry.date} — it falls outside the allowed range for your vessel account.`,
            },
            { status: 400 },
          );
        }
      }

      const existing = existingByDate.get(entry.date);
      if (existing) {
        if (existing === entry.state) {
          skippedSame += 1;
          continue;
        }
        if (!overwriteConflicts) {
          skippedConflict += 1;
          continue;
        }
      }

      toUpsert.push({
        user_id: userId,
        vessel_id: vesselId,
        date: entry.date,
        state: entry.state,
        is_part_of_active_passage: false,
        notes: buildAisHistoryImportNote(entry.navStatus ?? null, entry.speed ?? null),
      });
    }

    if (toUpsert.length === 0) {
      return NextResponse.json({
        imported: 0,
        skippedSame,
        skippedConflict,
        message: 'No changes to apply',
      });
    }

    const { error: upsertError } = await supabaseAdmin
      .from('daily_state_logs')
      .upsert(toUpsert, { onConflict: 'user_id,vessel_id,date' });

    if (upsertError) throw upsertError;

    return NextResponse.json({
      imported: toUpsert.length,
      skippedSame,
      skippedConflict,
    });
  } catch (err: unknown) {
    console.error('[AIS HISTORY IMPORT]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AIS history import failed' },
      { status: 500 },
    );
  }
}
