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
import { hasVesselAisTrackingTier } from '@/lib/vessel-ais-access';
import { getAisNavStatus, normalizeAisNavStatus } from '@/lib/ais/map-ais-to-state';
import { AisDebugGate } from '@/components/dashboard/ais-debug-gate';

type AisPreviewResponse = {
  vesselId: string;
  query: { mmsi: string | null; imo: string | null };
  fetchedAt: string;
  isStale: boolean;
  mappedState: string;
  logDate: string;
  positionLogDate?: string;
  position: Record<string, unknown>;
  error?: string;
};

type AisDebugPanelProps = {
  vesselId: string;
  accessToken: string | null;
  profileRaw: unknown;
};

/** AIS debug UI — hidden behind a local PIN gate on the live site. */
export function AisDebugPanel({ vesselId, accessToken, profileRaw }: AisDebugPanelProps) {
  const eligible = hasVesselAisTrackingTier(profileRaw);
  if (!eligible) return null;

  return (
    <AisDebugGate>
      <AisDebugPanelBody vesselId={vesselId} accessToken={accessToken} />
    </AisDebugGate>
  );
}

function AisDebugPanelBody({
  vesselId,
  accessToken,
}: {
  vesselId: string;
  accessToken: string | null;
}) {
  const [preview, setPreview] = useState<AisPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    const logDate = format(new Date(), 'yyyy-MM-dd');
    try {
      const res = await fetch(
        `/api/ais/preview?vesselId=${encodeURIComponent(vesselId)}&logDate=${encodeURIComponent(logDate)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = (await res.json()) as AisPreviewResponse;
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data);
    } catch (err: unknown) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }, [accessToken, vesselId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const pos = preview?.position ?? {};
  const rawNavStatus = getAisNavStatus(
    pos as { navigational_status?: string | null; navigation_status?: string | null },
  );
  const navStatus = normalizeAisNavStatus(rawNavStatus) || '—';
  const navStatusRawLabel = rawNavStatus && rawNavStatus !== navStatus ? rawNavStatus : null;
  const speed = typeof pos.speed === 'number' ? `${pos.speed.toFixed(1)} kn` : '—';
  const lat = typeof pos.lat === 'number' ? pos.lat.toFixed(5) : '—';
  const lon = typeof pos.lon === 'number' ? pos.lon.toFixed(5) : '—';
  const lastPosition =
    typeof pos.last_position_UTC === 'string'
      ? format(parseISO(pos.last_position_UTC), 'd MMM yyyy · HH:mm:ss')
      : '—';

  return (
    <Card className="rounded-xl border border-amber-500/40 bg-amber-500/5 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bug className="h-4 w-4 text-amber-600" />
              AIS debug
            </CardTitle>
            <CardDescription>
              Live Datalastic response — read-only, does not change your state log.
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
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {preview && !error && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DebugField label="Mapped state" value={preview.mappedState} highlight />
              <DebugField label="Sync log date" value={preview.logDate} />
              {preview.positionLogDate && preview.positionLogDate !== preview.logDate && (
                <DebugField label="Position UTC date" value={preview.positionLogDate} />
              )}
              <DebugField
                label="Stale?"
                value={preview.isStale ? 'Yes (>6h old)' : 'No'}
              />
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
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Raw Datalastic JSON
              </p>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
                {JSON.stringify(preview.position, null, 2)}
              </pre>
            </div>
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
