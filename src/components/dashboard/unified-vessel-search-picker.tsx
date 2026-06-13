'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Check, ChevronsUpDown, Loader2, Search, Ship, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';
import { resolveVesselFromAisSelection } from '@/lib/ais/resolve-vessel-from-ais';
import type {
  AisVesselLookupResponse,
  AisVesselLookupResultItem,
  AisVesselLookupSelection,
} from '@/lib/ais/vessel-lookup-types';
import { vesselTypes } from '@/lib/vessel-types';
import { wkInputCls } from '@/components/wk/wk-auth-shell';
import { cn } from '@/lib/utils';

type KnownVessel = {
  id: string;
  name: string;
  type?: string;
  officialNumber?: string | null;
  mmsi?: string | null;
  flag?: string | null;
  length_m?: number | null;
  beam?: number | null;
  gross_tonnage?: number | null;
  build_year?: number | null;
};

function formatVesselSpecs(parts: {
  length_m?: number | null;
  beam?: number | null;
  gross_tonnage?: number | null;
  build_year?: number | null;
}): string | null {
  const specs = [
    parts.length_m != null ? `${parts.length_m}m LOA` : null,
    parts.beam != null ? `${parts.beam}m beam` : null,
    parts.gross_tonnage != null ? `${parts.gross_tonnage} GT` : null,
    parts.build_year != null ? `Built ${parts.build_year}` : null,
  ].filter(Boolean);

  return specs.length > 0 ? specs.join(' · ') : null;
}

