'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Mail } from 'lucide-react';
import LogoOnboarding from '@/components/logo-onboarding';

export default function EmailConfirmPage() {
  return (
    <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8">
        <LogoOnboarding />
      </div>
      <div className="relative w-full max-w-md p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>
        
        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="font-headline text-2xl">Email Confirmed!</CardTitle>
            <CardDescription>
              Your email address has been successfully verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              You can now log in to your SeaJourney account and start tracking your maritime career.
            </p>
            <Button asChild className="w-full rounded-xl" size="lg">
              <Link href="/login">Go to Login</Link>
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Having trouble?{' '}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Contact Support
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
