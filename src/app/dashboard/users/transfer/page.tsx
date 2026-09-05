'use client';

/**
 * Admin: transfer a demo account to an official email without losing data.
 * Keeps the same user id — only the login email changes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Mail,
  Search,
  Ship,
  UserSearch,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
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
import {
  DashboardHeader,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardStatRow,
} from '@/components/dashboard/dashboard-home-ui';
import {
  MANUAL_CREW_TIERS,
  MANUAL_ROLES,
  MANUAL_STATUSES,
  MANUAL_VESSEL_TIERS,
  defaultTierForAdminRole,
  normalizeAdminRole,
  normalizeAdminStatus,
} from '@/lib/admin/manual-subscription';
import { formatSubscriptionTierLabel } from '@/lib/subscription-tier-labels';
import { cn } from '@/lib/utils';

type TargetPreview = {
  userId: string;
  profile: {
    id: string;
    email: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string | null;
    subscriptionTier: string | null;
    subscriptionStatus: string | null;
    isTesting: boolean;
    vesselName: string | null;
    assignmentCount: number;
    createdAt: string | null;
  } | null;
  auth: {
    email: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
  } | null;
};

type EmailCheck = {
  available: boolean;
  email: string;
  existingUser?: {
    id: string;
    email: string | null;
    role: string | null;
    firstName: string | null;
    lastName: string | null;
    isTesting: boolean;
  };
};

type UserOptionRow = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  isTesting: boolean;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function formatUserOptionLabel(user: UserOptionRow): string {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.username ||
    'Unnamed user';
  const email = user.email || 'no email';
  const role = user.role || 'crew';
  const demo = user.isTesting ? ' · demo' : '';
  return `${name} · ${email} · ${role}${demo}`;
}

export default function AdminAccountTransferPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();

  const { data: actorProfileRaw, isLoading: isLoadingActor } = useDoc<UserProfile>(
    'users',
    user?.id,
  );
  const actor = useMemo(() => {
    if (!actorProfileRaw) return null;
    const role = (actorProfileRaw as { role?: string }).role || actorProfileRaw.role || 'crew';
    return { ...actorProfileRaw, role } as UserProfile;
  }, [actorProfileRaw]);
  const isAdmin = actor?.role === 'admin';

  useEffect(() => {
    if (!isLoadingActor && actor && !isAdmin) {
      router.push('/dashboard');
    }
  }, [actor, isAdmin, isLoadingActor, router]);

  const [lookup, setLookup] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userOptions, setUserOptions] = useState<UserOptionRow[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [target, setTarget] = useState<TargetPreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailCheck, setEmailCheck] = useState<EmailCheck | null>(null);
  const [emailCheckError, setEmailCheckError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const [clearTesting, setClearTesting] = useState(true);
  const [sendPasswordReset, setSendPasswordReset] = useState(true);
  const [updateSubscription, setUpdateSubscription] = useState(true);
  const [nextRole, setNextRole] = useState('crew');
  const [nextTier, setNextTier] = useState('free');
  const [nextStatus, setNextStatus] = useState('active');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const authedFetch = useCallback(
    async (input: RequestInfo, init?: RequestInit) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      return fetch(input, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [supabase],
  );

  useEffect(() => {
    if (!isAdmin) {
      setIsLoadingUsers(false);
      return;
    }

    let cancelled = false;
    setIsLoadingUsers(true);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, first_name, last_name, username, email, role, is_testing')
          .order('email', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error('[admin/users/transfer] load users:', error);
          setUserOptions([]);
          return;
        }

        setUserOptions(
          (data ?? []).map((row) => ({
            id: row.id as string,
            firstName: (row.first_name as string) || '',
            lastName: (row.last_name as string) || '',
            username: (row.username as string) || '',
            email: (row.email as string) || '',
            role: (row.role as string) || 'crew',
            isTesting: row.is_testing === true,
          })),
        );
      } finally {
        if (!cancelled) setIsLoadingUsers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, supabase]);

  const searchableUserOptions = useMemo(
    () =>
      userOptions.map((user) => ({
        value: user.id,
        label: formatUserOptionLabel(user),
      })),
    [userOptions],
  );

  const tierOptions = useMemo(
    () => (nextRole === 'vessel' ? MANUAL_VESSEL_TIERS : MANUAL_CREW_TIERS),
    [nextRole],
  );

  const syncSubscriptionFromTarget = useCallback((preview: TargetPreview) => {
    const role = normalizeAdminRole(preview.profile?.role);
    setNextRole(role);
    setNextTier(
      defaultTierForAdminRole(role, (preview.profile?.subscriptionTier || 'free').toString()),
    );
    setNextStatus(normalizeAdminStatus(preview.profile?.subscriptionStatus));
  }, []);

  const loadTargetPreview = useCallback(
    async (query: { userId?: string; email?: string }) => {
      setIsLookingUp(true);
      setLookupError(null);
      setTarget(null);
      setNewEmail('');
      setEmailCheck(null);
      setEmailCheckError(null);

      try {
        const params = query.userId
          ? `userId=${encodeURIComponent(query.userId)}`
          : `email=${encodeURIComponent(query.email || '')}`;
        const res = await authedFetch(`/api/admin/users/change-email?${params}`);
        const json = await res.json();
        if (!res.ok) {
          setLookupError(json?.error || 'Account not found');
          return;
        }
        const preview = json as TargetPreview;
        setTarget(preview);
        syncSubscriptionFromTarget(preview);
        if (json.userId) setSelectedUserId(json.userId as string);
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : 'Lookup failed');
      } finally {
        setIsLookingUp(false);
      }
    },
    [authedFetch, syncSubscriptionFromTarget],
  );

  const handleLookup = useCallback(async () => {
    const query = lookup.trim();
    if (!query) return;

    if (query.includes('@')) {
      await loadTargetPreview({ email: query });
      return;
    }

    await loadTargetPreview({ userId: query });
  }, [loadTargetPreview, lookup]);

  const handleSelectUser = useCallback(
    (userId: string) => {
      setSelectedUserId(userId);
      setLookup('');
      void loadTargetPreview({ userId });
    },
    [loadTargetPreview],
  );

  const handleRoleChange = useCallback((role: string) => {
    setNextRole(role);
    setNextTier((prev) => defaultTierForAdminRole(role, prev));
  }, []);

  useEffect(() => {
    const email = newEmail.trim();
    if (!email || !isValidEmail(email)) {
      setEmailCheck(null);
      setEmailCheckError(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsCheckingEmail(true);
      setEmailCheckError(null);
      try {
        const params = new URLSearchParams({
          checkEmail: email,
        });
        if (target?.userId) params.set('excludeUserId', target.userId);

        const res = await authedFetch(
          `/api/admin/users/change-email?${params.toString()}`,
        );
        const json = await res.json();
        if (res.ok) {
          setEmailCheck(json as EmailCheck);
        } else {
          setEmailCheck(null);
          setEmailCheckError(json?.error || 'Could not verify email availability');
        }
      } catch {
        setEmailCheck(null);
        setEmailCheckError('Could not verify email availability');
      } finally {
        setIsCheckingEmail(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [authedFetch, newEmail, target?.userId]);

  const currentEmail =
    target?.auth?.email || target?.profile?.email || null;
  const normalizedNewEmail = normalizeEmail(newEmail);
  const normalizedCurrentEmail = normalizeEmail(currentEmail || '');

  const displayName = target?.profile
    ? [target.profile.firstName, target.profile.lastName].filter(Boolean).join(' ') ||
      target.profile.username ||
      'Unnamed user'
    : null;

  const emailIsDifferent =
    !!normalizedNewEmail &&
    !!normalizedCurrentEmail &&
    normalizedNewEmail !== normalizedCurrentEmail;

  const emailIsAvailable = emailCheck?.available !== false;

  const canTransfer =
    !!target?.userId &&
    isValidEmail(newEmail) &&
    emailIsDifferent &&
    emailIsAvailable &&
    !isCheckingEmail;

  const transferBlockedReason = useMemo(() => {
    if (!target) return 'Select an account to transfer.';
    if (!newEmail.trim()) return 'Enter the official email address to continue.';
    if (!isValidEmail(newEmail)) return 'Enter a valid email address.';
    if (!emailIsDifferent) return 'New email must be different from the current login email.';
    if (isCheckingEmail) return 'Checking whether that email is available…';
    if (emailCheck?.available === false) return 'That email is already registered to another account.';
    if (emailCheckError) return emailCheckError;
    return null;
  }, [
    emailCheck?.available,
    emailCheckError,
    emailIsDifferent,
    isCheckingEmail,
    newEmail,
    target,
  ]);

  const handleTransfer = useCallback(async () => {
    if (!target?.userId || !canTransfer) return;

    setIsTransferring(true);
    try {
      const res = await authedFetch('/api/admin/users/change-email', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: target.userId,
          newEmail: newEmail.trim(),
          clearTesting,
          sendPasswordReset,
          updateSubscription,
          role: nextRole,
          subscriptionTier: nextTier,
          subscriptionStatus: nextStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({
          title: json.partial ? 'Transfer partially completed' : 'Transfer failed',
          description: json?.error || 'Please try again.',
          variant: 'destructive',
        });
        if (json.partial) {
          router.push(`/dashboard/users/${target.userId}`);
        }
        return;
      }

      toast({
        title: 'Account transferred',
        description:
          [
            `Login email is now ${json.newEmail}.`,
            json.passwordResetSent ? 'Password reset link sent.' : null,
            json.subscriptionUpdated
              ? `Subscription set to ${nextTier.replace(/_/g, ' ')} (${nextStatus.replace(/-/g, ' ')}).`
              : null,
            json.subscriptionWarning,
          ]
            .filter(Boolean)
            .join(' '),
      });
      setConfirmOpen(false);
      setConfirmText('');
      router.push(`/dashboard/users/${target.userId}`);
    } catch (err) {
      toast({
        title: 'Transfer failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsTransferring(false);
    }
  }, [
    authedFetch,
    canTransfer,
    clearTesting,
    newEmail,
    nextRole,
    nextStatus,
    nextTier,
    router,
    sendPasswordReset,
    target?.userId,
    toast,
    updateSubscription,
  ]);

  if (isLoadingActor || !isAdmin) {
    return (
      <div className="flex flex-col gap-3 p-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DashboardQuickLinks
        links={[
          { href: '/dashboard/users', label: 'User lookup', icon: UserSearch },
        ]}
      />

      <DashboardHeader
        title="Transfer account email"
        description="Move a demo or placeholder account to the customer's official email without losing vessels, sea time, subscriptions, or documents. The account id stays the same — only the login email changes."
        actions={
          target ? (
            <Button variant="outline" size="sm" className="rounded-lg" asChild>
              <Link href={`/dashboard/users/${target.userId}`}>
                <UserSearch className="mr-1.5 h-3.5 w-3.5" />
                Open user record
              </Link>
            </Button>
          ) : null
        }
      />

      <DashboardPanel
        title="Find account"
        description="Pick from all accounts or search by email / user id."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select account</Label>
            {isLoadingUsers ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : (
              <SearchableSelect
                options={searchableUserOptions}
                value={selectedUserId}
                onValueChange={handleSelectUser}
                placeholder="Search by name, email, or role…"
                searchPlaceholder="Filter accounts…"
                disabled={isLookingUp}
                className="rounded-lg"
              />
            )}
            {!isLoadingUsers && (
              <p className="text-xs text-muted-foreground">
                {userOptions.length} accounts loaded
              </p>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-[10px] font-medium uppercase tracking-wide">
              <span className="bg-card px-2 text-muted-foreground">Or look up directly</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="demo@vessel.com or user uuid"
                disabled={isLookingUp}
                className="rounded-lg pl-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLookup();
                }}
              />
            </div>
            <Button
              onClick={() => void handleLookup()}
              disabled={isLookingUp || !lookup.trim()}
              className="rounded-lg"
            >
              {isLookingUp ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-4 w-4" />
              )}
              Find account
            </Button>
          </div>

          {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
          {isLookingUp && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading account…
            </p>
          )}
        </div>
      </DashboardPanel>

      {target && (
        <>
          <DashboardStatRow
            items={[
              { label: 'Role', value: target.profile?.role || '—' },
              { label: 'Plan', value: formatSubscriptionTierLabel(target.profile?.subscriptionTier || 'free') },
              {
                label: 'Assignments',
                value: target.profile?.assignmentCount ?? 0,
              },
              {
                label: 'Account type',
                value: target.profile?.isTesting ? 'Demo' : 'Live',
              },
            ]}
          />

          <DashboardPanel
            title="Transfer details"
            description="Set the official email and confirm what happens on handoff."
          >
            <div className="space-y-5">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{displayName}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground break-all">
                      Current login: {currentEmail || 'No email on file'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {target.profile?.role && (
                      <Badge variant="secondary" className="capitalize">
                        {target.profile.role}
                      </Badge>
                    )}
                    {target.profile?.isTesting && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                      >
                        <FlaskConical className="h-3 w-3" />
                        Demo
                      </Badge>
                    )}
                  </div>
                </div>
                {target.profile?.vesselName && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Ship className="h-3.5 w-3.5" />
                    {target.profile.vesselName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-email">Official email address</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="captain@official-domain.com"
                  className="rounded-lg"
                  autoComplete="off"
                />
                {isCheckingEmail && (
                  <p className="text-xs text-muted-foreground">Checking availability…</p>
                )}
                {!isCheckingEmail && emailCheck?.available && emailIsDifferent && (
                  <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {emailCheck.email} is available
                  </p>
                )}
                {!isCheckingEmail && emailCheck && emailCheck.available === false && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="flex items-start gap-2 font-medium text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      That email is already registered
                    </p>
                    <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
                      Delete the empty duplicate from{' '}
                      <Link
                        href={`/dashboard/users/${emailCheck.existingUser?.id}`}
                        className="underline"
                      >
                        User lookup
                      </Link>{' '}
                      first, then retry.
                    </p>
                  </div>
                )}
                {emailCheckError && (
                  <p className="text-xs text-destructive">{emailCheckError}</p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={updateSubscription}
                    onCheckedChange={(v) => setUpdateSubscription(v === true)}
                  />
                  <span>
                    Update subscription on transfer
                    <span className="block text-xs text-muted-foreground">
                      Writes role, tier, and status directly to the database. Stripe billing
                      is not updated automatically.
                    </span>
                  </span>
                </label>

                {updateSubscription && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Account type</Label>
                      <Select value={nextRole} onValueChange={handleRoleChange}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MANUAL_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Plan tier</Label>
                      <Select value={nextTier} onValueChange={setNextTier}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tierOptions.map((tier) => (
                            <SelectItem key={tier.value} value={tier.value}>
                              {tier.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={nextStatus} onValueChange={setNextStatus}>
                        <SelectTrigger className="rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MANUAL_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={clearTesting}
                    onCheckedChange={(v) => setClearTesting(v === true)}
                    disabled={!target.profile?.isTesting}
                  />
                  <span>
                    Clear testing / demo flag after transfer
                    {!target.profile?.isTesting && (
                      <span className="block text-xs text-muted-foreground">
                        This account is not marked as testing.
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={sendPasswordReset}
                    onCheckedChange={(v) => setSendPasswordReset(v === true)}
                  />
                  <span>
                    Send password reset link to the new email
                    <span className="block text-xs text-muted-foreground">
                      Lets them set a password on their official address immediately.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className={cn(
                    'text-sm',
                    canTransfer ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300',
                  )}
                >
                  {canTransfer
                    ? 'Ready to transfer. All data stays on this account.'
                    : transferBlockedReason}
                </p>
                <Button
                  className="rounded-lg sm:shrink-0"
                  disabled={!canTransfer}
                  onClick={() => {
                    setConfirmText('');
                    setConfirmOpen(true);
                  }}
                >
                  <Mail className="mr-1.5 h-4 w-4" />
                  Transfer to official email
                </Button>
              </div>
            </div>
          </DashboardPanel>
        </>
      )}

      <DashboardPanel
        title="What stays the same"
        description="Everything remains linked to the same account id."
      >
        <p className="text-sm text-muted-foreground">
          Vessel assignments, daily logs, passage tracks, testimonials, certificates,
          subscription tier, Stripe billing, and all other records stay intact. This is
          the recommended handoff for demo vessels — do not create a second account and
          copy data manually.
        </p>
      </DashboardPanel>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm email transfer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Change login from{' '}
                  <span className="font-medium text-foreground break-all">{currentEmail}</span>{' '}
                  to{' '}
                  <span className="font-medium text-foreground break-all">
                    {newEmail.trim()}
                  </span>
                  ?
                </p>
                <p>All data stays on this account. Type the new email to confirm.</p>
                {updateSubscription && (
                  <p>
                    Subscription will become{' '}
                    <span className="font-medium text-foreground capitalize">{nextRole}</span>,{' '}
                    <span className="font-medium text-foreground">
                      {nextTier.replace(/_/g, ' ')}
                    </span>{' '}
                    ({nextStatus.replace(/-/g, ' ')}).
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={newEmail.trim()}
            autoComplete="off"
            className="rounded-lg"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTransferring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                isTransferring ||
                confirmText.trim().toLowerCase() !== newEmail.trim().toLowerCase()
              }
              className={cn(!canTransfer && 'pointer-events-none opacity-50')}
              onClick={(e) => {
                e.preventDefault();
                void handleTransfer();
              }}
            >
              {isTransferring ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-1.5 h-4 w-4" />
              )}
              Transfer account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
