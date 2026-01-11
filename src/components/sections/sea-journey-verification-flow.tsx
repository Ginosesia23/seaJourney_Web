
'use client';

import React, { useState } from "react";
import Link from 'next/link';
import Image from 'next/image';
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Fingerprint, FileText, ShieldCheck, UserPlus, Search } from 'lucide-react';
import { Button } from "../ui/button";

type PlanKey = "free" | "hybrid" | "premium";

const planDetails: Record<PlanKey, { icon: React.FC<any>, title: string, subtitle: string, description: string }> = {
    free: {
        icon: FileText,
        title: "Free Export",
        subtitle: "Captain Signed PDF",
        description: "A basic PDF summary is generated for the captain to sign, similar to a traditional paper logbook.",
    },
    hybrid: {
        icon: Fingerprint,
        title: "Hybrid Export",
        subtitle: "PDF + QR + Cloud Snapshot",
        description: "Generates a PDF with a unique QR code. A tamper-proof snapshot of the record is stored for verification.",
    },
    premium: {
        icon: ShieldCheck,
        title: "Premium Export",
        subtitle: "Full Digital Verifiable Logbook",
        description: "The captain provides a digital sign-off within the app, creating a secure, auditable log with a full history.",
    }
}

const breakdownDetails: Record<PlanKey, { icon: React.FC<any>, title: string, description: string }[]> = {
    free: [
        {
            icon: FileText,
            title: "1. Log & Generate",
            description: "Crew logs their sea time on their device. When ready, they generate a standard PDF testimonial. No unique code is created for this basic export."
        },
        {
            icon: FileText,
            title: "2. Sign & Share",
            description: "The generated PDF is manually sent to the captain or a superior officer for a traditional (wet or digital) signature, just like a paper document."
        },
        {
            icon: Search,
            title: "3. Manual Verification",
            description: "The maritime authority (e.g., MCA) reviews the signed PDF. Verification relies entirely on the authenticity of the captain's signature on the document."
        }
    ],
    hybrid: [
        {
            icon: Fingerprint,
            title: "1. Generate Unique Code",
            description: "User generates an official testimonial. The app creates a unique, unguessable verification code and a data snapshot which is stored securely in the cloud."
        },
        {
            icon: Fingerprint,
            title: "2. Share with Official",
            description: "The unique code is embedded in the exported PDF's footer and as a QR code. This document is then shared with the maritime official for verification."
        },
        {
            icon: Search,
            title: "3. Official Verifies Online",
            description: "The official visits the SeaJourney verification portal, enters the code, and instantly sees the original, tamper-proof data snapshot to confirm its authenticity."
        }
    ],
    premium: [
        {
            icon: ShieldCheck,
            title: "1. Captain's Digital Sign-off",
            description: "Crew requests a testimonial sign-off within the app. The captain receives a secure link, authenticates, and digitally signs the record, creating an auditable log."
        },
        {
            icon: ShieldCheck,
            title: "2. Export Verifiable PDF",
            description: "The exported PDF contains a unique verification code and QR code that links directly to the digitally-signed, timestamped record in the SeaJourney cloud."
        },
        {
            icon: Search,
            title: "3. Full Audit Trail Verification",
            description: "The official uses the portal to view not just the record, but the entire audit trail: who signed it, when it was signed, and the history of the record, providing maximum trust."
        }
    ]
}

const planColorStyles: Record<PlanKey, { icon: string; bg: string }> = {
    free: {
        icon: 'text-muted-foreground',
        bg: 'bg-muted/50',
    },
    hybrid: {
        icon: 'text-accent',
        bg: 'bg-accent/10',
    },
    premium: {
        icon: 'text-[hsl(var(--chart-orange))]',
        bg: 'bg-[hsl(var(--chart-orange))]/10',
    },
};


