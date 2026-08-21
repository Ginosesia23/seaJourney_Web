'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, FileText, BookOpen, CheckCircle2, AlertCircle, Ship } from 'lucide-react';
import {
  VESSEL_CALCULATION_CATEGORY_LABELS,
  VESSEL_TYPES_BY_CATEGORY,
  type VesselCalculationCategory,
} from '@/lib/vessel-calculation-categories';
import { vesselTypes } from '@/lib/vessel-types';

const vesselTypeToLabel: Record<string, string> = {};
vesselTypes.forEach(({ value, label }) => { vesselTypeToLabel[value] = label; });

const CATEGORY_ORDER: VesselCalculationCategory[] = [
  'yacht_class',
  'commercial_class',
  'passenger_commercial_class',
  'fishing_class',
  'other_class',
];

export default function CalculationsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6 max-w-4xl">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">How We Calculate Sea Time</h1>
        <p className="text-muted-foreground">
          Understanding how SeaJourney calculates your sea service days and standby periods using MCA/PYA compliant calculation methods.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculation Standards
          </CardTitle>
          <CardDescription>
            Our calculations follow official maritime authority guidelines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">MCA Compliant Calculations</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">PYA Compliant Calculations</span>
            </div>
            <p className="text-sm text-muted-foreground pt-2">
              Our calculations use the same methods and formulas as specified by the Maritime and Coastguard Agency (MCA) and Professional Yachting Association (PYA) regulations. This ensures your sea time records follow official calculation standards for certification and applications.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5" />
            Vessel class categories
          </CardTitle>
          <CardDescription>
            The vessel type you set for each vessel determines which calculation rules apply
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sea time is calculated differently depending on your vessel&apos;s type. Each vessel type belongs to a calculation category; the category controls whether we use MCA/PYA-style rules (at sea, standby, yard, leave) or commercial rules (all days except leave count as sea time).
          </p>
          <div className="space-y-4">
            {CATEGORY_ORDER.map((category) => {
              const { label, shortDescription } = VESSEL_CALCULATION_CATEGORY_LABELS[category];
              const types = VESSEL_TYPES_BY_CATEGORY[category];
              const typeLabels = types.map((v) => vesselTypeToLabel[v] ?? v).join(', ');
              return (
                <div key={category} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-medium">
                      {label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {shortDescription}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Vessel types:</span> {typeLabels}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              When you add or edit a vessel, set its type from the list above. Your sea time and standby for that vessel will then use the rules for its category. You can see which category applies on your dashboard and in your vessel history.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            At Sea Days
          </CardTitle>
          <CardDescription>
            What counts as &quot;at sea&quot; depends on your vessel&apos;s class category (see above)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold mb-2">Yacht, fishing and other class (MCA/PYA-style):</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span><strong>Underway days:</strong> Days when the vessel is actively sailing or at sea</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span><strong>Watch days:</strong> Days when you were on watch duty (officers only) — these count as &quot;at sea&quot; even if the vessel was at anchor</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span><strong>Part of active passage:</strong> Days you&apos;ve marked as part of an active passage, regardless of vessel state</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Commercial and passenger commercial class:</h3>
              <p className="text-sm text-muted-foreground">
                All days onboard count as sea time except days on leave. There is no separate standby or yard breakdown; in-port and at-anchor days are included in sea time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Standby Days
          </CardTitle>
          <CardDescription>
            Applies to yacht, fishing and other class vessels; commercial and passenger commercial do not use standby
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              For yacht, fishing and other class vessels, standby days are calculated using MCA/PYA compliant calculation methods and represent time spent moored or at anchor that may count towards sea service requirements. Commercial and passenger commercial vessels do not have a separate standby count (all non-leave days count as sea time).
            </p>
            
            <div>
              <h3 className="font-semibold mb-2">How Standby Days Work:</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span><strong>Voyage-based calculation:</strong> Standby days are calculated between voyages (periods when the vessel is underway)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span><strong>Limited by sea days:</strong> Standby days cannot exceed the number of sea days in the preceding voyage</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span><strong>Exclusions:</strong> Watch days and days marked as "part of active passage" are excluded from standby calculations (they count as "at sea")</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <span><strong>States counted:</strong> Only "in-port" and "at-anchor" states can be counted as standby days</span>
                </li>
              </ul>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Important:</p>
                  <p className="text-muted-foreground">
                    Standby days are calculated automatically based on your logged vessel states and voyage patterns. 
                    The system uses MCA/PYA compliant calculation methods by limiting standby days to the number of sea days in the preceding voyage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
          <CardDescription>
            Where we get the information for calculations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold mb-2">Vessel State Logs:</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Daily vessel states you log (underway, at-anchor, in-port, on-leave, in-yard) form the basis of all calculations.
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="font-semibold mb-2">Watch Logs:</h3>
              <p className="text-sm text-muted-foreground mb-2">
                For officers, watch duty logs are used to count days as "at sea" even when the vessel is at anchor.
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="font-semibold mb-2">Part of Active Passage:</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Days you mark as "part of active passage" are counted as "at sea" regardless of the vessel state.
              </p>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="font-semibold mb-2">Vessel Assignments:</h3>
              <p className="text-sm text-muted-foreground">
                Your vessel assignment dates determine the period for which sea time is calculated. Only days within your assignment period are counted.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example Calculation (yacht class)</CardTitle>
          <CardDescription>
            MCA/PYA-style voyage and standby rules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="font-medium mb-2">Scenario:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Voyage 1: 10 days underway</li>
                <li>• Then: 5 days in-port</li>
                <li>• Voyage 2: 8 days underway</li>
                <li>• Then: 8 days at anchor or in-port</li>
              </ul>
            </div>
            
            <div>
              <p className="font-medium mb-2">Result:</p>
              <ul className="space-y-1">
                <li>• <strong>At Sea Days:</strong> 18 days (10 + 8 underway days)</li>
                <li>• <strong>Standby Days:</strong> 13 days total</li>
                <li className="ml-4 text-muted-foreground">- 5 days after Voyage 1 (all count, limited by 10 sea days)</li>
                <li className="ml-4 text-muted-foreground">- 8 days after Voyage 2 (all count, limited by 8 sea days)</li>
              </ul>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  If there were 12 days in-port after Voyage 1 instead of 5, only 10 standby days would count (limited by the 10 sea days from Voyage 1). 
                  Similarly, if there were 10 days at anchor after Voyage 2, only 8 would count (limited by the 8 sea days from Voyage 2).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>References</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              These calculations are based on official guidelines from:
            </p>
            <ul className="space-y-1">
              <li>• <strong>MCA (Maritime and Coastguard Agency):</strong> UK maritime regulations for sea service requirements</li>
              <li>• <strong>PYA (Professional Yachting Association):</strong> Industry standards for yacht crew certification</li>
            </ul>
            <p className="text-muted-foreground pt-2">
              Our calculations follow MCA/PYA calculation standards, but please verify with the official authorities that our calculated values meet your specific certification or application requirements.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
