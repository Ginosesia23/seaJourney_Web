
'use client';

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Fingerprint, Cloud, FileText, Bot, Share2, ScanLine } from 'lucide-react';

type PlanKey = "free" | "hybrid" | "premium";

const planDetails = {
    free: {
        title: "Free Export",
        subtitle: "Captain Signed PDF",
        description: "A basic PDF summary is generated from locally stored logs for the captain to sign, similar to a traditional paper logbook.",
        mca_title: "MCA Verification",
        mca_desc: "The MCA reviews the signed PDF, treating the captain's signature as the primary proof of service.",
    },
    hybrid: {
        title: "Hybrid Export",
        subtitle: "PDF + QR + Cloud Snapshot",
        description: "Generates a PDF with a unique QR code. A tamper-proof snapshot of the record is stored in the cloud for verification.",
        mca_title: "MCA Verification",
        mca_desc: "The MCA scans the QR code to instantly confirm that the PDF matches the original, secure record.",
    },
    premium: {
        title: "Premium Export",
        subtitle: "Full Digital Verifiable Logbook",
        description: "The captain provides a digital sign-off within the app, creating a secure, auditable log with a full history.",
        mca_title: "MCA Verification",
        mca_desc: "The MCA views the complete, digitally-signed record and its audit trail directly in the portal.",
    }
}

const breakdownDetails: Record<PlanKey, { icon: React.FC<any>, title: string, description: string }[]> = {
    free: [
        {
            icon: Bot,
            title: "1. Log & Generate",
            description: "Crew logs their sea time on their device. When ready, they generate a standard PDF testimonial. No unique code is created for this basic export."
        },
        {
            icon: FileText,
            title: "2. Sign & Share",
            description: "The generated PDF is manually sent to the captain or a superior officer for a traditional (wet or digital) signature, just like a paper document."
        },
        {
            icon: ScanLine,
            title: "3. Manual Verification",
            description: "The maritime authority (e.g., MCA) reviews the signed PDF. Verification relies entirely on the authenticity of the captain's signature on the document."
        }
    ],
    hybrid: [
        {
            icon: Bot,
            title: "1. Generate Unique Code",
            description: "User generates an official testimonial. The app creates a unique, unguessable verification code and a data snapshot which is stored securely in the cloud."
        },
        {
            icon: Share2,
            title: "2. Share with Official",
            description: "The unique code is embedded in the exported PDF's footer and as a QR code. This document is then shared with the maritime official for verification."
        },
        {
            icon: ScanLine,
            title: "3. Official Verifies Online",
            description: "The official visits the SeaJourney verification portal, enters the code, and instantly sees the original, tamper-proof data snapshot to confirm its authenticity."
        }
    ],
    premium: [
        {
            icon: Bot,
            title: "1. Captain's Digital Sign-off",
            description: "Crew requests a testimonial sign-off within the app. The captain receives a secure link, authenticates, and digitally signs the record, creating an auditable log."
        },
        {
            icon: Share2,
            title: "2. Export Verifiable PDF",
            description: "The exported PDF contains a unique verification code and QR code that links directly to the digitally-signed, timestamped record in the SeaJourney cloud."
        },
        {
            icon: ScanLine,
            title: "3. Full Audit Trail Verification",
            description: "The official uses the portal to view not just the record, but the entire audit trail: who signed it, when it was signed, and the history of the record, providing maximum trust."
        }
    ]
}

export const SeaJourneyVerificationFlow: React.FC = () => {
  const [activePlan, setActivePlan] = useState<PlanKey>("hybrid");

  return (
    <section className="w-full max-w-6xl mx-auto">
      <header className="text-center mb-12">
        <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
          SeaJourney Verification Ecosystem
        </h2>
        <p className="mt-4 max-w-3xl mx-auto text-lg leading-8 text-foreground/80">
          SeaJourney offers multiple paths to turn your sea time into verifiable evidence for authorities like the MCA. Select a tier below to see how each process works.
        </p>
      </header>

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
                         <p className="text-sm text-foreground/80">{plan.description}</p>
                         <div className="rounded-lg border bg-muted/50 p-4">
                            <h4 className="font-semibold text-sm flex items-center gap-2"><Cloud className="h-4 w-4"/> {plan.mca_title}</h4>
                            <p className="text-sm text-muted-foreground mt-2">{plan.mca_desc}</p>
                        </div>
                    </CardContent>
                </Card>
            </button>
          )
        })}
      </div>

       {/* Breakdown Section */}
      <div className="mt-16">
        <h3 className="text-center font-headline text-2xl font-bold tracking-tight text-primary mb-8">
            How It Works: <span className="capitalize">{activePlan}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {breakdownDetails[activePlan].map((step, index) => (
                <Card key={index} className="bg-card/50 rounded-xl">
                    <CardHeader className="text-center items-center">
                         <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-2">
                             <step.icon className="h-6 w-6 text-accent" />
                        </div>
                        <CardTitle className="font-headline text-lg">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-center text-sm text-foreground/80">{step.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
      </div>
    </section>
  );
};
