
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { updateUserProfile } from '@/supabase/database/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';

const profileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters.'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  bio: z.string().optional(),
  profilePicture: z.string().refine((val) => {
    if (!val || val === '') return true;
    try {
      new URL(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Please enter a valid URL or leave empty' }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function ProfileSkeleton() {
    return (
        <Card className="rounded-xl border shadow-sm">
            <CardHeader>
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-64" />
                    </div>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="flex items-center gap-4">
                    <Skeleton className="h-20 w-20 rounded-xl" />
                    <Skeleton className="h-10 flex-1 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                </div>
                <div className="flex items-center justify-between pt-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-10 w-32 rounded-xl" />
                </div>
            </CardContent>
        </Card>
    )
}


export function UserProfileCard() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading } = useDoc('users', user?.id);

  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      username: userProfileRaw.username || user?.user_metadata?.username || '',
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName || '',
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName || '',
      bio: userProfileRaw.bio || '',
      profilePicture: (userProfileRaw as any).profile_picture || (userProfileRaw as any).profilePicture || '',
      registrationDate: (userProfileRaw as any).registration_date || (userProfileRaw as any).registrationDate,
    };
  }, [userProfileRaw, user]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      firstName: '',
      lastName: '',
      bio: '',
      profilePicture: '',
    },
  });

  // Update form values when userProfile loads or changes
  useEffect(() => {
    if (userProfile && !isLoading) {
      form.reset({
        username: userProfile.username || '',
        firstName: userProfile.firstName || '',
        lastName: userProfile.lastName || '',
        bio: userProfile.bio || '',
        profilePicture: userProfile.profilePicture || '',
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
        bio: data.bio || '',
        profilePicture: data.profilePicture || '',
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

  const registrationDate = userProfile?.registrationDate ? new Date(userProfile.registrationDate) : null;
  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('');

  return (
    <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <div>
          <CardTitle className="text-xl">Profile Information</CardTitle>
          <CardDescription className="mt-1">
            Update your personal information and profile details
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Profile Picture Section */}
            <FormField
              control={form.control}
              name="profilePicture"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Picture</FormLabel>
                  <div className="flex items-start gap-6">
                    <Avatar className="h-24 w-24 rounded-xl border-2 border-border">
                      <AvatarImage src={field.value} alt={userProfile?.username} />
                      <AvatarFallback className="bg-primary/20 rounded-xl text-primary text-lg font-semibold">
                        {userProfile?.username ? getInitials(userProfile.username) : <UserIcon className="h-8 w-8" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <FormControl>
                        <Input 
                          placeholder="https://example.com/your-image.png" 
                          {...field} 
                          className="rounded-xl" 
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Enter a URL to your profile picture. It will be displayed on your profile and testimonials.
                      </p>
                      <FormMessage />
                    </div>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Your username" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <Input 
                  value={user?.email || 'No email associated'} 
                  disabled 
                  className="rounded-xl bg-muted" 
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Email address cannot be changed here
                </p>
              </FormItem>
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your first name" {...field} className="rounded-xl" />
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
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your last name" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Tell us a little about your experience and background..." 
                      {...field} 
                      className="rounded-xl min-h-[100px]" 
                      rows={4}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    A brief description of your experience and background
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Account Information</p>
                <p className="text-xs text-muted-foreground">
                  Member since {registrationDate ? format(registrationDate, 'MMMM d, yyyy') : 'N/A'}
                </p>
              </div>
              <Button type="submit" disabled={isSaving} variant="default" className="rounded-xl">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
