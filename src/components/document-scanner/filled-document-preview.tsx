'use client';

import React, { useMemo } from 'react';
import { Copy, Check, Pencil, User, Ship, Anchor, Award, Building2, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScannedField {
  fieldName: string;
  fieldDescription?: string;
  originalValue?: string;
  category?: string;
  profileKey?: string;
  suggestedValue: string | null;
  source: string;
}

interface FilledDocumentPreviewProps {
  documentTitle: string;
  documentDescription?: string | null;
  crewName: string;
  vesselName: string;
  fields: ScannedField[];
  unmatchedFields: ScannedField[];
  editedValues: Record<string, string>;
  onValueChange: (key: string, value: string) => void;
  copiedField: string | null;
  onCopyField: (key: string, value: string) => void;
  /**
   * When provided, each field row gets a small "remove" button that calls
   * this with the field's global index (position in the combined
   * [matched, unmatched] array). Lets users prune fields they don't want
   * on a saved template — e.g. decorative labels or duplicates.
   */
  onDeleteField?: (globalIndex: number) => void;
}

/** Category display config */
const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  personal: { label: 'Personal Details', icon: User, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500/5 border-blue-500/20' },
  vessel: { label: 'Vessel Details', icon: Ship, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500/5 border-emerald-500/20' },
  service: { label: 'Sea Service', icon: Anchor, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-500/5 border-indigo-500/20' },
  certificate: { label: 'Certificates & Qualifications', icon: Award, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/5 border-amber-500/20' },
  authority: { label: 'Issuing Authority', icon: Building2, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-500/5 border-purple-500/20' },
  other: { label: 'Other Fields', icon: HelpCircle, color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-500/5 border-slate-500/20' },
};

/** Get the source indicator style */
function getSourceDot(source: string): string {
  if (source === 'profile') return 'bg-blue-500';
  if (source === 'vessel') return 'bg-emerald-500';
  if (source === 'captain') return 'bg-amber-500';
  if (source === 'calculated') return 'bg-indigo-500';
  return 'bg-slate-400';
}

function getSourceLabel(source: string): string {
  if (source === 'profile') return 'From crew profile';
  if (source === 'vessel') return 'From vessel data';
  if (source === 'captain') return 'From captain';
  if (source === 'calculated') return 'Calculated sea time';
  return 'Manual entry';
}

/**
 * Renders a document-style mockup with extracted fields filled in,
 * grouped by category to resemble the original form's layout.
 */
export function FilledDocumentPreview({
  documentTitle,
  documentDescription,
  crewName,
  vesselName,
  fields,
  unmatchedFields,
  editedValues,
  onValueChange,
  copiedField,
  onCopyField,
  onDeleteField,
}: FilledDocumentPreviewProps) {
  // Group all fields by category
  const groupedFields = useMemo(() => {
    const allFields = [
      ...fields.map((f, i) => ({ ...f, globalIndex: i, isMatched: true })),
      ...unmatchedFields.map((f, i) => ({ ...f, globalIndex: fields.length + i, isMatched: false })),
    ];

    const groups = new Map<string, typeof allFields>();
    for (const field of allFields) {
      const cat = field.category || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(field);
    }

    // Order categories in a logical document flow
    const order = ['personal', 'vessel', 'service', 'certificate', 'authority', 'other'];
    const sorted: Array<{ category: string; fields: typeof allFields }> = [];
    for (const cat of order) {
      if (groups.has(cat)) {
        sorted.push({ category: cat, fields: groups.get(cat)! });
        groups.delete(cat);
      }
    }
    // Any remaining categories
    for (const [cat, catFields] of groups) {
      sorted.push({ category: cat, fields: catFields });
    }
    return sorted;
  }, [fields, unmatchedFields]);

  const matchedCount = fields.filter((f) => f.suggestedValue).length;
  const totalCount = fields.length + unmatchedFields.length;

  return (
    <div className="w-full">
      {/* Document mockup container — styled to look like a paper form */}
      <div className="relative mx-auto max-w-3xl">
        {/* Paper shadow effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-violet-500/5 blur-xl -z-10" />

        <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">
          {/* Document header — mimics a real form header */}
          <div className="relative border-b bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-900/50 dark:to-slate-800/30 px-6 py-5">
            {/* Decorative top line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-violet-500 to-primary" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight">{documentTitle}</h2>
                {documentDescription && (
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">{documentDescription}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Auto-filled</div>
                <div className="text-2xl font-bold text-primary tabular-nums">
                  {matchedCount}<span className="text-sm text-muted-foreground font-normal">/{totalCount}</span>
                </div>
              </div>
            </div>

            {/* Crew and vessel info bar */}
            <div className="flex items-center gap-4 mt-3 text-xs">
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Crew:</span>
                <span className="font-medium">{crewName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Ship className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Vessel:</span>
                <span className="font-medium">{vesselName}</span>
              </div>
            </div>

            {/* Source legend */}
            <div className="flex items-center gap-4 mt-2.5">
              {[
                { source: 'profile', label: 'Crew profile' },
                { source: 'vessel', label: 'Vessel data' },
                { source: 'calculated', label: 'Calculated' },
                { source: 'captain', label: 'Captain' },
                { source: 'manual', label: 'Manual / empty' },
              ].map(({ source, label }) => (
                <div key={source} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className={cn('h-2 w-2 rounded-full', getSourceDot(source))} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Document body — form sections */}
          <div className="px-6 py-4 space-y-5">
            {groupedFields.map(({ category, fields: catFields }) => {
              const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
              const Icon = config.icon;

              return (
                <div key={category} className="space-y-2.5">
                  {/* Section header — like a form section divider */}
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
                    config.bgColor,
                  )}>
                    <Icon className={cn('h-3.5 w-3.5', config.color)} />
                    <span className={cn('text-xs font-semibold uppercase tracking-wider', config.color)}>
                      {config.label}
                    </span>
                  </div>

                  {/* Fields grid — 2 columns like a real form */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    {catFields.map((field) => {
                      const key = `${field.fieldName}-${field.globalIndex}`;
                      const value = editedValues[key] ?? field.suggestedValue ?? field.originalValue ?? '';
                      const hasValue = !!value.trim();
                      const isCopied = copiedField === key;

                      return (
                        <div
                          key={key}
                          className={cn(
                            'group relative rounded-lg px-3 py-2 transition-colors duration-200',
                            'hover:bg-muted/50',
                            !hasValue && 'opacity-60',
                          )}
                        >
                          {/* Field label */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', getSourceDot(field.source))} />
                            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                              {field.fieldName}
                            </label>
                          </div>

                          {/* Field value — looks like a form field */}
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={value}
                              onChange={(e) => onValueChange(key, e.target.value)}
                              placeholder="—"
                              className={cn(
                                'flex-1 bg-transparent text-sm font-medium border-b border-dashed transition-colors duration-200',
                                'focus:outline-none focus:border-primary',
                                hasValue
                                  ? 'border-border/60 text-foreground'
                                  : 'border-border/30 text-muted-foreground italic',
                                'placeholder:text-muted-foreground/40 placeholder:not-italic',
                              )}
                              title={getSourceLabel(field.source)}
                            />
                            {/* Copy button — appears on hover */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => onCopyField(key, value)}
                            >
                              {isCopied
                                ? <Check className="h-3 w-3 text-emerald-500" />
                                : <Copy className="h-3 w-3 text-muted-foreground" />
                              }
                            </Button>
                            {onDeleteField && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => onDeleteField(field.globalIndex)}
                                title="Remove this field from the scan"
                                aria-label="Remove field"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {/* Show original value if different from suggested */}
                          {field.originalValue && field.suggestedValue && field.originalValue !== field.suggestedValue && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Original: <span className="line-through">{field.originalValue}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Document footer */}
          <div className="border-t bg-muted/20 px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Scanned and auto-filled by SeaJourney AI · {new Date().toLocaleDateString()}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Pencil className="h-3 w-3" />
              Click any value to edit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
