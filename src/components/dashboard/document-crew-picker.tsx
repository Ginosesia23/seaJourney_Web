'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, UserRound, Users } from 'lucide-react';
import { format, parse, startOfDay } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserProfile, VesselAssignment } from '@/lib/types';
import { cn } from '@/lib/utils';

export type DocumentCrewOption = {
  profile: UserProfile;
  assignment: VesselAssignment;
  isActive: boolean;
  positionLabel: string;
};

export type CrewStatusFilter = 'all' | 'present' | 'past';

function parseAssignmentDay(dateStr: string): Date {
  const day = dateStr.slice(0, 10);
  return startOfDay(parse(day, 'yyyy-MM-dd', new Date()));
}

export function isCrewAssignmentActive(a: {
  endDate?: string | null;
}): boolean {
  if (!a.endDate) return true;
  try {
    const end = parseAssignmentDay(a.endDate);
    if (Number.isNaN(end.getTime())) return true;
    return end > startOfDay(new Date());
  } catch {
    return true;
  }
}

function formatPeriod(assignment: VesselAssignment): string {
  try {
    const start = format(parseAssignmentDay(assignment.startDate), 'dd MMM yyyy');
    if (!assignment.endDate) return `${start} – present`;
    const end = format(parseAssignmentDay(assignment.endDate), 'dd MMM yyyy');
    return `${start} – ${end}`;
  } catch {
    return assignment.endDate
      ? `${assignment.startDate} – ${assignment.endDate}`
      : `${assignment.startDate} – present`;
  }
}

function displayName(profile: UserProfile): string {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  return name || profile.username || profile.email || 'Unknown';
}

export function DocumentCrewPicker({
  crewList,
  value,
  onValueChange,
  loading,
  className,
}: {
  crewList: DocumentCrewOption[];
  value: string;
  onValueChange: (crewId: string) => void;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CrewStatusFilter>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');

  const selected = useMemo(
    () => crewList.find((c) => c.profile.id === value) ?? null,
    [crewList, value],
  );

  const positionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of crewList) {
      const p = c.positionLabel.trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [crewList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return crewList.filter((c) => {
      if (statusFilter === 'present' && !c.isActive) return false;
      if (statusFilter === 'past' && c.isActive) return false;
      if (positionFilter !== 'all' && c.positionLabel !== positionFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        displayName(c.profile),
        c.profile.email,
        c.profile.username,
        c.positionLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [crewList, search, statusFilter, positionFilter]);

  const presentCount = crewList.filter((c) => c.isActive).length;
  const pastCount = crewList.length - presentCount;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[7.5rem] space-y-1">
          <Label className="text-[11px] text-muted-foreground">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as CrewStatusFilter)}
          >
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All ({crewList.length})
              </SelectItem>
              <SelectItem value="present">
                Present ({presentCount})
              </SelectItem>
              <SelectItem value="past">
                Past ({pastCount})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[12rem]">
          <Label className="text-[11px] text-muted-foreground">Position</Label>
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue placeholder="All positions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              {positionOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Crew member</Label>
        {loading ? (
          <div className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4 animate-pulse" />
            Loading crew…
          </div>
        ) : (
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setSearch('');
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  'h-auto min-h-11 w-full justify-between rounded-xl px-3 py-2 text-left font-normal',
                  !selected && 'text-muted-foreground',
                )}
              >
                {selected ? (
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {displayName(selected.profile)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 px-1.5 text-[10px] font-medium',
                            selected.isActive
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                              : 'border-muted-foreground/25 bg-muted/60 text-muted-foreground',
                          )}
                        >
                          {selected.isActive ? 'Present' : 'Past'}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {[selected.positionLabel || null, formatPeriod(selected.assignment)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-sm">
                    <UserRound className="h-4 w-4 opacity-60" />
                    Select crew member
                  </span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
            >
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email, or position…"
                    className="h-9 rounded-lg pl-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setOpen(false);
                    }}
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No crew match these filters.
                  </p>
                ) : (
                  filtered.map((c) => {
                    const isSelected = c.profile.id === value;
                    return (
                      <button
                        key={`${c.profile.id}:${c.assignment.id}`}
                        type="button"
                        onClick={() => {
                          onValueChange(c.profile.id);
                          setOpen(false);
                          setSearch('');
                        }}
                        className={cn(
                          'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                          isSelected && 'bg-muted/40',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            c.isActive
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <UserRound className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {displayName(c.profile)}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 px-1.5 text-[10px] font-medium',
                                c.isActive
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                  : 'border-muted-foreground/25 bg-muted/60 text-muted-foreground',
                              )}
                            >
                              {c.isActive ? 'Present' : 'Past'}
                            </Badge>
                          </span>
                          {c.positionLabel ? (
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-foreground/80">
                              {c.positionLabel}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {c.profile.email || 'No email'}
                            {' · '}
                            {formatPeriod(c.assignment)}
                          </span>
                        </span>
                        {isSelected ? (
                          <Check className="mt-1 h-4 w-4 shrink-0 text-foreground" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
