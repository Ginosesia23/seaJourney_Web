'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Ship, UserRound } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useSupabase } from '@/supabase';
import { toast } from '@/hooks/use-toast';

const MANUAL_CREW_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'crew_limited', label: 'Crew limited' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
] as const;

const MANUAL_VESSEL_TIERS = [
  { value: 'free', label: 'Free' },
  { value: 'vessel_lite', label: 'Vessel Standard' },
  { value: 'vessel_basic', label: 'Vessel Premium' },
  { value: 'vessel_pro', label: 'Vessel Professional' },
  { value: 'vessel_fleet', label: 'Vessel Fleet' },
] as const;

const MANUAL_ROLES = [
  { value: 'crew', label: 'Crew' },
  { value: 'captain', label: 'Captain' },
  { value: 'vessel', label: 'Vessel manager' },
] as const;

const MANUAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'past-due', label: 'Past due' },
] as const;

type TargetAccount = {
  id: string;
  role?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
  active_vessel_id?: string | null;
};

type Props = {
  target: TargetAccount;
  isSelf?: boolean;
  onUpdated?: (patch: Record<string, unknown>) => void;
};

function normalizeRole(role: string | null | undefined): string {
  const r = (role || 'crew').toLowerCase();
  if (r === 'crew' || r === 'captain' || r === 'vessel') return r;
  return 'crew';
}

function normalizeStatus(status: string | null | undefined): string {
  const s = (status || 'inactive').toLowerCase().replace(/_/g, '-');
  return MANUAL_STATUSES.some((item) => item.value === s) ? s : 'inactive';
}

function defaultTierForRole(role: string, currentTier: string): string {
  const tier = currentTier.toLowerCase();
  const options = role === 'vessel' ? MANUAL_VESSEL_TIERS : MANUAL_CREW_TIERS;
  if (options.some((item) => item.value === tier)) return tier;
  return role === 'vessel' ? 'vessel_lite' : 'free';
}

