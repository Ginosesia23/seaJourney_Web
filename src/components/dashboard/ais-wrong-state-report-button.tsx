'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Flag, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import type { DailyStatus } from '@/lib/types';

const STATE_OPTIONS: { value: DailyStatus; label: string }[] = [
  { value: 'underway', label: 'Underway' },
  { value: 'at-anchor', label: 'At anchor' },
  { value: 'in-port', label: 'In port' },
  { value: 'in-yard', label: 'In yard' },
  { value: 'on-leave', label: 'On leave' },
];

function stateLabel(state: string | null | undefined): string {
  if (!state) return 'None logged';
  return STATE_OPTIONS.find((s) => s.value === state)?.label || state;
}

type Props = {
  accessToken: string | null;
  vesselId: string;
  accountType: 'vessel' | 'crew';
  aisEnabled: boolean;
  detectedState?: DailyStatus | string | null;
  aisNavStatus?: string | null;
  aisSpeedKn?: number | null;
  logDate?: string;
};

export function AisWrongStateReportButton({
  accessToken,
  vesselId,
  accountType,
  aisEnabled,
  detectedState,
  aisNavStatus,
  aisSpeedKn,
  logDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggested, setSuggested] = useState<DailyStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const day = logDate || format(new Date(), 'yyyy-MM-dd');
  const detected = (detectedState as DailyStatus | null | undefined) || null;

  const canSubmit = useMemo(() => {
    if (!suggested) return false;
    if (detected && suggested === detected) return false;
    return true;
  }, [suggested, detected]);

  if (!aisEnabled) return null;

  const handleSubmit = async () => {
    if (!accessToken || !canSubmit || !suggested) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/ais/wrong-state-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          vesselId,
          accountType,
          logDate: day,
          suggestedState: suggested,
          notes: notes.trim() || null,
          aisNavStatus: aisNavStatus ?? null,
          aisSpeedKn: aisSpeedKn ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to submit report');
      toast({
        title: 'Report sent',
        description: 'Thanks — an admin will review the AIS state for this day.',
      });
      setOpen(false);
      setSuggested('');
      setNotes('');
    } catch (err) {
      toast({
        title: 'Could not send report',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Flag className="mr-1.5 h-3.5 w-3.5" />
        Report wrong
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Report wrong AIS state
            </DialogTitle>
            <DialogDescription>
              Tell us what today&apos;s state should be. We keep the AIS result for
              review and will use reports to improve detection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">AIS set today to</div>
              <div className="font-medium">{stateLabel(detected)}</div>
              {(aisNavStatus || aisSpeedKn != null) && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {[
                    aisNavStatus,
                    aisSpeedKn != null ? `${Number(aisSpeedKn).toFixed(1)} kn` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Correct state</Label>
              <Select
                value={suggested}
                onValueChange={(v) => setSuggested(v as DailyStatus)}
              >
                <SelectTrigger className="h-9 rounded-lg">
                  <SelectValue placeholder="Select the right state" />
                </SelectTrigger>
                <SelectContent>
                  {STATE_OPTIONS.filter((s) => s.value !== detected).map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Alongside in marina, not underway"
                className="min-h-[72px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={!canSubmit || submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Submit report'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