function formatAisSummary(autofill: VesselRegistrationAutofill): string {
  return [
    autofill.aisTypeSpecific || autofill.aisType,
    autofill.countryName || autofill.flag,
    autofill.mmsi ? `MMSI ${autofill.mmsi}` : null,
    autofill.officialNumber ? `IMO ${autofill.officialNumber}` : null,
    autofill.call_sign ? `Call ${autofill.call_sign}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatLocalVesselSummary(vessel: KnownVessel): string {
  const typeLabel =
    vesselTypes.find((t) => t.value === vessel.type)?.label || vessel.type;
  return [
    typeLabel,
    vessel.flag,
    vessel.mmsi ? `MMSI ${vessel.mmsi}` : null,
    vessel.officialNumber ? `IMO ${vessel.officialNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function VesselResultDetails({
  name,
  summary,
  specs,
  footnote,
  auth = false,
}: {
  name: string;
  summary?: string | null;
  specs?: string | null;
  footnote?: React.ReactNode;
  auth?: boolean;
}) {
  if (auth) {
    return (
      <div className="min-w-0 flex-1">
        <div className="wk-vessel-picker-row-name">{name}</div>
        {summary ? <div className="wk-vessel-picker-row-meta">{summary}</div> : null}
        {specs ? <div className="wk-vessel-picker-row-specs">{specs}</div> : null}
        {footnote}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 text-left">
      <div className="font-medium leading-snug">{name}</div>
      {summary ? <div className="text-xs leading-relaxed text-muted-foreground">{summary}</div> : null}
      {specs ? (
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground/90">{specs}</div>
      ) : null}
      {footnote}
    </div>
  );
}

function shouldFetchAis(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 9 || digits.length === 7) return true;
  if (/^\s*[\d\s-]+\s*$/.test(trimmed)) return false;
  return trimmed.length >= 3;
}

async function vesselHasManager(vesselId: string): Promise<boolean> {
  try {
    const response = await fetch('/api/vessels/check-manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vesselId }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.hasManager);
  } catch {
    return false;
  }
}

export type UnifiedVesselSearchPickerProps = {
  value: string;
  onChange: (vesselId: string, vesselName: string, vesselType?: string) => void;
  supabase: SupabaseClient;
  knownVessels?: KnownVessel[];
  disabled?: boolean;
  blockManagedVessels?: boolean;
  variant?: 'default' | 'auth';
  placeholder?: string;
  triggerClassName?: string;
  inputClassName?: string;
};

export function UnifiedVesselSearchPicker({
  value,
  onChange,
  supabase,
  knownVessels = [],
  disabled = false,
  blockManagedVessels = false,
  variant = 'default',
  placeholder = 'Search by name, MMSI, or IMO…',
  triggerClassName,
  inputClassName,
}: UnifiedVesselSearchPickerProps) {
  const isAuth = variant === 'auth';
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [localResults, setLocalResults] = useState<KnownVessel[]>([]);
  const [aisResults, setAisResults] = useState<AisVesselLookupResultItem[]>([]);
  const [aisSingle, setAisSingle] = useState<{
    autofill: VesselRegistrationAutofill;
    existingInDatabase: AisVesselLookupSelection['existingInDatabase'];
  } | null>(null);
  const [isSearchingLocal, setIsSearchingLocal] = useState(false);
  const [isSearchingAis, setIsSearchingAis] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>('');

  const selectedVessel = useMemo(
    () => knownVessels.find((v) => v.id === value) ?? null,
    [knownVessels, value],
  );

  const displayLabel = selectedVessel?.name || selectedLabel || '';

  useEffect(() => {
    if (selectedVessel) {
      setSelectedLabel(selectedVessel.name);
    } else if (!value) {
      setSelectedLabel('');
    }
  }, [selectedVessel, value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setLocalResults([]);
      setAisResults([]);
      setAisSingle(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearchingLocal(true);
      const localPromise = fetch('/api/vessels/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerm: trimmed }),
      })
        .then(async (response) => {
          if (!response.ok) return [] as KnownVessel[];
          const data = await response.json();
          return (data.vessels || []) as KnownVessel[];
        })
        .catch(() => [] as KnownVessel[]);

      let aisPromise: Promise<AisVesselLookupResponse | null> = Promise.resolve(null);
      if (shouldFetchAis(trimmed)) {
        setIsSearchingAis(true);
        aisPromise = fetch('/api/ais/vessel-lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
        })
          .then(async (response) => {
            const data = (await response.json()) as AisVesselLookupResponse;
            if (!response.ok || !data.found) return null;
            return data;
          })
          .catch(() => null);
      } else {
        setIsSearchingAis(false);
        setAisResults([]);
        setAisSingle(null);
      }

      const [local, ais] = await Promise.all([localPromise, aisPromise]);
      setLocalResults(local);
      setIsSearchingLocal(false);

      if (ais?.mode === 'list' && ais.results) {
        setAisResults(ais.results);
        setAisSingle(null);
      } else if (ais?.mode === 'single' && ais.autofill) {
        setAisResults([]);
        setAisSingle({
          autofill: ais.autofill,
          existingInDatabase: ais.existingInDatabase ?? null,
        });
      } else {
        setAisResults([]);
        setAisSingle(null);
      }
      setIsSearchingAis(false);
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [open, query]);

  const selectLocalVessel = async (vessel: KnownVessel) => {
    if (blockManagedVessels) {
      const hasManager = await vesselHasManager(vessel.id);
      if (hasManager) {
        toast({
          title: 'Vessel Already Managed',
          description:
            'This vessel is already being managed by another account. Please select a different vessel.',
          variant: 'destructive',
        });
        return;
      }
    }

    setSelectedLabel(vessel.name);
    onChange(vessel.id, vessel.name, vessel.type);
    setOpen(false);
    setQuery('');
  };

  const selectAisSelection = async (selection: AisVesselLookupSelection) => {
    if (blockManagedVessels && selection.existingInDatabase?.hasManager) {
      toast({
        title: 'Vessel Already Managed',
        description:
          'This vessel is already registered on SeaJourney. Please contact the existing manager or choose a different vessel.',
        variant: 'destructive',
      });
      return;
    }

    setIsResolving(true);
    try {
      const { vesselId, vesselName, created, linkedExisting } =
        await resolveVesselFromAisSelection(selection);

      if (blockManagedVessels && (await vesselHasManager(vesselId))) {
        toast({
          title: 'Vessel Already Managed',
          description:
            'This vessel is already being managed by another account. Please select a different vessel.',
          variant: 'destructive',
        });
        return;
      }

      const typeLabel =
        vesselTypes.find((t) => t.value === selection.autofill.type)?.label ||
        selection.autofill.aisTypeSpecific ||
        selection.autofill.aisType ||
        undefined;
      setSelectedLabel(vesselName);
      onChange(vesselId, vesselName, typeLabel);
      setOpen(false);
      setQuery('');
      toast({
        title: linkedExisting || !created ? 'Vessel linked' : 'Vessel added',
        description: linkedExisting || !created
          ? `${vesselName} is already on SeaJourney — using that profile.`
          : `${vesselName} is ready for your dates.`,
      });
    } catch (error: unknown) {
      console.error('AIS vessel resolve failed:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to add vessel from AIS.',
        variant: 'destructive',
      });
    } finally {
      setIsResolving(false);
    }
  };

  const clearSelection = (event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedLabel('');
    onChange('', '', undefined);
    setQuery('');
  };

  const isLoading = isSearchingLocal || isSearchingAis || isResolving;
  const hasResults =
    localResults.length > 0 || aisResults.length > 0 || Boolean(aisSingle);
  const trimmedQuery = query.trim();

  const renderAisFootnote = (managed: boolean, hasExisting: boolean) => {
    if (!hasExisting) return null;
    const label = managed
      ? 'Already managed on SeaJourney'
      : 'Already on SeaJourney — will use existing profile';

    if (isAuth) {
      return <div className="wk-vessel-picker-row-note">{label}</div>;
    }

    return <div className="mt-1 text-[11px] font-medium text-primary">{label}</div>;
  };

  const triggerContent = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {isAuth ? (
          <Ship
            className={cn(
              'h-4 w-4 shrink-0',
              displayLabel ? 'wk-vessel-picker-icon' : 'opacity-50',
            )}
            style={!displayLabel ? { color: 'var(--wk-text-muted)' } : undefined}
          />
        ) : null}
        <span className="truncate">{displayLabel || placeholder}</span>
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-1">
        {displayLabel ? (
          <span
            role="button"
            tabIndex={0}
            onClick={clearSelection}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clearSelection(e as unknown as React.MouseEvent);
              }
            }}
            className={cn(
              'rounded-md p-0.5 transition-colors',
              isAuth
                ? 'text-[var(--wk-text-muted)] hover:text-[var(--wk-text)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Clear vessel selection"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <ChevronsUpDown
          className={cn('h-4 w-4', isAuth ? 'text-[var(--wk-text-muted)]' : 'opacity-50')}
        />
      </span>
    </>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {isAuth ? (
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-open={open}
            data-selected={Boolean(displayLabel)}
            className={cn(wkInputCls, 'wk-vessel-picker-trigger', triggerClassName)}
            style={!displayLabel ? { color: 'var(--wk-text-muted)' } : undefined}
          >
            {triggerContent}
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-11 w-full justify-between rounded-xl border-input bg-background px-3.5 font-normal shadow-sm transition-shadow',
              open && 'ring-2 ring-primary/15',
              !displayLabel && 'text-muted-foreground',
              triggerClassName,
            )}
          >
            {triggerContent}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-[var(--radix-popover-trigger-width)] overflow-hidden p-0',
          isAuth
            ? 'wk wk-vessel-picker-popover rounded-xl'
            : 'rounded-xl border shadow-lg',
        )}
        align="start"
      >
        <div className={cn(isAuth ? 'wk-vessel-picker-search-wrap' : 'border-b bg-muted/40 p-2.5')}>
          <div className="relative">
            <Search
              className={cn(
                'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                isAuth ? 'text-[var(--wk-text-muted)]' : 'text-muted-foreground',
              )}
            />
            {isAuth ? (
              <input
                type="text"
                placeholder="Name, MMSI, or IMO"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="wk-vessel-picker-search"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
            ) : (
              <Input
                placeholder="Name, MMSI, or IMO"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={cn(
                  'h-10 rounded-lg border-input/80 bg-background pl-9 shadow-none',
                  inputClassName,
                )}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
            )}
          </div>
        </div>

        <div className={cn('max-h-[420px] overflow-y-auto', isAuth ? 'py-1' : 'p-1')}>
          {isLoading && !hasResults ? (
            <div
              className={cn(
                'px-2 py-6 text-center text-sm',
                isAuth ? 'wk-vessel-picker-empty' : 'text-muted-foreground',
              )}
            >
              <Loader2
                className={cn(
                  'mx-auto mb-2 h-4 w-4 animate-spin',
                  isAuth ? 'text-[var(--wk-accent)]' : undefined,
                )}
              />
              Searching vessels…
            </div>
          ) : null}

          {localResults.length > 0 ? (
            <div className="mb-1">
              <div
                className={cn(
                  isAuth
                    ? 'wk-vessel-picker-section'
                    : 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                )}
              >
                On SeaJourney
              </div>
              {localResults.map((vessel) => (
                <button
                  key={vessel.id}
                  type="button"
                  data-selected={value === vessel.id}
                  onClick={() => void selectLocalVessel(vessel)}
                  className={cn(
                    isAuth
                      ? 'wk-vessel-picker-row'
                      : 'relative flex w-full cursor-pointer select-none items-start rounded-lg px-3 py-2.5 text-sm outline-none transition-colors hover:bg-accent/80',
                    !isAuth && value === vessel.id && 'bg-accent',
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      isAuth ? 'wk-vessel-picker-check' : undefined,
                      value === vessel.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <VesselResultDetails
                    auth={isAuth}
                    name={vessel.name}
                    summary={formatLocalVesselSummary(vessel) || null}
                    specs={formatVesselSpecs(vessel)}
                  />
                </button>
              ))}
            </div>
          ) : null}

          {aisSingle ? (
            <div className="mb-1">
              <div
                className={cn(
                  isAuth
                    ? 'wk-vessel-picker-section'
                    : 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                )}
              >
                From AIS
              </div>
              {(() => {
                const managed =
                  blockManagedVessels &&
                  Boolean(aisSingle.existingInDatabase?.hasManager);
                return (
                  <button
                    type="button"
                    disabled={isResolving || managed}
                    onClick={() =>
                      void selectAisSelection({
                        autofill: aisSingle.autofill,
                        existingInDatabase: aisSingle.existingInDatabase,
                      })
                    }
                    className={cn(
                      isAuth
                        ? 'wk-vessel-picker-row'
                        : 'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/80 disabled:opacity-50',
                    )}
                  >
                    <Ship
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isAuth ? 'wk-vessel-picker-icon' : 'text-primary',
                      )}
                    />
                    <VesselResultDetails
                      auth={isAuth}
                      name={aisSingle.autofill.name}
                      summary={formatAisSummary(aisSingle.autofill)}
                      specs={formatVesselSpecs(aisSingle.autofill)}
                      footnote={renderAisFootnote(
                        managed,
                        Boolean(aisSingle.existingInDatabase),
                      )}
                    />
                  </button>
                );
              })()}
            </div>
          ) : null}

          {aisResults.length > 0 ? (
            <div>
              <div
                className={cn(
                  isAuth
                    ? 'wk-vessel-picker-section'
                    : 'px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                )}
              >
                From AIS
              </div>
              {aisResults.map((item) => {
                const managed =
                  blockManagedVessels && Boolean(item.existingInDatabase?.hasManager);
                return (
                  <button
                    key={item.uuid ?? `${item.autofill.mmsi}-${item.autofill.name}`}
                    type="button"
                    disabled={isResolving || managed}
                    onClick={() =>
                      void selectAisSelection({
                        autofill: item.autofill,
                        existingInDatabase: item.existingInDatabase,
                      })
                    }
                    className={cn(
                      isAuth
                        ? 'wk-vessel-picker-row'
                        : 'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/80 disabled:opacity-50',
                    )}
                  >
                    <Ship
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isAuth ? 'wk-vessel-picker-icon' : 'text-primary',
                      )}
                    />
                    <VesselResultDetails
                      auth={isAuth}
                      name={item.autofill.name}
                      summary={formatAisSummary(item.autofill)}
                      specs={formatVesselSpecs(item.autofill)}
                      footnote={renderAisFootnote(
                        managed,
                        Boolean(item.existingInDatabase),
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ) : null}

          {!isLoading && trimmedQuery.length >= 2 && !hasResults ? (
            <div
              className={cn(
                isAuth ? 'wk-vessel-picker-empty' : 'px-3 py-6 text-center text-sm text-muted-foreground',
              )}
            >
              No vessels found. Try MMSI, IMO, or a longer vessel name.
            </div>
          ) : null}

          {!isLoading && trimmedQuery.length < 2 ? (
            <div
              className={cn(
                isAuth ? 'wk-vessel-picker-empty' : 'px-3 py-6 text-center text-sm text-muted-foreground',
              )}
            >
              Type at least 2 characters to search
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
