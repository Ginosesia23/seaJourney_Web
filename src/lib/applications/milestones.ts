import type { ApplicationRequirement, ApplicationRequirementType, RequirementConfig } from '@/lib/applications/types';

export type CareerMilestoneStatus = 'draft' | 'published' | 'archived';

export type CareerMilestone = {
  id: string;
  track: string;
  level_key: string;
  label: string;
  description: string | null;
  sort_order: number;
  sea_time_metric: string | null;
  sea_time_min: number | null;
  sea_time_source: string | null;
  status: CareerMilestoneStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  requirements?: MilestoneRequirement[];
};

export type MilestoneRequirement = {
  id: string;
  milestone_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  requirement_type: ApplicationRequirementType;
  config: RequirementConfig;
  is_required: boolean;
  created_at?: string;
};

export function mapMilestoneRequirement(row: Record<string, unknown>): MilestoneRequirement {
  return {
    id: row.id as string,
    milestone_id: row.milestone_id as string,
    sort_order: (row.sort_order as number) ?? 0,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    requirement_type: row.requirement_type as ApplicationRequirementType,
    config: (row.config as RequirementConfig) || {},
    is_required: row.is_required !== false,
    created_at: row.created_at as string | undefined,
  };
}

/** Adapt milestone requirements for the shared evaluator. */
export function toApplicationRequirements(
  reqs: MilestoneRequirement[],
): ApplicationRequirement[] {
  return reqs.map((r) => ({
    id: r.id,
    template_id: r.milestone_id,
    sort_order: r.sort_order,
    title: r.title,
    description: r.description,
    requirement_type: r.requirement_type,
    config: r.config,
    is_required: r.is_required,
    created_at: r.created_at,
  }));
}

export const MILESTONE_TRACK_OPTIONS = [
  { value: 'deck', label: 'Deck' },
  { value: 'engine', label: 'Engine' },
  { value: 'interior', label: 'Interior' },
  { value: 'galley', label: 'Galley' },
  { value: 'any', label: 'Any track' },
] as const;
