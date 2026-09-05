'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Ban,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { toast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

type AuthStatus = {
  email: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  createdAt: string | null;
  provider: string | null;
  providers: string[] | null;
  isConfirmed: boolean;
};

export function AuthStatusCard({
  userId,
  targetRole,
  isSelf,
}: {
  userId: string;
  targetRole: string;
  isSelf: boolean;
}) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');

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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/admin/users/auth?userId=${encodeURIComponent(userId)}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Failed to load auth status');
        setStatus(null);
        return;
      }
      setStatus(json as AuthStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load auth status');
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [authedFetch, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResend = useCallback(async () => {
    setIsResending(true);
    try {
      const res = await authedFetch('/api/admin/users/auth', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({
          title: 'Could not resend confirmation email',
          description: json?.error || 'Please try again later.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Confirmation email sent',
        description: `${json.method === 'invite' ? 'Invite' : 'Confirmation'} link sent to ${json.sentTo}`,
      });
      // Re-fetch in case Supabase updated the user record.
      void load();
    } catch (err) {
      toast({
        title: 'Could not resend confirmation email',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsResending(false);
    }
  }, [authedFetch, load, userId]);

  const locked = isSelf || targetRole.toLowerCase() === 'admin';

  const handleSetDisabled = useCallback(
    async (disabled: boolean) => {
      setIsUpdatingAccess(true);
      try {
        const res = await authedFetch('/api/admin/users/account', {
          method: 'PATCH',
          body: JSON.stringify({ userId, disabled }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            title: disabled ? 'Could not disable account' : 'Could not enable account',
            description: json?.error || 'Please try again.',
            variant: 'destructive',
          });
          return;
        }
        toast({
          title: disabled ? 'Account disabled' : 'Account enabled',
          description: disabled
            ? 'They can no longer sign in. Existing sessions were signed out.'
            : 'They can sign in again.',
        });
        setDisableOpen(false);
        void load();
      } catch (err) {
        toast({
          title: 'Update failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setIsUpdatingAccess(false);
      }
    },
    [authedFetch, load, userId],
  );

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const res = await authedFetch('/api/admin/users/account', {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Could not delete account',
          description: json?.error || 'Please try again.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Account deleted',
        description:
          json.warning ||
          (json.profileAction === 'anonymised'
            ? 'Sign-in was removed. The profile was anonymised because related records still exist.'
            : 'This user can no longer sign in.'),
      });
      setDeleteOpen(false);
      router.push('/dashboard/users');
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [authedFetch, router, userId]);

  if (isLoading) {
    return (
      <Card className="rounded-md border-border shadow-none">
        <CardHeader className="border-b border-border bg-muted/40 px-4 py-2.5">
          <CardTitle className="text-xs font-medium">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error || !status) {
    return (
      <Card className="rounded-md border-destructive/30 shadow-none">
        <CardHeader className="border-b border-border bg-muted/40 px-4 py-2.5">
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            Authentication
          </CardTitle>
          <CardDescription className="text-[11px]">
            {error || 'No auth record found.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const confirmed = status.isConfirmed;
  const banned = !!status.bannedUntil && new Date(status.bannedUntil) > new Date();

  return (
    <Card
      className={cn(
        'rounded-md border-border shadow-none',
        !confirmed && 'border-amber-500/40 bg-amber-500/[0.04]',
        banned && 'border-destructive/40 bg-destructive/[0.04]',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
            {banned ? (
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
            ) : confirmed ? (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            )}
            Authentication
          </CardTitle>
          <CardDescription className="mt-0.5 text-[11px]">
            {banned
              ? 'This account is disabled and cannot sign in.'
              : confirmed
                ? 'Email confirmed — they can sign in.'
                : 'Email not confirmed — they cannot sign in until they verify.'}
          </CardDescription>
        </div>
        <StatusBadge confirmed={confirmed} banned={banned} />
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email confirmed">
            {confirmed ? (
              <div className="flex flex-col">
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Confirmed
                </span>
                {status.emailConfirmedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDateTime(status.emailConfirmedAt)} ·{' '}
                    {fmtRelative(status.emailConfirmedAt)}
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Not confirmed
              </span>
            )}
          </Field>

          <Field label="Last sign in">
            {status.lastSignInAt ? (
              <div className="flex flex-col">
                <span className="text-sm text-foreground">
                  {fmtDateTime(status.lastSignInAt)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtRelative(status.lastSignInAt)}
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Never</span>
            )}
          </Field>

          <Field label="Auth account created">
            <span className="text-sm text-foreground">
              {status.createdAt ? fmtDateTime(status.createdAt) : '—'}
            </span>
          </Field>

          <Field label="Provider">
            <span className="text-sm capitalize text-foreground">
              {status.providers?.join(', ') || status.provider || 'email'}
            </span>
          </Field>

          {banned && (
            <Field label="Disabled until">
              <span className="text-sm text-destructive">
                {fmtDateTime(status.bannedUntil!)}
              </span>
            </Field>
          )}
        </div>

        {!confirmed && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium">
                  Resend confirmation link to{' '}
                  <span className="break-all font-mono">{status.email}</span>?
                </p>
                <p className="mt-0.5 text-[11px] text-amber-800/90 dark:text-amber-200/80">
                  Sends a fresh confirmation link via Supabase.
                </p>
              </div>
            </div>
            <div>
              <Button
                size="sm"
                onClick={handleResend}
                disabled={isResending || !status.email}
                className="h-8 rounded-md bg-amber-600 text-xs hover:bg-amber-600/90"
              >
                {isResending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Resend confirmation email
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">Account access</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Disable blocks sign-in and signs them out. Delete removes the login;
            related sea-time records may keep an anonymised profile.
          </p>
          {locked ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {isSelf
                ? 'You cannot disable or delete your own admin account.'
                : 'Admin accounts cannot be disabled or deleted here.'}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {banned ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleSetDisabled(false)}
                  disabled={isUpdatingAccess}
                  className="h-8 rounded-md border-border text-xs"
                >
                  {isUpdatingAccess ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlock className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Enable account
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDisableOpen(true)}
                  disabled={isUpdatingAccess}
                  className="h-8 rounded-md border-border text-xs"
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  Disable account
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setDeleteConfirm('');
                  setDeleteOpen(true);
                }}
                disabled={isDeleting}
                className="h-8 rounded-md text-xs"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete account
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable this account?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be signed out immediately and cannot log in until you enable the
              account again. Their data stays in SeaJourney.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingAccess}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isUpdatingAccess}
              onClick={(e) => {
                e.preventDefault();
                void handleSetDisabled(true);
              }}
            >
              {isUpdatingAccess ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirm('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes their login. Type DELETE to confirm. If other records still
              reference them, the profile is anonymised instead of fully removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Type DELETE"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting || deleteConfirm !== 'DELETE'}
              onClick={(e) => {
                e.preventDefault();
                if (deleteConfirm !== 'DELETE') return;
                void handleDelete();
              }}
            >
              {isDeleting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StatusBadge({
  confirmed,
  banned,
}: {
  confirmed: boolean;
  banned: boolean;
}) {
  if (banned) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Disabled
      </span>
    );
  }
  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unverified
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return '';
  }
}
