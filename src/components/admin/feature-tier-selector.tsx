'use client';

import { cn } from '@/lib/utils';
import type { FeatureAudience } from '@/lib/feature-flags/catalog';
import {
  CREW_TIER_LABELS,
  CREW_TIER_LADDER,
  VESSEL_TIER_LABELS,
  VESSEL_TIER_LADDER,
  isFullCrewTierSet,
  toggleCrewTierInSet,
  toggleVesselTiersInSet,
  type CrewTierSlug,
  type VesselTierSlug,
} from '@/lib/feature-flags/tier-access';

type Props = {
  audience: FeatureAudience;
  crewTiers: CrewTierSlug[] | null;
  vesselTiers: VesselTierSlug[] | null;
  disabled?: boolean;
  onChange: (next: {
    crewTiers: CrewTierSlug[] | null;
    vesselTiers: VesselTierSlug[] | null;
  }) => void;
};

function TierChip({
  label,
  checked,
  disabled,
  emphasis,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  emphasis?: 'amber' | 'default';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
        checked
          ? emphasis === 'amber'
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {label}
    </button>
  );
}

function VesselTierChipGroup({
  label,
  vesselTiers,
  disabled,
  onChange,
  hint,
}: {
  label: string;
  vesselTiers: VesselTierSlug[] | null;
  disabled?: boolean;
  onChange: (next: VesselTierSlug[] | null) => void;
  hint?: string;
}) {
  const selected = new Set(
    vesselTiers == null ? VESSEL_TIER_LADDER : vesselTiers,
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {VESSEL_TIER_LADDER.map((tier) => {
          const checked = selected.has(tier);
          return (
            <TierChip
              key={tier}
              label={VESSEL_TIER_LABELS[tier] ?? tier}
              checked={checked}
              disabled={disabled}
              onClick={() => {
                onChange(toggleVesselTiersInSet(tier, !checked, vesselTiers));
              }}
            />
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {hint ||
          'Turning a vessel tier on includes that plan and every higher plan. Turning it off also clears every lower plan.'}
      </p>
    </div>
  );
}

function CrewTierChipGroup({
  crewTiers,
  disabled,
  onChange,
}: {
  crewTiers: CrewTierSlug[] | null;
  disabled?: boolean;
  onChange: (next: CrewTierSlug[] | null) => void;
}) {
  const selected = new Set(
    crewTiers == null ? CREW_TIER_LADDER : crewTiers,
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-foreground">Crew tiers</p>
      <div className="flex flex-wrap gap-1.5">
        {CREW_TIER_LADDER.map((tier) => {
          const checked = selected.has(tier);
          return (
            <TierChip
              key={tier}
              label={CREW_TIER_LABELS[tier] ?? tier}
              checked={checked}
              disabled={disabled}
              emphasis={tier === 'crew_limited' ? 'amber' : 'default'}
              onClick={() => {
                onChange(toggleCrewTierInSet(tier, !checked, crewTiers));
              }}
            />
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Turning a crew tier on selects only that tier. Turning it off also clears
        every lower tier. Crew limited does not auto-include Standard or above —
        select those separately for self-paying accounts.
        {crewTiers != null &&
        !isFullCrewTierSet(crewTiers) &&
        crewTiers.length === 0
          ? ' Currently: no crew tiers.'
          : ''}
      </p>
    </div>
  );
}

export function FeatureTierSelector({
  audience,
  crewTiers,
  vesselTiers,
  disabled,
  onChange,
}: Props) {
  const showCrew = audience === 'crew' || audience === 'both';
  const showVessel =
    audience === 'vessel' || audience === 'both' || audience === 'crew';

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {showCrew ? (
        <CrewTierChipGroup
          crewTiers={crewTiers}
          disabled={disabled}
          onChange={(nextCrew) =>
            onChange({ crewTiers: nextCrew, vesselTiers })
          }
        />
      ) : null}
      {showVessel ? (
        <VesselTierChipGroup
          label={
            audience === 'crew'
              ? 'Vessel package for crew limited'
              : 'Vessel tiers'
          }
          vesselTiers={vesselTiers}
          disabled={disabled}
          onChange={(nextVessel) =>
            onChange({ crewTiers, vesselTiers: nextVessel })
          }
          hint={
            audience === 'crew'
              ? 'Only applies when Crew limited is selected. Turning off Vessel Premium also clears Free and Standard. Higher plans (Professional/Fleet) stay on.'
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
