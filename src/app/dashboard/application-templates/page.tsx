'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ClipboardList,
  FileText,
  FileUp,
  FolderOpen,
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
import { bearerHeaders, downloadWithAuth } from '@/lib/applications/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { CERTIFICATE_PRESETS, type CertificatePreset } from '@/lib/certificates/presets';
import { useCertificateCatalog } from '@/hooks/use-certificate-catalog';
import {
  CAREER_TRACK_LABELS,
  TARGETABLE_LEVELS,
  type CareerTrack,
} from '@/lib/applications/career-path';
import {
  PROFILE_FIELD_OPTIONS,
  REQUIREMENT_TYPE_LABELS,
  type ApplicationRequirement,
  type ApplicationRequirementType,
  type ApplicationTemplate,
  type ApplicationTemplateFile,
  type RequirementConfig,
} from '@/lib/applications/types';

type DraftRequirement = {
  localId: string;
  title: string;
  description: string;
  requirement_type: ApplicationRequirementType;
  is_required: boolean;
  config: RequirementConfig;
};

type EditableTemplate = {
  id: string | null;
  title: string;
  organization: string;
  description: string;
  instructions: string;
  external_url: string;
  career_track: string;
  target_level: string;
  status: 'draft' | 'published' | 'archived';
  requirements: DraftRequirement[];
  files: ApplicationTemplateFile[];
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

function emptyTemplate(): EditableTemplate {
  return {
    id: null,
    title: '',
    organization: '',
    description: '',
    instructions: '',
    external_url: '',
    career_track: 'deck',
    target_level: 'watch_rating',
    status: 'draft',
    requirements: [
      {
        ...emptyRequirement(),
        title: 'Identity profile complete',
        requirement_type: 'profile_fields',
        config: {
          fields: [
            'first_name',
            'last_name',
            'email',
            'nationality',
            'date_of_birth',
          ],
        },
      },
      {
        ...emptyRequirement(),
        title: 'At least one approved testimonial',
        requirement_type: 'testimonial',
        config: { minCount: 1, status: 'approved' },
      },
    ],
    files: [],
  };
}

function fromApi(t: ApplicationTemplate): EditableTemplate {
  return {
    id: t.id,
    title: t.title,
    organization: t.organization,
    description: t.description || '',
    instructions: t.instructions || '',
    external_url: t.external_url || '',
    career_track: t.career_track || 'any',
    target_level: t.target_level || 'other',
    status: t.status,
    requirements: (t.requirements || []).map((r: ApplicationRequirement) => ({
      localId: r.id,
      title: r.title,
      description: r.description || '',
      requirement_type: r.requirement_type,
      is_required: r.is_required,
      config: { ...(r.config || {}) },
    })),
    files: t.files || [],
  };
}

function toPayload(draft: EditableTemplate) {
  return {
    title: draft.title.trim(),
    organization: draft.organization.trim(),
    description: draft.description.trim() || null,
    instructions: draft.instructions.trim() || null,
    external_url: draft.external_url.trim() || null,
    career_track: draft.career_track || 'any',
    target_level: draft.target_level || 'other',
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

export default function ApplicationTemplatesAdminPage() {
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

  const [list, setList] = useState<ApplicationTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState<EditableTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      const res = await fetch('/api/application-templates', {
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setList(json.templates || []);
    } catch (e) {
      toast({
        title: 'Could not load applications',
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

  const statusCounts = useMemo(() => {
    const counts = { draft: 0, published: 0, archived: 0 };
    for (const t of list) counts[t.status] += 1;
    return counts;
  }, [list]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return list;
    return list.filter((t) => t.status === statusFilter);
  }, [list, statusFilter]);

  async function saveDraft(extra?: { status?: EditableTemplate['status'] }) {
    if (!draft) return;
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh the page and try again.',
        variant: 'destructive',
      });
      return;
    }
    if (!draft.title.trim() || !draft.organization.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Title and organization are required.',
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
      let res = await fetch(
        draft.id
          ? `/api/application-templates/${draft.id}`
          : '/api/application-templates',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: bearerHeaders(accessToken, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        },
      );
      let json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      // If we created + asked to publish in one step, ensure status stuck
      // (older API paths ignored status on POST).
      if (
        !draft.id &&
        extra?.status === 'published' &&
        json.template?.id &&
        json.template?.status !== 'published'
      ) {
        res = await fetch(`/api/application-templates/${json.template.id}`, {
          method: 'PATCH',
          headers: bearerHeaders(accessToken, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ status: 'published' }),
        });
        json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Publish failed');
      }

      const saved = fromApi(json.template);
      setDraft(saved);
      await loadList();
      toast({
        title:
          saved.status === 'published'
            ? 'Published'
            : extra?.status === 'archived'
              ? 'Archived'
              : 'Saved',
        description:
          saved.status === 'published'
            ? 'Crew can now see this on Apply.'
            : saved.status === 'archived'
              ? 'Hidden from crew Apply list.'
              : 'Still a draft — click Publish when ready for crew.',
      });
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

  async function deleteTemplate(id: string) {
    if (!accessToken) return;
    if (!confirm('Delete this application template and its files?')) return;
    const res = await fetch(`/api/application-templates/${id}`, {
      method: 'DELETE',
      headers: bearerHeaders(accessToken),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({
        title: 'Delete failed',
        description: json.error || 'Unknown error',
        variant: 'destructive',
      });
      return;
    }
    if (draft?.id === id) setDraft(null);
    await loadList();
    toast({ title: 'Deleted' });
  }

  async function uploadFile(file: File) {
    if (!draft?.id) {
      toast({
        title: 'Save first',
        description: 'Save the application before uploading documents.',
      });
      return;
    }
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh the page and try again.',
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `/api/application-templates/${draft.id}/files`,
        {
          method: 'POST',
          headers: bearerHeaders(accessToken),
          body: form,
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setDraft((prev) =>
        prev
          ? { ...prev, files: [json.file, ...(prev.files || [])] }
          : prev,
      );
      await loadList();
      toast({ title: 'Document uploaded' });
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(fileId: string) {
    if (!draft?.id || !accessToken) return;
    const res = await fetch(
      `/api/application-templates/${draft.id}/files/${fileId}`,
      {
        method: 'DELETE',
        headers: bearerHeaders(accessToken),
      },
    );
    if (!res.ok) {
      const json = await res.json();
      toast({
        title: 'Could not delete file',
        description: json.error,
        variant: 'destructive',
      });
      return;
    }
    setDraft((prev) =>
      prev
        ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) }
        : prev,
    );
  }

  if (isLoadingProfile || !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 pb-12">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const filters: Array<{
    id: 'all' | 'draft' | 'published' | 'archived';
    label: string;
    count: number;
  }> = [
    { id: 'all', label: 'All', count: list.length },
    { id: 'published', label: 'Published', count: statusCounts.published },
    { id: 'draft', label: 'Drafts', count: statusCounts.draft },
    { id: 'archived', label: 'Archived', count: statusCounts.archived },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
      <header className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-6 py-8 text-white sm:px-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 55% 80% at 100% 0%, rgba(56,189,248,0.2), transparent 50%)',
          }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300/80">
              Admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Application templates
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Build checklists, attach reference documents, and publish packages
              for crew on Apply.
            </p>
          </div>
          <Button
            onClick={() => setDraft(emptyTemplate())}
            className="gap-2 bg-white text-slate-900 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            New application
          </Button>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Published</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{statusCounts.published}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Drafts</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{statusCounts.draft}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Archived</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{statusCounts.archived}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === f.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:bg-muted/60',
                )}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Templates</h2>
              <p className="text-xs text-muted-foreground">
                Select one to edit
              </p>
            </div>
            <div className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
              {loadingList ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : filteredList.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No templates in this filter.
                </p>
              ) : (
                filteredList.map((t) => {
                  const active = draft?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDraft(fromApi(t))}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                        active
                          ? 'bg-sky-500/10 ring-1 ring-sky-500/30'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-[10px] font-bold">
                        {t.organization.slice(0, 3).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t.organization} · {t.requirements?.length ?? 0} reqs
                          {t.target_level && t.target_level !== 'other'
                            ? ` · → ${t.target_level.replace(/_/g, ' ')}`
                            : ''}
                        </p>
                      </div>
                      <Badge
                        variant={
                          t.status === 'published'
                            ? 'default'
                            : t.status === 'archived'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="shrink-0 capitalize"
                      >
                        {t.status}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {draft ? (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card/95 px-5 py-4 backdrop-blur">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <h2 className="truncate text-base font-semibold">
                    {draft.id ? 'Edit application' : 'New application'}
                  </h2>
                  <Badge variant="outline" className="capitalize">
                    {draft.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {draft.requirements.length} requirement
                  {draft.requirements.length === 1 ? '' : 's'} ·{' '}
                  {draft.files.length} file
                  {draft.files.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
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
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => void saveDraft({ status: 'published' })}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Publish
                </Button>
                {draft.id ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={saving}
                      onClick={() => void saveDraft({ status: 'archived' })}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void deleteTemplate(draft.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="space-y-8 p-5 sm:p-6">
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Basics</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={draft.title}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                      placeholder="PYA Yacht Sea Service Package"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org">Organization</Label>
                    <Input
                      id="org"
                      value={draft.organization}
                      onChange={(e) =>
                        setDraft({ ...draft, organization: e.target.value })
                      }
                      placeholder="PYA / Nautilus / MCA / Custom"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="external">Official apply URL</Label>
                    <Input
                      id="external"
                      value={draft.external_url}
                      onChange={(e) =>
                        setDraft({ ...draft, external_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Career track</Label>
                    <Select
                      value={draft.career_track || 'any'}
                      onValueChange={(value) => {
                        const track = value as CareerTrack;
                        const stillValid = TARGETABLE_LEVELS.some(
                          (t) =>
                            t.level === draft.target_level &&
                            (t.track === track || t.track === 'any' || track === 'any'),
                        );
                        const fallback =
                          TARGETABLE_LEVELS.find((t) => t.track === track)?.level ||
                          'other';
                        setDraft({
                          ...draft,
                          career_track: track,
                          target_level: stillValid ? draft.target_level : fallback,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(CAREER_TRACK_LABELS) as CareerTrack[]
                        ).map((key) => (
                          <SelectItem key={key} value={key}>
                            {CAREER_TRACK_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prepares crew for (next ticket)</Label>
                    <Select
                      value={draft.target_level || 'other'}
                      onValueChange={(value) =>
                        setDraft({ ...draft, target_level: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGETABLE_LEVELS.filter(
                          (t) =>
                            t.track === 'any' ||
                            draft.career_track === 'any' ||
                            t.track === draft.career_track,
                        ).map((t) => (
                          <SelectItem key={`${t.track}-${t.level}`} value={t.level}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Crew on the previous step see this under “Recommended for
                      your next ticket”.
                    </p>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="description">Short description</Label>
                    <Textarea
                      id="description"
                      value={draft.description}
                      onChange={(e) =>
                        setDraft({ ...draft, description: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="instructions">Crew instructions</Label>
                    <Textarea
                      id="instructions"
                      value={draft.instructions}
                      onChange={(e) =>
                        setDraft({ ...draft, instructions: e.target.value })
                      }
                      rows={3}
                      placeholder="What crew should do once requirements are met..."
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Requirements</h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        requirements: [
                          ...draft.requirements,
                          emptyRequirement(),
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>

                <div className="space-y-3">
                  {draft.requirements.map((req, index) => (
                    <RequirementEditor
                      key={req.localId}
                      index={index}
                      requirement={req}
                      certificatePresets={certificatePresets}
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

              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Reference documents</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Guides or blank forms for crew. Save the application before
                  uploading.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Label
                    htmlFor="file-upload"
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm transition-colors hover:bg-muted/50',
                      (!draft.id || uploading) && 'pointer-events-none opacity-50',
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="h-4 w-4" />
                    )}
                    Upload PDF / image
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".pdf,image/*,.doc,.docx"
                    disabled={!draft.id || uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadFile(file);
                      e.target.value = '';
                    }}
                  />
                  {!draft.id ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      Save first to enable uploads
                    </span>
                  ) : null}
                </div>
                {draft.files.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No files attached yet
                  </div>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {draft.files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                      >
                        <button
                          type="button"
                          className="truncate text-left font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => {
                            if (!draft.id || !accessToken) return;
                            void downloadWithAuth(
                              `/api/application-templates/${draft.id}/files/${f.id}`,
                              accessToken,
                              f.file_name,
                            ).catch((e) =>
                              toast({
                                title: 'Download failed',
                                description:
                                  e instanceof Error
                                    ? e.message
                                    : 'Unknown error',
                                variant: 'destructive',
                              }),
                            );
                          }}
                        >
                          {f.file_name}
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void deleteFile(f.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-4 text-base font-semibold">No template selected</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Choose a template from the list, or create a new application to
              define requirements and publish for crew.
            </p>
            <Button
              className="mt-6 gap-2"
              onClick={() => setDraft(emptyTemplate())}
            >
              <Plus className="h-4 w-4" />
              New application
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function RequirementEditor({
  index,
  requirement,
  onChange,
  onRemove,
  certificatePresets = CERTIFICATE_PRESETS,
}: {
  index: number;
  requirement: DraftRequirement;
  onChange: (next: DraftRequirement) => void;
  onRemove: () => void;
  certificatePresets?: CertificatePreset[];
}) {
  const type = requirement.requirement_type;
  const config = requirement.config;
  const presets = certificatePresets.length
    ? certificatePresets
    : CERTIFICATE_PRESETS;

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-background text-xs font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
            {index + 1}
          </span>
          <Badge variant="secondary" className="font-normal">
            {REQUIREMENT_TYPE_LABELS[type]}
          </Badge>
          {!requirement.is_required ? (
            <Badge variant="outline" className="font-normal">
              Optional
            </Badge>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Title</Label>
          <Input
            value={requirement.title}
            onChange={(e) =>
              onChange({ ...requirement, title: e.target.value })
            }
            placeholder="Requirement title"
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={type}
            onValueChange={(value) =>
              onChange({
                ...requirement,
                requirement_type: value as ApplicationRequirementType,
                config: defaultConfigFor(value as ApplicationRequirementType),
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(
                  REQUIREMENT_TYPE_LABELS,
                ) as ApplicationRequirementType[]
              ).map((key) => (
                <SelectItem key={key} value={key}>
                  {REQUIREMENT_TYPE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Checkbox
            id={`req-${requirement.localId}`}
            checked={requirement.is_required}
            onCheckedChange={(checked) =>
              onChange({
                ...requirement,
                is_required: checked === true,
              })
            }
          />
          <Label htmlFor={`req-${requirement.localId}`}>Required</Label>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={requirement.description}
            onChange={(e) =>
              onChange({ ...requirement, description: e.target.value })
            }
            rows={2}
          />
        </div>
      </div>

      {type === 'profile_fields' ? (
        <div className="flex flex-wrap gap-3">
          {PROFILE_FIELD_OPTIONS.map((opt) => {
            const fields = config.fields || [];
            const checked = fields.includes(opt.key);
            return (
              <label
                key={opt.key}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c
                      ? [...fields, opt.key]
                      : fields.filter((f) => f !== opt.key);
                    onChange({
                      ...requirement,
                      config: { ...config, fields: next },
                    });
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      ) : null}

      {type === 'certificate' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Certificate preset</Label>
            <Select
              value={config.presetId || '_custom'}
              onValueChange={(value) => {
                if (value === '_custom') {
                  onChange({
                    ...requirement,
                    config: {
                      ...config,
                      presetId: undefined,
                    },
                  });
                  return;
                }
                const preset = presets.find((p) => p.id === value);
                if (!preset || preset.id === 'other') {
                  onChange({
                    ...requirement,
                    config: { ...config, presetId: undefined },
                  });
                  return;
                }
                onChange({
                  ...requirement,
                  title: requirement.title.trim()
                    ? requirement.title
                    : preset.name,
                  description: requirement.description.trim()
                    ? requirement.description
                    : preset.description,
                  config: {
                    ...config,
                    presetId: preset.id,
                    certificateType: preset.type,
                    nameContains: (
                      preset.name.match(/\(([^)]+)\)/)?.[1]?.split(/[/,]/)[0]?.trim() ||
                      preset.name.split('(')[0].trim()
                    ).slice(0, 40),
                    mustNotExpired: true,
                    minCount: config.minCount ?? 1,
                  },
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick STCW, EDH, ENG1…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_custom">Custom filter</SelectItem>
                {presets.filter((p) => p.id !== 'other').map(
                  (preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Prefills type/name filters so Apply can match crew certificates and
              show valid / renew / expired.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Min count"
              value={config.minCount ?? 1}
              onChange={(n) =>
                onChange({ ...requirement, config: { ...config, minCount: n } })
              }
            />
            <div className="space-y-2">
              <Label>Type filter</Label>
              <Input
                value={config.certificateType || ''}
                onChange={(e) =>
                  onChange({
                    ...requirement,
                    config: {
                      ...config,
                      certificateType: e.target.value || undefined,
                    },
                  })
                }
                placeholder="STCW"
              />
            </div>
            <div className="space-y-2">
              <Label>Name contains</Label>
              <Input
                value={config.nameContains || ''}
                onChange={(e) =>
                  onChange({
                    ...requirement,
                    config: {
                      ...config,
                      nameContains: e.target.value || undefined,
                    },
                  })
                }
                placeholder="Basic Safety"
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <Checkbox
                checked={config.mustNotExpired !== false}
                onCheckedChange={(c) =>
                  onChange({
                    ...requirement,
                    config: { ...config, mustNotExpired: c === true },
                  })
                }
              />
              Must not be expired (expired copies do not count)
            </label>
          </div>
        </div>
      ) : null}

      {type === 'testimonial' || type === 'proof_of_service' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Min count"
            value={config.minCount ?? 1}
            onChange={(n) =>
              onChange({ ...requirement, config: { ...config, minCount: n } })
            }
          />
          {type === 'testimonial' ? (
            <NumberField
              label="Min at-sea days per testimonial (optional)"
              value={config.minAtSeaDays ?? 0}
              onChange={(n) =>
                onChange({
                  ...requirement,
                  config: { ...config, minAtSeaDays: n || undefined },
                })
              }
            />
          ) : null}
        </div>
      ) : null}

      {type === 'sea_time_min' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Minimum days"
            value={config.min ?? 0}
            onChange={(n) =>
              onChange({ ...requirement, config: { ...config, min: n } })
            }
          />
          <div className="space-y-2">
            <Label>Metric</Label>
            <Select
              value={config.metric || 'atSeaDays'}
              onValueChange={(value) =>
                onChange({
                  ...requirement,
                  config: {
                    ...config,
                    metric: value as RequirementConfig['metric'],
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atSeaDays">At-sea days</SelectItem>
                <SelectItem value="totalDays">Total service days</SelectItem>
                <SelectItem value="standbyDays">Standby days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={config.source || 'testimonials'}
              onValueChange={(value) =>
                onChange({
                  ...requirement,
                  config: {
                    ...config,
                    source: value as RequirementConfig['source'],
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="testimonials">
                  Approved testimonials
                </SelectItem>
                <SelectItem value="tracked">Tracked state logs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {type === 'manual_checklist' ? (
        <div className="space-y-2">
          <Label>Hint for crew</Label>
          <Input
            value={config.hint || ''}
            onChange={(e) =>
              onChange({
                ...requirement,
                config: { ...config, hint: e.target.value || undefined },
              })
            }
            placeholder="e.g. Scan your discharge book pages 1–4"
          />
        </div>
      ) : null}

      {type === 'external_link' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={config.url || ''}
              onChange={(e) =>
                onChange({
                  ...requirement,
                  config: { ...config, url: e.target.value || undefined },
                })
              }
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Link label</Label>
            <Input
              value={config.label || ''}
              onChange={(e) =>
                onChange({
                  ...requirement,
                  config: { ...config, label: e.target.value || undefined },
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function defaultConfigFor(type: ApplicationRequirementType): RequirementConfig {
  switch (type) {
    case 'profile_fields':
      return {
        fields: [
          'first_name',
          'last_name',
          'email',
          'nationality',
          'date_of_birth',
        ],
      };
    case 'certificate':
      return { minCount: 1, mustNotExpired: true };
    case 'testimonial':
    case 'proof_of_service':
      return { minCount: 1, status: 'approved' };
    case 'sea_time_min':
      return { min: 180, metric: 'atSeaDays', source: 'testimonials' };
    case 'external_link':
      return { url: '', label: 'Open form' };
    default:
      return {};
  }
}
