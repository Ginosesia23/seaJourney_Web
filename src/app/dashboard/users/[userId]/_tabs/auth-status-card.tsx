'use client';

import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';
import { cn } from '@/lib/utils';

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

export function AuthStatusCard({ userId }: { userId: string }) {
  const { supabase } = useSupabase();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

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

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error || !status) {
    return (
      <Card className="rounded-2xl border-destructive/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Authentication
          </CardTitle>
          <CardDescription>{error || 'No auth record found.'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const confirmed = status.isConfirmed;
  const banned = !!status.bannedUntil && new Date(status.bannedUntil) > new Date();

  return (
    <Card
      className={cn(
        'rounded-2xl',
        !confirmed && 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10',
        banned && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {banned ? (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            ) : confirmed ? (
              <ShieldCheck className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            Authentication
          </CardTitle>
          <CardDescription>
            {confirmed
              ? 'This user has confirmed their email and can sign in.'
              : 'This user has NOT confirmed their email — they cannot sign in until they do.'}
          </CardDescription>
        </div>
        <StatusBadge confirmed={confirmed} banned={banned} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email confirmed">
            {confirmed ? (
              <div className="flex flex-col">
                <span className="inline-flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirmed
                </span>
                {status.emailConfirmedAt && (
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(status.emailConfirmedAt)} ·{' '}
                    {fmtRelative(status.emailConfirmedAt)}
                  </span>
                )}
              </div>
            ) : (
              <span className="font-medium text-amber-600">Not confirmed</span>
            )}
          </Field>

          <Field label="Last sign in">
            {status.lastSignInAt ? (
              <div className="flex flex-col">
                <span className="font-medium">
                  {fmtDateTime(status.lastSignInAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtRelative(status.lastSignInAt)}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </Field>

          <Field label="Auth account created">
            <span className="font-medium">
              {status.createdAt ? fmtDateTime(status.createdAt) : '—'}
            </span>
          </Field>

          <Field label="Provider">
            <span className="font-medium capitalize">
              {status.providers?.join(', ') || status.provider || 'email'}
            </span>
          </Field>

          {banned && (
            <Field label="Banned until">
              <span className="font-medium text-destructive">
                {fmtDateTime(status.bannedUntil!)}
              </span>
            </Field>
          )}
        </div>

        {!confirmed && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">
                  Resend confirmation link to{' '}
                  <span className="break-all">{status.email}</span>?
                </p>
                <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
                  Sends a fresh email-confirmation link via Supabase. The user must click
                  it before they can sign in.
                </p>
              </div>
            </div>
            <div>
              <Button
                size="sm"
                onClick={handleResend}
                disabled={isResending || !status.email}
                className="bg-amber-600 hover:bg-amber-600/90"
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
      </CardContent>
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
    return <Badge variant="destructive">Banned</Badge>;
  }
  if (confirmed) {
    return (
      <Badge className="bg-green-600 hover:bg-green-600/90">Verified</Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-400 text-amber-700 dark:text-amber-300"
    >
      Unverified
    </Badge>
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
