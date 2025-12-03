'use client';

import { UserProfileCard } from '@/components/dashboard/user-profile';
import { SubscriptionCard } from '@/components/dashboard/subscription-card';
import { Separator } from '@/components/ui/separator';

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
            <p className="text-muted-foreground">
              Manage your account information and subscription
            </p>
          </div>
        </div>
        <Separator />
      </div>

      {/* Cards Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Subscription Card - Takes 1/3 of width on large screens */}
        <div className="lg:col-span-1">
          <SubscriptionCard />
        </div>
        
        {/* User Profile Card - Takes 2/3 of width on large screens */}
        <div className="lg:col-span-2">
          <UserProfileCard />
        </div>
      </div>
    </div>
  );
}