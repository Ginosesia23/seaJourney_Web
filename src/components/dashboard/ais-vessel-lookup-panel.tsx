'use client';

import { useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';
import type {
  AisExistingVesselMatch,
  AisVesselLookupResponse,
  AisVesselLookupResultItem,
  AisVesselLookupSelection,
} from '@/lib/ais/vessel-lookup-types';
import { cn } from '@/lib/utils';

function formatAisVesselSummary(autofill: VesselRegistrationAutofill): string {
  return [
    autofill.aisTypeSpecific || autofill.aisType,
    autofill.countryName,
    autofill.mmsi ? `MMSI ${autofill.mmsi}` : null,
    autofill.officialNumber ? `IMO ${autofill.officialNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatAisVesselSpecs(autofill: VesselRegistrationAutofill): string | null {
  const specs = [
    autofill.length_m ? `${autofill.length_m}m LOA` : null,
    autofill.gross_tonnage ? `${autofill.gross_tonnage} GT` : null,
    autofill.build_year ? `Built ${autofill.build_year}` : null,
  ].filter(Boolean);

  return specs.length > 0 ? specs.join(' · ') : null;
}

function AisLookupPreview({
  autofill,
  existingInDatabase,
}: {
  autofill: VesselRegistrationAutofill;
  existingInDatabase?: AisExistingVesselMatch | null;
}) {
  const specs = formatAisVesselSpecs(autofill);

  return (
    <div>
      <p className="text-sm font-semibold">{autofill.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatAisVesselSummary(autofill)}</p>
      {specs ? <p className="mt-1 text-xs text-muted-foreground/80">{specs}</p> : null}
      {existingInDatabase ? (
        <p className="mt-2 text-xs font-medium text-primary">
          {existingInDatabase.hasManager
            ? 'Official vessel profile on SeaJourney'
            : 'Already on SeaJourney — will use existing profile'}
        </p>
      ) : null}
    </div>
  );
}

function AisLookupResultRow({
  item,
  onSelect,
  allowManagedVessels,
}: {
  item: AisVesselLookupResultItem;
  onSelect: () => void;
  allowManagedVessels: boolean;
}) {
  const { autofill, existingInDatabase } = item;
  const specs = formatAisVesselSpecs(autofill);
  const disabled = Boolean(existingInDatabase?.hasManager && !allowManagedVessels);

  return (
    <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{autofill.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatAisVesselSummary(autofill)}</p>
        {specs ? (
          <p className="mt-0.5 text-xs text-muted-foreground/80">{specs}</p>
        ) : null}
        {existingInDatabase ? (
          <p className="mt-1 text-[11px] font-medium text-primary">
            {existingInDatabase.hasManager
              ? 'Official vessel on SeaJourney'
              : 'On SeaJourney'}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onSelect}
        disabled={disabled}
        className="h-8 shrink-0 px-3 text-xs"
      >
        {existingInDatabase ? 'Use' : 'Select'}
      </Button>
    </div>
  );
}

export type AisVesselLookupPanelProps = {
  onSelect: (selection: AisVesselLookupSelection) => void | Promise<void>;
  compact?: boolean;
  className?: string;
  /** Crew flows allow picking managed/official vessels. Signup blocks those. */
  allowManagedVessels?: boolean;
  onAutofillOnly?: (autofill: VesselRegistrationAutofill) => void;
};

export function AisVesselLookupPanel({
  onSelect,
  compact = false,
  className,
  allowManagedVessels = true,
  onAutofillOnly,
}: AisVesselLookupPanelProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AisVesselLookupResponse | null>(null);

  const handleLookup = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast({
        title: 'Enter a search term',
        description: 'Use a vessel name, 9-digit MMSI, or 7-digit IMO.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/ais/vessel-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = (await response.json()) as AisVesselLookupResponse;

      const hasSingle = data.mode === 'single' && data.autofill;
      const hasList = data.mode === 'list' && (data.results?.length ?? 0) > 0;

      if (!response.ok || !data.found || (!hasSingle && !hasList)) {
        toast({
          title: 'Vessel not found',
          description:
            data.error || 'No AIS record found. Try a different search or enter details manually.',
          variant: 'destructive',
        });
        setResult({ found: false, error: data.error });
        return;
      }

      setResult(data);
    } catch (error) {
      console.error('AIS vessel lookup failed:', error);
      toast({
        title: 'Lookup failed',
        description: 'Could not reach the AIS service. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const applySelection = async (selection: AisVesselLookupSelection) => {
    if (selection.existingInDatabase?.hasManager && !allowManagedVessels) {
      toast({
        title: 'Vessel already managed',
        description: 'This vessel is already registered on SeaJourney.',
        variant: 'destructive',
      });
      return;
    }

    if (onAutofillOnly && !selection.existingInDatabase) {
      onAutofillOnly(selection.autofill);
      setResult(null);
      toast({
        title: 'Details applied',
        description: 'Review the form fields below before saving.',
      });
      return;
    }

    await onSelect(selection);
    setResult(null);
    setQuery('');
  };

  const handleApplySingle = () => {
    if (!result?.autofill) return;
    void applySelection({
      autofill: result.autofill,
      existingInDatabase: result.existingInDatabase ?? null,
    });
  };

  return (
    <div
      className={cn(
        'rounded-xl border bg-muted/30',
        compact ? 'p-2' : 'p-3',
        className,
      )}
    >
      {!compact ? (
        <div className="mb-2">
          <p className="text-sm font-medium">Look up via AIS</p>
          <p className="text-xs text-muted-foreground">
            Search by name, MMSI, or IMO to auto-fill vessel details.
          </p>
        </div>
      ) : (
        <p className="mb-2 text-xs font-medium text-muted-foreground">AIS lookup</p>
      )}

      <div className={cn('flex gap-2', compact ? 'flex-col' : 'flex-col sm:flex-row')}>
        <Input
          placeholder={compact ? 'Name, MMSI, or IMO' : 'e.g. Octopus, 566093000, IMO 9525338'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (result) setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleLookup();
            }
          }}
          className={cn('bg-background', compact ? 'h-8 text-xs' : 'h-9')}
        />
        <Button
          type="button"
          size={compact ? 'sm' : 'default'}
          onClick={() => void handleLookup()}
          disabled={loading || !query.trim()}
          className={cn(!compact && 'sm:shrink-0')}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {!compact ? <span className="ml-2">Look up</span> : null}
        </Button>
      </div>

      {result?.found && result.mode === 'list' && result.results ? (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground">
              {result.totalCount === 1
                ? '1 match'
                : `${result.totalCount ?? result.results.length} matches`}
              {result.query ? ` for “${result.query}”` : ''}
            </p>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setQuery('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          {result.truncated ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              Showing first {result.results.length}. Add more of the name to narrow results.
            </p>
          ) : null}
          <div className="max-h-48 overflow-y-auto rounded-lg border bg-background">
            {result.results.map((item) => (
              <AisLookupResultRow
                key={item.uuid ?? `${item.autofill.mmsi}-${item.autofill.name}`}
                item={item}
                allowManagedVessels={allowManagedVessels}
                onSelect={() =>
                  void applySelection({
                    autofill: item.autofill,
                    existingInDatabase: item.existingInDatabase,
                  })
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      {result?.found && result.mode === 'single' && result.autofill ? (
        <div className="mt-2 rounded-lg border bg-background p-3">
          <AisLookupPreview
            autofill={result.autofill}
            existingInDatabase={result.existingInDatabase}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setResult(null)}
            >
              Dismiss
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApplySingle}
              disabled={Boolean(result.existingInDatabase?.hasManager && !allowManagedVessels)}
            >
              {result.existingInDatabase ? 'Use vessel' : 'Use details'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AisAutofillAppliedBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary',
        className,
      )}
    >
      <Check className="h-3.5 w-3.5 shrink-0" />
      AIS details applied — review before saving.
    </div>
  );
}
