'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Award,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { bearerHeaders } from '@/lib/applications/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CAREER_TRACK_LABELS,
  TARGETABLE_LEVELS,
  type CareerTrack,
} from '@/lib/applications/career-path';
import type { CareerMilestone } from '@/lib/applications/milestones';
import { MilestoneRequirementEditor } from '@/components/admin/milestone-requirement-editor';
import type { DraftRequirement } from '@/components/admin/milestone-requirement-editor';
import { useCertificateCatalog } from '@/hooks/use-certificate-catalog';

type EditableMilestone = {
  id: string | null;
  track: string;
  level_key: string;
  label: string;
  description: string;
  sort_order: number;
  sea_time_metric: string;
  sea_time_min: string;
  sea_time_source: string;
  status: 'draft' | 'published' | 'archived';
  requirements: DraftRequirement[];
};

function emptyRequirement(): DraftRequirement {
  return {
    localId: crypto.randomUUID(),
    title: '',
    description: '',
    requirement_type: 'manual_checklist',
    is_required: true,
    config: {},
  };
}

function emptyMilestone(): EditableMilestone {
  return {
    id: null,
    track: 'deck',
    level_key: 'oow',
    label: '',
    description: '',
    sort_order: 20,
    sea_time_metric: 'totalDays',
    sea_time_min: '1095',
    sea_time_source: 'testimonials',
    status: 'draft',
    requirements: [emptyRequirement()],
  };
}

function fromApi(m: CareerMilestone): EditableMilestone {
  return {
    id: m.id,
    track: m.track,
    level_key: m.level_key,
    label: m.label,
    description: m.description || '',
    sort_order: m.sort_order,
    sea_time_metric: m.sea_time_metric || 'totalDays',
    sea_time_min: m.sea_time_min != null ? String(m.sea_time_min) : '',
    sea_time_source: m.sea_time_source || 'testimonials',
    status: m.status,
    requirements: (m.requirements || []).map((r) => ({
      localId: r.id,
      title: r.title,
      description: r.description || '',
      requirement_type: r.requirement_type,
      is_required: r.is_required,
      config: { ...(r.config || {}) },
    })),
  };
}

function toPayload(draft: EditableMilestone) {
  return {
    track: draft.track,
    level_key: draft.level_key,
    label: draft.label.trim(),
    description: draft.description.trim() || null,
    sort_order: draft.sort_order,
    sea_time_metric: draft.sea_time_metric || null,
    sea_time_min: draft.sea_time_min ? Number(draft.sea_time_min) : null,
    sea_time_source: draft.sea_time_source || null,
    requirements: draft.requirements.map((r, index) => ({
      title: r.title.trim() || `Requirement ${index + 1}`,
      description: r.description.trim() || null,
      requirement_type: r.requirement_type,
      is_required: r.is_required,
      sort_order: index,
      config: r.config,
    })),
  };
}

