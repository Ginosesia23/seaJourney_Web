'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { bearerHeaders } from '@/lib/applications/client';
import {
  CERTIFICATE_PRESET_CATEGORIES,
  slugifyCertificateCatalogId,
  type CertificatePreset,
  type CertificatePresetCategory,
} from '@/lib/certificates/presets';
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
import {
  DashboardHeader,
  DashboardPanel,
} from '@/components/dashboard/dashboard-home-ui';
import { cn } from '@/lib/utils';

type EditablePreset = {
  id: string;
  name: string;
  type: string;
  issuingAuthority: string;
  typicalValidityYears: string;
  renewalRequired: boolean;
  renewalNoticeDays: string;
  description: string;
  category: CertificatePresetCategory;
  aliases: string;
  sortOrder: string;
  active: boolean;
  isNew: boolean;
};

function emptyDraft(): EditablePreset {
  return {
    id: '',
    name: '',
    type: 'MCA',
    issuingAuthority: 'MCA',
    typicalValidityYears: '',
    renewalRequired: true,
    renewalNoticeDays: '90',
    description: '',
    category: 'other',
    aliases: '',
    sortOrder: '200',
    active: true,
    isNew: true,
  };
}

function fromApi(p: CertificatePreset): EditablePreset {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    issuingAuthority: p.issuingAuthority,
    typicalValidityYears:
      p.typicalValidityYears != null ? String(p.typicalValidityYears) : '',
    renewalRequired: p.renewalRequired,
    renewalNoticeDays: String(p.renewalNoticeDays ?? 90),
    description: p.description || '',
    category: p.category,
    aliases: (p.aliases || []).join(', '),
    sortOrder: String(p.sortOrder ?? 100),
    active: p.active !== false,
    isNew: false,
  };
}

function toPayload(draft: EditablePreset) {
  const id = slugifyCertificateCatalogId(draft.id || draft.name);
  return {
    id,
    name: draft.name.trim(),
    certificate_type: draft.type.trim(),
    issuing_authority: draft.issuingAuthority.trim(),
    typical_validity_years: draft.typicalValidityYears
      ? Number(draft.typicalValidityYears)
      : null,
    renewal_required: draft.renewalRequired,
    renewal_notice_days: draft.renewalNoticeDays
      ? Number(draft.renewalNoticeDays)
      : 90,
    description: draft.description.trim(),
    category: draft.category,
    aliases: draft.aliases,
    sort_order: draft.sortOrder ? Number(draft.sortOrder) : 100,
    active: draft.active,
  };
}

