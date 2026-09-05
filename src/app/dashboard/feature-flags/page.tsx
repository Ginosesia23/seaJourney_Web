'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  ToggleLeft,
} from 'lucide-react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { FeatureAudience, FeatureFlagKey } from '@/lib/feature-flags/catalog';
import {
  formatTierAccessSummary,
  type CrewTierSlug,
  type VesselTierSlug,
} from '@/lib/feature-flags/tier-access';
import { FeatureTierSelector } from '@/components/admin/feature-tier-selector';

type FeatureNote = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
};

type AdminFeature = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  audience: FeatureAudience;
  routes: string[];
  enabled: boolean;
  crewTiers: CrewTierSlug[] | null;
  vesselTiers: VesselTierSlug[] | null;
  minCrewTier: CrewTierSlug | null;
  minVesselTier: VesselTierSlug | null;
  note: string | null;
  notes: FeatureNote[];
  noteCount: number;
  updatedAt: string | null;
  updatedBy: string | null;
  lastEnabledAt: string | null;
  lastDisabledAt: string | null;
  hasDbRow: boolean;
};

type FilterId = 'all' | FeatureAudience | 'disabled';

function audienceLabel(audience: FeatureAudience): string {
  if (audience === 'crew') return 'Crew';
  if (audience === 'vessel') return 'Vessel';
  return 'Both';
}

function formatWhen(iso: string | null | undefined): {
  absolute: string;
  relative: string;
} {
  if (!iso) return { absolute: '—', relative: 'Never' };
  try {
    const d = parseISO(iso);
    return {
      absolute: format(d, 'MMM d, yyyy HH:mm'),
      relative: formatDistanceToNow(d, { addSuffix: true }),
    };
  } catch {
    return { absolute: iso, relative: iso };
  }
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          on ? 'bg-emerald-500' : 'bg-amber-500',
        )}
      />
      {on ? 'Enabled' : 'Disabled'}
    </span>
  );
}

