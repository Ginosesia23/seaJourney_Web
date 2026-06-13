'use client';

import { format, parse } from 'date-fns';
import {
  Briefcase,
  Calendar,
  Clock,
  Edit,
  Loader2,
  Ship,
  Trash2,
} from 'lucide-react';

import { MiniStatTile } from '@/components/dashboard/mini-stat-tile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Vessel, VesselAssignment } from '@/lib/types';
import { cn } from '@/lib/utils';

type VesselHistoryCardProps = {
  vessel: Vessel;
  vesselAssignments: VesselAssignment[];
  currentAssignment?: VesselAssignment;
  pastAssignments: VesselAssignment[];
  isCrewMember: boolean;
  hasActiveAssignment: boolean;
  isResuming: string | null;
  onEdit: (assignment: VesselAssignment) => void;
  onDelete: (assignment: VesselAssignment) => void;
  onResume: (assignment: VesselAssignment) => void;
  getAssignmentDuration: (assignment: VesselAssignment) => number;
};

function formatAssignmentRange(assignment: VesselAssignment): string {
  const start = format(parse(assignment.startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
  if (!assignment.endDate) return `${start} → Present`;
  const end = format(parse(assignment.endDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
  return `${start} → ${end}`;
}

function formatDurationLabel(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const remainder = days % 365;
    if (remainder === 0) return `${years} yr${years === 1 ? '' : 's'}`;
    return `${years} yr${years === 1 ? '' : 's'} · ${remainder}d`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

function AssignmentActions({
  assignment,
  isCrewMember,
  hasActiveAssignment,
  isResuming,
  onEdit,
  onDelete,
  onResume,
  variant = 'past',
}: {
  assignment: VesselAssignment;
  isCrewMember: boolean;
  hasActiveAssignment: boolean;
  isResuming: string | null;
  onEdit: (assignment: VesselAssignment) => void;
  onDelete: (assignment: VesselAssignment) => void;
  onResume: (assignment: VesselAssignment) => void;
  variant?: 'current' | 'past';
}) {
  const showResume = variant === 'past' && isCrewMember && !hasActiveAssignment;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showResume && (
        <Button
          variant="default"
          size="sm"
          className="h-8 rounded-lg px-2.5 text-xs sm:px-3"
          onClick={() => onResume(assignment)}
          disabled={isResuming === assignment.id}
        >
          {isResuming === assignment.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Ship className="mr-1.5 h-3.5 w-3.5" />
              Resume
            </>
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-lg"
        onClick={() => onEdit(assignment)}
        aria-label="Edit assignment"
      >
        <Edit className="h-4 w-4" />
      </Button>
      {variant === 'past' && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(assignment)}
          aria-label="Delete assignment"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function VesselHistoryCard({
  vessel,
  vesselAssignments,
  currentAssignment,
  pastAssignments,
  isCrewMember,
  hasActiveAssignment,
  isResuming,
  onEdit,
  onDelete,
  onResume,
  getAssignmentDuration,
}: VesselHistoryCardProps) {
  const totalDays = vesselAssignments.reduce(
    (sum, assignment) => sum + getAssignmentDuration(assignment),
    0,
  );
  const isActive = !!currentAssignment;

  const vesselMeta = [
    vessel.type,
    vessel.flag || vessel.flag_state,
    vessel.length_m ? `${vessel.length_m}m` : null,
    vessel.build_year ? `Built ${vessel.build_year}` : null,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-300',
        'hover:border-primary/20 hover:shadow-md',
        isActive && 'ring-1 ring-emerald-500/25',
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1',
          isActive
            ? 'bg-gradient-to-r from-emerald-500 via-sky-500 to-blue-600'
            : 'bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/15 to-transparent',
        )}
        aria-hidden
      />

      <div className="p-5 pb-4">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border',
              isActive
                ? 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-sky-500/10'
                : 'border-border bg-muted/40',
            )}
          >
            <Ship
              className={cn(
                'h-7 w-7',
                isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
              )}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{vessel.name}</h2>
              {isActive && (
                <Badge className="rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Current
                </Badge>
              )}
            </div>

            {vesselMeta.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {vesselMeta.map((item) => (
                  <span
                    key={item}
                    className="rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniStatTile
            label="Assignments"
            value={vesselAssignments.length}
            tone={isActive ? 'green' : 'muted'}
          />
          <MiniStatTile
            label="Total days"
            value={totalDays}
            tone="blue"
            hint={formatDurationLabel(totalDays)}
          />
        </div>
      </div>

      <div className="space-y-4 border-t bg-muted/5 px-5 py-4">
        {currentAssignment && (
          <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 via-background to-sky-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Active tour
                  </span>
                  {currentAssignment.position && (
                    <Badge variant="outline" className="rounded-md text-xs">
                      {currentAssignment.position}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0 text-emerald-600/70 dark:text-emerald-400/70" />
                    <span>{formatAssignmentRange(currentAssignment)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-emerald-600/70 dark:text-emerald-400/70" />
                    <span>{formatDurationLabel(getAssignmentDuration(currentAssignment))}</span>
                  </div>
                </div>
              </div>
              <AssignmentActions
                assignment={currentAssignment}
                isCrewMember={isCrewMember}
                hasActiveAssignment={hasActiveAssignment}
                isResuming={isResuming}
                onEdit={onEdit}
                onDelete={onDelete}
                onResume={onResume}
                variant="current"
              />
            </div>
          </div>
        )}

        {pastAssignments.length > 0 && (
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Previous assignments
            </p>
            <div className="relative space-y-0 pl-5">
              <div
                className="absolute bottom-3 left-[7px] top-2 w-px bg-border"
                aria-hidden
              />
              {pastAssignments.map((assignment) => {
                const duration = getAssignmentDuration(assignment);
                return (
                  <div
                    key={assignment.id}
                    className="group/row relative pb-4 last:pb-0"
                  >
                    <span
                      className="absolute -left-5 top-2 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground/35 transition-colors group-hover/row:bg-primary/60"
                      aria-hidden
                    />
                    <div className="rounded-xl border border-transparent bg-background/60 p-3 transition-colors hover:border-border hover:bg-accent/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                            {assignment.position ? (
                              <span className="text-sm font-medium">{assignment.position}</span>
                            ) : (
                              <span className="text-sm font-medium text-muted-foreground">
                                Assignment
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatAssignmentRange(assignment)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDurationLabel(duration)}
                            </span>
                          </div>
                        </div>
                        <AssignmentActions
                          assignment={assignment}
                          isCrewMember={isCrewMember}
                          hasActiveAssignment={hasActiveAssignment}
                          isResuming={isResuming}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onResume={onResume}
                          variant="past"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
