'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import type { VesselGeneratedTestimonial } from '@/lib/types';
import {
  AMSA_DUTIES_PERFORMED,
  AMSA_DUTY_LABELS,
  AMSA_MODE_LABELS,
  AMSA_MODE_OF_OPERATION,
  AMSA_PROPULSION_LABELS,
  AMSA_PROPULSION_TYPE,
  AMSA_TYPE_LABELS,
  AMSA_TYPE_OF_OPERATION,
  type AmsaSeaServiceReference,
  defaultAmsaSeaServiceReference,
  parseAmsaReferenceFromDb,
} from '@/lib/amsa-sea-service-reference';
import { cn } from '@/lib/utils';

type Props = {
  testimonial: VesselGeneratedTestimonial;
  supabase: SupabaseClient;
  onSaved: (updated: VesselGeneratedTestimonial) => void;
  disabled?: boolean;
};

export function VesselGeneratedAmsaReferencePanel({
  testimonial,
  supabase,
  onSaved,
  disabled = false,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedRef = parseAmsaReferenceFromDb(testimonial.amsa_reference_data);
  const [draft, setDraft] = useState<AmsaSeaServiceReference>(() =>
    savedRef ?? defaultAmsaSeaServiceReference(),
  );

  useEffect(() => {
    setDraft(parseAmsaReferenceFromDb(testimonial.amsa_reference_data) ?? defaultAmsaSeaServiceReference());
  }, [testimonial.id, testimonial.amsa_reference_data]);

  const toComparable = (ref: AmsaSeaServiceReference) => ({
    mode_of_operation: ref.mode_of_operation,
    type_of_operation: [...ref.type_of_operation].sort(),
    duties_performed: [...ref.duties_performed].sort(),
    propulsion_type: [...ref.propulsion_type].sort(),
  });
  const hasSavedReference = savedRef !== null;
  const hasUnsavedChanges =
    JSON.stringify(toComparable(draft)) !==
    JSON.stringify(toComparable(savedRef ?? defaultAmsaSeaServiceReference()));

  const toggleType = (code: (typeof AMSA_TYPE_OF_OPERATION)[number]) => {
    setDraft((d) => {
      const set = new Set(d.type_of_operation);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...d, type_of_operation: [...set] as AmsaSeaServiceReference['type_of_operation'] };
    });
  };

  const toggleDuty = (code: (typeof AMSA_DUTIES_PERFORMED)[number]) => {
    setDraft((d) => {
      const set = new Set(d.duties_performed);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...d, duties_performed: [...set] as AmsaSeaServiceReference['duties_performed'] };
    });
  };

  const toggleProp = (code: (typeof AMSA_PROPULSION_TYPE)[number]) => {
    setDraft((d) => {
      const set = new Set(d.propulsion_type);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...d, propulsion_type: [...set] as AmsaSeaServiceReference['propulsion_type'] };
    });
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        mode_of_operation: draft.mode_of_operation,
        type_of_operation: draft.type_of_operation,
        duties_performed: draft.duties_performed,
        propulsion_type: draft.propulsion_type,
      };
      const { data, error } = await supabase
        .from('vessel_generated_testimonials')
        .update({
          amsa_reference_data: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', testimonial.id)
        .select()
        .single();

      if (error) {
        toast({
          title: 'Could not save',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      onSaved(data as VesselGeneratedTestimonial);
      toast({ title: 'Saved', description: 'AMSA reference data updated for this document.' });
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, supabase, testimonial.id, toast]);

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2.5 text-xs"
            disabled={disabled}
          >
            <span className="flex items-center gap-2">
              <span>AMSA ref</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  hasSavedReference
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                )}
              >
                {hasSavedReference ? 'Added' : 'Missing'}
              </span>
              {hasUnsavedChanges ? (
                <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-medium">
                  Unsaved
                </span>
              ) : null}
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(92vw,720px)] space-y-4 p-4">
        <p className="text-xs text-muted-foreground">
          (1) Choose one mode. (2)–(4) You can select multiple codes. These appear on the AMSA PDF.
        </p>

        <div className="space-y-2">
          <Label className="text-sm font-medium">(1) Mode of operation</Label>
          <RadioGroup
            value={draft.mode_of_operation}
            onValueChange={(v) =>
              setDraft((d) => ({
                ...d,
                mode_of_operation: v as AmsaSeaServiceReference['mode_of_operation'],
              }))
            }
            className="grid gap-2 sm:grid-cols-1"
          >
            {AMSA_MODE_OF_OPERATION.map((code) => (
              <div key={code} className="flex items-start gap-2">
                <RadioGroupItem value={code} id={`mode-${testimonial.id}-${code}`} className="mt-0.5" />
                <Label htmlFor={`mode-${testimonial.id}-${code}`} className="text-sm font-normal leading-snug cursor-pointer">
                  <span className="font-mono font-medium">{code}</span> — {AMSA_MODE_LABELS[code]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">(2) Type of operation</Label>
          <div className="flex flex-wrap gap-3">
            {AMSA_TYPE_OF_OPERATION.map((code) => (
              <label
                key={code}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={draft.type_of_operation.includes(code)}
                  onCheckedChange={() => toggleType(code)}
                />
                <span>
                  <span className="font-mono font-medium">{code}</span> {AMSA_TYPE_LABELS[code]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">(3) Duties performed</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {AMSA_DUTIES_PERFORMED.map((code) => (
              <label
                key={code}
                className="flex items-start gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={draft.duties_performed.includes(code)}
                  onCheckedChange={() => toggleDuty(code)}
                />
                <span>
                  <span className="font-mono font-medium">{code}</span> — {AMSA_DUTY_LABELS[code]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">(4) Propulsion type</Label>
          <div className="flex flex-wrap gap-3">
            {AMSA_PROPULSION_TYPE.map((code) => (
              <label
                key={code}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  checked={draft.propulsion_type.includes(code)}
                  onCheckedChange={() => toggleProp(code)}
                />
                <span>
                  <span className="font-mono font-medium">{code}</span> {AMSA_PROPULSION_LABELS[code]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          className="rounded-xl"
          onClick={handleSave}
          disabled={disabled || saving}
        >
          {saving ? 'Saving…' : 'Save reference data'}
        </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
