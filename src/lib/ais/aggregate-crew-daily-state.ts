/**
 * Aggregate an array of hourly crew AIS state samples for one calendar day
 * into a single {@link DailyStatus} used to write `daily_state_logs`.
 *
 * This is analyzer-first — we delegate the heavy lifting to
 * {@link analyzeAisDailyState} (the same function the AIS import page uses),
 * so we get for free:
 *
 *   * The **≥ 4-hour underway rule** (`minUnderwayMs`) — a sea day only counts
 *     when total underway time across the day exceeds 4h.
 *   * **Previous-day carry-forward** — if the vessel didn't move overnight
 *     the analyzer preserves yesterday's stationary state.
 *   * **Position clustering** — anchor→berth transitions ("moved from anchor
 *     to port, but only 0.5 NM") disambiguate correctly.
 *   * **Location context** — reverse-geocoded end-of-day location flags
 *     "populated area" so anchored-in-a-harbor gets treated as in-port.
 *   * **Speed / motion analysis** and inter-cluster relocation heuristics.
 *
 * We fall back to a plain frequency vote **only** when we have < 2 usable
 * position samples (which is a rare data-quality case; the analyzer needs at
 * least 2 fixes to build its clusters).
 */

import type { DailyStatus } from '@/lib/types';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  analyzeAisDailyState,
  type AisAnalyzeOptions,
} from '@/lib/ais/analyze-daily-state';

/** Minimum total underway time for a day to count as a sea day. */
export const MIN_UNDERWAY_MS_FOR_SEA_DAY = 4 * 60 * 60 * 1000;

/** All valid crew daily states. */
const ALL_STATES: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'in-yard',
  'on-leave',
];

/** Preference order used for tie-breaking when we have to fall back to frequency. */
const TIE_BREAK_ORDER: DailyStatus[] = [
  'underway',
  'at-anchor',
  'in-port',
  'in-yard',
  'on-leave',
];

export type CrewAisSample = {
  state: DailyStatus;
  sampledAt: string;
  navStatus?: string | null;
  speedKn?: number | null;
  lat?: number | null;
  lon?: number | null;
  /** Raw Datalastic payload — the analyzer prefers this for full metrics. */
  rawPosition?: DatalasticVesselPosition | null;
};

export type CrewDailyStateAggregate = {
  /** Final chosen state to write to `daily_state_logs`. */
  state: DailyStatus;
  /** Human-readable reason. */
  reason: string;
  /** Analyzer's confidence (or 'low' if we fell back to frequency). */
  confidence: 'high' | 'medium' | 'low';
  /** Count of samples per state (missing states are 0). */
  counts: Record<DailyStatus, number>;
  /** Total number of samples we considered. */
  sampleCount: number;
  /** Whether the ≥ 4h underway rule fired (from the analyzer). */
  seaDayRuleFired: boolean;
  /** Passthrough of the analyzer's metrics, when we ran it. */
  metrics?: ReturnType<typeof analyzeAisDailyState>['metrics'];
  /** True when we used the frequency-vote fallback instead of the analyzer. */
  usedFallback: boolean;
};

/**
 * Aggregate crew AIS samples for a single day into a chosen state.
 *
 * @param samples      All hourly samples we collected for the target day.
 * @param options      Previous-day carry-forward + reverse-geocoded location
 *                     context for today's end-of-day position. Same shape as
 *                     `AisAnalyzeOptions` used by the AIS history import.
 */
export function aggregateCrewDailyState(
  samples: CrewAisSample[],
  options?: {
    previousDay?: AisAnalyzeOptions['previousDay'];
    locationContext?: AisAnalyzeOptions['locationContext'];
  },
): CrewDailyStateAggregate {
  const counts = countStates(samples);
  const sampleCount = samples.length;

  const analyzerInput = buildAnalyzerInput(samples);

  if (analyzerInput.length >= 2) {
    const analysis = analyzeAisDailyState(analyzerInput, {
      previousDay: options?.previousDay ?? null,
      locationContext: options?.locationContext ?? null,
      minUnderwayMs: MIN_UNDERWAY_MS_FOR_SEA_DAY,
    });

    return {
      state: analysis.state,
      reason: analysis.reason,
      confidence: analysis.confidence,
      counts,
      sampleCount,
      seaDayRuleFired: analysis.state === 'underway',
      metrics: analysis.metrics,
      usedFallback: false,
    };
  }

  // Fallback: not enough positions to run the analyzer. Use frequency vote
  // with previous-day carry-forward for stationary states.
  return frequencyFallback(samples, counts, sampleCount, options?.previousDay ?? null);
}

function countStates(samples: CrewAisSample[]): Record<DailyStatus, number> {
  const counts: Record<DailyStatus, number> = {
    underway: 0,
    'at-anchor': 0,
    'in-port': 0,
    'in-yard': 0,
    'on-leave': 0,
  };
  for (const s of samples) {
    if (ALL_STATES.includes(s.state)) counts[s.state] += 1;
  }
  return counts;
}

/**
 * Convert crew samples into the shape the analyzer needs — a list of
 * Datalastic positions with `timestampMs` populated from the sample time.
 */
