'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Bug, Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { hasCrewAisLiveTrackingTier } from '@/supabase/database/subscription-helpers';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';
import { AisDebugGate } from '@/components/dashboard/ais-debug-gate';

type PreviewSample = {
  id: string;
  sampledAt: string;
  state: string;
  navStatus: string | null;
  speedKn: number | null;
  lat: number | null;
  lon: number | null;
};

type PreviewResponse = {
  vesselId: string;
  vesselName: string | null;
  query: { mmsi: string | null; imo: string | null };
  fetchedAt: string;
  isStale: boolean;
  mappedState: string;
  resolvedState?: {
    state: string;
    confidence: string;
    reason: string;
    distanceFromPreviousNm: number | null;
    positionChangedMeaningfully: boolean;
  };
  previousSampleForResolver?: {
    state: string;
    lat: number | null;
    lon: number | null;
    sampledAt: string;
  } | null;
  placeMemory?: {
    state: string;
    lat: number;
    lon: number;
    distanceNm: number;
    source: string;
    visitCount: number;
    placeName?: string | null;
  } | null;
  logDate: string;
  positionLogDate?: string;
  position: Record<string, unknown>;
  normalisedNavStatus: string | null;
  rawNavStatus: string | null;
  previousDay: {
    date: string;
    state: string;
    notes: string | null;
    lastLatitude: number | null;
    lastLongitude: number | null;
  } | null;
  locationContext: {
    endOfDayPlaceName: string | null;
    endOfDayInPopulatedArea: boolean;
  } | null;
  aggregate: {
    state: string;
    reason: string;
    confidence: string;
    counts: Record<string, number>;
    sampleCount: number;
    seaDayRuleFired: boolean;
    usedFallback: boolean;
    metrics: Record<string, unknown> | null;
  };
  todaySamples: PreviewSample[];
  error?: string;
};

type CrewAisDebugPanelProps = {
  accessToken: string | null;
  profileRaw: unknown;
};

/**
 * Crew-side AIS debug panel. Hidden behind a local PIN gate on the live
 * site; only fetches Datalastic after unlock. Read-only — does not record
 * a sample or update the calendar.
 */
export function CrewAisDebugPanel({ accessToken, profileRaw }: CrewAisDebugPanelProps) {
  const { boost: vesselBoost } = useCrewVesselFeatureBoost();
  const eligible = hasCrewAisLiveTrackingTier(profileRaw, vesselBoost);
  if (!eligible) return null;

  return (
    <AisDebugGate>
      <CrewAisDebugPanelBody accessToken={accessToken} />
    </AisDebugGate>
  );
}

