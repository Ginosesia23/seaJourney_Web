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
  AlertTriangle,
  Anchor,
  Crown,
  Loader2,
  Mail,
  Plus,
  Settings,
  Ship,
  Trash2,
  UserCog,
  Wrench,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasVesselPremiumPlusFeatures } from '@/supabase/database/subscription-helpers';
import type { VesselLinkedRole } from '@/lib/types';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
}

const ROLE_META: Record<
  VesselLinkedRole,
  { label: string; description: string; icon: React.ElementType; tone: string }
> = {
  captain: {
    label: 'Captain',
    description: 'Can sign off testimonials and approve sea-service for the vessel.',
    icon: Crown,
    tone: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  },
  officer: {
    label: 'Officer',
    description: 'Can sign off bridge-watch and passage entries.',
    icon: Anchor,
    tone: 'bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  },
  engineer: {
    label: 'Engineer',
    description: 'Engineering-side sign-offs and engine-room records.',
    icon: Wrench,
    tone: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  manager: {
    label: 'Manager',
    description: 'Administrative delegate — manage vessel data without signing authority.',
    icon: Settings,
    tone: 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
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

  // Form state for "Add linked account"
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<VesselLinkedRole>('captain');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const role = (profileRaw?.role as string) || 'crew';
  const activeVesselId = (profileRaw?.active_vessel_id as string) || null;

  const isVesselManager = role === 'vessel';
  const hasPremiumPlusTier = useMemo(() => {
    if (!profileRaw) return false;
    if (!isVesselManager) return false;
    return hasVesselPremiumPlusFeatures(profileRaw);
  }, [profileRaw, isVesselManager]);

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
      const { data, error } = await supabase
        .from('users')
        .select(
          'id, email, first_name, last_name, role, position, registration_date, last_sign_in_at, managed_by_vessel_id',
        )
        .eq('managed_by_vessel_id', activeVesselId)
        .order('registration_date', { ascending: false });
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
        description: `${formFirstName} will receive an email to set their password.`,
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
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add linked account
        </Button>
      </PageHeader>

      <RoleLegend />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCog className="h-5 w-5" />
            Linked accounts on this vessel
          </CardTitle>
          <CardDescription>
            These accounts log in to SeaJourney using their own email and password, but they belong
            to this vessel. Sea-service testimonials and sign-off requests can be routed to them
            automatically (coming soon).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : linked.length === 0 ? (
            <EmptyState onAdd={() => setIsAddOpen(true)} />
          ) : (
            <ul className="divide-y rounded-md border">
              {linked.map((account) => (
                <LinkedAccountRow
                  key={account.id}
                  account={account}
                  onRemove={() => setPendingRemove(account)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---- Add dialog ---- */}
      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a linked account</DialogTitle>
            <DialogDescription>
              We&apos;ll create a SeaJourney account tied to your vessel and email an invitation to
              set a password. The account uses a separate email from your personal one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="role-first-name">First name</Label>
                <Input
                  id="role-first-name"
                  value={formFirstName}
                  onChange={(e) => setFormFirstName(e.target.value)}
                  placeholder="James"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <Label htmlFor="role-last-name">Last name</Label>
                <Input
                  id="role-last-name"
                  value={formLastName}
                  onChange={(e) => setFormLastName(e.target.value)}
                  placeholder="Carter"
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="role-email">Email</Label>
              <Input
                id="role-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="captain@your-vessel.com"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Must be an email that isn&apos;t already on SeaJourney. A vessel-specific alias
                works well (e.g. <code>captain@your-vessel.com</code>).
              </p>
            </div>
            <div>
              <Label htmlFor="role-role">Role</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as VesselLinkedRole)}>
                <SelectTrigger id="role-role">
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
              <p className="mt-1 text-xs text-muted-foreground">
                {ROLE_META[formRole].description}
              </p>
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddOpen(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitInvite} disabled={isSubmitting}>
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
          </DialogFooter>
        </DialogContent>
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

function RoleLegend() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(Object.keys(ROLE_META) as VesselLinkedRole[]).map((r) => {
        const meta = ROLE_META[r];
        const Icon = meta.icon;
        return (
          <Card key={r} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${meta.tone}`}>
                <Icon className="h-4 w-4" />
              </div>
              <CardTitle className="mt-2 text-base">{meta.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <UserCog className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold">No linked accounts yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Add the captain, officers, engineer, or manager who will sign documents on the vessel&apos;s
          behalf. They&apos;ll get an email to set their password.
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Add the first linked account
      </Button>
    </div>
  );
}

function LinkedAccountRow({
  account,
  onRemove,
}: {
  account: LinkedAccountRow;
  onRemove: () => void;
}) {
  const meta = ROLE_META[account.role];
  const Icon = meta.icon;
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ') || account.email;
  const initials = (
    (account.firstName?.[0] || '') + (account.lastName?.[0] || '') || account.email[0] || '?'
  ).toUpperCase();
  const status = account.lastSignInAt ? 'Active' : 'Invitation sent';

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{fullName}</span>
            <Badge variant="secondary" className={`gap-1 ${meta.tone}`}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">{account.email}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-xs text-muted-foreground">
          {status}
          {account.lastSignInAt
            ? ` · last seen ${new Date(account.lastSignInAt).toLocaleDateString()}`
            : ''}
        </span>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Remove
        </Button>
      </div>
    </li>
  );
}
