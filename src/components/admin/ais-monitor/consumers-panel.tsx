'use client';

import Link from 'next/link';
import { ArrowUpRight, Users } from 'lucide-react';

import type { AisMonitorConsumer, AisMonitorConsumers } from '@/lib/ais/monitor/types';
import { cn } from '@/lib/utils';

import { fmtRelative, fmtShortTime, humanizeToken } from './format';
import { Pill, StatusDot, StudioEmpty, StudioPanel } from './studio';

const RELATIONSHIP_LABEL: Record<AisMonitorConsumer['relationship'], string> = {
  vessel_manager: 'Vessel manager',
  assigned_crew: 'Crew',
  former_crew: 'Former crew',
};

const USAGE_LABEL: Record<AisMonitorConsumer['usage'], string> = {
  vessel_plan: 'Vessel plan · daily logs',
  vessel_daily_logs: 'Daily logs · polling funded by crew',
  crew_live_tracking: 'Live AIS · sea service',
};

function ConsumerRow({ c, showFetchUsage }: { c: AisMonitorConsumer; showFetchUsage: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/dashboard/users/${c.userId}`}
            className="inline-flex max-w-full items-center gap-1 truncate text-sm text-foreground hover:underline"
          >
            {c.name ?? c.email ?? 'Unnamed account'}
            <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Link>
          <Pill tone={c.relationship === 'vessel_manager' ? 'violet' : 'muted'}>{RELATIONSHIP_LABEL[c.relationship]}</Pill>
          {c.subscriptionTier ? <Pill mono>{humanizeToken(c.subscriptionTier)}</Pill> : null}
        </div>
        {c.name && c.email ? <p className="truncate text-[11px] text-muted-foreground">{c.email}</p> : null}
        <p className="text-[11px] text-muted-foreground">
          {USAGE_LABEL[c.usage]}
          {c.lastSampleAt ? (
            <>
              {' · last sample '}
              <span className="font-mono" title={c.lastSampleAt}>
                {fmtRelative(c.lastSampleAt)}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {showFetchUsage ? (
          c.usedThisFetch ? (
            <StatusDot tone="emerald">
              <span className="text-foreground">Used this fetch</span>
            </StatusDot>
          ) : (
            <StatusDot tone="muted">
              <span className="text-muted-foreground">Not used</span>
            </StatusDot>
          )
        ) : (
          <StatusDot tone={c.receiving ? 'emerald' : 'muted'}>
            <span className={c.receiving ? 'text-foreground' : 'text-muted-foreground'}>
              {c.receiving ? 'Receiving' : 'Not receiving'}
            </span>
          </StatusDot>
        )}
        {c.reason ? <span className="max-w-[160px] text-[10px] text-amber-600">{c.reason}</span> : null}
      </div>
    </li>
  );
}

/** Accounts using a vessel's central AIS data (and, for a single fetch, who used it). */
export function ConsumersPanel({
  consumers,
  className,
}: {
  consumers: AisMonitorConsumers | null | undefined;
  className?: string;
}) {
  const perFetch = !!consumers?.fetchWindow;
  const w = consumers?.fetchWindow;
  const description = perFetch && w
    ? `Samples recorded ${fmtShortTime(w.from)} – ${fmtShortTime(w.to)} (until the next fetch) are attributed to this request. Plan / tracking status reflects current account settings.`
    : 'Accounts linked to this vessel and whether they currently receive AIS-derived records.';

  return (
    <StudioPanel
      title="Data consumers"
      icon={Users}
      description={description}
      className={className}
      action={
        consumers ? (
          <div className="flex items-center gap-1.5">
            {perFetch ? (
              <Pill tone={consumers.usedThisFetchCount ? 'emerald' : 'muted'} mono>
                {consumers.usedThisFetchCount ?? 0} used
              </Pill>
            ) : null}
            <Pill tone={consumers.receivingCount ? 'sky' : 'muted'} mono>
              {consumers.receivingCount} receiving
            </Pill>
          </div>
        ) : null
      }
    >
      {!consumers ? (
        <StudioEmpty>Request is not attributed to a vessel.</StudioEmpty>
      ) : consumers.accounts.length === 0 ? (
        <StudioEmpty>No manager or assigned crew accounts are linked to this vessel.</StudioEmpty>
      ) : (
        <ul className={cn('divide-y divide-border bg-background')}>
          {consumers.accounts.map((c) => (
            <ConsumerRow key={c.userId} c={c} showFetchUsage={perFetch} />
          ))}
        </ul>
      )}
    </StudioPanel>
  );
}
