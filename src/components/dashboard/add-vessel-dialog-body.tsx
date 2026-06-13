'use client';

import type { UseFormReturn } from 'react-hook-form';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  AisAutofillAppliedBanner,
  AisVesselLookupPanel,
} from '@/components/dashboard/ais-vessel-lookup-panel';
import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';
import { resolveVesselFromAisSelection } from '@/lib/ais/resolve-vessel-from-ais';
import { vesselTypes } from '@/lib/vessel-types';
import { useToast } from '@/hooks/use-toast';

export type AddVesselFormValues = {
  name: string;
  type: string;
  officialNumber?: string;
};

type AddVesselDialogBodyProps = {
  form: UseFormReturn<AddVesselFormValues>;
  onSubmit: (data: AddVesselFormValues) => void | Promise<void>;
  isSaving: boolean;
  supabase: SupabaseClient;
  onVesselResolved: (vesselId: string, vesselName: string) => void;
  aisAutofillExtras: VesselRegistrationAutofill | null;
  setAisAutofillExtras: (value: VesselRegistrationAutofill | null) => void;
};

export function AddVesselDialogBody({
  form,
  onSubmit,
  isSaving,
  supabase,
  onVesselResolved,
  aisAutofillExtras,
  setAisAutofillExtras,
}: AddVesselDialogBodyProps) {
  const { toast } = useToast();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <AisVesselLookupPanel
          onAutofillOnly={(autofill) => {
            form.setValue('name', autofill.name);
            form.setValue('type', autofill.type);
            form.setValue('officialNumber', autofill.officialNumber || '');
            setAisAutofillExtras(autofill);
          }}
          onSelect={async (selection) => {
            try {
              const { vesselId, vesselName, created, linkedExisting } =
                await resolveVesselFromAisSelection(selection);
              onVesselResolved(vesselId, vesselName);
              form.reset();
              setAisAutofillExtras(null);
              toast({
                title: linkedExisting || !created ? 'Vessel linked' : 'Vessel created',
                description: linkedExisting || !created
                  ? `${vesselName} is already on SeaJourney — using that profile.`
                  : `${vesselName} is ready for your assignment.`,
              });
            } catch (error: unknown) {
              console.error('AIS vessel resolve failed:', error);
              toast({
                title: 'Error',
                description:
                  error instanceof Error ? error.message : 'Failed to add vessel from AIS.',
                variant: 'destructive',
              });
            }
          }}
        />

        {aisAutofillExtras ? <AisAutofillAppliedBanner /> : null}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vessel Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., M/Y Odyssey" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vessel Type</FormLabel>
              <FormControl>
                <SearchableSelect
                  options={vesselTypes}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Select a vessel type"
                  searchPlaceholder="Search vessel types..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="officialNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Official Number (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., IMO 1234567" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter className="gap-2 pt-4">
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="rounded-lg">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isSaving} className="rounded-lg">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Vessel
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
