'use client';

/**
 * /dashboard/vessel-roles
 *
 * Pro-tier vessel feature: create and manage "linked accounts" — secondary
 * Supabase auth users that are owned by the vessel. Useful when the captain
 * (or officer / engineer / vessel manager) doesn't want to use their own
 * personal SeaJourney account but still needs to sign documents on behalf
 * of the vessel.
 *
 * Backed by:
 *  - POST /api/users/invite-vessel-role
 *  - POST /api/users/remove-vessel-role
 *  - users.managed_by_vessel_id  (sql/add-managed-by-vessel-id-to-users.sql)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Anchor,
  Check,
  ChevronDown,
  Crown,
  Loader2,
  Lock,
  Mail,
  Plus,
  Radio,
  Settings,
  Shield,
  Ship,
  Trash2,
  UserCog,
  Wrench,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasVesselPremiumPlusFeatures } from '@/supabase/database/subscription-helpers';
import type { VesselLinkedRole } from '@/lib/types';
import {
  VESSEL_LINKED_CORE_FEATURES,
  VESSEL_LINKED_FEATURE_GROUPS,
  grantableVesselLinkedFeatures,
  resolveLinkedAccountFeatures,
  type VesselLinkedFeatureDefinition,
  type VesselLinkedFeatureKey,
} from '@/lib/vessel-linked-features';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
} from '@/components/ui/dialog';
import { SeaDialogContent, SeaDialogHeader, SeaDialogBody, SeaDialogFooter } from '@/components/ui/sea-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';

interface LinkedAccountRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: VesselLinkedRole;
  joinedAt: string | null;
  lastSignInAt: string | null;
  features: VesselLinkedFeatureKey[];
}

const ROLE_META: Record<
  VesselLinkedRole,
  { label: string; description: string; icon: React.ElementType; tone: string; rail: string }
> = {
  captain: {
    label: 'Captain',
    description:
      'Assigned as this vessel’s captain immediately — can sign off testimonials without a separate claim approval.',
    icon: Crown,
    tone: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    rail: 'bg-amber-500',
  },
  officer: {
    label: 'Officer',
    description: 'Can sign off bridge-watch and passage entries.',
    icon: Anchor,
    tone: 'bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    rail: 'bg-sky-500',
  },
  engineer: {
    label: 'Engineer',
    description: 'Engineering-side sign-offs and engine-room records.',
    icon: Wrench,
    tone: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    rail: 'bg-emerald-500',
  },
  manager: {
    label: 'Manager',
    description: 'Administrative delegate — manage vessel data without signing authority.',
    icon: Settings,
    tone: 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
    rail: 'bg-violet-500',
  },
};

function deriveLinkedRole(row: Record<string, unknown>): VesselLinkedRole {
  // The api/users/invite-vessel-role endpoint stores the role both in
  // user_metadata.linked_role (auth) and indirectly in
  // users.role / vessel_assignments.assignment_role. Here we fetch from
  // public.users; the safest derivation uses (role + position):
  //   role=captain                       → captain
  //   position contains "engineer"       → engineer
  //   position contains "manager"        → manager
  //   else                                → officer
  const userRole = ((row.role as string) || '').toLowerCase();
  const position = ((row.position as string) || '').toLowerCase();
  if (userRole === 'captain') return 'captain';
  if (position.includes('engineer')) return 'engineer';
  if (position.includes('manager')) return 'manager';
  return 'officer';
}

export default function VesselRolesPage() {
  const router = useRouter();
  const { user, isUserLoading } = useUser();
  const { supabase } = useSupabase();
  const { data: profileRaw, isLoading: isProfileLoading } = useDoc<Record<string, unknown>>(
    'users',
    user?.id,
  );

  const [linked, setLinked] = useState<LinkedAccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<LinkedAccountRow | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [savingFeaturesId, setSavingFeaturesId] = useState<string | null>(null);

  // Form state for "Add linked account"
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<VesselLinkedRole>('captain');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { flags } = useFeatureFlags();
  const grantableFeatures = useMemo(
    () => grantableVesselLinkedFeatures((key) => !!flags[key]),
    [flags],
  );
  const grantableKeys = useMemo(
    () => new Set(grantableFeatures.map((f) => f.key)),
    [grantableFeatures],
  );

  const role = (profileRaw?.role as string) || 'crew';
  const activeVesselId = (profileRaw?.active_vessel_id as string) || null;

  const isVesselManager = role === 'vessel';
  const hasPremiumPlusTier = useMemo(() => {
    if (!profileRaw) return false;
    if (!isVesselManager) return false;
    return hasVesselPremiumPlusFeatures(profileRaw);
  }, [profileRaw, isVesselManager]);

  const panelStats = useMemo(() => {
    const live = linked.filter((a) => Boolean(a.lastSignInAt)).length;
    return {
      accounts: linked.length,
      live,
      setup: linked.length - live,
      grants: linked.reduce(
        (n, a) => n + a.features.filter((key) => grantableKeys.has(key)).length,
        0,
      ),
    };
  }, [linked, grantableKeys]);

  // Redirect non-vessel users away.
  useEffect(() => {
    if (isUserLoading || isProfileLoading) return;
    if (!user) {
      router.replace('/dashboard');
      return;
    }
    if (profileRaw && !isVesselManager) {
      router.replace('/dashboard');
    }
  }, [isUserLoading, isProfileLoading, user, profileRaw, isVesselManager, router]);

  const fetchLinkedAccounts = useCallback(async () => {
    if (!supabase || !activeVesselId || !hasPremiumPlusTier) {
      setLinked([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      let query = supabase
        .from('users')
        .select(
          'id, email, first_name, last_name, role, position, registration_date, last_sign_in_at, managed_by_vessel_id, linked_account_features',
        )
        .eq('managed_by_vessel_id', activeVesselId)
        .order('registration_date', { ascending: false });
      let { data, error } = await query;
      if (error && /linked_account_features/i.test(error.message || '')) {
        const fallback = await supabase
          .from('users')
          .select(
            'id, email, first_name, last_name, role, position, registration_date, last_sign_in_at, managed_by_vessel_id',
          )
          .eq('managed_by_vessel_id', activeVesselId)
          .order('registration_date', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;

      const mapped: LinkedAccountRow[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          email: (r.email as string) || '',
          firstName: (r.first_name as string) || null,
          lastName: (r.last_name as string) || null,
          role: deriveLinkedRole(r),
          joinedAt: (r.registration_date as string) || null,
          lastSignInAt: (r.last_sign_in_at as string) || null,
          features: resolveLinkedAccountFeatures(r),
        };
      });
      setLinked(mapped);
    } catch (err) {
      console.error('[VESSEL ROLES] Failed to load linked accounts:', err);
      toast({
        title: 'Could not load linked accounts',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase, activeVesselId, hasPremiumPlusTier]);

  useEffect(() => {
    void fetchLinkedAccounts();
  }, [fetchLinkedAccounts]);

  const resetForm = useCallback(() => {
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormRole('captain');
    setFormError(null);
  }, []);

  const handleSubmitInvite = useCallback(async () => {
    if (!user || !activeVesselId) return;
    setFormError(null);

    if (!formFirstName.trim() || !formLastName.trim() || !formEmail.trim()) {
      setFormError('First name, last name, and email are all required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formEmail.trim())) {
      setFormError('That email address does not look valid.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/users/invite-vessel-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formFirstName.trim(),
          lastName: formLastName.trim(),
          email: formEmail.trim().toLowerCase(),
          role: formRole,
          vesselId: activeVesselId,
          vesselUserId: user.id,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      if (!res.ok) {
        setFormError(payload?.message || payload?.error || `Request failed (${res.status})`);
        return;
      }
      toast({
        title: 'Invitation sent',
        description:
          formRole === 'captain'
            ? `${formFirstName} is assigned as this vessel’s captain and will receive an email to set their password.`
            : `${formFirstName} will receive an email to set their password.`,
      });
      setIsAddOpen(false);
      resetForm();
      await fetchLinkedAccounts();
    } catch (err) {
      console.error('[VESSEL ROLES] Invite failed:', err);
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }, [user, activeVesselId, formFirstName, formLastName, formEmail, formRole, resetForm, fetchLinkedAccounts]);

  const handleConfirmRemove = useCallback(async () => {
    if (!pendingRemove || !user || !activeVesselId) return;
    setIsRemoving(true);
    try {
      const res = await fetch('/api/users/remove-vessel-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vesselUserId: user.id,
          linkedUserId: pendingRemove.id,
          vesselId: activeVesselId,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      if (!res.ok) {
        toast({
          title: 'Could not remove account',
          description: payload?.message || payload?.error || `Request failed (${res.status})`,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Linked account removed' });
      setPendingRemove(null);
      await fetchLinkedAccounts();
    } catch (err) {
      console.error('[VESSEL ROLES] Remove failed:', err);
      toast({
        title: 'Could not remove account',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  }, [pendingRemove, user, activeVesselId, fetchLinkedAccounts]);

  const handleToggleFeature = useCallback(
    async (account: LinkedAccountRow, key: VesselLinkedFeatureKey, enabled: boolean) => {
      if (!user || !activeVesselId) return;
      if (enabled && !grantableKeys.has(key)) return;
      const previous = account.features;
      const next = enabled
        ? (previous.includes(key) ? previous : [...previous, key])
        : previous.filter((k) => k !== key);

      setLinked((rows) =>
        rows.map((row) => (row.id === account.id ? { ...row, features: next } : row)),
      );
      setSavingFeaturesId(account.id);
      try {
        const res = await fetch('/api/users/vessel-role-features', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vesselUserId: user.id,
            linkedUserId: account.id,
            vesselId: activeVesselId,
            features: next,
          }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { error?: string; message?: string; features?: VesselLinkedFeatureKey[] }
          | null;
        if (!res.ok) {
          setLinked((rows) =>
            rows.map((row) => (row.id === account.id ? { ...row, features: previous } : row)),
          );
          toast({
            title: 'Could not update features',
            description: payload?.message || payload?.error || `Request failed (${res.status})`,
            variant: 'destructive',
          });
          return;
        }
        if (payload?.features) {
          setLinked((rows) =>
            rows.map((row) =>
              row.id === account.id ? { ...row, features: payload.features! } : row,
            ),
          );
        }
      } catch (err) {
        setLinked((rows) =>
          rows.map((row) => (row.id === account.id ? { ...row, features: previous } : row)),
        );
        toast({
          title: 'Could not update features',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setSavingFeaturesId((cur) => (cur === account.id ? null : cur));
      }
    },
    [user, activeVesselId, grantableKeys],
  );

  // ---- Render guards ----

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isVesselManager) {
    return null; // redirect in progress
  }

  // ---- Premium+ tier gate ----
  if (!hasPremiumPlusTier) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader />
        <VesselPremiumFeatureGate
          title="Available on Vessel Premium"
          featureLabel="Vessel-linked role accounts"
          description="Let your captain, officers, engineer, and manager sign documents on behalf of the vessel without using their personal SeaJourney accounts."
        />
      </div>
    );
  }

  if (!activeVesselId) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader />
        <Alert>
          <Ship className="h-4 w-4" />
          <AlertTitle>No active vessel</AlertTitle>
          <AlertDescription>
            Select an active vessel in your account before adding linked role accounts.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <ConsoleHeader
        stats={panelStats}
        loading={isLoading}
        onAdd={() => setIsAddOpen(true)}
      />

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Accounts
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {panelStats.accounts.toString().padStart(2, '0')}
            </span>
          </div>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            Expand an account to grant extras. Core pages stay live for every linked login.
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : linked.length === 0 ? (
          <EmptyState onAdd={() => setIsAddOpen(true)} />
        ) : (
          <ul className="divide-y">
            {linked.map((account) => (
              <LinkedAccountRow
                key={account.id}
                account={account}
                grantableFeatures={grantableFeatures}
                saving={savingFeaturesId === account.id}
                onRemove={() => setPendingRemove(account)}
                onToggleFeature={(key, enabled) => {
                  void handleToggleFeature(account, key, enabled);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ---- Add dialog ---- */}
      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetForm();
        }}
      >
        <SeaDialogContent size="md">
          <SeaDialogHeader
            icon={UserCog}
            eyebrow="Vessel roles"
            title="Add a linked account"
            description="We'll create a SeaJourney account tied to your vessel and email an invitation to set a password."
          />
          <SeaDialogBody>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="role-first-name" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  First name
                </Label>
                <Input
                  id="role-first-name"
                  value={formFirstName}
                  onChange={(e) => setFormFirstName(e.target.value)}
                  placeholder="James"
                  autoComplete="given-name"
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-last-name" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Last name
                </Label>
                <Input
                  id="role-last-name"
                  value={formLastName}
                  onChange={(e) => setFormLastName(e.target.value)}
                  placeholder="Carter"
                  autoComplete="family-name"
                  className="h-10 rounded-lg"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-email" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input
                id="role-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="captain@your-vessel.com"
                autoComplete="off"
                className="h-10 rounded-lg"
              />
              <p className="text-xs text-muted-foreground">
                Must be an email that isn&apos;t already on SeaJourney. A vessel-specific alias
                works well (e.g. <code className="rounded bg-muted px-1 py-0.5 text-[11px]">captain@your-vessel.com</code>).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-role" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Role
              </Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as VesselLinkedRole)}>
                <SelectTrigger id="role-role" className="h-10 rounded-lg">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_META) as VesselLinkedRole[]).map((r) => {
                    const meta = ROLE_META[r];
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={r} value={r}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ROLE_META[formRole].description}
              </p>
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </SeaDialogBody>
          <SeaDialogFooter>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => {
                setIsAddOpen(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button className="rounded-lg" onClick={handleSubmitInvite} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending invite…
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send invitation
                </>
              )}
            </Button>
          </SeaDialogFooter>
        </SeaDialogContent>
      </Dialog>

      {/* ---- Remove confirmation ---- */}
      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this linked account?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove ? (
                <>
                  <span className="font-medium text-foreground">
                    {pendingRemove.firstName || ''} {pendingRemove.lastName || ''}
                  </span>{' '}
                  ({pendingRemove.email}) will be unlinked from this vessel. Any testimonials and
                  signatures they have already produced remain valid — only their access to this
                  vessel is ended.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRemove();
              }}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function ConsoleHeader({
  stats,
  loading,
  onAdd,
}: {
  stats: { accounts: number; live: number; setup: number; grants: number };
  loading: boolean;
  onAdd: () => void;
}) {
  const metrics = [
    { key: 'accounts', label: 'Accounts', value: stats.accounts, hint: 'Linked to this vessel' },
    { key: 'live', label: 'Live', value: stats.live, hint: 'Have signed in' },
    { key: 'setup', label: 'Setup', value: stats.setup, hint: 'Invitation pending' },
    { key: 'grants', label: 'Grants', value: stats.grants, hint: 'Extra features on' },
  ] as const;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            <Shield className="h-3.5 w-3.5" />
            Access control
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Vessel roles</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Linked logins owned by this vessel. Grant each account only the tools it needs.
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add account
        </Button>
      </div>

      <div className="grid grid-cols-2 border-t bg-muted/30 sm:grid-cols-4">
        {metrics.map((m) => (
          <div
            key={m.key}
            className="border-border px-5 py-3 sm:border-r sm:last:border-r-0 [&:nth-child(odd)]:border-r max-sm:[&:nth-child(-n+2)]:border-b"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {m.label}
            </div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums leading-none">
              {loading ? '—' : String(m.value).padStart(2, '0')}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{m.hint}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t px-5 py-2.5">
        {(Object.keys(ROLE_META) as VesselLinkedRole[]).map((r) => {
          const meta = ROLE_META[r];
          const Icon = meta.icon;
          return (
            <div key={r} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', meta.rail)} />
              <Icon className="h-3 w-3" />
              <span className="font-medium text-foreground">{meta.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vessel roles</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Create secondary accounts linked to this vessel for your captain, officers, engineer, or
          manager. They log in with their own email but the account is owned by the vessel — perfect
          for sign-offs without using personal accounts.
        </p>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
        <UserCog className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold">No linked accounts yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Add the captain, officers, engineer, or manager who will operate this vessel&apos;s
          dashboard. They&apos;ll get an email to set a password.
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add the first account
      </Button>
    </div>
  );
}

function LinkedAccountRow({
  account,
  grantableFeatures,
  saving,
  onRemove,
  onToggleFeature,
}: {
  account: LinkedAccountRow;
  grantableFeatures: VesselLinkedFeatureDefinition[];
  saving: boolean;
  onRemove: () => void;
  onToggleFeature: (key: VesselLinkedFeatureKey, enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = ROLE_META[account.role];
  const Icon = meta.icon;
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ') || account.email;
  const initials = (
    (account.firstName?.[0] || '') + (account.lastName?.[0] || '') || account.email[0] || '?'
  ).toUpperCase();
  const isLive = Boolean(account.lastSignInAt);
  const grantableKeys = useMemo(
    () => new Set(grantableFeatures.map((f) => f.key)),
    [grantableFeatures],
  );
  const granted = new Set(
    account.features.filter((key) => grantableKeys.has(key)),
  );
  const enabledCount = granted.size;
  const totalCount = grantableFeatures.length;
  const coreItems = VESSEL_LINKED_CORE_FEATURES.filter(
    (item) => !item.captainOnly || account.role === 'captain',
  );
  const visibleGroups = useMemo(
    () =>
      VESSEL_LINKED_FEATURE_GROUPS.map((group) => ({
        ...group,
        features: grantableFeatures.filter((f) => f.group === group.key),
      })).filter((group) => group.features.length > 0),
    [grantableFeatures],
  );

  return (
    <li className="relative">
      <span className={cn('absolute inset-y-0 left-0 w-1', meta.rail)} />
      <div className="flex items-center justify-between gap-3 py-2.5 pl-4 pr-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              isLive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-amber-400',
            )}
            title={isLive ? 'Live' : 'Invitation sent'}
          />
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{fullName}</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {account.email}
            </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'hidden font-mono text-[11px] tabular-nums sm:inline',
              enabledCount > 0 ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {String(enabledCount).padStart(2, '0')}/{String(totalCount).padStart(2, '0')}
          </span>
          <span
            className={cn(
              'hidden rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider sm:inline',
              isLive
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
            )}
          >
            {isLive ? 'Live' : 'Setup'}
          </span>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          <Button
            variant={expanded ? 'default' : 'outline'}
            size="sm"
            className="h-8 font-mono text-[11px] uppercase tracking-wider"
            onClick={() => setExpanded((open) => !open)}
          >
            <Activity className="mr-1 h-3.5 w-3.5" />
            Panel
            <ChevronDown
              className={cn('ml-1 h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove linked account"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Core
            </span>
            {coreItems.map((item) => (
              <span
                key={item.label}
                title={item.description}
                className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
              >
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                {item.label}
              </span>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-3">
            {visibleGroups.map((group) => {
              const features = group.features;
              const onCount = features.filter((f) => granted.has(f.key)).length;
              return (
                <section
                  key={group.key}
                  className="overflow-hidden rounded-md border bg-background/80"
                >
                  <div className="flex items-center justify-between border-b bg-muted/50 px-2.5 py-1.5">
                    <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {group.label}
                    </h4>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {onCount}/{features.length}
                    </span>
                  </div>
                  <div className="divide-y">
                    {features.map((feature) => {
                      const enabled = granted.has(feature.key);
                      return (
                        <label
                          key={feature.key}
                          title={feature.description}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 transition-colors',
                            enabled ? 'bg-emerald-500/[0.06]' : 'hover:bg-muted/40',
                          )}
                        >
                          <span className="min-w-0 truncate text-[13px] font-medium">
                            {feature.label}
                          </span>
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                'font-mono text-[10px] font-semibold uppercase tracking-wider',
                                enabled
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-muted-foreground/70',
                              )}
                            >
                              {enabled ? 'On' : 'Off'}
                            </span>
                            <Switch
                              checked={enabled}
                              disabled={saving}
                              onCheckedChange={(checked) => onToggleFeature(feature.key, checked)}
                              aria-label={`Allow ${feature.label}`}
                              className="h-5 w-9 shrink-0 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4"
                            />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {visibleGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No extra features are available to grant right now. Platform features may be
              temporarily disabled by an admin.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