export default function CertificateCatalogAdminPage() {
  const { user } = useUser();
  const { session } = useSupabase();
  const accessToken = session?.access_token;
  const router = useRouter();
  const { toast } = useToast();
  const { data: userProfileRaw, isLoading: isLoadingProfile } =
    useDoc<UserProfile>('users', user?.id);

  const isAdmin = userProfileRaw?.role === 'admin';

  const [list, setList] = useState<CertificatePreset[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState<EditablePreset | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | CertificatePresetCategory>(
    'all',
  );

  useEffect(() => {
    if (!isLoadingProfile && userProfileRaw && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, router, userProfileRaw]);

  const loadList = useCallback(async () => {
    if (!accessToken) return;
    setLoadingList(true);
    try {
      const res = await fetch('/api/admin/certificate-catalog', {
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setList(json.presets || []);
    } catch (e) {
      toast({
        title: 'Could not load certificate catalog',
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

  const filtered = useMemo(() => {
    return list.filter((p) => {
      if (!showInactive && p.active === false) return false;
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      return true;
    });
  }, [filterCategory, list, showInactive]);

  async function saveDraft() {
    if (!draft || !accessToken) return;
    const payload = toPayload(draft);
    if (!payload.name || !payload.certificate_type || !payload.id) {
      toast({
        title: 'Missing fields',
        description: 'Name, type, and id are required.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        draft.isNew
          ? '/api/admin/certificate-catalog'
          : `/api/admin/certificate-catalog/${draft.id}`,
        {
          method: draft.isNew ? 'POST' : 'PATCH',
          headers: bearerHeaders(accessToken, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast({
        title: draft.isNew ? 'Certificate added' : 'Certificate updated',
        description: payload.name,
      });
      await loadList();
      setDraft(fromApi(json.preset));
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

  async function deactivate() {
    if (!draft || draft.isNew || !accessToken) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/certificate-catalog/${draft.id}`, {
        method: 'DELETE',
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Deactivate failed');
      toast({ title: 'Deactivated', description: draft.name });
      setDraft(null);
      await loadList();
    } catch (e) {
      toast({
        title: 'Could not deactivate',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  if (isLoadingProfile || !isAdmin) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Certificate catalog"
        description="Manage the certificate list used on the crew Certificates page and when setting career milestone requirements."
        actions={
          <Button
            onClick={() => setDraft(emptyDraft())}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add certificate
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <DashboardPanel
          title="Catalog"
          description={`${filtered.length} shown`}
          action={
            <div className="flex items-center gap-2">
              <Select
                value={filterCategory}
                onValueChange={(v) =>
                  setFilterCategory(v as 'all' | CertificatePresetCategory)
                }
              >
                <SelectTrigger className="h-8 w-[7.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {CERTIFICATE_PRESET_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        >
          <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={showInactive}
              onCheckedChange={(c) => setShowInactive(c === true)}
            />
            Show inactive
          </label>
          {loadingList ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No certificates yet. Add one to populate the crew dropdown.
            </p>
          ) : (
            <div className="-mx-4 overflow-hidden rounded-lg border sm:-mx-5">
              {filtered.map((p) => {
                const selected = draft?.id === p.id && !draft.isNew;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDraft(fromApi(p))}
                    className={cn(
                      'flex w-full items-start gap-3 border-b px-3 py-3 text-left last:border-b-0 sm:px-4',
                      selected ? 'bg-muted/50' : 'hover:bg-muted/30',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.type} · {p.id}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {CERTIFICATE_PRESET_CATEGORIES.find((c) => c.id === p.category)
                          ?.label || p.category}
                      </Badge>
                      {p.active === false ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactive
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DashboardPanel>

        <div className="space-y-4">
          {!draft ? (
            <DashboardPanel title="Editor">
              <p className="text-sm text-muted-foreground">
                Select a certificate on the left, or add a new one. Changes appear
                in the crew Certificates dropdown and career milestone requirement
                picker.
              </p>
            </DashboardPanel>
          ) : (
            <DashboardPanel
              title={draft.isNew ? 'New certificate' : draft.name || 'Edit certificate'}
              description={
                draft.isNew
                  ? 'Create a catalog entry crew can pick when adding certificates.'
                  : `Id: ${draft.id}`
              }
              action={
                <div className="flex flex-wrap gap-2">
                  {!draft.isNew ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || !draft.active}
                      onClick={() => void deactivate()}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Deactivate
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void saveDraft()}
                  >
                    {saving ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Display name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setDraft({
                        ...draft,
                        name,
                        id: draft.isNew
                          ? slugifyCertificateCatalogId(name)
                          : draft.id,
                      });
                    }}
                    placeholder="GMDSS (GOC / ROC)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Id (slug)</Label>
                  <Input
                    value={draft.id}
                    disabled={!draft.isNew}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        id: slugifyCertificateCatalogId(e.target.value),
                      })
                    }
                    placeholder="gmdss"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Stable key used in career matching. Cannot change after save.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(v) =>
                      setDraft({
                        ...draft,
                        category: v as CertificatePresetCategory,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CERTIFICATE_PRESET_CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Input
                    value={draft.type}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    placeholder="STCW / MCA / Radio / Medical"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Issuing authority</Label>
                  <Input
                    value={draft.issuingAuthority}
                    onChange={(e) =>
                      setDraft({ ...draft, issuingAuthority: e.target.value })
                    }
                    placeholder="MCA"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Typical validity (years)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.typicalValidityYears}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        typicalValidityYears: e.target.value,
                      })
                    }
                    placeholder="Leave blank if none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Renewal notice (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draft.renewalNoticeDays}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        renewalNoticeDays: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) =>
                      setDraft({ ...draft, sortOrder: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Checkbox
                    checked={draft.renewalRequired}
                    onCheckedChange={(c) =>
                      setDraft({ ...draft, renewalRequired: c === true })
                    }
                  />
                  <Label>Renewal usually required</Label>
                </div>
                {!draft.isNew ? (
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox
                      checked={draft.active}
                      onCheckedChange={(c) =>
                        setDraft({ ...draft, active: c === true })
                      }
                    />
                    <Label>Active (shown in dropdowns)</Label>
                  </div>
                ) : null}
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
                <div className="space-y-2 sm:col-span-2">
                  <Label>Match aliases</Label>
                  <Input
                    value={draft.aliases}
                    onChange={(e) =>
                      setDraft({ ...draft, aliases: e.target.value })
                    }
                    placeholder="gmdss, goc, roc"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comma-separated names used to match older certificates that
                    were saved without a preset id.
                  </p>
                </div>
              </div>
            </DashboardPanel>
          )}
        </div>
      </div>
    </div>
  );
}
