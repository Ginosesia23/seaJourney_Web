'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ship, User, Briefcase, Loader2, Save } from 'lucide-react';
import {
  vesselDetailsSchema,
  type VesselDetailsFormValues,
  vesselToFormDefaults,
  buildVesselUpdatePayloadFromForm,
} from '@/lib/vessel-details-form';
import { vesselTypes } from '@/lib/vessel-types';
import type { Vessel } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function idleVesselFormDefaults(): VesselDetailsFormValues {
  return vesselToFormDefaults({ type: vesselTypes[0].value, name: '' } as Partial<Vessel> & Record<string, unknown>);
}

type AdminVesselEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: Vessel | null;
  onSaved?: () => void;
};

export function AdminVesselEditDialog({ open, onOpenChange, vessel, onSaved }: AdminVesselEditDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<VesselDetailsFormValues>({
    resolver: zodResolver(vesselDetailsSchema),
    defaultValues: idleVesselFormDefaults(),
  });

  const watchedType = form.watch('type');

  useEffect(() => {
    if (open && vessel) {
      form.reset(vesselToFormDefaults(vessel as Partial<Vessel> & Record<string, unknown>));
    }
  }, [open, vessel, form]);

  const onSubmit = async (data: VesselDetailsFormValues) => {
    if (!vessel?.id) return;
    setIsSaving(true);
    try {
      const updates = buildVesselUpdatePayloadFromForm(data);
      const response = await fetch('/api/vessels/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vesselId: vessel.id, updates }),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.message || responseData.error || 'Failed to update vessel');
      }
      toast({ title: 'Vessel updated', description: 'Changes have been saved.' });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Could not save vessel.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Edit vessel</DialogTitle>
          <DialogDescription>
            Update vessel details for <span className="font-medium text-foreground">{vessel?.name ?? '—'}</span>.
            Admin only.
          </DialogDescription>
        </DialogHeader>

        {vessel ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col max-h-[min(85vh,720px)]">
              <ScrollArea className="flex-1 px-6 max-h-[min(60vh,520px)]">
                <div className="space-y-6 pr-4 pb-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Ship className="h-4 w-4" />
                      Basic information
                    </div>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vessel name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => {
                        const currentValue = watchedType || field.value || '';
                        return (
                          <FormItem>
                            <FormLabel>Vessel type</FormLabel>
                            <Select
                              key={`admin-type-${vessel.id}-${currentValue}`}
                              onValueChange={field.onChange}
                              value={currentValue}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {vesselTypes.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name="imo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IMO number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Official / IMO number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="call_sign"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Call sign</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="mmsi"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MMSI</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <User className="h-4 w-4" />
                      Dimensions & specifications
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="length_m"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Length (m)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="beam"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Beam (m)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="draft"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Draft (m)</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="gross_tonnage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gross tonnage</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" step="0.01" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="number_of_crew"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of crew</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="build_year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Year built</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" min={1900} max={new Date().getFullYear()} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="flag_state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Flag state</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Country of registration" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Briefcase className="h-4 w-4" />
                      Company details
                    </div>
                    <FormField
                      control={form.control}
                      name="management_company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="company_address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company address</FormLabel>
                          <FormControl>
                            <Textarea {...field} rows={3} />
                          </FormControl>
                          <FormDescription>Use line breaks so addresses fit on PDFs.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="company_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="company_phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company phone</FormLabel>
                            <FormControl>
                              <Input {...field} type="tel" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save changes
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
