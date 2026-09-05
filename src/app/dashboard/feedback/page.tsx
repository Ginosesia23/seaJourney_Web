'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { createFeedback, getUserFeedback, getAllFeedback, updateFeedback, markFeedbackResponseAsRead, deleteFeedback, type Feedback, type FeedbackType, type FeedbackStatus } from '@/supabase/database/queries';
import { Loader2, MessageSquare, Bug, Sparkles, HelpCircle, CheckCircle2, Clock, XCircle, AlertCircle, Send, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import type { UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'other'], {
    required_error: 'Please select a feedback type.',
  }),
  subject: z.string().min(3, { message: 'Subject must be at least 3 characters long.' }).max(200, { message: 'Subject must be less than 200 characters.' }),
  message: z.string().min(10, { message: 'Message must be at least 10 characters long.' }).max(5000, { message: 'Message must be less than 5000 characters.' }),
});

type FeedbackFormValues = z.infer<typeof feedbackSchema>;

const feedbackTypeLabels: Record<FeedbackType, { label: string; icon: React.ComponentType<any>; color: string }> = {
  bug: { label: 'Bug Report', icon: Bug, color: 'destructive' },
  feature: { label: 'Feature Request', icon: Sparkles, color: 'default' },
  other: { label: 'Other', icon: HelpCircle, color: 'secondary' },
};

const statusLabels: Record<FeedbackStatus, { label: string; icon: React.ComponentType<any>; color: string }> = {
  open: { label: 'Open', icon: Clock, color: 'default' },
  in_progress: { label: 'In Progress', icon: AlertCircle, color: 'default' },
  resolved: { label: 'Resolved', icon: CheckCircle2, color: 'default' },
  closed: { label: 'Closed', icon: XCircle, color: 'secondary' },
};

