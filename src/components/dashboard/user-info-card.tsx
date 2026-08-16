'use client';

import { useMemo } from 'react';
import { useDoc } from '@/supabase/database';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, Ship, Shield, User } from 'lucide-react';
import { format } from 'date-fns';
import type { UserProfile, Vessel } from '@/lib/types';
import { cn } from '@/lib/utils';

interface UserInfoCardProps {
  userId: string | undefined;
  /** Override card title (default: Account status) */
  title?: string;
  /** Override description; pass empty string to hide */
  description?: string;
  className?: string;
  /** Compact side-panel styling */
  compact?: boolean;
}

export function UserInfoCard({
  userId,
  title = 'Account status',
  description = 'Role and assignment at a glance',
  className,
  compact = false,
}: UserInfoCardProps) {
  const { data: userProfileRaw, isLoading } = useDoc<UserProfile>('users', userId);

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
      ads: (() => {
        const a = (userProfileRaw as any).ads;
        return a === true || a === false ? a : null;
      })(),
    } as UserProfile;
  }, [userProfileRaw]);

  const { data: activeVessel } = useDoc<Vessel>('vessels', userProfile?.activeVesselId || null);

  if (isLoading) {
    return (
      <section className={cn('flex flex-col rounded-xl border bg-card', className)}>
        <div className="border-b px-4 py-3 sm:px-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!userProfile) {
    return null;
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'crew':
        return 'Crew';
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

  const getRoleBadgeClassName = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400';
      case 'vessel':
        return 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-500/20 dark:text-sky-400';
      case 'captain':
        return 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:bg-violet-500/20 dark:text-violet-400';
      default:
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400';
    }
  };

  const registrationDate = userProfile.registrationDate
    ? new Date(userProfile.registrationDate)
    : null;

  const rows = [
    {
      key: 'position',
      icon: Briefcase,
      label: 'Position',
      value: (
        <Badge variant="outline" className="font-normal">
          {userProfile.position || '—'}
        </Badge>
      ),
    },
    {
      key: 'role',
      icon: Shield,
      label: 'Role',
      value: (
        <Badge variant="outline" className={getRoleBadgeClassName(userProfile.role)}>
          {getRoleLabel(userProfile.role)}
        </Badge>
      ),
    },
    ...(activeVessel
      ? [
          {
            key: 'vessel',
            icon: Ship,
            label: 'Active vessel',
            value: <span className="text-sm font-medium text-right">{activeVessel.name}</span>,
          },
        ]
      : []),
    ...(registrationDate
      ? [
          {
            key: 'member',
            icon: User,
            label: 'Member since',
            value: (
              <span className="text-sm font-medium tabular-nums">
                {format(registrationDate, compact ? 'MMM d, yyyy' : 'MMMM d, yyyy')}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <section className={cn('flex flex-col rounded-xl border bg-card', className)}>
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={cn('flex-1 px-4 py-3 sm:px-5', compact ? 'space-y-2.5' : 'space-y-1')}>
        {rows.map((row, index) => {
          const Icon = row.icon;
          return (
            <div
              key={row.key}
              className={cn(
                'flex items-center justify-between gap-3 py-2',
                index < rows.length - 1 && 'border-b border-border/60',
              )}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{row.label}</span>
              </div>
              {row.value}
            </div>
          );
        })}
      </div>
    </section>
  );
}
