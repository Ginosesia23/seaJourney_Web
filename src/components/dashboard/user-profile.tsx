
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useFirestore, useDoc, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
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
  profilePicture: z.string().url().optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function ProfileSkeleton() {
    return (
        <Card className="rounded-xl border bg-card dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="flex items-center space-x-4">
                    <Skeleton className="h-20 w-20 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-10 w-24" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                </div>
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-10 w-24" />
            </CardContent>
        </Card>
    )
}


export function UserProfileCard() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'profile', user.uid);
  }, [firestore, user?.uid]);

  const { data: userProfile, isLoading } = useDoc(userProfileRef);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      username: userProfile?.username || user?.displayName || '',
      firstName: userProfile?.firstName || '',
      lastName: userProfile?.lastName || '',
      bio: userProfile?.bio || '',
      profilePicture: userProfile?.profilePicture || '',
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    if (!userProfileRef) return;
    setIsSaving(true);
    
    setDoc(userProfileRef, data, { merge: true })
      .then(() => {
        toast({
          title: 'Profile Updated',
          description: 'Your profile has been saved successfully.',
        });
      })
      .catch((error) => {
        const permissionError = new FirestorePermissionError({
          path: userProfileRef.path,
          operation: 'update',
          requestResourceData: data,
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  const registrationDate = userProfile?.registrationDate ? new Date(userProfile.registrationDate) : null;
  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('');

  return (
    <Card className="rounded-xl border bg-card dark:shadow-md transition-shadow dark:hover:shadow-lg">
      <CardHeader>
        <CardTitle>User Profile</CardTitle>
        <CardDescription>This information will be displayed on your testimonials and other documents.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="profilePicture"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Picture</FormLabel>
                   <div className="flex items-center gap-4">
                      <Avatar className="h-20 w-20">
                          <AvatarImage src={field.value} alt={userProfile?.username} />
                          <AvatarFallback className="bg-primary/20">
                              {userProfile?.username ? getInitials(userProfile.username) : <UserIcon />}
                          </AvatarFallback>
                      </Avatar>
                      <FormControl>
                          <Input placeholder="https://example.com/your-image.png" {...field} />
                      </FormControl>
                  </div>
                  <FormMessage />
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
                      <Input placeholder="Your username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Email</FormLabel>
                <Input value={user?.email || 'No email associated'} disabled />
              </FormItem>
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your first name" {...field} />
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
                      <Input placeholder="Your last name" {...field} />
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
                    <Textarea placeholder="Tell us a little about your experience..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" disabled={isSaving} variant="default" className="rounded-lg">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <p>Member since: {registrationDate ? format(registrationDate, 'MMMM d, yyyy') : 'N/A'}</p>
      </CardFooter>
    </Card>
  );
}
