'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, MapPin, Radio } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { AisMonitorFetchDetail } from '@/lib/ais/monitor/types';

import { HttpStatusBadge, ModeBadge, OutcomeBadge, TriggerBadge } from './badges';
import { fmtDateTime, fmtMs, humanizeToken } from './format';
import { useAdminMonitorQuery } from './hooks';
import { StudioPanel } from './studio';
import { vesselMonitorHref } from './vessel-panels';

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[132px_1fr] items-start gap-3 border-b border-border px-4 py-2 last:border-b-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className={mono ? 'min-w-0 break-words font-mono text-xs' : 'min-w-0 break-words text-xs'}>{children}</div>
    </div>
  );
}

export function FetchDetailSheet({ fetchId, onClose }: { fetchId: string | null; onClose: () => void }) {
  const { data, error, isLoading } = useAdminMonitorQuery<AisMonitorFetchDetail>(
    fetchId ? `/api/admin/ais-monitor/fetches/${fetchId}` : null,
    { enabled: !!fetchId, pollMs: null },
  );
  const f = data?.fetch.id === fetchId ? data.fetch : null;
  const obs = data?.fetch.id === fetchId ? data.observation : null;

  return (
    <Sheet open={!!fetchId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border p-0 sm:max-w-lg">
        <SheetHeader className="space-y-1 border-b border-border bg-muted/40 px-5 py-4 text-left">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5" /> AIS Monitor <span className="text-border">/</span>
            <span className="text-foreground">Request</span>
          </p>
          <SheetTitle className="text-base font-medium">Provider request</SheetTitle>
          <SheetDescription className="text-[11px]">
            Audit record from ais_fetch_log. No raw provider payload, URL or credentials are stored.
          </SheetDescription>
          {fetchId ? <p className="font-mono text-[10px] text-muted-foreground">{fetchId}</p> : null}
        </SheetHeader>

        <div className="space-y-4 p-5">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading || !f ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeBadge success={f.success} providerCalled={f.providerCalled} />
                <HttpStatusBadge status={f.httpStatus} />
                <TriggerBadge trigger={f.triggerSource} detail={f.triggerDetail} />
                <span className="font-mono text-[11px] text-muted-foreground">{fmtMs(f.responseTimeMs)}</span>
              </div>

              <StudioPanel title="Request">
                <Row label="Vessel">
                  {f.vesselId ? (
                    <Link
                      href={vesselMonitorHref(f.vesselId)}
                      className="inline-flex items-center gap-1 text-foreground hover:underline"
                    >
                      {data?.vessel?.name ?? 'Unknown vessel'} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="italic text-muted-foreground">Unattributed</span>
                  )}
                </Row>
                <Row label="MMSI" mono>
                  {f.mmsi ?? data?.vessel?.mmsi ?? '—'}
                </Row>
                <Row label="Provider">
                  {f.provider}
                  {f.endpoint ? <span className="ml-1 font-mono text-muted-foreground">/{f.endpoint}</span> : null}
                </Row>
                <Row label="Requested" mono>
                  {fmtDateTime(f.requestedAt)}
                </Row>
                <Row label="Completed" mono>
                  {fmtDateTime(f.completedAt)}
                </Row>
                <Row label="Response time" mono>
                  {fmtMs(f.responseTimeMs)}
                </Row>
                <Row label="Trigger detail" mono>
                  {f.triggerDetail ?? '—'}
                </Row>
                <Row label="Tracking mode">
                  <ModeBadge mode={f.trackingMode} />
                </Row>
                <Row label="Scheduled reason">{humanizeToken(f.scheduledReason)}</Row>
                <Row label="Credits used">
                  {f.providerCreditsUsed ?? <span className="text-muted-foreground">Not reported</span>}
                </Row>
                {f.errorMessage ? (
                  <Row label="Error">
                    <span className="text-destructive">{f.errorMessage}</span>
                  </Row>
                ) : null}
              </StudioPanel>

              <StudioPanel title="Resulting observation" icon={MapPin}>
                {obs ? (
                  <>
                    <Row label="State">{humanizeToken(obs.state)}</Row>
                    <Row label="Speed" mono>
                      {obs.speedKn != null ? `${obs.speedKn.toFixed(1)} kn` : '—'}
                    </Row>
                    <Row label="Heading / course" mono>
                      {obs.heading ?? '—'}° / {obs.course ?? '—'}°
                    </Row>
                    <Row label="Position" mono>
                      {obs.latitude != null && obs.longitude != null
                        ? `${obs.latitude.toFixed(5)}, ${obs.longitude.toFixed(5)}`
                        : '—'}
                    </Row>
                    <Row label="Nav status">{obs.rawNavigationStatus ?? '—'}</Row>
                    <Row label="Provider fix time" mono>
                      {fmtDateTime(obs.providerTimestamp)}
                    </Row>
                  </>
                ) : (
                  <p className="px-4 py-4 text-[11px] text-muted-foreground">
                    {f.success
                      ? 'No matching observation found (history/lookup requests do not create observations; duplicate fixes are de-duplicated).'
                      : 'Failed requests do not create observations.'}
                  </p>
                )}
              </StudioPanel>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
