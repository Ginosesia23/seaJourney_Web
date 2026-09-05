'use client';

import { Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CERTIFICATE_PRESETS, type CertificatePreset } from '@/lib/certificates/presets';
import {
  PROFILE_FIELD_OPTIONS,
  REQUIREMENT_TYPE_LABELS,
  type ApplicationRequirementType,
  type RequirementConfig,
} from '@/lib/applications/types';

export type DraftRequirement = {
  localId: string;
  title: string;
  description: string;
  requirement_type: ApplicationRequirementType;
  is_required: boolean;
  config: RequirementConfig;
};

export type MilestoneOption = {
  id: string;
  label: string;
  level_key: string;
  track: string;
};

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function defaultConfigFor(type: ApplicationRequirementType): RequirementConfig {
  switch (type) {
    case 'profile_fields':
      return {
        fields: [
          'first_name',
          'last_name',
          'email',
          'nationality',
          'date_of_birth',
        ],
      };
    case 'certificate':
      return { minCount: 1, mustNotExpired: true };
    case 'testimonial':
    case 'proof_of_service':
      return { minCount: 1, status: 'approved' };
    case 'sea_time_min':
      return { min: 180, metric: 'atSeaDays', source: 'testimonials' };
    case 'prior_milestone':
      return { minMonths: 18 };
    case 'external_link':
      return { url: '', label: 'Open form' };
    default:
      return {};
  }
}