export default function FeedbackPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userFeedback, setUserFeedback] = useState<Feedback[]>([]);
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [adminResponse, setAdminResponse] = useState('');
  const [isUpdatingFeedback, setIsUpdatingFeedback] = useState(false);
  const [isMarkingAsRead, setIsMarkingAsRead] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeletingFeedback, setIsDeletingFeedback] = useState(false);
  // Admin: send message to user
  const [messageToUserId, setMessageToUserId] = useState<string>('');
  const [messageToUserSubject, setMessageToUserSubject] = useState('');
  const [messageToUserMessage, setMessageToUserMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isNewMessageDialogOpen, setIsNewMessageDialogOpen] = useState(false);
  const [usersList, setUsersList] = useState<Array<{ id: string; email: string; first_name?: string | null; last_name?: string | null; username?: string | null }>>([]);

  // Fetch user profile to check if admin
  const { data: userProfileRaw } = useDoc<UserProfile>('users', user?.id);
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
    } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      type: 'bug',
      subject: '',
      message: '',
    },
  });

  // Fetch feedback (admin: fetch all once for counts + client-side filter; non-admin: fetch own only)
  useEffect(() => {
    if (!user?.id) return;

    const fetchFeedback = async () => {
      setIsLoadingFeedback(true);
      try {
        if (isAdmin) {
          const feedback = await getAllFeedback(supabase);
          setAllFeedback(feedback);
        } else {
          const feedback = await getUserFeedback(supabase, user.id);
          setUserFeedback(feedback);
        }
      } catch (error) {
        console.error('[FEEDBACK] Error fetching feedback:', error);
        toast({
          title: 'Error',
          description: 'Failed to load feedback. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingFeedback(false);
      }
    };

    fetchFeedback();
  }, [user?.id, supabase, isAdmin, toast]);

  // Admin: fetch users for "Send message to user"
  useEffect(() => {
    if (!isAdmin || !supabase) return;
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, username')
          .order('email', { ascending: true });
        if (error) throw error;
        setUsersList(data || []);
      } catch (err) {
        console.error('[FEEDBACK] Error fetching users:', err);
      }
    };
    fetchUsers();
  }, [isAdmin, supabase]);

  const sendMessageToUser = async () => {
    if (!user?.id || !messageToUserId?.trim()) {
      toast({
        title: 'Select a user',
        description: 'Please select a user to send the message to.',
        variant: 'destructive',
      });
      return;
    }
    if (!messageToUserSubject.trim() || messageToUserSubject.length < 3) {
      toast({
        title: 'Subject required',
        description: 'Subject must be at least 3 characters.',
        variant: 'destructive',
      });
      return;
    }
    if (!messageToUserMessage.trim() || messageToUserMessage.length < 10) {
      toast({
        title: 'Message required',
        description: 'Message must be at least 10 characters.',
        variant: 'destructive',
      });
      return;
    }
    setIsSendingMessage(true);
    try {
      await createFeedback(supabase, {
        userId: user.id,
        type: 'other',
        subject: messageToUserSubject.trim(),
        message: messageToUserMessage.trim(),
        recipientId: messageToUserId.trim(),
      });
      toast({
        title: 'Message sent',
        description: 'The user will see this message in their Feedback page.',
      });
      setMessageToUserId('');
      setMessageToUserSubject('');
      setMessageToUserMessage('');
      setIsNewMessageDialogOpen(false);
      const feedback = await getAllFeedback(supabase);
      setAllFeedback(feedback);
    } catch (error) {
      console.error('[FEEDBACK] Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Admin: status counts filtered by current type (so type row selection updates status numbers)
  const statusCounts = useMemo(() => {
    if (!isAdmin) return { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const list = typeFilter === 'all' ? allFeedback : allFeedback.filter((f) => f.type === typeFilter);
    const open = list.filter((f) => f.status === 'open').length;
    const in_progress = list.filter((f) => f.status === 'in_progress').length;
    const resolved = list.filter((f) => f.status === 'resolved').length;
    const closed = list.filter((f) => f.status === 'closed').length;
    return {
      all: list.length,
      open,
      in_progress,
      resolved,
      closed,
    };
  }, [isAdmin, allFeedback, typeFilter]);

  // Admin: type counts filtered by current status (so status selection updates type numbers)
  const typeCounts = useMemo(() => {
    if (!isAdmin) return { all: 0, bug: 0, feature: 0, other: 0 };
    const list = statusFilter === 'all' ? allFeedback : allFeedback.filter((f) => f.status === statusFilter);
    const bug = list.filter((f) => f.type === 'bug').length;
    const feature = list.filter((f) => f.type === 'feature').length;
    const other = list.filter((f) => f.type === 'other').length;
    return {
      all: list.length,
      bug,
      feature,
      other,
    };
  }, [isAdmin, allFeedback, statusFilter]);

  // Admin: filter full list by selected status and type (client-side)
  const displayFeedback = useMemo(() => {
    if (!isAdmin) return userFeedback;
    let list = allFeedback;
    if (statusFilter !== 'all') list = list.filter((f) => f.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter((f) => f.type === typeFilter);
    return list;
  }, [isAdmin, allFeedback, userFeedback, statusFilter, typeFilter]);

  const onSubmit = async (values: FeedbackFormValues) => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to submit feedback.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createFeedback(supabase, {
        userId: user.id,
        type: values.type,
        subject: values.subject,
        message: values.message,
      });

      toast({
        title: 'Feedback submitted',
        description: 'Thank you for your feedback! We will review it soon.',
      });

      form.reset();
      
      // Refresh feedback list
      if (isAdmin) {
        const feedback = await getAllFeedback(supabase);
        setAllFeedback(feedback);
      } else {
        const feedback = await getUserFeedback(supabase, user.id);
        setUserFeedback(feedback);
      }
    } catch (error) {
      console.error('[FEEDBACK] Error submitting feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateFeedback = async (feedbackId: string, updates: { status?: FeedbackStatus; adminResponse?: string }) => {
    if (!user?.id) return;

    setIsUpdatingFeedback(true);
    try {
      await updateFeedback(supabase, feedbackId, {
        ...updates,
        respondedBy: user.id,
      });

      toast({
        title: 'Feedback updated',
        description: 'Feedback has been updated successfully.',
      });

      setIsResponseDialogOpen(false);
      setSelectedFeedback(null);
      setAdminResponse('');

      // Refresh full list so counts stay correct
      const feedback = await getAllFeedback(supabase);
      setAllFeedback(feedback);
    } catch (error) {
      console.error('[FEEDBACK] Error updating feedback:', error);
      toast({
        title: 'Error',
        description: 'Failed to update feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingFeedback(false);
    }
  };

  const openResponseDialog = (feedback: Feedback) => {
    setSelectedFeedback(feedback);
    setAdminResponse(feedback.adminResponse || '');
    setIsResponseDialogOpen(true);
  };

  const handleMarkAsRead = async (feedbackId: string) => {
    if (!user?.id) return;
    
    setIsMarkingAsRead(feedbackId);
    try {
      await markFeedbackResponseAsRead(supabase, feedbackId);
      
      // Update local state
      if (isAdmin) {
        setAllFeedback(prev => prev.map(f => 
          f.id === feedbackId 
            ? { ...f, adminResponseReadAt: new Date().toISOString() }
            : f
        ));
      } else {
        setUserFeedback(prev => prev.map(f => 
          f.id === feedbackId 
            ? { ...f, adminResponseReadAt: new Date().toISOString() }
            : f
        ));
      }
      
      toast({
        title: 'Marked as Read',
        description: 'The response has been marked as read.',
      });
    } catch (error: any) {
      console.error('[FEEDBACK] Error marking as read:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark as read. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsMarkingAsRead(null);
    }
  };

  const handleDeleteFeedback = async () => {
    if (!deleteConfirmId) return;
    setIsDeletingFeedback(true);
    try {
      await deleteFeedback(supabase, deleteConfirmId);
      toast({
        title: 'Feedback deleted',
        description: 'The entry has been removed.',
      });
      setDeleteConfirmId(null);
      const feedback = await getAllFeedback(supabase);
      setAllFeedback(feedback);
    } catch (error) {
      console.error('[FEEDBACK] Error deleting:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete feedback. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingFeedback(false);
    }
  };

  const filterChip = (
    active: boolean,
    onClick: () => void,
    label: string,
    count: number,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
      <span
        className={cn(
          'rounded px-1 font-mono text-[10px] tabular-nums',
          active ? 'bg-muted text-muted-foreground' : 'text-muted-foreground/70',
        )}
      >
        {count}
      </span>
    </button>
  );

  const renderFeedbackItem = (feedback: Feedback) => {
    const isReceivedMessage = !isAdmin && feedback.recipientId === user?.id;
    const typeInfo = feedbackTypeLabels[feedback.type];
    const statusInfo = statusLabels[feedback.status];
    const TypeIcon = typeInfo.icon;
    const StatusIcon = statusInfo.icon;

    return (
      <div
        key={feedback.id}
        className="overflow-hidden rounded-md border border-border bg-background"
      >
        <div className="flex flex-col gap-3 border-b border-border bg-muted/40 px-4 py-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">{feedback.subject}</h3>
              {isReceivedMessage ? (
                <Badge variant="secondary" className="text-[10px]">
                  Message from admin
                </Badge>
              ) : (
                <>
                  <Badge
                    variant={feedback.type === 'bug' ? 'destructive' : 'outline'}
                    className="text-[10px]"
                  >
                    {typeInfo.label}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        feedback.status === 'resolved' && 'bg-emerald-500',
                        feedback.status === 'open' && 'bg-amber-500',
                        feedback.status === 'in_progress' && 'bg-sky-500',
                        feedback.status === 'closed' && 'bg-muted-foreground',
                      )}
                    />
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isReceivedMessage
                ? `Received ${format(new Date(feedback.createdAt), 'MMM d, yyyy · HH:mm')}`
                : isAdmin
                  ? `Submitted ${format(new Date(feedback.createdAt), 'MMM d, yyyy · HH:mm')}`
                  : `Submitted ${format(new Date(feedback.createdAt), 'MMM d, yyyy · HH:mm')}`}
            </p>
            {isAdmin ? (
              <p className="text-[11px] text-muted-foreground">
                {feedback.recipientId && feedback.recipient
                  ? `To: ${[feedback.recipient.first_name, feedback.recipient.last_name].filter(Boolean).join(' ').trim() || feedback.recipient.username || 'Unknown'}${feedback.recipient.email ? ` (${feedback.recipient.email})` : ''}`
                  : `From: ${
                      feedback.submitter
                        ? [feedback.submitter.first_name, feedback.submitter.last_name]
                            .filter(Boolean)
                            .join(' ')
                            .trim() ||
                          feedback.submitter.username ||
                          'Unknown'
                        : 'Unknown user'
                    }${
                      feedback.submitter?.email
                        ? ` (${feedback.submitter.email})`
                        : feedback.userId
                          ? ` (${feedback.userId.slice(0, 8)}…)`
                          : ''
                    }`}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isAdmin ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md border-border text-xs"
                  onClick={() => openResponseDialog(feedback)}
                >
                  {feedback.recipientId
                    ? feedback.adminResponse
                      ? 'Edit follow-up'
                      : 'Add follow-up'
                    : feedback.adminResponse
                      ? 'Edit response'
                      : 'Respond'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md border-border text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteConfirmId(feedback.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-4">
          <p className="whitespace-pre-wrap text-sm text-foreground">{feedback.message}</p>
          {feedback.adminResponse ? (
            <div
              className={cn(
                'rounded-md border px-3 py-2.5',
                !feedback.adminResponseReadAt && !isAdmin
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-border bg-muted/40',
              )}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-foreground">Admin response</span>
                  {!feedback.adminResponseReadAt && !isAdmin ? (
                    <Badge className="text-[10px]">New</Badge>
                  ) : null}
                  {feedback.adminResponseAt ? (
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(feedback.adminResponseAt), 'MMM d, yyyy · HH:mm')}
                    </span>
                  ) : null}
                </div>
                {!feedback.adminResponseReadAt && !isAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-md border-border text-xs"
                    onClick={() => handleMarkAsRead(feedback.id)}
                    disabled={isMarkingAsRead === feedback.id}
                  >
                    {isMarkingAsRead === feedback.id ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Marking…
                      </>
                    ) : (
                      'Mark as read'
                    )}
                  </Button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {feedback.adminResponse}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderFeedbackList = () => {
    if (isLoadingFeedback) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-md border border-border bg-background"
            >
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <Skeleton className="h-4 w-1/3" />
              </div>
              <div className="space-y-2 px-4 py-4">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (displayFeedback.length === 0) {
      return (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5">
            <p className="text-xs font-medium text-foreground">
              {isAdmin ? 'No matching feedback' : 'No feedback yet'}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <p className="mt-3 max-w-md text-xs text-muted-foreground">
              {isAdmin
                ? 'No feedback found matching your filters.'
                : "You haven't submitted any feedback yet."}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">{displayFeedback.map(renderFeedbackItem)}</div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{isAdmin ? 'Platform' : 'Dashboard'}</span>
            <span className="text-border">/</span>
            <span className="text-foreground">Feedback</span>
          </div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">Feedback</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isAdmin
              ? 'Review user feedback, reply, and send direct messages.'
              : 'Report problems or suggest improvements for SeaJourney.'}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="hidden items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span className="font-mono tabular-nums text-foreground">{statusCounts.open}</span>
                open
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                <span className="font-mono tabular-nums text-foreground">
                  {statusCounts.in_progress}
                </span>
                in progress
              </span>
            </div>
            <Button
              onClick={() => setIsNewMessageDialogOpen(true)}
              className="h-8 shrink-0 rounded-md text-xs"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              New message
            </Button>
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-md border border-border bg-background">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <p className="text-xs font-medium text-foreground">Filters</p>
            </div>
            <div className="space-y-3 px-4 py-3 sm:px-5">
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Status</p>
                <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
                  {(
                    [
                      ['all', 'All', statusCounts.all, MessageSquare],
                      ['open', 'Open', statusCounts.open, Clock],
                      ['in_progress', 'In progress', statusCounts.in_progress, AlertCircle],
                      ['resolved', 'Resolved', statusCounts.resolved, CheckCircle2],
                      ['closed', 'Closed', statusCounts.closed, XCircle],
                    ] as const
                  ).map(([value, label, count, Icon]) =>
                    filterChip(
                      statusFilter === value,
                      () => setStatusFilter(value),
                      label,
                      count,
                      Icon,
                    ),
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Type</p>
                <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
                  {(
                    [
                      ['all', 'All types', typeCounts.all, MessageSquare],
                      ['bug', 'Bug', typeCounts.bug, Bug],
                      ['feature', 'Feature', typeCounts.feature, Sparkles],
                      ['other', 'Other', typeCounts.other, HelpCircle],
                    ] as const
                  ).map(([value, label, count, Icon]) =>
                    filterChip(
                      typeFilter === value,
                      () => setTypeFilter(value),
                      label,
                      count,
                      Icon,
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>

          {renderFeedbackList()}
        </div>
      ) : (
        <Tabs defaultValue="submit" className="w-full space-y-4">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5 w-fit">
            <TabsList className="h-auto bg-transparent p-0">
              <TabsTrigger
                value="submit"
                className="h-7 rounded-[5px] px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Submit
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="h-7 rounded-[5px] px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Clock className="mr-1.5 h-3.5 w-3.5" />
                My feedback
                <span className="ml-1.5 rounded px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {userFeedback.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="submit" className="mt-0">
            <div className="overflow-hidden rounded-md border border-border bg-background">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <h2 className="text-xs font-medium text-foreground">Submit feedback</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Found a problem or have an idea? Send it here.
                </p>
              </div>
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-9 rounded-md border-border text-sm">
                                <SelectValue placeholder="Select feedback type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bug">
                                <div className="flex items-center gap-2">
                                  <Bug className="h-4 w-4" />
                                  Bug report
                                </div>
                              </SelectItem>
                              <SelectItem value="feature">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4" />
                                  Feature request
                                </div>
                              </SelectItem>
                              <SelectItem value="other">
                                <div className="flex items-center gap-2">
                                  <HelpCircle className="h-4 w-4" />
                                  Other
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-[11px]">
                            What kind of feedback is this?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Subject</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Brief summary"
                              className="h-9 rounded-md border-border text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            3–200 characters
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Message</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the problem or idea in detail…"
                              className="min-h-[140px] rounded-md border-border text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            10–5000 characters
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-8 rounded-md text-xs"
                    >
                      {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Submit feedback
                    </Button>
                  </form>
                </Form>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {renderFeedbackList()}
          </TabsContent>
        </Tabs>
      )}

      {isAdmin && (
        <Dialog open={isNewMessageDialogOpen} onOpenChange={setIsNewMessageDialogOpen}>
          <DialogContent className="max-w-md rounded-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-medium">
                <Send className="h-4 w-4" />
                Send message to user
              </DialogTitle>
              <DialogDescription>
                The user will see this under Feedback → My feedback.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Recipient</label>
                <Select value={messageToUserId} onValueChange={setMessageToUserId}>
                  <SelectTrigger className="h-9 w-full rounded-md border-border text-sm">
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersList.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {[u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
                          u.username ||
                          'Unknown'}
                        {u.email ? ` (${u.email})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Subject</label>
                <Input
                  placeholder="Message subject"
                  value={messageToUserSubject}
                  onChange={(e) => setMessageToUserSubject(e.target.value)}
                  maxLength={200}
                  className="h-9 rounded-md border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Message</label>
                <Textarea
                  placeholder="Write your message…"
                  className="min-h-[120px] rounded-md border-border text-sm"
                  value={messageToUserMessage}
                  onChange={(e) => setMessageToUserMessage(e.target.value)}
                  maxLength={5000}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  className="h-8 rounded-md text-xs"
                  onClick={() => setIsNewMessageDialogOpen(false)}
                  disabled={isSendingMessage}
                >
                  Cancel
                </Button>
                <Button
                  className="h-8 rounded-md text-xs"
                  onClick={sendMessageToUser}
                  disabled={isSendingMessage}
                >
                  {isSendingMessage && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Send message
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isAdmin && (
        <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
          <DialogContent className="max-w-2xl rounded-md">
            <DialogHeader>
              <DialogTitle className="text-base font-medium">Respond to feedback</DialogTitle>
              <DialogDescription className="space-y-1">
                <span className="block">{selectedFeedback?.subject}</span>
                <span className="block text-muted-foreground">
                  Submitted by:{' '}
                  {selectedFeedback?.submitter
                    ? [selectedFeedback.submitter.first_name, selectedFeedback.submitter.last_name]
                        .filter(Boolean)
                        .join(' ')
                        .trim() ||
                      selectedFeedback.submitter.username ||
                      'Unknown'
                    : 'Unknown user'}
                  {selectedFeedback?.submitter?.email
                    ? ` (${selectedFeedback.submitter.email})`
                    : selectedFeedback?.userId
                      ? ` (${selectedFeedback.userId.slice(0, 8)}…)`
                      : ''}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Status</label>
                <Select
                  value={selectedFeedback?.status || 'open'}
                  onValueChange={(value) => {
                    if (selectedFeedback) {
                      setSelectedFeedback({
                        ...selectedFeedback,
                        status: value as FeedbackStatus,
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-9 rounded-md border-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Response</label>
                <Textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  placeholder="Enter your response…"
                  className="min-h-[150px] rounded-md border-border text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="h-8 rounded-md text-xs"
                onClick={() => {
                  setIsResponseDialogOpen(false);
                  setSelectedFeedback(null);
                  setAdminResponse('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="h-8 rounded-md text-xs"
                onClick={() => {
                  if (selectedFeedback) {
                    handleUpdateFeedback(selectedFeedback.id, {
                      status: selectedFeedback.status,
                      adminResponse: adminResponse || undefined,
                    });
                  }
                }}
                disabled={isUpdatingFeedback}
              >
                {isUpdatingFeedback && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save response
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent className="rounded-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this feedback entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 rounded-md text-xs" disabled={isDeletingFeedback}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 rounded-md text-xs"
              onClick={handleDeleteFeedback}
              disabled={isDeletingFeedback}
            >
              {isDeletingFeedback && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