export default function FeatureFlagsAdminPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();
  const { data: profileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>(
    'users',
    user?.id,
  );

  const isAdmin = useMemo(() => {
    const role = (
      (profileRaw as { role?: string } | null)?.role ||
      (profileRaw as UserProfile | null)?.role ||
      ''
    )
      .toString()
      .toLowerCase()
      .trim();
    return role === 'admin';
  }, [profileRaw]);

  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingTiersKey, setSavingTiersKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/feature-flags', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setFeatures((json.features || []) as AdminFeature[]);
    } catch (err) {
      toast({
        title: 'Could not load feature flags',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => {
    if (isLoadingProfile || !profileRaw) return;
    if (!isAdmin) {
      router.replace('/dashboard');
      return;
    }
    void load();
  }, [isAdmin, isLoadingProfile, profileRaw, load, router]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setTiers = async (
    key: FeatureFlagKey,
    tiers: {
      crewTiers: CrewTierSlug[] | null;
      vesselTiers: VesselTierSlug[] | null;
    },
  ) => {
    setSavingTiersKey(key);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          crewTiers: tiers.crewTiers,
          vesselTiers: tiers.vesselTiers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Tier update failed');
      setFeatures((json.features || []) as AdminFeature[]);
      toast({
        title: 'Tier access updated',
        description: `${json.label || key} tier rules saved.`,
      });
    } catch (err) {
      toast({
        title: 'Tier update failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
      await load();
    } finally {
      setSavingTiersKey(null);
    }
  };

  const setEnabled = async (key: FeatureFlagKey, enabled: boolean) => {
    setSavingKey(key);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/feature-flags', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      setFeatures((json.features || []) as AdminFeature[]);
      toast({
        title: enabled ? 'Feature enabled' : 'Feature disabled',
        description: json.label || key,
      });
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const addNote = async (key: FeatureFlagKey) => {
    const body = (drafts[key] || '').trim();
    if (!body) return;
    setAddingKey(key);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add note');
      setFeatures((json.features || []) as AdminFeature[]);
      setDrafts((prev) => ({ ...prev, [key]: '' }));
      toast({ title: 'Note added' });
    } catch (err) {
      toast({
        title: 'Could not add note',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setAddingKey(null);
    }
  };

  const filtered = features.filter((f) => {
    if (filter === 'disabled') {
      if (f.enabled) return false;
    } else if (filter !== 'all') {
      if (f.audience !== filter && f.audience !== 'both') return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      f.label.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.routes.some((r) => r.toLowerCase().includes(q))
    );
  });

  const disabledCount = features.filter((f) => !f.enabled).length;
  const onCount = features.length - disabledCount;

  const filters: { id: FilterId; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: features.length },
    { id: 'crew', label: 'Crew' },
    { id: 'vessel', label: 'Vessel' },
    { id: 'disabled', label: 'Disabled', count: disabledCount },
  ];

  if (isLoadingProfile || !profileRaw || (isAdmin && isLoading && features.length === 0)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[480px] w-full rounded-md" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-6">
        {/* Page header — Supabase Studio style */}
        <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ToggleLeft className="h-3.5 w-3.5" />
              <span>Platform</span>
              <span className="text-border">/</span>
              <span className="text-foreground">Feature flags</span>
            </div>
            <h1 className="text-xl font-medium tracking-tight text-foreground">
              Feature flags
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Control which product features are live and which subscription tiers
              can access them. Admins always bypass disabled flags.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {onCount} enabled
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {disabledCount} disabled
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-md border-border bg-background text-xs"
              onClick={() => void load()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
            {filters.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
                  filter === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                {typeof tab.count === 'number' ? (
                  <span
                    className={cn(
                      'rounded px-1 font-mono text-[10px] tabular-nums',
                      filter === tab.id
                        ? 'bg-muted/70 text-muted-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search features…"
              className="h-8 rounded-md border-border bg-background pl-8 text-xs shadow-none"
            />
          </div>
        </div>

        {/* Data table card */}
        <div className="overflow-hidden rounded-md border border-border bg-muted/40">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-9 w-8 bg-muted/40 px-2 text-[11px] font-normal text-muted-foreground" />
                <TableHead className="h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 w-[100px] bg-muted/40 text-[11px] font-normal text-muted-foreground">
                  Audience
                </TableHead>
                <TableHead className="hidden h-9 bg-muted/40 text-[11px] font-normal text-muted-foreground md:table-cell">
                  Access
                </TableHead>
                <TableHead className="h-9 w-[110px] bg-muted/40 text-[11px] font-normal text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 w-[88px] bg-muted/40 text-center text-[11px] font-normal text-muted-foreground">
                  Enabled
                </TableHead>
                <TableHead className="h-9 w-[72px] bg-muted/40 text-right text-[11px] font-normal text-muted-foreground">
                  Notes
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((feature) => {
                const saving = savingKey === feature.key;
                const savingTiers = savingTiersKey === feature.key;
                const expanded = expandedKeys.has(feature.key);
                const tierSummary = formatTierAccessSummary(feature.audience, {
                  crewTiers: feature.crewTiers ?? null,
                  vesselTiers: feature.vesselTiers ?? null,
                  minCrewTier: feature.minCrewTier,
                  minVesselTier: feature.minVesselTier,
                });
                const notes = feature.notes || [];
                const live = formatWhen(feature.lastEnabledAt);
                const disabled = formatWhen(feature.lastDisabledAt);
                const updated = formatWhen(feature.updatedAt);
                const adding = addingKey === feature.key;

                return (
                  <Fragment key={feature.key}>
                    <TableRow
                      className={cn(
                        'cursor-pointer border-border',
                        expanded
                          ? 'bg-muted/70'
                          : 'bg-background hover:bg-muted/40',
                        !feature.enabled && !expanded && 'opacity-80',
                      )}
                      onClick={() => toggleExpanded(feature.key)}
                    >
                      <TableCell className="w-8 px-2 py-2.5">
                        <ChevronRight
                          className={cn(
                            'h-3.5 w-3.5 text-muted-foreground transition-transform',
                            expanded && 'rotate-90',
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-2.5 align-middle">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="min-w-0 max-w-[320px]">
                              <div className="truncate text-sm text-foreground">
                                {feature.label}
                              </div>
                              <div className="truncate font-mono text-[11px] text-muted-foreground">
                                {feature.key}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="max-w-xs text-xs"
                          >
                            <p>{feature.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2.5 align-middle">
                        <span className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {audienceLabel(feature.audience)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden py-2.5 align-middle md:table-cell">
                        <span className="line-clamp-1 text-[11px] text-muted-foreground">
                          {tierSummary}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 align-middle">
                        <StatusDot on={feature.enabled} />
                      </TableCell>
                      <TableCell
                        className="py-2.5 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {saving ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : null}
                          <Switch
                            checked={feature.enabled}
                            disabled={saving}
                            onCheckedChange={(checked) =>
                              void setEnabled(feature.key, checked)
                            }
                            aria-label={`Toggle ${feature.label}`}
                            className="scale-90 data-[state=checked]:bg-emerald-500"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right align-middle">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {feature.noteCount ?? notes.length}
                        </span>
                      </TableCell>
                    </TableRow>

                    {expanded ? (
                      <TableRow className="border-border hover:bg-transparent">
                        <TableCell
                          colSpan={7}
                          className="bg-muted/40 p-0"
                        >
                          <div
                            className="space-y-4 border-t border-border px-4 py-4 sm:px-5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-1">
                              <p className="text-sm text-foreground">
                                {feature.description}
                              </p>
                              {feature.routes.length > 0 ? (
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  {feature.routes.join('  ·  ')}
                                </p>
                              ) : null}
                            </div>

                            <div className="rounded-md border border-border bg-background">
                              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                <div>
                                  <p className="text-xs font-medium text-foreground">
                                    Tier access
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Choose which plans can use this feature
                                  </p>
                                </div>
                                {savingTiers ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : null}
                              </div>
                              <div className="px-3 py-3">
                                <FeatureTierSelector
                                  audience={feature.audience}
                                  crewTiers={feature.crewTiers ?? null}
                                  vesselTiers={feature.vesselTiers ?? null}
                                  disabled={savingTiers}
                                  onChange={(next) =>
                                    void setTiers(feature.key, next)
                                  }
                                />
                              </div>
                            </div>

                            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
                              {(
                                [
                                  ['Last enabled', live],
                                  ['Last disabled', disabled],
                                  ['Last updated', updated],
                                ] as const
                              ).map(([label, when]) => (
                                <div
                                  key={label}
                                  className="bg-background px-3 py-2.5"
                                >
                                  <p className="text-[11px] text-muted-foreground">
                                    {label}
                                  </p>
                                  <p className="mt-0.5 text-sm tabular-nums text-foreground">
                                    {when.absolute}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {when.relative}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="rounded-md border border-border bg-background">
                              <div className="border-b border-border px-3 py-2">
                                <p className="text-xs font-medium text-foreground">
                                  Notes
                                </p>
                              </div>
                              <div className="space-y-3 px-3 py-3">
                                {notes.length === 0 ? (
                                  <p className="py-4 text-center text-xs text-muted-foreground">
                                    No notes yet for this feature.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {notes.map((n) => {
                                      const when = formatWhen(n.createdAt);
                                      return (
                                        <div
                                          key={n.id}
                                          className="rounded-md border border-border bg-muted/40 px-3 py-2.5"
                                        >
                                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                                            {n.body}
                                          </p>
                                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                            <span className="tabular-nums">
                                              {when.absolute}
                                            </span>
                                            <span>·</span>
                                            <span>{when.relative}</span>
                                            {n.createdByName ? (
                                              <>
                                                <span>·</span>
                                                <span>{n.createdByName}</span>
                                              </>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                                  <Input
                                    value={drafts[feature.key] ?? ''}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [feature.key]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void addNote(feature.key);
                                      }
                                    }}
                                    placeholder="Add a note…"
                                    className="h-8 flex-1 rounded-md border-border text-xs shadow-none"
                                    disabled={adding}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 shrink-0 rounded-md bg-emerald-500 text-xs text-white hover:bg-emerald-500/90"
                                    disabled={
                                      adding ||
                                      !(drafts[feature.key] || '').trim()
                                    }
                                    onClick={() => void addNote(feature.key)}
                                  >
                                    {adding ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      'Add note'
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}

              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="h-36 bg-background">
                    <div className="flex flex-col items-center justify-center gap-1 text-center">
                      <p className="text-sm text-foreground">No features found</p>
                      <p className="text-xs text-muted-foreground">
                        Try another filter or search term.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