export function MilestoneRequirementEditor({
  index,
  requirement,
  onChange,
  onRemove,
  availableMilestones = [],
  currentMilestoneId,
  certificatePresets = CERTIFICATE_PRESETS,
}: {
  index: number;
  requirement: DraftRequirement;
  onChange: (next: DraftRequirement) => void;
  onRemove: () => void;
  availableMilestones?: MilestoneOption[];
  currentMilestoneId?: string | null;
  certificatePresets?: CertificatePreset[];
}) {
  const type = requirement.requirement_type;
  const config = requirement.config;
  const presets = certificatePresets.length
    ? certificatePresets
    : CERTIFICATE_PRESETS;

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-background text-xs font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
            {index + 1}
          </span>
          <Badge variant="secondary" className="font-normal">
            {REQUIREMENT_TYPE_LABELS[type]}
          </Badge>
          {!requirement.is_required ? (
            <Badge variant="outline" className="font-normal">
              Optional
            </Badge>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Title</Label>
          <Input
            value={requirement.title}
            onChange={(e) =>
              onChange({ ...requirement, title: e.target.value })
            }
            placeholder="Requirement title"
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={type}
            onValueChange={(value) =>
              onChange({
                ...requirement,
                requirement_type: value as ApplicationRequirementType,
                config: defaultConfigFor(value as ApplicationRequirementType),
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(
                  REQUIREMENT_TYPE_LABELS,
                ) as ApplicationRequirementType[]
              ).map((key) => (
                <SelectItem key={key} value={key}>
                  {REQUIREMENT_TYPE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-2">
          <Checkbox
            id={`req-${requirement.localId}`}
            checked={requirement.is_required}
            onCheckedChange={(checked) =>
              onChange({
                ...requirement,
                is_required: checked === true,
              })
            }
          />
          <Label htmlFor={`req-${requirement.localId}`}>Required</Label>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={requirement.description}
            onChange={(e) =>
              onChange({ ...requirement, description: e.target.value })
            }
            rows={2}
          />
        </div>
      </div>

      {type === 'profile_fields' ? (
        <div className="flex flex-wrap gap-3">
          {PROFILE_FIELD_OPTIONS.map((opt) => {
            const fields = config.fields || [];
            const checked = fields.includes(opt.key);
            return (
              <label
                key={opt.key}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c
                      ? [...fields, opt.key]
                      : fields.filter((f) => f !== opt.key);
                    onChange({
                      ...requirement,
                      config: { ...config, fields: next },
                    });
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      ) : null}

      {type === 'certificate' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Certificate preset</Label>
            <Select
              value={config.presetId || '_custom'}
              onValueChange={(value) => {
                if (value === '_custom') {
                  onChange({
                    ...requirement,
                    config: { ...config, presetId: undefined },
                  });
                  return;
                }
                const preset = presets.find((p) => p.id === value);
                if (!preset || preset.id === 'other') {
                  onChange({
                    ...requirement,
                    config: { ...config, presetId: undefined },
                  });
                  return;
                }
                onChange({
                  ...requirement,
                  title: requirement.title.trim()
                    ? requirement.title
                    : preset.name,
                  description: requirement.description.trim()
                    ? requirement.description
                    : preset.description,
                  config: {
                    ...config,
                    presetId: preset.id,
                    certificateType: preset.type,
                    // Prefer short code in parentheses (EDH, GMDSS) over broad titles
                    nameContains: (
                      preset.name.match(/\(([^)]+)\)/)?.[1]?.split(/[/,]/)[0]?.trim() ||
                      preset.name.split('(')[0].trim()
                    ).slice(0, 40),
                    mustNotExpired: true,
                    minCount: config.minCount ?? 1,
                  },
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick STCW, EDH, ENG1…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_custom">Custom filter</SelectItem>
                {presets.filter((p) => p.id !== 'other').map(
                  (preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Min count"
              value={config.minCount ?? 1}
              onChange={(n) =>
                onChange({ ...requirement, config: { ...config, minCount: n } })
              }
            />
            <div className="space-y-2">
              <Label>Type filter</Label>
              <Input
                value={config.certificateType || ''}
                onChange={(e) =>
                  onChange({
                    ...requirement,
                    config: {
                      ...config,
                      certificateType: e.target.value || undefined,
                    },
                  })
                }
                placeholder="STCW"
              />
            </div>
            <div className="space-y-2">
              <Label>Name contains</Label>
              <Input
                value={config.nameContains || ''}
                onChange={(e) =>
                  onChange({
                    ...requirement,
                    config: {
                      ...config,
                      nameContains: e.target.value || undefined,
                    },
                  })
                }
                placeholder="Basic Safety"
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <Checkbox
                checked={config.mustNotExpired !== false}
                onCheckedChange={(c) =>
                  onChange({
                    ...requirement,
                    config: { ...config, mustNotExpired: c === true },
                  })
                }
              />
              Must not be expired
            </label>
            <NumberField
              label="Min months held (from issue date)"
              value={config.minMonthsHeld ?? 0}
              onChange={(n) =>
                onChange({
                  ...requirement,
                  config: {
                    ...config,
                    minMonthsHeld: n > 0 ? n : undefined,
                  },
                })
              }
            />
          </div>
        </div>
      ) : null}

      {type === 'testimonial' || type === 'proof_of_service' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Min count"
            value={config.minCount ?? 1}
            onChange={(n) =>
              onChange({ ...requirement, config: { ...config, minCount: n } })
            }
          />
          {type === 'testimonial' ? (
            <NumberField
              label="Min at-sea days per testimonial (optional)"
              value={config.minAtSeaDays ?? 0}
              onChange={(n) =>
                onChange({
                  ...requirement,
                  config: { ...config, minAtSeaDays: n || undefined },
                })
              }
            />
          ) : null}
        </div>
      ) : null}

      {type === 'sea_time_min' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Minimum days"
            value={config.min ?? 0}
            onChange={(n) =>
              onChange({ ...requirement, config: { ...config, min: n } })
            }
          />
          <div className="space-y-2">
            <Label>Metric</Label>
            <Select
              value={config.metric || 'atSeaDays'}
              onValueChange={(value) =>
                onChange({
                  ...requirement,
                  config: {
                    ...config,
                    metric: value as RequirementConfig['metric'],
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atSeaDays">At-sea days</SelectItem>
                <SelectItem value="totalDays">Total service days</SelectItem>
                <SelectItem value="standbyDays">Standby days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={config.source || 'testimonials'}
              onValueChange={(value) =>
                onChange({
                  ...requirement,
                  config: {
                    ...config,
                    source: value as RequirementConfig['source'],
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="testimonials">
                  Approved testimonials
                </SelectItem>
                <SelectItem value="tracked">Tracked state logs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {type === 'prior_milestone' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Prerequisite milestone</Label>
            <Select
              value={config.milestoneId || config.levelKey || '_none'}
              onValueChange={(value) => {
                if (value === '_none') {
                  onChange({
                    ...requirement,
                    config: { ...config, milestoneId: undefined, levelKey: undefined },
                  });
                  return;
                }
                const picked = availableMilestones.find(
                  (m) => m.id === value || m.level_key === value,
                );
                if (!picked) return;
                onChange({
                  ...requirement,
                  title: requirement.title.trim()
                    ? requirement.title
                    : `${picked.label} held`,
                  config: {
                    ...config,
                    milestoneId: picked.id,
                    levelKey: picked.level_key,
                    minMonths: config.minMonths ?? 18,
                  },
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select milestone…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Select…</SelectItem>
                {availableMilestones
                  .filter((m) => m.id !== currentMilestoneId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label} ({m.level_key})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Crew must complete that milestone&apos;s requirements before this
              one counts. Duration is measured from when they first fully complete
              the prerequisite.
            </p>
          </div>
          <NumberField
            label="Minimum months held"
            value={config.minMonths ?? 0}
            onChange={(n) =>
              onChange({
                ...requirement,
                config: { ...config, minMonths: n > 0 ? n : undefined },
              })
            }
          />
        </div>
      ) : null}

      {type === 'manual_checklist' ? (
        <div className="space-y-2">
          <Label>Hint for crew</Label>
          <Input
            value={config.hint || ''}
            onChange={(e) =>
              onChange({
                ...requirement,
                config: { ...config, hint: e.target.value || undefined },
              })
            }
            placeholder="e.g. Complete OOW prep modules"
          />
        </div>
      ) : null}

      {type === 'external_link' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={config.url || ''}
              onChange={(e) =>
                onChange({
                  ...requirement,
                  config: { ...config, url: e.target.value || undefined },
                })
              }
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Link label</Label>
            <Input
              value={config.label || ''}
              onChange={(e) =>
                onChange({
                  ...requirement,
                  config: { ...config, label: e.target.value || undefined },
                })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
