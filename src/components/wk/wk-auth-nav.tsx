'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LayoutDashboard, LogOut, User } from 'lucide-react';
import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import type { UserProfile } from '@/lib/types';
import { signOutLocal } from '@/lib/auth-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

function getInitials(profile: UserProfile | null | undefined, email?: string | null) {
  if (profile) {
    const firstName =
      (profile as { first_name?: string }).first_name || profile.firstName;
    const lastName =
      (profile as { last_name?: string }).last_name || profile.lastName;
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName.slice(0, 2).toUpperCase();
    if (profile.username) return profile.username.slice(0, 2).toUpperCase();
  }
  return (email?.[0] || 'U').toUpperCase();
}

function getDisplayName(profile: UserProfile | null | undefined, email?: string | null) {
  if (profile) {
    const firstName =
      (profile as { first_name?: string }).first_name || profile.firstName;
    const lastName =
      (profile as { last_name?: string }).last_name || profile.lastName;
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    if (profile.username) return profile.username;
  }
  return email?.split('@')[0] || 'Account';
}

/**
 * Public-header auth CTA: "Sign in" when logged out, profile avatar when logged in.
 */
export function WkAuthNav({
  showStartFree = true,
  className,
  onNavigate,
}: {
  showStartFree?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const { user, isUserLoading } = useUser();
  const { data: profile } = useDoc<UserProfile>('users', user?.id);

  const initials = getInitials(profile, user?.email);
  const displayName = getDisplayName(profile, user?.email);

  const handleSignOut = async () => {
    await signOutLocal(supabase);
    onNavigate?.();
    router.push('/');
  };

  if (isUserLoading) {
    return (
      <div
        className={cn('h-9 w-9 animate-pulse rounded-full', className)}
        style={{ backgroundColor: 'var(--wk-bg-subtle)' }}
        aria-hidden
      />
    );
  }

  if (user) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wk-accent-ring)]"
              style={{
                backgroundColor: 'var(--wk-accent-soft)',
                color: 'var(--wk-accent)',
                border: '1px solid var(--wk-accent-ring)',
              }}
              aria-label={`Account menu for ${displayName}`}
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--wk-accent)',
                  }}
                >
                  {initials || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium truncate">{displayName}</span>
                {user.email ? (
                  <span className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </span>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onNavigate?.();
                router.push('/dashboard');
              }}
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Link
        href="/login"
        className={cn(
          'text-sm font-medium',
          showStartFree ? 'hidden md:inline-block' : 'inline-block',
        )}
        style={{ color: 'var(--wk-text-soft)' }}
        onClick={onNavigate}
      >
        Sign in
      </Link>
      {showStartFree ? (
        <Link
          href="/signup"
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white shadow-sm"
          style={{
            background:
              'linear-gradient(135deg, var(--wk-accent) 0%, var(--wk-accent-strong) 100%)',
            boxShadow: 'var(--wk-glow)',
          }}
          onClick={onNavigate}
        >
          Start free
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
