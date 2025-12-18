'use client';

import { useMemo } from 'react';
import { useDoc, useCollection } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { User, Briefcase, Ship, Shield } from 'lucide-react';
import { format } from 'date-fns';
import type { UserProfile, Vessel } from '@/lib/types';

interface UserInfoCardProps {
  userId: string | undefined;
}

export function UserInfoCard({ userId }: UserInfoCardProps) {
  const { data: userProfileRaw, isLoading } = useDoc<UserProfile>('users', userId);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    return {
      ...userProfileRaw,
      position: (userProfileRaw as any).position || userProfileRaw.position || null,
      role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
      email: (userProfileRaw as any).email || userProfileRaw.email || '',
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName || null,
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName || null,
      activeVesselId: (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId || null,
      registrationDate: (userProfileRaw as any).registration_date || (userProfileRaw as any).registrationDate || null,
    } as UserProfile;
  }, [userProfileRaw]);

  // Fetch active vessel details if available
  const { data: activeVessel } = useDoc<Vessel>('vessels', userProfile?.activeVesselId || null);

  if (isLoading) {
    return (
      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!userProfile) {
    return null;
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'crew':
        return 'Crew Member';
      case 'captain':
        return 'Captain';
      case 'vessel':
        return 'Vessel Manager';
      case 'admin':
        return 'Administrator';
      default:
        return role;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive'; // Red - Highest access level
      case 'vessel':
        return 'default'; // Primary blue - Vessel management access
      default:
        return 'secondary'; // Gray - Standard crew access
    }
  };

  const getRoleBadgeClassName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400';
      case 'vessel':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400';
      case 'captain':
        return 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400';
    }
  };

  const registrationDate = userProfile.registrationDate 
    ? new Date(userProfile.registrationDate) 
    : null;

  return (
    <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Account Information
        </CardTitle>
        <CardDescription>
          Your account details and role information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Position */}
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-4 w-4" />
            <span>Position</span>
          </div>
          <Badge variant="outline" className="font-normal">
            {userProfile.position || '—'}
          </Badge>
        </div>

        {/* Role */}
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Role</span>
          </div>
          <Badge 
            variant="outline" 
            className={getRoleBadgeClassName(userProfile.role)}
          >
            {getRoleLabel(userProfile.role)}
          </Badge>
        </div>

        {/* Active Vessel */}
        {activeVessel && (
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Ship className="h-4 w-4" />
              <span>Active Vessel</span>
            </div>
            <span className="text-sm font-medium">{activeVessel.name}</span>
          </div>
        )}

        {/* Registration Date */}
        {registrationDate && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Member Since</span>
            </div>
            <span className="text-sm font-medium">
              {format(registrationDate, 'MMMM d, yyyy')}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
