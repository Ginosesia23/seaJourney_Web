import { NextRequest, NextResponse } from 'next/server';

import { resolveAisImportAssignmentBounds } from '@/lib/ais/import-assignment-bounds';
import { enrichPreviewDaysWithLocationNames } from '@/lib/ais/enrich-location-names';
import {
  buildHistoricalImportPreview,
  parseHistoryPosition,
  validateHistoryDateRange,
} from '@/lib/ais/historical-import';
import { isDateWithinAnyAssignmentPeriod } from '@/lib/vessel-assignment-dates';
import { DatalasticApiError, fetchVesselHistoryRange } from '@/lib/datalastic/client';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assertAisHistoryVesselAccess,
  authenticateAisHistoryUser,
} from '@/lib/vessel-ais-access';

/**
 * POST /api/ais/history/preview
 * Body: { vesselId, from, to, timezoneOffsetMinutes? }
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateAisHistoryUser(req, supabaseAdmin);
    if ('error' in authResult) return authResult.error;

    const body = await req.json();
    const vesselId = body.vesselId as string | undefined;
    const from = body.from as string | undefined;
    const to = body.to as string | undefined;
    const timezoneOffsetMinutes =
      typeof body.timezoneOffsetMinutes === 'number'
        ? body.timezoneOffsetMinutes
        : 0;

    if (!vesselId || !from || !to) {
      return NextResponse.json(
        { error: 'vesselId, from, and to are required' },
        { status: 400 },
      );
    }

    const rangeCheck = validateHistoryDateRange(from, to);
    if (!rangeCheck.ok) {
      return NextResponse.json({ error: rangeCheck.error }, { status: 400 });
    }

    const vesselResult = await assertAisHistoryVesselAccess(
      authResult.auth,
      vesselId,
      supabaseAdmin,
    );
    if ('error' in vesselResult) return vesselResult.error;

    const boundsResult = await resolveAisImportAssignmentBounds(
      authResult.auth,
      vesselId,
      from,
      to,
      supabaseAdmin,
    );
    if (!boundsResult.ok) {
      return NextResponse.json(
        { error: boundsResult.error },
        { status: boundsResult.status ?? 400 },
      );
    }

    const { bounds } = boundsResult;
    const vessel = vesselResult.vessel;
    if (!vessel.mmsi && !vessel.imo) {
      return NextResponse.json(
        { error: 'Add an MMSI or IMO on the vessel profile before importing AIS history.' },
        { status: 400 },
      );
    }

    let rawPositions: unknown[] = [];
    let requestCount = 0;

    for (const segment of bounds.allowedSegments) {
      const result = await fetchVesselHistoryRange({
        mmsi: vessel.mmsi,
        imo: vessel.imo,
        from: segment.from,
        to: segment.to,
      });
      rawPositions = rawPositions.concat(result.positions);
      requestCount += result.requestCount;
    }

    const positions = rawPositions
      .map((p) => parseHistoryPosition(p as Record<string, unknown>))
      .filter((p): p is NonNullable<typeof p> => p != null);

    const fetchFrom = bounds.allowedSegments[0]?.from ?? from;
    const fetchTo = bounds.allowedSegments[bounds.allowedSegments.length - 1]?.to ?? to;

    const { data: existingRows, error: logsError } = await supabaseAdmin
      .from('daily_state_logs')
      .select('date, state')
      .eq('user_id', authResult.auth.userId)
      .eq('vessel_id', vesselId)
      .gte('date', fetchFrom)
      .lte('date', fetchTo);

    if (logsError) {
      throw logsError;
    }

    const existingLogs = new Map<string, DailyStatus>();
    for (const row of existingRows ?? []) {
      existingLogs.set(row.date as string, row.state as DailyStatus);
    }

    const { days, summary } = buildHistoricalImportPreview(
      positions,
      existingLogs,
      from,
      to,
      timezoneOffsetMinutes,
    );

    const role = (authResult.auth.profile.role || '').toString().toLowerCase();
    const filterByAssignment = role === 'crew' || role === 'captain';

    const filteredDays = filterByAssignment
      ? days.filter((day) =>
          isDateWithinAnyAssignmentPeriod(day.date, bounds.assignments),
        )
      : days.filter(
          (day) => day.date >= bounds.earliestDate && day.date <= bounds.latestDate,
        );

    const outsideAssignmentDays = days.length - filteredDays.length;

    const filteredSummary = filteredDays.reduce(
      (acc, day) => {
        acc.totalDays += 1;
        acc.positionCount += day.positionCount;
        if (day.changeType === 'new') acc.newDays += 1;
        else if (day.changeType === 'same') acc.sameDays += 1;
        else if (day.changeType === 'conflict') acc.conflictDays += 1;
        return acc;
      },
      {
        totalDays: 0,
        newDays: 0,
        sameDays: 0,
        conflictDays: 0,
        positionCount: 0,
        outsideAssignmentDays,
      },
    );

    const daysWithLocations = await enrichPreviewDaysWithLocationNames(filteredDays);

    return NextResponse.json({
      vesselId,
      from,
      to,
      timezoneOffsetMinutes,
      days: daysWithLocations,
      summary: filteredSummary,
      allowedSegments: bounds.allowedSegments,
      assignmentPeriods: bounds.assignments,
      importEarliestDate: bounds.earliestDate,
      importLatestDate: bounds.latestDate,
      rawPositionCount: rawPositions.length,
      datalasticRequestCount: requestCount,
    });
  } catch (err: unknown) {
    console.error('[AIS HISTORY PREVIEW]', err);
    if (err instanceof DatalasticApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status >= 400 && err.status < 500 ? err.status : 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AIS history preview failed' },
      { status: 500 },
    );
  }
}
