'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  ChevronRight,
  Monitor,
  Moon,
  PenTool,
  Shield,
  Sun,
  User,
} from 'lucide-react';
import { useMemo } from 'react';

import { useActivityRail } from '@/components/activity-rail/activity-rail-provider';
import { CalendarColorSettings } from '@/components/dashboard/calendar-color-settings';
import {
  SettingsPageHeader,
  SettingsRow,
  SettingsSection,
} from '@/components/dashboard/settings-page-ui';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useDoc } from '@/supabase/database';
import { useUser } from '@/supabase';
import type { UserProfile } from '@/lib/types';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
] as const;

export default function SettingsPage() {
  const { user } = useUser();
  const { data: userProfile } = useDoc<UserProfile>('users', user?.id);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const { open: railOpen, setOpen: setRailOpen } = useActivityRail();

  const role = (userProfile?.role || '').toString().toLowerCase();
  const isCaptain = role === 'captain';
  const isVessel = role === 'vessel';
  const activeTheme = theme || 'system';

  const accountLinks = useMemo(() => {
    const links = [
      {
        href: '/dashboard/profile',
        label: isVessel ? 'Vessel profile' : 'Profile',
        hint: isVessel ? 'Vessel details and account' : 'Name, position, and official details',
        icon: User,
      },
      {
        href: '/dashboard/privacy',
        label: 'Data & privacy',
        hint: 'How we store and use your data',
        icon: Shield,
      },
    ];
    if (isCaptain) {
      links.splice(1, 0, {
        href: '/dashboard/settings/signature',
        label: 'Signature',
        hint: 'Saved captain signature for documents',
        icon: PenTool,
      });
    }
    return links;
  }, [isCaptain, isVessel]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        title="Settings"
        description="Theme, calendar colors, and how the dashboard is laid out on this device."
      />

      <SettingsSection
        title="Appearance"
        description="Applies to the whole dashboard on this browser."
      >
        <SettingsRow
          label="Theme"
          hint={
            resolvedTheme
              ? `Currently ${resolvedTheme} on this device.`
              : 'Choose light, dark, or follow the system.'
          }
        >
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
            {THEMES.map((option) => {
              const Icon = option.icon;
              const selected = activeTheme === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTheme(option.id)}
                  className={cn(
                    'h-7 rounded-[5px] px-2.5 text-xs',
                    selected
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Calendar colors"
        description="How logged days look on Calendar, Daily log, and crew calendars."
      >
        <CalendarColorSettings />
      </SettingsSection>

      <SettingsSection
        title="Layout"
        description="Saved on this device. Keyboard: B for the left nav, period for the attention bar."
      >
        <div className="divide-y divide-border">
          <SettingsRow
            label="Keep left navigation open"
            hint="When off, the sidebar collapses to icons."
          >
            <Switch
              checked={sidebarOpen}
              onCheckedChange={setSidebarOpen}
              aria-label="Keep left navigation open"
            />
          </SettingsRow>
          <SettingsRow
            label="Keep attention bar open"
            hint="The right-hand inbox and missing-log list."
          >
            <Switch
              checked={railOpen}
              onCheckedChange={setRailOpen}
              aria-label="Keep attention bar open"
            />
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title="Account" description="Profile, signature, and privacy." flush>
        <div className="divide-y divide-border">
          {accountLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
