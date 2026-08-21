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

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
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
      const imo = String(readField(row, 'imo', 'officialNumber', 'official_number') ?? '');
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
          readField(a as unknown as Record<string, unknown>, 'created_at', 'createdAt') ?? '',
        );
        const bCreated = String(
          readField(b as unknown as Record<string, unknown>, 'created_at', 'createdAt') ?? '',
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Vessels" value={stats.total} icon={Ship} />
        <StatTile label="Subscribed" value={stats.subscribed} icon={CreditCard} />
        <StatTile label="Official" value={stats.official} icon={ShieldCheck} />
        <StatTile label="With active crew" value={stats.withCrew} icon={Users} />
      </div>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>All vessels</CardTitle>
          <CardDescription>
            {filtered.length} of {vessels.length} vessels shown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, IMO, MMSI, flag, or manager…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-full lg:w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                <SelectItem value="subscribed">Subscribed</SelectItem>
                <SelectItem value="official">Official</SelectItem>
                <SelectItem value="ais">AIS tracking</SelectItem>
                <SelectItem value="unmanaged">No manager</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-full lg:w-[160px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: name</SelectItem>
                <SelectItem value="crew">Sort: active crew</SelectItem>
                <SelectItem value="newest">Sort: newest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Identifiers</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Crew</TableHead>
                  <TableHead className="text-right">Past</TableHead>
                  <TableHead className="w-12 text-right" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                        ? 'No vessels match the current filters.'
                        : 'No vessels found in the system.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((vessel) => {
                    const row = vessel as unknown as Record<string, unknown>;
                    const imo = readField(row, 'imo', 'officialNumber', 'official_number');
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
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => onEdit(vessel)}
                      >
                        <TableCell>
                          <div className="flex min-w-[160px] flex-col">
                            <span className="font-medium">{vessel.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {vesselTypeLabel(vessel.type)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5 font-mono text-xs tabular-nums">
                            <span>
                              <span className="text-muted-foreground">IMO </span>
                              {imo ? String(imo) : '—'}
                            </span>
                            <span>
                              <span className="text-muted-foreground">MMSI </span>
                              {mmsi ? String(mmsi) : '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {flag ? (
                            <span className="text-sm">{String(flag)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {manager ? (
                            <div className="flex min-w-[140px] flex-col">
                              <Link
                                href={`/dashboard/users/${manager.userId}`}
                                className="text-sm font-medium hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {manager.name}
                              </Link>
                              {manager.email && (
                                <span className="truncate text-xs text-muted-foreground">
                                  {manager.email}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No manager</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {official && (
                              <Badge
                                variant="default"
                                className="border-0 bg-blue-600 text-[10px] text-white hover:bg-blue-700"
                              >
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                Official
                              </Badge>
                            )}
                            {subscribed && (
                              <Badge
                                variant="default"
                                className="border-0 bg-emerald-600 text-[10px] text-white hover:bg-emerald-700"
                              >
                                <CreditCard className="mr-1 h-3 w-3" />
                                Paid
                              </Badge>
                            )}
                            {ais && (
                              <Badge variant="secondary" className="text-[10px]">
                                <Radio className="mr-1 h-3 w-3" />
                                AIS
                              </Badge>
                            )}
                            {!official && !subscribed && !ais && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          onClick={(e) => {
                            if (crewCount <= 0) return;
                            e.stopPropagation();
                            onViewActiveCrew({ id: vessel.id, name: vessel.name });
                          }}
                        >
                          {crewCount > 0 ? (
                            <button
                              type="button"
                              className="font-medium underline-offset-2 hover:text-primary hover:underline"
                            >
                              {crewCount}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          onClick={(e) => {
                            if (pastCount <= 0) return;
                            e.stopPropagation();
                            onViewPastCrew({ id: vessel.id, name: vessel.name });
                          }}
                        >
                          {pastCount > 0 ? (
                            <button
                              type="button"
                              className="font-medium underline-offset-2 hover:text-primary hover:underline"
                            >
                              {pastCount}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                aria-label={`Actions for ${vessel.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEdit(vessel)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() =>
                                  onDelete({ id: vessel.id, name: vessel.name })
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
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
        </CardContent>
      </Card>
    </div>
  );
}
