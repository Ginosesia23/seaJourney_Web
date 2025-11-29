
'use client';

import { UserProfileCard } from '@/components/dashboard/user-profile';
import { SubscriptionCard } from '@/components/dashboard/subscription-card';

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <SubscriptionCard />
      <UserProfileCard />
    </div>
  );
}
