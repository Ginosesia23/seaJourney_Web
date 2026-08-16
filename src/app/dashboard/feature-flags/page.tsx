'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldOff,
  ToggleLeft,
} from 'lucide-react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
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
  note: string | null;
  notes: FeatureNote[];
  noteCount: number;
  updatedAt: string | null;
  updatedBy: string | null;
  lastEnabledAt: string | null;
  lastDisabledAt: string | null;
  hasDbRow: boolean;
};

function audienceLabel(audience: FeatureAudience): string {
  if (audience === 'crew') return 'Crew';
  if (audience === 'vessel') return 'Vessel';
  return 'Both';
}

function formatWhen(iso: string | null | undefined): { absolute: string; relative: string } {
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
  const [filter, setFilter] = useState<'all' | FeatureAudience | 'disabled'>('all');
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
        description: `${json.label || key} is now ${enabled ? 'on' : 'off'}.`,
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
    if (filter === 'disabled') return !f.enabled;
    if (filter === 'all') return true;
    return f.audience === filter || f.audience === 'both';
  });

  const disabledCount = features.filter((f) => !f.enabled).length;
  const onCount = features.length - disabledCount;

  if (isLoadingProfile || !profileRaw || (isAdmin && isLoading && features.length === 0)) {
    return (
      <div className="flex flex-col gap-3 p-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ToggleLeft className="h-3.5 w-3.5" />
              Platform
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Feature flags</h1>
            <p className="text-sm text-muted-foreground">
              Expand a row for toggle history and notes. Admins still have access when a feature is off.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {disabledCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              >
                <ShieldOff className="h-3 w-3" />
                {disabledCount} off
              </Badge>
            )}
            <Badge variant="outline" className="font-normal tabular-nums">
              {onCount}/{features.length} on
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => void load()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', 'All'],
              ['crew', 'Crew'],
              ['vessel', 'Vessel'],
              ['disabled', 'Off only'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={filter === id ? 'default' : 'ghost'}
              className="h-7 rounded-md px-2.5 text-xs"
              onClick={() => setFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 w-8" />
                <TableHead className="h-9">Feature</TableHead>
                <TableHead className="h-9 w-[9%]">Audience</TableHead>
                <TableHead className="h-9 w-[8%]">Status</TableHead>
                <TableHead className="h-9 w-[9%] text-center">Enabled</TableHead>
                <TableHead className="h-9 w-[10%] text-right">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((feature) => {
                const saving = savingKey === feature.key;
                const expanded = expandedKeys.has(feature.key);
                const notes = feature.notes || [];
                const live = formatWhen(feature.lastEnabledAt);
                const disabled = formatWhen(feature.lastDisabledAt);
                const updated = formatWhen(feature.updatedAt);
                const adding = addingKey === feature.key;

                return (
                  <Fragment key={feature.key}>
                    <TableRow
                      className={cn(
                        'cursor-pointer',
                        !feature.enabled && 'bg-amber-500/[0.04]',
                        expanded && 'bg-muted/40',
                      )}
                      onClick={() => toggleExpanded(feature.key)}
                    >
                      <TableCell className="py-2 w-8">
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform',
                            expanded && 'rotate-180',
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-2 align-middle">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium leading-tight">
                                {feature.label}
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground font-mono">
                                {feature.key}
                                {feature.routes[0] ? ` · ${feature.routes[0]}` : ''}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs">
                            <p>{feature.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2 align-middle">
                        <span className="text-xs text-muted-foreground">
                          {audienceLabel(feature.audience)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 align-middle">
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 px-1.5 text-[10px] font-semibold uppercase tracking-wide',
                            feature.enabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                          )}
                        >
                          {feature.enabled ? 'On' : 'Off'}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="py-2 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {saving && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                          <Switch
                            checked={feature.enabled}
                            disabled={saving}
                            onCheckedChange={(checked) =>
                              void setEnabled(feature.key, checked)
                            }
                            aria-label={`Toggle ${feature.label}`}
                            className="scale-90"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2 align-middle text-right">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {feature.noteCount ?? notes.length}
                        </span>
                      </TableCell>
                    </TableRow>

                    {expanded && (
                      <TableRow className="hover:bg-transparent border-b">
                        <TableCell colSpan={6} className="bg-muted/20 p-0">
                          <div className="px-4 py-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Last live
                                </p>
                                <p className="text-sm font-medium tabular-nums">
                                  {live.absolute}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {live.relative}
                                </p>
                              </div>
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Last disabled
                                </p>
                                <p className="text-sm font-medium tabular-nums">
                                  {disabled.absolute}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {disabled.relative}
                                </p>
                              </div>
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Last updated
                                </p>
                                <p className="text-sm font-medium tabular-nums">
                                  {updated.absolute}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {updated.relative}
                                </p>
                              </div>
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-medium text-muted-foreground">
                                Notes
                              </p>
                              {notes.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">
                                  No notes yet for this feature.
                                </p>
                              ) : (
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {notes.map((n) => {
                                    const when = formatWhen(n.createdAt);
                                    return (
                                      <div
                                        key={n.id}
                                        className="rounded-md border bg-background px-3 py-2.5 space-y-1.5"
                                      >
                                        <p className="text-xs leading-relaxed whitespace-pre-wrap">
                                          {n.body}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                          <span className="tabular-nums">{when.absolute}</span>
                                          <span>·</span>
                                          <span>{when.relative}</span>
                                          {n.createdByName && (
                                            <>
                                              <span>·</span>
                                              <span>{n.createdByName}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                                className="h-8 rounded-md text-xs flex-1"
                                disabled={adding}
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 rounded-md text-xs shrink-0"
                                disabled={adding || !(drafts[feature.key] || '').trim()}
                                onClick={() => void addNote(feature.key)}
                              >
                                {adding ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  'Add note'
                                )}
                              </Button>
                            </div>

                            {feature.routes.length > 0 && (
                              <p className="text-[11px] text-muted-foreground font-mono">
                                Routes: {feature.routes.join(' · ')}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-20 text-center text-sm text-muted-foreground"
                  >
                    No features match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}
