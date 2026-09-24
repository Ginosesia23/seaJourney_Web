'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AIS_TRIGGER_LABELS, type AisTriggerSource } from '@/lib/ais/fetch-audit-shared';
import type { AisMonitorHealthStatus } from '@/lib/ais/monitor/types';

import { humanizeToken } from './format';
import { Pill, StatusDot, type StudioTone } from './studio';

export function OutcomeBadge({ success, providerCalled = true }: { success: boolean; providerCalled?: boolean }) {
  if (!providerCalled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <StatusDot tone="muted">
              <span className="text-muted-foreground">Not sent</span>
            </StatusDot>
          </span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Aborted before any provider request (e.g. missing MMSI/IMO).</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <StatusDot tone={success ? 'emerald' : 'destructive'}>
      <span className={success ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}>
        {success ? 'Success' : 'Failed'}
      </span>
    </StatusDot>
  );
}

export function HttpStatusBadge({ status }: { status: number | null }) {
  if (status == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tone: StudioTone =
    status === 429 || status === 401 || status === 403 ? 'destructive' : status >= 400 ? 'amber' : 'emerald';
  return (
    <Pill tone={tone} mono>
      {status}
    </Pill>
  );
}

const TRIGGER_TONE: Record<AisTriggerSource, StudioTone> = {
  adaptive_scheduler: 'sky',
  retry: 'amber',
  manual_admin: 'violet',
  manual_user: 'violet',
  premium_enabled: 'emerald',
  entitlement_refresh: 'emerald',
  state_change: 'sky',
  initial_tracking_start: 'emerald',
  history_import: 'muted',
  vessel_lookup: 'muted',
  unknown: 'muted',
};

export function TriggerBadge({ trigger, detail }: { trigger: AisTriggerSource; detail?: string | null }) {
  const pill = <Pill tone={TRIGGER_TONE[trigger]}>{AIS_TRIGGER_LABELS[trigger]}</Pill>;
  if (!detail) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{pill}</span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-xs">{detail}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <span className="text-xs text-muted-foreground">—</span>;
  const tone: StudioTone =
    mode === 'fast' || mode === 'transition'
      ? 'sky'
      : mode === 'failure_retry'
        ? 'destructive'
        : mode === 'normal'
          ? 'emerald'
          : 'muted';
  return <Pill tone={tone}>{humanizeToken(mode)}</Pill>;
}

const HEALTH: Record<AisMonitorHealthStatus, { label: string; tone: StudioTone; help: string }> = {
  healthy: { label: 'Healthy', tone: 'emerald', help: 'Provider requests are succeeding and the scheduler is running.' },
  degraded: { label: 'Degraded', tone: 'amber', help: 'One or more warnings are active — see Alerts.' },
  down: {
    label: 'Down',
    tone: 'destructive',
    help: 'No recent successful requests, authentication failures, or a stalled scheduler.',
  },
  idle: { label: 'Idle', tone: 'muted', help: 'No vessels are enabled for provider polling and no requests in 24h.' },
};

export function HealthIndicator({ status, live }: { status: AisMonitorHealthStatus | null; live: boolean }) {
  const h = status ? HEALTH[status] : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-xs">
          <StatusDot tone={h?.tone ?? 'muted'} pulse={live && !!h && status !== 'idle'}>
            <span className="font-medium text-foreground">{h?.label ?? 'Loading'}</span>
          </StatusDot>
          {live ? <span className="text-muted-foreground">Live</span> : null}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{h?.help ?? 'Loading monitor status…'}</TooltipContent>
    </Tooltip>
  );
}