function buildAnalyzerInput(samples: CrewAisSample[]) {
  return samples
    .filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')
    .map((s) => {
      const sampledMs = Date.parse(s.sampledAt);
      const rawEpoch = s.rawPosition?.last_position_epoch
        ? s.rawPosition.last_position_epoch * 1000
        : null;
      const timestampMs =
        rawEpoch ?? (Number.isFinite(sampledMs) ? sampledMs : null);
      // Prefer the raw Datalastic payload if we stored it (has all nav status
      // spellings and epoch); overlay the sample's lat/lon so we're immune to
      // any raw normalisation quirks.
      const base = (s.rawPosition as DatalasticVesselPosition | null) ?? {};
      return {
        ...base,
        lat: s.lat as number,
        lon: s.lon as number,
        speed: s.speedKn ?? base.speed ?? null,
        navigational_status:
          base.navigational_status ?? base.navigation_status ?? s.navStatus ?? null,
        last_position_UTC: base.last_position_UTC ?? s.sampledAt,
        timestampMs,
      };
    });
}

function frequencyFallback(
  samples: CrewAisSample[],
  counts: Record<DailyStatus, number>,
  sampleCount: number,
  previousDay: AisAnalyzeOptions['previousDay'],
): CrewDailyStateAggregate {
  if (sampleCount === 0) {
    // No samples today at all. If yesterday was stationary, carry it forward
    // exactly like the analyzer would.
    if (previousDay && isStationary(previousDay.state)) {
      return {
        state: previousDay.state,
        reason: `No AIS samples today — carrying forward yesterday's "${previousDay.state}".`,
        confidence: 'low',
        counts,
        sampleCount: 0,
        seaDayRuleFired: false,
        usedFallback: true,
      };
    }
    return {
      state: 'in-port',
      reason: 'No AIS samples recorded today.',
      confidence: 'low',
      counts,
      sampleCount: 0,
      seaDayRuleFired: false,
      usedFallback: true,
    };
  }

  // With only one sample we can't run the analyzer, but we can still use its
  // key rule: if the single sample is `underway`, we don't have anywhere near
  // 4 hours of movement evidence, so demote to yesterday's stationary state or
  // "at-anchor" as a neutral fallback.
  if (sampleCount === 1) {
    const only = samples[0].state;
    if (only === 'underway') {
      if (previousDay && isStationary(previousDay.state)) {
        return {
          state: previousDay.state,
          reason: `Only one AIS sample was underway — not enough to prove ≥ 4h at sea. Carrying forward yesterday's "${previousDay.state}".`,
          confidence: 'low',
          counts,
          sampleCount,
          seaDayRuleFired: false,
          usedFallback: true,
        };
      }
      return {
        state: 'at-anchor',
        reason: 'Only one AIS sample was underway — not enough evidence for a sea day; defaulted to at-anchor.',
        confidence: 'low',
        counts,
        sampleCount,
        seaDayRuleFired: false,
        usedFallback: true,
      };
    }
    return {
      state: only,
      reason: `Single AIS sample was "${only}".`,
      confidence: 'low',
      counts,
      sampleCount,
      seaDayRuleFired: false,
      usedFallback: true,
    };
  }

  // Multiple samples but none with coords: pick the most frequent.
  let best: DailyStatus = 'in-port';
  let bestCount = -1;
  for (const s of TIE_BREAK_ORDER) {
    if (counts[s] > bestCount) {
      bestCount = counts[s];
      best = s;
    }
  }

  // If we ended up on `underway` via frequency alone, check if the analyzer's
  // ≥ 4-sample threshold would actually be met.
  const seaDayRuleFired = best === 'underway' && counts.underway >= 4;
  if (best === 'underway' && !seaDayRuleFired) {
    // Not enough underway samples to prove ≥ 4 hours — pick the next best.
    const alt = pickBestNonUnderway(counts);
    return {
      state: alt,
      reason: `Underway samples (${counts.underway}) fall below the 4-hour minimum — most-frequent non-underway state ("${alt}") applied.`,
      confidence: 'medium',
      counts,
      sampleCount,
      seaDayRuleFired: false,
      usedFallback: true,
    };
  }

  return {
    state: best,
    reason: describeFrequencyPick(counts, best, sampleCount),
    confidence: sampleCount >= 3 ? 'medium' : 'low',
    counts,
    sampleCount,
    seaDayRuleFired,
    usedFallback: true,
  };
}

function pickBestNonUnderway(counts: Record<DailyStatus, number>): DailyStatus {
  let best: DailyStatus = 'in-port';
  let bestCount = -1;
  for (const s of TIE_BREAK_ORDER) {
    if (s === 'underway') continue;
    if (counts[s] > bestCount) {
      bestCount = counts[s];
      best = s;
    }
  }
  return best;
}

function isStationary(state: DailyStatus): boolean {
  return state === 'in-port' || state === 'at-anchor' || state === 'in-yard';
}

function describeFrequencyPick(
  counts: Record<DailyStatus, number>,
  pick: DailyStatus,
  total: number,
): string {
  const n = counts[pick];
  const others = ALL_STATES.filter((s) => s !== pick && counts[s] > 0)
    .map((s) => `${s}=${counts[s]}`)
    .join(', ');
  const otherSummary = others ? ` (others: ${others})` : '';
  return `Most frequent state was "${pick}" (${n}/${total} samples)${otherSummary}.`;
}
