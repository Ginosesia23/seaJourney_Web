'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * SeaJourney dialog shell — unmistakably branded panel (navy header band,
 * mono eyebrow, structured body/footer). Use for invites, edits, and similar.
 */

type SeaDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogContent> & {
  size?: 'sm' | 'md' | 'lg';
};

const SIZE_CLASS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
} as const;

const SeaDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  SeaDialogContentProps
>(({ className, size = 'md', children, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      // Reset default padded “white box” look
      'gap-0 overflow-hidden border-0 bg-card p-0 shadow-[0_24px_80px_-12px_rgba(15,23,42,0.45)]',
      'rounded-2xl ring-1 ring-black/10 dark:ring-white/10',
      // Close chip sits on the navy header
      '[&>button]:right-3 [&>button]:top-3 [&>button]:z-20',
      '[&>button]:rounded-full [&>button]:border [&>button]:border-white/20',
      '[&>button]:bg-white/10 [&>button]:p-1.5 [&>button]:text-white [&>button]:opacity-100',
      '[&>button]:shadow-none [&>button]:backdrop-blur-sm',
      '[&>button]:hover:bg-white/20 [&>button]:hover:text-white [&>button]:hover:opacity-100',
      '[&>button]:focus:ring-white/40 [&>button]:focus:ring-offset-0',
      SIZE_CLASS[size],
      className,
    )}
    {...props}
  >
    {children}
  </DialogContent>
));
SeaDialogContent.displayName = 'SeaDialogContent';

type SeaDialogHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
};

function SeaDialogHeader({
  className,
  eyebrow,
  title,
  description,
  icon: Icon,
  ...props
}: SeaDialogHeaderProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-[hsl(var(--header))] px-5 pb-5 pt-5 pr-14 text-[hsl(var(--header-foreground))]',
        className,
      )}
      {...props}
    >
      {/* Atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full blur-2xl"
        style={{ backgroundColor: 'hsl(var(--accent) / 0.35)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />

      <div className="relative flex items-start gap-3.5">
        {Icon ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-inner backdrop-blur-sm">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </div>
        ) : null}
        <DialogHeader className="min-w-0 space-y-1.5 text-left">
          {eyebrow ? (
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/65">
              {eyebrow}
            </p>
          ) : null}
          <DialogTitle className="text-xl font-semibold tracking-tight text-white sm:text-[1.35rem]">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="max-w-[34ch] text-[13px] leading-relaxed text-white/70">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
      </div>
    </div>
  );
}

function SeaDialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 space-y-4 overflow-y-auto bg-background px-5 py-5',
        className,
      )}
      {...props}
    />
  );
}

function SeaDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogFooter
      className={cn(
        'gap-2 border-t border-border/80 bg-muted/50 px-5 py-4 sm:justify-end sm:gap-2 sm:space-x-0',
        className,
      )}
      {...props}
    />
  );
}

function SeaDialogLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog as SeaDialog,
  DialogTrigger as SeaDialogTrigger,
  DialogClose as SeaDialogClose,
  SeaDialogContent,
  SeaDialogHeader,
  SeaDialogBody,
  SeaDialogFooter,
  SeaDialogLabel,
  DialogTitle as SeaDialogTitle,
  DialogDescription as SeaDialogDescription,
};
