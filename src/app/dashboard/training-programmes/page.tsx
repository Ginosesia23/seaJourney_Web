'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useDoc } from '@/supabase/database';
import { useSupabase } from '@/supabase';

type Program = {
  id: string;
  code: string;
  name: string;
  recognition_status: string | null;
  is_active: boolean;
};

type Version = {
  id: string;
  version: string;
  status: string;
  published_at: string | null;
};

export default function TrainingProgrammesAdminPage() {
  const { session, user } = useSupabase();
  const { toast } = useToast();
  const { data: profile } = useDoc<{ role?: string }>('users', user?.id);
  const isAdmin = useMemo(() => profile?.role === 'admin', [profile?.role]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const loadPrograms = useCallback(async () => {
    if (!session?.access_token || !isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch('/api/trb/admin/programs', {
        headers: bearerHeaders(session.access_token),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Forbidden');
      setPrograms(json.programs || []);
    } catch (e) {
      toast({
        title: 'Could not load programmes',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, isAdmin, toast]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  async function loadVersions(programId: string) {
    if (!session?.access_token) return;
    setSelectedProgramId(programId);
    const res = await fetch(`/api/trb/admin/programs/${programId}`, {
      headers: bearerHeaders(session.access_token),
    });
    const json = await res.json();
    if (res.ok) setVersions(json.versions || []);
  }

  async function createDraft() {
    if (!session?.access_token) return;
    setCreating(true);
    try {
      const res = await fetch('/api/trb/admin/programs', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      toast({ title: 'Draft programme created' });
      setCode('');
      setName('');
      await loadPrograms();
    } catch (e) {
      toast({
        title: 'Create failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }

  async function publish(versionId: string, action: 'publish_pilot' | 'publish_active' | 'retire') {
    if (!session?.access_token || !selectedProgramId) return;
    const res = await fetch(`/api/trb/admin/programs/${selectedProgramId}`, {
      method: 'POST',
      headers: {
        ...bearerHeaders(session.access_token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, versionId }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast({
        title: 'Action failed',
        description: json.error || 'Unknown error',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Version updated' });
    await loadVersions(selectedProgramId);
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <TrainingRecordsPageHeader
          title="Training programmes"
          description="Programme administration requires an admin account."
        />
        <TrainingRecordsEmpty
          title="Access restricted"
          description="Only SeaJourney administrators can create or publish training programme content."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title="Training programmes"
        description="Draft, pilot, active and retired programme versions. Published versions are immutable — create a new version to change content."
        actions={
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link href="/dashboard/training-records">Preview as crew</Link>
          </Button>
        }
      />

      <TrainingRecordsSection title="Create draft programme">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Code</Label>
            <Input
              className="h-8 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. demo-internal-v2"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              className="h-8 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Programme display name"
            />
          </div>
        </div>
        <Button
          className="mt-3 h-8 text-xs"
          size="sm"
          disabled={creating || !code.trim() || !name.trim()}
          onClick={() => void createDraft()}
        >
          {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Create draft
        </Button>
      </TrainingRecordsSection>

      <TrainingRecordsSection title="Programmes" flush>
        {programs.length === 0 ? (
          <TrainingRecordsEmpty
            title="No programmes"
            description="Create a draft programme to begin."
          />
        ) : (
          <ul className="divide-y divide-border">
            {programs.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{p.code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <TrainingStatusPill
                    status={p.recognition_status || (p.is_active ? 'active' : 'retired')}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => void loadVersions(p.id)}
                  >
                    Versions
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TrainingRecordsSection>

      {selectedProgramId ? (
        <TrainingRecordsSection title="Versions" flush>
          {versions.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No versions loaded.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div>
                    <p className="text-sm font-medium">{v.version}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{v.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <TrainingStatusPill status={v.status} />
                    {v.status === 'draft' ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void publish(v.id, 'publish_pilot')}
                      >
                        Publish as pilot
                      </Button>
                    ) : null}
                    {v.status === 'pilot' || v.status === 'draft' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => void publish(v.id, 'publish_active')}
                      >
                        Publish active
                      </Button>
                    ) : null}
                    {v.status !== 'retired' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => void publish(v.id, 'retire')}
                      >
                        Retire
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TrainingRecordsSection>
      ) : null}
    </div>
  );
}
