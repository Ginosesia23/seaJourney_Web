
'use client';

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Fingerprint, Cloud, FileText } from 'lucide-react';

type PlanKey = "free" | "hybrid" | "premium";

const PLAN_COPY: Record<PlanKey, { title: string; body: string }> = {
  free: {
    title: "Current path: Free Export – Captain Signed PDF",
    body:
      "SeaJourney produces a simple PDF from locally stored logs. The captain signs it, " +
      "and the MCA treats it as they would a handwritten logbook: the signature is the verification.",
  },
  hybrid: {
    title: "Current path: Hybrid Export – PDF + QR + Cloud Snapshot",
    body:
      "SeaJourney generates a PDF with a QR code and stores a matching snapshot online. " +
      "The MCA can scan the QR or enter the ID to confirm the PDF matches the record SeaJourney has on file.",
  },
  premium: {
    title: "Current path: Premium Export – Full Digital Verifiable Logbook",
    body:
      "SeaJourney keeps a full audit trail in the cloud and records a digital captain sign-off. " +
      "The MCA can view the original signed entry, timestamps, and vessel details via the portal, " +
      "treating SeaJourney as an official digital logbook.",
  },
};

const planDetails = {
    free: {
        title: "Free Export",
        subtitle: "Captain Signed PDF",
        features: [
            "Crew logs sea time locally on the device.",
            "User generates a basic SeaJourney PDF summary.",
            "Captain or Chief Officer signs the PDF."
        ],
        mca_title: "MCA Verification",
        mca_desc: "MCA reviews the PDF as they would a paper logbook: captain signature + vessel details = primary proof of service.",
        footnote: "No cloud needed. Ideal for crew who want offline-only logs."
    },
    hybrid: {
        title: "Hybrid Export",
        subtitle: "PDF + QR + Cloud Snapshot",
        features: [
            "User chooses “Official Export” in SeaJourney.",
            "App generates a PDF with QR code, entry ID and cryptographic hash.",
            "App uploads only that export snapshot (ID + hash + summary data) to the cloud."
        ],
        mca_title: "MCA Verification",
        mca_desc: "MCA scans the QR or enters the entry ID on the SeaJourney portal, and confirms the PDF matches the stored export, detecting any tampering.",
        footnote: "Great balance for free users who still want verifiable exports."
    },
    premium: {
        title: "Premium Export",
        subtitle: "Full Digital Verifiable Logbook",
        features: [
            "All logs stored in the SeaJourney cloud with audit trail (timestamps, device, edits).",
            "Captain / management receives a secure sign-off request and approves via authenticated login.",
            "SeaJourney seals the entry with a digital signature and immutable hash.",
            "Exported PDFs include QR, verification link and signature metadata."
        ],
        mca_title: "MCA Verification",
        mca_desc: "MCA opens the SeaJourney portal and can see the original signed record, timestamps, audit trail and vessel sign-off, treating it as an official digital logbook.",
        footnote: "Designed to be the “gold standard” for digital sea-time evidence."
    }
}

export const SeaJourneyVerificationFlow: React.FC = () => {
  const [activePlan, setActivePlan] = useState<PlanKey>("free");

  const summary = PLAN_COPY[activePlan];

  return (
    <section className="w-full max-w-6xl mx-auto">
      <header className="text-center mb-12">
        <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          SeaJourney Verification Ecosystem
        </h2>
        <p className="mt-4 max-w-3xl mx-auto text-lg leading-8 text-foreground/80">
          See how SeaJourney turns crew logs into MCA-usable evidence, across
          Free, Hybrid and Premium verification paths.
        </p>
      </header>

      <p className="text-center text-muted-foreground mb-8">
        Export paths from SeaJourney to MCA-usable documents:
      </p>

      {/* Plan cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {Object.entries(planDetails).map(([key, plan]) => {
          const isActive = activePlan === key;
          return (
            <button
                key={key}
                onClick={() => setActivePlan(key as PlanKey)}
                className="text-left h-full"
            >
                <Card className={cn(
                    "h-full flex flex-col transition-all duration-300 rounded-2xl",
                    isActive ? "border-primary ring-2 ring-primary shadow-2xl -translate-y-2" : "hover:shadow-xl hover:-translate-y-1"
                )}>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                           <CardTitle className="font-headline text-xl">{plan.title}</CardTitle>
                           {isActive && <CheckCircle className="h-6 w-6 text-primary"/>}
                        </div>
                        <CardDescription>{plan.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                        <ul className="space-y-2">
                           {plan.features.map((feature, i) => (
                               <li key={i} className="flex items-start gap-3">
                                   <Fingerprint className="h-4 w-4 mt-1 text-accent flex-shrink-0"/>
                                   <span className="text-sm text-foreground/80">{feature}</span>
                               </li>
                           ))}
                        </ul>
                        <div className="rounded-lg border bg-muted/50 p-4">
                            <h4 className="font-semibold text-sm flex items-center gap-2"><Cloud className="h-4 w-4"/> {plan.mca_title}</h4>
                            <p className="text-sm text-muted-foreground mt-2">{plan.mca_desc}</p>
                        </div>
                    </CardContent>
                    <div className="p-6 pt-0">
                         <p className="text-xs text-muted-foreground italic">{plan.footnote}</p>
                    </div>
                </Card>
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="mt-12 rounded-xl border-2 border-primary/80 bg-card p-6 shadow-lg">
        <div className="flex items-start gap-4">
            <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-5 w-5 text-primary"/>
            </div>
            <div>
                <h3 className="text-lg font-bold text-primary">{summary.title}</h3>
                <p className="mt-1 text-foreground/90">{summary.body}</p>
            </div>
        </div>
      </div>
    </section>
  );
};
