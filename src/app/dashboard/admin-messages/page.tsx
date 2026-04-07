'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { AdminMessage, UserProfile } from '@/lib/types';
import { format } from 'date-fns';
import { Loader2, MessagesSquare, Send, Zap } from 'lucide-react';

/** Must match your Supabase public table name exactly. */
const APP_BROADCAST_NOTIFICATIONS_TABLE = 'app_broadcast_notifications';

const BROADCAST_PRESETS: { id: string; label: string; title: string; body: string }[] = [
  {
    id: 'update-ready',
    label: 'Update available',
    title: 'Update ready',
    body: 'A new version of SeaJourney is available. Please refresh your browser or update the app to get the latest improvements and fixes.',
  },
  {
    id: 'maintenance',
    label: 'Maintenance window',
    title: 'Scheduled maintenance',
    body: 'We will perform brief maintenance on SeaJourney. You may see short interruptions—we will restore service as quickly as possible. Thank you for your patience.',
  },
  {
    id: 'new-features',
    label: "What's new",
    title: 'New features',
    body: 'We have shipped improvements to SeaJourney. Open the app or dashboard to explore what is new. Send feedback if something does not look right.',
  },
  {
    id: 'service-ok',
    label: 'All systems normal',
    title: 'Service status',
    body: 'All SeaJourney services are operating normally. If you experience an issue, contact us from the Feedback page.',
  },
  {
    id: 'feedback',
    label: 'We value feedback',
    title: 'Your feedback matters',
    body: 'We read every message. Use Feedback in the dashboard to report bugs, suggest features, or ask questions—we are here to help.',
  },
  {
    id: 'billing',
    label: 'Subscription & billing',
    title: 'Subscription & billing',
    body: 'You can review or change your plan anytime from Account / Subscription in the dashboard. Contact support if you need help with billing.',
  },
  {
    id: 'security',
    label: 'Security reminder',
    title: 'Account security',
    body: 'Use a strong unique password, sign out on shared devices, and report suspicious activity via Feedback. Never share your login details with anyone.',
  },
];

export default function AdminMessagesPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as { role?: string }).role || userProfileRaw.role || 'crew';
    return { ...userProfileRaw, role } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  const [rows, setRows] = useState<AdminMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [postingPresetId, setPostingPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  const loadMessages = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from(APP_BROADCAST_NOTIFICATIONS_TABLE)
        .select('id, title, body, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRows((data || []) as AdminMessage[]);
    } catch (e) {
      console.error('[admin-messages] load', e);
      toast({
        variant: 'destructive',
        title: 'Could not load messages',
        description: e instanceof Error ? e.message : 'Check the table name and RLS policies.',
      });
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }, [isAdmin, supabase, toast]);

  useEffect(() => {
    if (!isAdmin) {
      setLoadingList(false);
      return;
    }
    loadMessages();
  }, [isAdmin, loadMessages]);

  const insertMessageRow = useCallback(
    async (t: string, b: string): Promise<AdminMessage | null> => {
      const { data, error } = await supabase
        .from(APP_BROADCAST_NOTIFICATIONS_TABLE)
        .insert({ title: t, body: b, created_at: new Date().toISOString() })
        .select('id, title, body, created_at')
        .single();

      if (error) throw error;
      return data ? (data as AdminMessage) : null;
    },
    [supabase]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      toast({ variant: 'destructive', title: 'Title and body are required.' });
      return;
    }
    setSubmitting(true);
    try {
      const inserted = await insertMessageRow(t, b);
      if (inserted) {
        setRows((prev) => [inserted, ...prev]);
      }
      setTitle('');
      setBody('');
      toast({ title: 'Message saved', description: 'The new entry has been added to the table.' });
    } catch (e) {
      console.error('[admin-messages] insert', e);
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (row: AdminMessage) => {
    setResendingId(row.id);
    try {
      const inserted = await insertMessageRow(row.title, row.body);
      if (inserted) {
        setRows((prev) => [inserted, ...prev]);
      }
      toast({
        title: 'Sent again',
        description: 'A new row was added with the same title and body.',
      });
    } catch (e) {
      console.error('[admin-messages] resend', e);
      toast({
        variant: 'destructive',
        title: 'Could not resend',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setResendingId(null);
    }
  };

  const isBusy = submitting || resendingId !== null || postingPresetId !== null;

  const handlePresetPost = async (preset: (typeof BROADCAST_PRESETS)[number]) => {
    setPostingPresetId(preset.id);
    try {
      const inserted = await insertMessageRow(preset.title, preset.body);
      if (inserted) {
        setRows((prev) => [inserted, ...prev]);
      }
      toast({
        title: 'Posted',
        description: `“${preset.label}” was added to the database.`,
      });
    } catch (e) {
      console.error('[admin-messages] preset', e);
      toast({
        variant: 'destructive',
        title: 'Could not post',
        description: e instanceof Error ? e.message : 'Try again.',
      });
    } finally {
      setPostingPresetId(null);
    }
  };

  const handlePresetFillForm = (preset: (typeof BROADCAST_PRESETS)[number]) => {
    setTitle(preset.title);
    setBody(preset.body);
    toast({ title: 'Loaded into form', description: 'Edit in New message, then click Add message.' });
  };

  if (isLoadingProfile || (!userProfile && user)) {
    return (
      <div className="flex flex-col gap-6 max-w-6xl">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessagesSquare className="h-8 w-8 text-primary" />
          Admin messages
        </h1>
        <p className="text-muted-foreground">
          Use quick posts for common notices, or write a custom message. Resend duplicates an existing row. Only admins can access this page.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card className="rounded-xl border min-w-0">
          <CardHeader>
            <CardTitle>New message</CardTitle>
            <CardDescription>Title and body are stored as plain text.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-msg-title">Title</Label>
                <Input
                  id="admin-msg-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short headline"
                  className="rounded-xl"
                  disabled={isBusy}
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-msg-body">Body</Label>
                <Textarea
                  id="admin-msg-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Full message content"
                  className="rounded-xl min-h-[180px]"
                  disabled={isBusy}
                />
              </div>
              <Button type="submit" className="rounded-xl" disabled={isBusy}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Add message'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-xl border min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Quick posts
            </CardTitle>
            <CardDescription>
              One tap adds a new row immediately. Customize loads the text into New message so you can edit before sending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 max-h-[min(520px,70vh)] overflow-y-auto pr-1 -mr-1">
              {BROADCAST_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm font-medium min-w-0 flex-1">{preset.label}</span>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => handlePresetPost(preset)}
                      disabled={isBusy}
                    >
                      {postingPresetId === preset.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Post now'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => handlePresetFillForm(preset)}
                      disabled={isBusy}
                    >
                      Customize
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle>Existing messages</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No messages yet.</p>
          ) : (
            <ul className="space-y-4">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold text-sm">{row.title}</h3>
                        <time className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(row.created_at), 'dd MMM yyyy, HH:mm')}
                        </time>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.body}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl shrink-0"
                      onClick={() => handleResend(row)}
                      disabled={isBusy}
                      title="Insert a new database row with the same title and body"
                    >
                      {resendingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Resend
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
