'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { updateUserProfile } from '@/supabase/database/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const profileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters.'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function ProfileSkeleton() {
  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-3 w-56" />
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t pt-4">
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
    </section>
  );
}

export function UserProfileCard({ className }: { className?: string }) {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading } = useDoc('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      username: userProfileRaw.username || user?.user_metadata?.username || '',
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName || '',
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName || '',
    };
  }, [userProfileRaw, user]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      firstName: '',
      lastName: '',
    },
  });

  useEffect(() => {
    if (userProfile && !isLoading) {
      form.reset({
        username: userProfile.username || '',
        firstName: userProfile.firstName || '',
        lastName: userProfile.lastName || '',
      });
    }
  }, [userProfile, isLoading, form]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!user?.id) return;
    setIsSaving(true);

    try {
      await updateUserProfile(supabase, user.id, {
        username: data.username,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
      });

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been saved successfully.',
      });
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  return (
    <section className={cn('flex flex-col rounded-xl border bg-card', className)}>
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold tracking-tight">Personal details</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Username and name used across SeaJourney
        </p>
      </div>
      <div className="flex-1 px-4 py-4 sm:px-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Your username" {...field} className="h-9 rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel className="text-xs">Email</FormLabel>
                <Input
                  value={user?.email || 'No email associated'}
                  disabled
                  className="h-9 rounded-lg bg-muted"
                />
                <p className="text-[11px] text-muted-foreground">
                  Contact support to change your email
                </p>
              </FormItem>
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">First name</FormLabel>
                    <FormControl>
                      <Input placeholder="First name" {...field} className="h-9 rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Last name</FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" {...field} className="h-9 rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={isSaving} size="sm" className="rounded-lg">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </section>
  );
}
