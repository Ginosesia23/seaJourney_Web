'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Smartphone } from 'lucide-react';

// Placeholder for a server action
async function signUpAction(prevState: any, formData: FormData) {
  const email = formData.get('email');
  console.log('Tester email submitted:', email);
  // In a real app, you would save this email to a database.
  // For now, we'll just simulate a success response.
  if (email && typeof email === 'string' && email.includes('@')) {
    return { success: true, message: "Thanks for signing up! We'll be in touch." };
  }
  return { success: false, message: 'Please enter a valid email address.' };
}


function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button 
      type="submit" 
      disabled={pending} 
      className="w-full bg-[#3DDC84] hover:bg-[#3DDC84]/90 text-black"
    >
      {pending ? 'Submitting...' : 'Become a Tester'}
    </Button>
  );
}

export default function AndroidTesterSignup() {
  const [state, formAction] = useActionState(signUpAction, { success: false, message: '' });
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast({
          title: 'Success!',
          description: state.message,
        });
        formRef.current?.reset();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: state.message,
        });
      }
    }
  }, [state, toast]);

  return (
    <section id="android-testers" className="py-16 sm:py-24 bg-green-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Smartphone className="mx-auto h-12 w-12 text-[#3DDC84]" />
          <h2 className="mt-4 font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Be the First to Test on Android
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            The Android version of SeaJourney is coming soon. Sign up to become a beta tester and get early access.
          </p>
        </div>
        <div className="mt-12 mx-auto max-w-lg">
           <form ref={formRef} action={formAction}>
            <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle>Join the Android Beta Program</CardTitle>
                <CardDescription>Enter your email to get notified when the beta is ready.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="email" className="sr-only">Email</Label>
                <Input 
                  id="email" 
                  name="email" 
                  type="email" 
                  placeholder="you@email.com" 
                  required 
                />
              </CardContent>
              <CardFooter>
                <SubmitButton />
              </CardFooter>
            </Card>
          </form>
        </div>
      </div>
    </section>
  );
}
