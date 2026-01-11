'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { createFeedback, getUserFeedback, getAllFeedback, updateFeedback, type Feedback, type FeedbackType, type FeedbackStatus } from '@/supabase/database/queries';
import { Loader2, MessageSquare, Bug, Sparkles, HelpCircle, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { UserProfile } from '@/lib/types';

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
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');

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

  // Fetch feedback
  useEffect(() => {
    if (!user?.id) return;

    const fetchFeedback = async () => {
      setIsLoadingFeedback(true);
      try {
        if (isAdmin) {
          const feedback = await getAllFeedback(supabase, {
            status: statusFilter !== 'all' ? statusFilter : undefined,
            type: typeFilter !== 'all' ? typeFilter : undefined,
          });
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
  }, [user?.id, supabase, isAdmin, statusFilter, typeFilter, toast]);

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

      // Refresh feedback list
      const feedback = await getAllFeedback(supabase, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      });
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

  const displayFeedback = isAdmin ? allFeedback : userFeedback;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Feedback</h1>
            <p className="text-muted-foreground">
              {isAdmin ? 'Manage user feedback and respond to requests' : 'Report problems or suggest new features'}
            </p>
          </div>
        </div>
        <Separator />
      </div>

      {isAdmin ? (
        // Admin view - no tabs, just feedback list
        <div className="flex flex-col gap-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FeedbackStatus | 'all')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Type</label>
                  <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as FeedbackType | 'all')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback List */}
          {isLoadingFeedback ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-1/4 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : displayFeedback.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  No feedback found matching your filters.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {displayFeedback.map((feedback) => {
                const typeInfo = feedbackTypeLabels[feedback.type];
                const statusInfo = statusLabels[feedback.status];
                const TypeIcon = typeInfo.icon;
                const StatusIcon = statusInfo.icon;

                return (
                  <Card key={feedback.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <TypeIcon className="h-5 w-5" />
                            <CardTitle className="text-lg">{feedback.subject}</CardTitle>
                            <Badge variant={feedback.type === 'bug' ? 'destructive' : 'default'}>
                              {typeInfo.label}
                            </Badge>
                            <Badge variant={feedback.status === 'resolved' ? 'default' : 'secondary'}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <CardDescription>
                            Submitted on {format(new Date(feedback.createdAt), 'PPP p')}
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResponseDialog(feedback)}
                        >
                          {feedback.adminResponse ? 'Edit Response' : 'Respond'}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm whitespace-pre-wrap">{feedback.message}</p>
                      </div>

                      {feedback.adminResponse && (
                        <>
                          <Separator />
                          <div className="bg-muted/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold">Admin Response</span>
                              {feedback.adminResponseAt && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(feedback.adminResponseAt), 'PPP p')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{feedback.adminResponse}</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Regular user view - with tabs for submit and history
        <Tabs defaultValue="submit" className="w-full">
          <TabsList className="rounded-xl">
            <TabsTrigger value="submit" className="!rounded-lg">
              <MessageSquare className="h-4 w-4 mr-2" />
              Submit Feedback
            </TabsTrigger>
            <TabsTrigger value="history" className="!rounded-lg">
              <Clock className="h-4 w-4 mr-2" />
              My Feedback
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Submit Feedback</CardTitle>
                <CardDescription>
                  Found a problem or have an idea for a new feature? Let us know!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select feedback type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bug">
                                <div className="flex items-center gap-2">
                                  <Bug className="h-4 w-4" />
                                  Bug Report
                                </div>
                              </SelectItem>
                              <SelectItem value="feature">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4" />
                                  Feature Request
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
                          <FormDescription>
                            Select the type of feedback you're submitting
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
                          <FormLabel>Subject</FormLabel>
                          <FormControl>
                            <Input placeholder="Brief description of your feedback" {...field} />
                          </FormControl>
                          <FormDescription>
                            A short summary of your feedback (3-200 characters)
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
                          <FormLabel>Message</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the problem or feature request in detail..."
                              className="min-h-[150px]"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Provide as much detail as possible (10-5000 characters)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Submit Feedback
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            {isLoadingFeedback ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-1/4 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : displayFeedback.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  You haven't submitted any feedback yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {displayFeedback.map((feedback) => {
                const typeInfo = feedbackTypeLabels[feedback.type];
                const statusInfo = statusLabels[feedback.status];
                const TypeIcon = typeInfo.icon;
                const StatusIcon = statusInfo.icon;

                return (
                  <Card key={feedback.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <TypeIcon className="h-5 w-5" />
                            <CardTitle className="text-lg">{feedback.subject}</CardTitle>
                            <Badge variant={feedback.type === 'bug' ? 'destructive' : 'default'}>
                              {typeInfo.label}
                            </Badge>
                            <Badge variant={feedback.status === 'resolved' ? 'default' : 'secondary'}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          </div>
                          <CardDescription>
                            Submitted on {format(new Date(feedback.createdAt), 'PPP p')}
                          </CardDescription>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openResponseDialog(feedback)}
                          >
                            {feedback.adminResponse ? 'Edit Response' : 'Respond'}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm whitespace-pre-wrap">{feedback.message}</p>
                      </div>

                      {feedback.adminResponse && (
                        <>
                          <Separator />
                          <div className="bg-muted/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold">Admin Response</span>
                              {feedback.adminResponseAt && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(feedback.adminResponseAt), 'PPP p')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{feedback.adminResponse}</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </TabsContent>
        </Tabs>
      )}

      {/* Admin Response Dialog */}
      {isAdmin && (
        <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Respond to Feedback</DialogTitle>
              <DialogDescription>
                {selectedFeedback?.subject}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select
                  value={selectedFeedback?.status || 'open'}
                  onValueChange={(value) => {
                    if (selectedFeedback) {
                      setSelectedFeedback({ ...selectedFeedback, status: value as FeedbackStatus });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Response</label>
                <Textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  placeholder="Enter your response to the user..."
                  className="min-h-[150px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsResponseDialogOpen(false);
                  setSelectedFeedback(null);
                  setAdminResponse('');
                }}
              >
                Cancel
              </Button>
              <Button
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
                {isUpdatingFeedback && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Response
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