export default function CareerMilestonesAdminPage() {
  const { user } = useUser();
  const { session } = useSupabase();
  const accessToken = session?.access_token;
  const router = useRouter();
  const { toast } = useToast();
  const { data: userProfileRaw, isLoading: isLoadingProfile } =
    useDoc<UserProfile>('users', user?.id);

  const isAdmin = userProfileRaw?.role === 'admin';
  const { presets: certificatePresets } = useCertificateCatalog({
    includeOther: false,
  });

  const [list, setList] = useState<CareerMilestone[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState<EditableMilestone | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'draft' | 'published' | 'archived'
  >('all');

  useEffect(() => {
    if (!isLoadingProfile && userProfileRaw && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, router, userProfileRaw]);

  const loadList = useCallback(async () => {
    if (!accessToken) return;
    setLoadingList(true);
    try {
      const res = await fetch('/api/career-milestones', {
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setList(json.milestones || []);
    } catch (e) {
      toast({
        title: 'Could not load milestones',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoadingList(false);
    }
  }, [accessToken, toast]);

  useEffect(() => {
    if (isAdmin && accessToken) void loadList();
  }, [isAdmin, accessToken, loadList]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return list;
    return list.filter((m) => m.status === statusFilter);
  }, [list, statusFilter]);

  async function saveDraft(extra?: { status?: EditableMilestone['status'] }) {
    if (!draft || !accessToken) return;
    if (!draft.label.trim()) {
      toast({
        title: 'Missing label',
        description: 'Each milestone needs a display name (e.g. OOW).',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...toPayload(draft),
        ...(extra?.status ? { status: extra.status } : {}),
      };
      const res = await fetch(
        draft.id ? `/api/career-milestones/${draft.id}` : '/api/career-milestones',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: bearerHeaders(accessToken, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      const saved = json.milestone as CareerMilestone;
      setDraft(fromApi(saved));
      await loadList();
      toast({ title: 'Milestone saved' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteMilestone(id: string) {
    if (!accessToken) return;
    if (!confirm('Delete this milestone and all its requirements?')) return;
    try {
      const res = await fetch(`/api/career-milestones/${id}`, {
        method: 'DELETE',
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      if (draft?.id === id) setDraft(null);
      await loadList();
      toast({ title: 'Milestone deleted' });
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  if (isLoadingProfile || !isAdmin) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Career milestones</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Define tickets like OOW with requirements. Published milestones appear on
          crew accounts to track progress toward their next ticket.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'published', 'archived'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={() => setDraft(emptyMilestone())}
          >
            <Plus className="h-4 w-4" />
            New milestone
          </Button>
          <div className="divide-y rounded-2xl border">
            {loadingList ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredList.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No milestones yet
              </p>
            ) : (
              filteredList.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    draft?.id === m.id && 'bg-muted/60',
                  )}
                  onClick={() => setDraft(fromApi(m))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.label}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {m.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CAREER_TRACK_LABELS[m.track as CareerTrack] || m.track} ·{' '}
                    {m.level_key}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        {draft ? (
          <div className="space-y-6 rounded-2xl border p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">
                  {draft.id ? 'Edit milestone' : 'New milestone'}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {draft.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void deleteMilestone(draft.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void saveDraft()}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
                {draft.status !== 'published' ? (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveDraft({ status: 'published' })}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Publish
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void saveDraft({ status: 'archived' })}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Display name</Label>
                <Input
                  value={draft.label}
                  onChange={(e) =>
                    setDraft({ ...draft, label: e.target.value })
                  }
                  placeholder="Officer of the Watch (OOW)"
                />
              </div>
              <div className="space-y-2">
                <Label>Track</Label>
                <Select
                  value={draft.track}
                  onValueChange={(value) =>
                    setDraft({ ...draft, track: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CAREER_TRACK_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Level key</Label>
                <Select
                  value={draft.level_key}
                  onValueChange={(value) =>
                    setDraft({ ...draft, level_key: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGETABLE_LEVELS.filter(
                      (t) =>
                        t.track === 'any' ||
                        draft.track === 'any' ||
                        t.track === draft.track,
                    ).map((t) => (
                      <SelectItem key={`${t.track}-${t.level}`} value={t.level}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sort_order: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Typical sea time (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.sea_time_min}
                  onChange={(e) =>
                    setDraft({ ...draft, sea_time_min: e.target.value })
                  }
                  placeholder="1095"
                />
              </div>
              <div className="space-y-2">
                <Label>Sea time metric</Label>
                <Select
                  value={draft.sea_time_metric}
                  onValueChange={(value) =>
                    setDraft({ ...draft, sea_time_metric: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="totalDays">Total days</SelectItem>
                    <SelectItem value="atSeaDays">At sea days</SelectItem>
                    <SelectItem value="standbyDays">Standby days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sea time source</Label>
                <Select
                  value={draft.sea_time_source}
                  onValueChange={(value) =>
                    setDraft({ ...draft, sea_time_source: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="testimonials">Testimonials</SelectItem>
                    <SelectItem value="tracked">Tracked logbook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Requirements</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      requirements: [...draft.requirements, emptyRequirement()],
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="space-y-3">
                {draft.requirements.map((req, index) => (
                  <MilestoneRequirementEditor
                    key={req.localId}
                    index={index}
                    requirement={req}
                    currentMilestoneId={draft.id}
                    certificatePresets={certificatePresets}
                    availableMilestones={list.map((m) => ({
                      id: m.id,
                      label: m.label,
                      level_key: m.level_key,
                      track: m.track,
                    }))}
                    onChange={(next) => {
                      const requirements = [...draft.requirements];
                      requirements[index] = next;
                      setDraft({ ...draft, requirements });
                    }}
                    onRemove={() =>
                      setDraft({
                        ...draft,
                        requirements: draft.requirements.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
            <Award className="h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-4 text-base font-semibold">No milestone selected</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Select a milestone from the list or create one to define OOW, Watch
              Rating, and other ticket requirements.
            </p>
            <Button
              className="mt-6 gap-2"
              onClick={() => setDraft(emptyMilestone())}
            >
              <Plus className="h-4 w-4" />
              New milestone
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