export function AdminAccountTypeCard({ target, isSelf = false, onUpdated }: Props) {
  const { supabase } = useSupabase();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentRole = normalizeRole(target.role);
  const locked = isSelf || currentRole === 'admin';

  const [nextRole, setNextRole] = useState(currentRole);
  const [nextTier, setNextTier] = useState(
    defaultTierForRole(currentRole, (target.subscription_tier || 'free').toString()),
  );
  const [nextStatus, setNextStatus] = useState(
    normalizeStatus(target.subscription_status),
  );

  const tierOptions = useMemo(
    () => (nextRole === 'vessel' ? MANUAL_VESSEL_TIERS : MANUAL_CREW_TIERS),
    [nextRole],
  );

  const openDialog = useCallback(() => {
    const role = normalizeRole(target.role);
    setNextRole(role);
    setNextTier(defaultTierForRole(role, (target.subscription_tier || 'free').toString()));
    setNextStatus(normalizeStatus(target.subscription_status));
    setDialogOpen(true);
  }, [target]);

  const onRoleChange = useCallback(
    (role: string) => {
      setNextRole(role);
      setNextTier((prev) => defaultTierForRole(role, prev));
    },
    [],
  );

  const roleWillChange = nextRole !== currentRole;

  const saveAccountType = useCallback(async () => {
    setIsSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/users/crew-subscription', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          userId: target.id,
          action: 'manual',
          role: nextRole,
          subscriptionTier: nextTier,
          subscriptionStatus: nextStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'Could not update account',
          description: typeof json.error === 'string' ? json.error : res.statusText,
        });
        return;
      }

      const updated = (json.user ?? {}) as Record<string, unknown>;
      onUpdated?.({
        role: updated.role ?? nextRole,
        subscription_tier: updated.subscription_tier ?? nextTier,
        subscription_status: updated.subscription_status ?? nextStatus.replace(/-/g, '_'),
        active_vessel_id: updated.active_vessel_id ?? null,
      });

      toast({
        title: roleWillChange ? 'Account type updated' : 'Subscription updated',
        description:
          typeof json.warning === 'string' && json.warning
            ? json.warning
            : roleWillChange && nextRole === 'vessel'
              ? 'This user is now a vessel manager account.'
              : roleWillChange && currentRole === 'vessel'
                ? 'This user is now a crew-style account again.'
                : 'Role, tier, and status saved.',
      });

      setDialogOpen(false);
      setConfirmOpen(false);
    } catch (error) {
      console.error('[admin-account-type]', error);
      toast({
        variant: 'destructive',
        title: 'Could not update account',
        description: 'Unexpected error saving account type.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    currentRole,
    nextRole,
    nextStatus,
    nextTier,
    onUpdated,
    roleWillChange,
    supabase,
    target.id,
  ]);

  const handleSaveClick = () => {
    if (roleWillChange) {
      setConfirmOpen(true);
      return;
    }
    void saveAccountType();
  };

  return (
    <>
      <Card className="rounded-2xl border-dashed lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4" />
            Account type
          </CardTitle>
          <CardDescription>
            Switch between crew/captain and vessel manager accounts. Tier and status are saved
            together with the role change.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {currentRole}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {(target.subscription_tier || 'free').toString().replace(/_/g, ' ')}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {(target.subscription_status || 'inactive').toString().replace(/_/g, ' ')}
              </Badge>
            </div>
            {locked ? (
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? 'You cannot change your own admin account here.'
                  : 'Admin accounts cannot be changed from this page.'}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {currentRole === 'vessel'
                  ? 'Convert back to crew or captain if this should be a personal crew account again.'
                  : 'Convert to vessel manager if this user should manage a yacht account.'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!locked && currentRole !== 'vessel' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setNextRole('vessel');
                  setNextTier(defaultTierForRole('vessel', nextTier));
                  setNextStatus(normalizeStatus(target.subscription_status));
                  setDialogOpen(true);
                }}
              >
                <Ship className="mr-1.5 h-3.5 w-3.5" />
                Convert to vessel
              </Button>
            )}
            {!locked && currentRole === 'vessel' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setNextRole('crew');
                  setNextTier(defaultTierForRole('crew', nextTier));
                  setNextStatus(normalizeStatus(target.subscription_status));
                  setDialogOpen(true);
                }}
              >
                <UserRound className="mr-1.5 h-3.5 w-3.5" />
                Convert to crew
              </Button>
            )}
            {!locked && (
              <Button type="button" size="sm" onClick={openDialog}>
                Change account type…
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account type, tier &amp; status</DialogTitle>
            <DialogDescription>
              Writes directly to the database. Stripe billing is not updated automatically — check
              Stripe if this user has an active subscription.
            </DialogDescription>
            {roleWillChange && nextRole === 'vessel' && currentRole !== 'vessel' ? (
              <p className="pt-2 text-sm text-amber-700 dark:text-amber-300">
                This will convert the account to a vessel manager and clear crew-side vessel links.
              </p>
            ) : null}
            {roleWillChange && currentRole === 'vessel' && nextRole !== 'vessel' ? (
              <p className="pt-2 text-sm text-amber-700 dark:text-amber-300">
                This will convert the account back to a crew-style role and clear the active vessel
                link.
              </p>
            ) : null}
            {target.stripe_subscription_id ? (
              <p className="pt-2 text-sm text-amber-700 dark:text-amber-300">
                This user still has a Stripe subscription on file.
              </p>
            ) : null}
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Account type</Label>
              <Select value={nextRole} onValueChange={onRoleChange}>
                <SelectTrigger>
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
              <Label>Tier</Label>
              <Select value={nextTier} onValueChange={setNextTier}>
                <SelectTrigger>
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
                <SelectTrigger>
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveClick} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change account type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will change the account from{' '}
              <strong className="capitalize">{currentRole}</strong> to{' '}
              <strong className="capitalize">{nextRole}</strong> with tier{' '}
              <strong>{nextTier.replace(/_/g, ' ')}</strong> ({nextStatus.replace(/-/g, ' ')}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isSaving} onClick={() => void saveAccountType()}>
              {isSaving ? 'Saving…' : 'Confirm change'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