function CrewAisDebugPanelBody({ accessToken }: { accessToken: string | null }) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    const logDate = format(new Date(), 'yyyy-MM-dd');
    try {
      const res = await fetch(
        `/api/ais/crew-preview?logDate=${encodeURIComponent(logDate)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data);
    } catch (err: unknown) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const pos = preview?.position ?? {};
  const navStatus = preview?.normalisedNavStatus || '—';
  const navStatusRawLabel =
    preview?.rawNavStatus && preview.rawNavStatus !== preview.normalisedNavStatus
      ? preview.rawNavStatus
      : null;
  const speed = typeof pos.speed === 'number' ? `${(pos.speed as number).toFixed(1)} kn` : '—';
  const lat = typeof pos.lat === 'number' ? (pos.lat as number).toFixed(5) : '—';
  const lon = typeof pos.lon === 'number' ? (pos.lon as number).toFixed(5) : '—';
  const lastPosition =
    typeof pos.last_position_UTC === 'string'
      ? format(parseISO(pos.last_position_UTC as string), 'd MMM yyyy · HH:mm:ss')
      : '—';

  return (
    <Card className="rounded-xl border border-amber-500/40 bg-amber-500/5 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bug className="h-4 w-4 text-amber-600" />
              Crew AIS debug
            </CardTitle>
            <CardDescription>
              Live Datalastic response for your active vessel + full analyzer
              inputs. Read-only — does not record a sample.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-300">
            Debug
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            disabled={loading}
            onClick={() => void loadPreview()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh preview
              </>
            )}
          </Button>
          {preview?.fetchedAt && (
            <span className="text-xs text-muted-foreground">
              Fetched {format(parseISO(preview.fetchedAt), 'HH:mm:ss')}
              {preview.vesselName ? ` · ${preview.vesselName}` : ''}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {preview && !error && (
          <>
            {/* Resolved sample state — what gets INSERTED into the sample
                table and compared for state-change notifications. This is
                the stability-aware wrapper around the raw single-fix
                mapping; if it disagrees with the mapped state, it means
                position stability or geocoding overrode a noisy fix. */}
            {preview.resolvedState && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Resolved sample state
                  </span>
                  <span className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
                    {preview.resolvedState.state}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {preview.resolvedState.confidence}
                  </span>
                  {preview.resolvedState.state !== preview.mappedState && (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
                    >
                      Stabilized (raw: {preview.mappedState})
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm">{preview.resolvedState.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Distance from previous fix:{' '}
                  {preview.resolvedState.distanceFromPreviousNm != null
                    ? `${(preview.resolvedState.distanceFromPreviousNm * 1852).toFixed(0)} m`
                    : '—'}
                  {' · '}Position changed meaningfully:{' '}
                  {preview.resolvedState.positionChangedMeaningfully ? 'yes' : 'no'}
                  {preview.previousSampleForResolver && (
                    <>
                      {' · '}Previous sample state: {preview.previousSampleForResolver.state}
                    </>
                  )}
                </p>
              </div>
            )}

            {preview.placeMemory && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Place memory
                </p>
                <p className="mt-1">
                  Prior <span className="font-semibold">{preview.placeMemory.state}</span>
                  {' · '}
                  {(preview.placeMemory.distanceNm * 1852).toFixed(0)} m away
                  {' · '}
                  {preview.placeMemory.visitCount} visit
                  {preview.placeMemory.visitCount === 1 ? '' : 's'}
                  {' · '}
                  {preview.placeMemory.source}
                  {preview.placeMemory.placeName
                    ? ` · ${preview.placeMemory.placeName}`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Match buffer ≈ 740 m (0.4 nm) — GPS never repeats exact
                  coordinates.
                </p>
              </div>
            )}

            {/* Analyzer verdict — this is what would be written to the
                calendar right now. Shows the reason too so you can see which
                rule fired and whether it's disagreeing with the raw single-fix
                mapped state. */}
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Analyzer verdict
                </span>
                <span className="text-base font-semibold text-sky-800 dark:text-sky-200">
                  {preview.aggregate.state}
                </span>
                <span className="text-xs text-muted-foreground">
                  · confidence: {preview.aggregate.confidence}
                </span>
                {preview.aggregate.usedFallback && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
                    Frequency fallback
                  </Badge>
                )}
                {preview.aggregate.state !== preview.mappedState && (
                  <Badge variant="outline" className="border-rose-500/50 text-rose-700 dark:text-rose-300">
                    Differs from single-fix ({preview.mappedState})
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm">{preview.aggregate.reason}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DebugField label="Mapped state (single fix)" value={preview.mappedState} highlight />
              <DebugField label="Sync log date" value={preview.logDate} />
              {preview.positionLogDate && preview.positionLogDate !== preview.logDate && (
                <DebugField label="Position UTC date" value={preview.positionLogDate} />
              )}
              <DebugField label="Stale?" value={preview.isStale ? 'Yes (>6h old)' : 'No'} />
              <DebugField
                label="Nav status"
                value={navStatusRawLabel ? `${navStatus} (raw: ${navStatusRawLabel})` : navStatus}
              />
              <DebugField label="Speed" value={speed} />
              <DebugField label="Lat / Lon" value={`${lat}, ${lon}`} />
              <DebugField label="Last position" value={lastPosition} />
              <DebugField
                label="Query"
                value={`MMSI ${preview.query.mmsi || '—'} · IMO ${preview.query.imo || '—'}`}
              />
              <DebugField
                label="Geocode place"
                value={preview.locationContext?.endOfDayPlaceName || '—'}
              />
              <DebugField
                label="Populated area?"
                value={
                  preview.locationContext
                    ? preview.locationContext.endOfDayInPopulatedArea
                      ? 'Yes'
                      : 'No'
                    : '—'
                }
              />
              <DebugField
                label="Previous-day state"
                value={
                  preview.previousDay
                    ? `${preview.previousDay.state} · ${preview.previousDay.date}`
                    : '—'
                }
              />
              <DebugField
                label="Previous-day last coord"
                value={
                  preview.previousDay?.lastLatitude != null &&
                  preview.previousDay.lastLongitude != null
                    ? `${preview.previousDay.lastLatitude.toFixed(4)}, ${preview.previousDay.lastLongitude.toFixed(4)}`
                    : '—'
                }
              />
              <DebugField
                label="Today samples"
                value={String(preview.todaySamples.length)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Today&apos;s stored samples ({preview.todaySamples.length})
              </p>
              {preview.todaySamples.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No samples recorded yet today.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-background">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Time (UTC)</th>
                        <th className="px-2 py-1.5 text-left font-medium">State</th>
                        <th className="px-2 py-1.5 text-left font-medium">Nav status</th>
                        <th className="px-2 py-1.5 text-right font-medium">Speed</th>
                        <th className="px-2 py-1.5 text-right font-medium">Lat</th>
                        <th className="px-2 py-1.5 text-right font-medium">Lon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.todaySamples.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="px-2 py-1.5 font-mono">
                            {format(parseISO(s.sampledAt), 'HH:mm:ss')}
                          </td>
                          <td className="px-2 py-1.5">{s.state}</td>
                          <td className="px-2 py-1.5 truncate">{s.navStatus ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right">
                            {s.speedKn != null ? `${s.speedKn.toFixed(1)} kn` : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {s.lat != null ? s.lat.toFixed(4) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {s.lon != null ? s.lon.toFixed(4) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Raw Datalastic JSON
              </p>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
                {JSON.stringify(preview.position, null, 2)}
              </pre>
            </div>

            <details className="rounded-lg border bg-background p-3 text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Full preview payload
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto text-xs leading-relaxed">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DebugField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background/80 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-sm font-medium break-words ${highlight ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
