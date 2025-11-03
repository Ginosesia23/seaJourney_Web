'use client';

import { useUser, useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { UserProfileCard } from '@/components/dashboard/user-profile';

export default function DashboardPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    if (auth) {
      auth.signOut();
      router.push('/');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
              Dashboard
            </h1>
            <p className="mt-4 text-lg text-foreground/80">
              Welcome back, {user?.displayName || user?.email || 'User'}!
            </p>
            
            <div className="mt-8">
              <UserProfileCard />
            </div>

            <div className="mt-8">
              <Button onClick={handleSignOut} variant="outline">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
