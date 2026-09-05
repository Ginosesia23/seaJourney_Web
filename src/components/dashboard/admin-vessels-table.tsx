'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Loader2,
  MoreHorizontal,
  Pencil,
  Radio,
  Search,
  ShieldCheck,
  Ship,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Vessel } from '@/lib/types';
import { vesselTypes } from '@/lib/vessel-types';
import { cn } from '@/lib/utils';

export type VesselManagerInfo = {
  userId: string;
  name: string;
  email: string | null;
};

type StatusFilter = 'all' | 'subscribed' | 'official' | 'unmanaged' | 'ais';
type SortKey = 'name' | 'crew' | 'newest';

function readField(vessel: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = vessel[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function isOfficialVessel(vessel: Record<string, unknown>): boolean {
  const flag = readField(vessel, 'is_official', 'isOfficial');
  return flag === true || flag === 'true';
}

function hasAisTracking(vessel: Record<string, unknown>): boolean {
  return Boolean(readField(vessel, 'ais_tracking_enabled', 'aisTrackingEnabled'));
}

function vesselTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return vesselTypes.find((t) => t.value === type)?.label || type;
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone?: 'default' | 'emerald' | 'sky' | 'amber';
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="px-3 py-3">
        <div
          className={cn(
            'font-mono text-2xl font-medium tabular-nums tracking-tight',
            tone === 'emerald' && 'text-emerald-600',
            tone === 'sky' && 'text-sky-600',
            tone === 'amber' && 'text-amber-600',
            tone === 'default' && 'text-foreground',
          )}
        >
          {value}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function AdminVesselsTable({
  vessels,
  isLoading,
  crewCounts,
  pastCounts,
  subscribedIds,
  managers,
  onEdit,
  onDelete,
  onViewActiveCrew,
  onViewPastCrew,
}: {
  vessels: Vessel[];
  isLoading: boolean;
  crewCounts: Map<string, number>;
  pastCounts: Map<string, number>;
  subscribedIds: Set<string>;
  managers: Map<string, VesselManagerInfo>;
  onEdit: (vessel: Vessel) => void;
  onDelete: (vessel: { id: string; name: string }) => void;
  onViewActiveCrew: (vessel: { id: string; name: string }) => void;
  onViewPastCrew: (vessel: { id: string; name: string }) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');

  const stats = useMemo(() => {
    let subscribed = 0;
    let official = 0;
    let withCrew = 0;
    for (const vessel of vessels) {
      const row = vessel as unknown as Record<string, unknown>;
      if (subscribedIds.has(vessel.id)) subscribed += 1;
      if (isOfficialVessel(row)) official += 1;
      if ((crewCounts.get(vessel.id) ?? 0) > 0) withCrew += 1;
    }
    return { total: vessels.length, subscribed, official, withCrew };
  }, [vessels, subscribedIds, crewCounts]);

  const typeOptions = useMemo(() => {
    const present = new Set(vessels.map((v) => v.type).filter(Boolean));
    return vesselTypes.filter((t) => present.has(t.value));
  }, [vessels]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const rows = vessels.filter((vessel) => {
      const row = vessel as unknown as Record<string, unknown>;
      const manager = managers.get(vessel.id);
      const official = isOfficialVessel(row);
      const ais = hasAisTracking(row);
      const subscribed = subscribedIds.has(vessel.id);

      if (statusFilter === 'subscribed' && !subscribed) return false;
      if (statusFilter === 'official' && !official) return false;
      if (statusFilter === 'ais' && !ais) return false;
      if (statusFilter === 'unmanaged' && manager) return false;
      if (typeFilter !== 'all' && vessel.type !== typeFilter) return false;

      if (!q) return true;
      const imo = String(
        readField(row, 'imo', 'officialNumber', 'official_number') ?? '',
      );
      const mmsi = String(readField(row, 'mmsi') ?? '');
      const flag = String(readField(row, 'flag', 'flag_state') ?? '');
      const haystack = [
        vessel.name,
        vessel.type,
        vesselTypeLabel(vessel.type),
        imo,
        mmsi,
        flag,
        manager?.name,
        manager?.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    rows.sort((a, b) => {
      if (sortBy === 'crew') {
        return (crewCounts.get(b.id) ?? 0) - (crewCounts.get(a.id) ?? 0);
      }
      if (sortBy === 'newest') {
        const aCreated = String(
          readField(
            a as unknown as Record<string, unknown>,
            'created_at',
            'createdAt',
          ) ?? '',
        );
        const bCreated = String(
          readField(
            b as unknown as Record<string, unknown>,
            'created_at',
            'createdAt',
          ) ?? '',
        );
        return bCreated.localeCompare(aCreated);
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return rows;
  }, [
    vessels,
    searchTerm,
    statusFilter,
    typeFilter,
    sortBy,
    managers,
    subscribedIds,
    crewCounts,
  ]);

  const statusTabs: Array<{ id: StatusFilter; label: string; count: number }> =
    [
      { id: 'all', label: 'All', count: stats.total },
      { id: 'subscribed', label: 'Subscribed', count: stats.subscribed },
      { id: 'official', label: 'Official', count: stats.official },
      {
        id: 'ais',
        label: 'AIS',
        count: vessels.filter((v) =>
          hasAisTracking(v as unknown as Record<string, unknown>),
        ).length,
      },
      {
        id: 'unmanaged',
        label: 'No manager',
        count: vessels.filter((v) => !managers.get(v.id)).length,
      },
    ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stats — kept as top section, Studio-styled */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Vessels"
          value={stats.total}
          hint="All vessels on the platform"
          icon={Ship}
        />
        <StatTile
          label="Subscribed"
          value={stats.subscribed}
          hint="Active vessel plan"
          icon={CreditCard}
          tone="emerald"
        />
        <StatTile
          label="Official"
          value={stats.official}
          hint="Marked official"
          icon={ShieldCheck}
          tone="sky"
        />
        <StatTile
          label="With active crew"
          value={stats.withCrew}
          hint="At least one active assignment"
          icon={Users}
          tone="amber"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
                  statusFilter === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'rounded px-1 font-mono text-[10px] tabular-nums',
                    statusFilter === tab.id
                      ? 'bg-muted text-muted-foreground'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, IMO, MMSI, manager…"
              className="h-8 rounded-md border-border bg-background pl-8 text-xs shadow-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-full rounded-md border-border text-xs sm:w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All types
              </SelectItem>
              {typeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortKey)}
          >
            <SelectTrigger className="h-8 w-full rounded-md border-border text-xs sm:w-[160px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name" className="text-xs">
                Sort: name
              </SelectItem>
              <SelectItem value="crew" className="text-xs">
                Sort: active crew
              </SelectItem>
              <SelectItem value="newest" className="text-xs">
                Sort: newest
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            <span className="font-mono tabular-nums">{filtered.length}</span>
            {' of '}
            <span className="font-mono tabular-nums">{vessels.length}</span>
            {' shown'}
          </p>
        </div>
      </div>

      {/* Data table */}
      <div className="overflow-hidden rounded-md border border-border bg-muted/40">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Vessel
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground md:table-cell">
                Identifiers
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground lg:table-cell">
                Flag
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Manager
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-9 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground">
                Crew
              </TableHead>
              <TableHead className="hidden h-9 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground sm:table-cell">
                Past
              </TableHead>
              <TableHead
                className="h-9 w-10 bg-muted/40 text-right text-[11px] font-normal text-muted-foreground"
                aria-label="Actions"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-36 bg-background">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading vessels…
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-36 bg-background">
                  <div className="flex flex-col items-center justify-center gap-1 text-center">
                    <p className="text-sm text-foreground">No vessels found</p>
                    <p className="text-xs text-muted-foreground">
                      {searchTerm ||
                      statusFilter !== 'all' ||
                      typeFilter !== 'all'
                        ? 'Try another filter or search term.'
                        : 'No vessels in the system yet.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((vessel) => {
                const row = vessel as unknown as Record<string, unknown>;
                const imo = readField(
                  row,
                  'imo',
                  'officialNumber',
                  'official_number',
                );
                const mmsi = readField(row, 'mmsi');
                const flag = readField(row, 'flag', 'flag_state');
                const manager = managers.get(vessel.id);
                const official = isOfficialVessel(row);
                const ais = hasAisTracking(row);
                const subscribed = subscribedIds.has(vessel.id);
                const crewCount = crewCounts.get(vessel.id) ?? 0;
                const pastCount = pastCounts.get(vessel.id) ?? 0;

                return (
                  <TableRow
                    key={vessel.id}
                    className="cursor-pointer border-border bg-background hover:bg-muted/40"
                    onClick={() => onEdit(vessel)}
                  >
                    <TableCell className="py-2.5 align-middle">
                      <div className="flex min-w-[140px] flex-col">
                        <span className="text-sm text-foreground">
                          {vessel.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {vesselTypeLabel(vessel.type)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle md:table-cell">
                      <div className="flex flex-col gap-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        <span>
                          <span className="text-muted-foreground/70">IMO </span>
                          <span className="text-foreground">
                            {imo ? String(imo) : '—'}
                          </span>
                        </span>
                        <span>
                          <span className="text-muted-foreground/70">MMSI </span>
                          <span className="text-foreground">
                            {mmsi ? String(mmsi) : '—'}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-2.5 align-middle lg:table-cell">
                      {flag ? (
                        <span className="text-xs text-foreground">
                          {String(flag)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      {manager ? (
                        <div className="flex min-w-[120px] flex-col">
                          <Link
                            href={`/dashboard/users/${manager.userId}`}
                            className="text-xs text-foreground hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {manager.name}
                          </Link>
                          {manager.email ? (
                            <span className="truncate text-[11px] text-muted-foreground">
                              {manager.email}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          No manager
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {official ? (
                          <span className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-400">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            Official
                          </span>
                        ) : null}
                        {subscribed ? (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Paid
                          </span>
                        ) : null}
                        {ais ? (
                          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Radio className="h-2.5 w-2.5" />
                            AIS
                          </span>
                        ) : null}
                        {!official && !subscribed && !ais ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell
                      className="py-2.5 text-right align-middle"
                      onClick={(e) => {
                        if (crewCount <= 0) return;
                        e.stopPropagation();
                        onViewActiveCrew({
                          id: vessel.id,
                          name: vessel.name,
                        });
                      }}
                    >
                      {crewCount > 0 ? (
                        <button
                          type="button"
                          className="font-mono text-xs tabular-nums text-foreground underline-offset-2 hover:underline"
                        >
                          {crewCount}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="hidden py-2.5 text-right align-middle sm:table-cell"
                      onClick={(e) => {
                        if (pastCount <= 0) return;
                        e.stopPropagation();
                        onViewPastCrew({
                          id: vessel.id,
                          name: vessel.name,
                        });
                      }}
                    >
                      {pastCount > 0 ? (
                        <button
                          type="button"
                          className="font-mono text-xs tabular-nums text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {pastCount}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="py-2.5 text-right align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            aria-label={`Actions for ${vessel.name}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(vessel)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() =>
                              onDelete({
                                id: vessel.id,
                                name: vessel.name,
                              })
                            }
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