export const SeaJourneyVerificationFlow: React.FC = () => {
  const [activePlan, setActivePlan] = useState<PlanKey>("hybrid");
  
  const activeColors = planColorStyles[activePlan];

  return (
    <section className="w-full max-w-6xl mx-auto">
      {/* Branding Header */}
      <div className="flex items-center justify-center mb-10 py-8 border-b border-white/10">
        <Image
          src="/seajourney_logo_white.png"
          alt="SeaJourney"
          width={200}
          height={72}
          className="h-16 w-auto"
          priority
        />
      </div>

      <header className="text-center mb-12">
        <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
        </div>
        <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
          SeaJourney Verification Ecosystem
        </h2>
        <p className="mt-4 max-w-3xl mx-auto text-lg leading-8 text-white/70">
          SeaJourney offers multiple paths to turn your sea time into verifiable evidence for authorities like the MCA. Select a tier below to see how each process works.
        </p>
      </header>

      {/* Plan cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {(Object.keys(planDetails) as PlanKey[]).map((key) => {
          const plan = planDetails[key];
          const isActive = activePlan === key;
          const Icon = plan.icon;
          const colors = planColorStyles[key];

          return (
            <button
                key={key}
                onClick={() => setActivePlan(key)}
                className="text-left h-full"
            >
                <Card className={cn(
                    "h-full flex flex-col transition-all duration-300 rounded-2xl bg-card/80 backdrop-blur-sm border-white/10",
                    isActive ? "border-primary ring-2 ring-primary shadow-2xl -translate-y-2" : "hover:shadow-xl hover:-translate-y-1 hover:border-white/20"
                )}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                           <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl mb-4", colors.bg)}>
                                <Icon className={cn("h-6 w-6", colors.icon)} />
                           </div>
                           {isActive && <CheckCircle className="h-6 w-6 text-primary"/>}
                        </div>
                        <CardTitle className="font-headline text-xl">{plan.title}</CardTitle>
                        <CardDescription>{plan.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-3">
                         <p className="text-sm text-muted-foreground">{plan.description}</p>
                    </CardContent>
                </Card>
            </button>
          )
        })}
      </div>

       {/* Breakdown Section */}
      <div className="mt-16">
        <h3 className="text-center font-headline text-2xl font-bold tracking-tight text-white mb-8">
            How It Works: <span className="capitalize">{activePlan}</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {breakdownDetails[activePlan].map((step, index) => {
                const BreakdownIcon = step.icon;
                return (
                    <Card key={index} className="bg-card/80 backdrop-blur-sm rounded-xl border-white/10">
                        <CardHeader className="text-center items-center">
                            <div className={cn("flex h-12 w-12 items-center justify-center rounded-full mb-2", activeColors.bg)}>
                                <BreakdownIcon className={cn("h-6 w-6", activeColors.icon)} />
                            </div>
                            <CardTitle className="font-headline text-lg">{step.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-center text-sm text-muted-foreground">{step.description}</p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
      </div>
      
      {/* CTA Section */}
      <div className="mt-24">
         <h3 className="text-center font-headline text-2xl font-bold tracking-tight text-white mb-8">
            What's Next?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="text-center hover:shadow-xl transition-shadow rounded-2xl bg-card/80 backdrop-blur-sm border-white/10">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
                        <Search className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="font-headline text-xl">For Officials</CardTitle>
                    <CardDescription>Verify a document using the official verification portal.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild className="rounded-full">
                        <Link href="/verify">Verify a Record</Link>
                    </Button>
                </CardContent>
            </Card>
             <Card className="text-center hover:shadow-xl transition-shadow rounded-2xl bg-card/80 backdrop-blur-sm border-white/10">
                <CardHeader>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-2">
                        <UserPlus className="h-6 w-6 text-accent" />
                    </div>
                    <CardTitle className="font-headline text-xl">For Crew</CardTitle>
                    <CardDescription>Start logging your sea time and generate verifiable documents.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Button asChild variant="accent" className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                        <Link href="/coming-soon">Get Started</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
      </div>
    </section>
  );
};
