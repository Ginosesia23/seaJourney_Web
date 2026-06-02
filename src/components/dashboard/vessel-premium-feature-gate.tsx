'use client';

import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type VesselPremiumFeatureGateProps = {
  title: string;
  description: string;
  featureLabel?: string;
};

export function VesselPremiumFeatureGate({
  title,
  description,
  featureLabel = 'This feature',
}: VesselPremiumFeatureGateProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="text-center sm:text-left">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200 sm:mx-0">
          <Lock className="h-6 w-6" />
        </div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <CardDescription>
          {featureLabel} is available on <strong>Vessel Premium</strong> and{' '}
          <strong>Vessel Professional</strong> (and Fleet). {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => router.push('/dashboard/subscription')}>View plans</Button>
      </CardContent>
    </Card>
  );
}
