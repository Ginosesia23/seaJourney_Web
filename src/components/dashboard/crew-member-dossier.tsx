'use client';

/**
 * CrewMemberDossier — layout shell for the vessel-manager crew detail view.
 * Zones: status strip → needs attention → section nav → active panel.
 * Identity (name / onboard) stays in the page header above this shell.
 */

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  FileText,
  LayoutDashboard,
  Ship,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type CrewDossierSection =
  | 'overview'
  | 'calendar'
  | 'documents'
  | 'leave'
  | 'watches'
  | 'profile';

export type CrewDossierStatKey =
  | 'seaService'
  | 'totalDays'
  | 'leaveDays'
  | 'documents';

export interface CrewDossierStat {
  key: CrewDossierStatKey;
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
}

export interface CrewDossierAttentionItem {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const SECTIONS: {
  id: CrewDossierSection;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'leave', label: 'Leave', icon: CalendarDays },
  { id: 'watches', label: 'Watches', icon: Clock },
  { id: 'profile', label: 'Profile', icon: UserRound },
];

export interface CrewMemberDossierProps {
  section: CrewDossierSection;
  onSectionChange: (section: CrewDossierSection) => void;
  stats: CrewDossierStat[];
  onStatClick?: (key: CrewDossierStatKey) => void;
  attentionItems?: CrewDossierAttentionItem[];
  /** Small control next to sea-service context (e.g. crew vs vessel logs). */
  dataSourceControl?: ReactNode;
  periodControl?: ReactNode;
  children: ReactNode;
}

export function CrewMemberDossier({
  section,
  onSectionChange,
  stats,
  onStatClick,
  attentionItems = [],
  dataSourceControl,
  periodControl,
  children,
}: CrewMemberDossierProps) {
  return (
    <div className="flex flex-col gap-4">
      {periodControl}

      {/* Status strip */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Ship className="h-3.5 w-3.5" />
            Status
          </div>
          {dataSourceControl}
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {stats.map((stat) => {
            const clickable = !!onStatClick;
            const Comp = clickable ? 'button' : 'div';
            return (
              <Comp
                key={stat.key}
                type={clickable ? 'button' : undefined}
                onClick={clickable ? () => onStatClick?.(stat.key) : undefined}
                className={cn(
                  'bg-card px-4 py-3.5 text-left transition-colors',
                  clickable && 'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                )}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  {stat.loading ? (
                    <span className="text-sm text-muted-foreground">…</span>
                  ) : (
                    <span className="text-2xl font-semibold tabular-nums tracking-tight">
                      {stat.value}
                    </span>
                  )}
                </div>
                {stat.hint ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                    {stat.hint}
                  </p>
                ) : null}
              </Comp>
            );
          })}
        </div>
      </section>

      {/* Needs attention */}
      {attentionItems.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-amber-300/50 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300/40 px-4 py-2.5 dark:border-amber-500/20 sm:px-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs attention
            </div>
            <Badge
              variant="secondary"
              className="rounded-md border-amber-400/40 bg-amber-100/80 text-[10px] uppercase tracking-wider text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            >
              {attentionItems.length} item{attentionItems.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <ul className="divide-y divide-amber-300/30 dark:divide-amber-500/15">
            {attentionItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-amber-900/80 dark:text-amber-200/80">
                    {item.description}
                  </p>
                </div>
                {item.onAction && item.actionLabel ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-lg border-amber-600/40 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    onClick={item.onAction}
                  >
                    {item.actionLabel}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Section nav + panel */}
      <section className="overflow-hidden rounded-xl border bg-card">
        <div
          role="tablist"
          aria-label="Crew member sections"
          className="flex gap-1 overflow-x-auto border-b bg-muted/20 p-1.5"
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSectionChange(id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </section>
    </div>
  );
}
