
'use client';

import React, { useState } from "react";

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

export const SeaJourneyVerificationFlow: React.FC = () => {
  const [activePlan, setActivePlan] = useState<PlanKey>("free");
  const [activeStep, setActiveStep] = useState<"log" | "store" | "export">(
    "log",
  );

  const summary = PLAN_COPY[activePlan];

  return (
    <section className="w-full max-w-5xl mx-auto my-8 px-4 py-6 rounded-3xl bg-[radial-gradient(circle_at_top_left,#003366_0,#000e1c_45%,#00060e_100%)] text-slate-50 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
      {/* Header */}
      <header className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-wide mb-1">
          SeaJourney Verification Ecosystem
        </h1>
        <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-200/80">
          See how SeaJourney turns crew logs into MCA-usable evidence, across
          Free, Hybrid and Premium verification paths.
        </p>
      </header>

      {/* Top steps */}
      <div className="relative flex flex-col md:flex-row justify-between gap-3 md:gap-4 mx-2 mb-3">
        {/* background line (desktop only) */}
        <div className="hidden md:block absolute left-[6%] right-[6%] top-[21px] h-[2px] bg-gradient-to-r from-sky-500/30 via-sky-500 to-sky-500/30 pointer-events-none" />

        {[
          {
            key: "log" as const,
            label: "1. Log Sea Time",
            desc: "Crew records days, ranks, vessels.",
          },
          {
            key: "store" as const,
            label: "2. Store Data",
            desc: "Local device or secure cloud sync.",
          },
          {
            key: "export" as const,
            label: "3. Choose Export",
            desc: "Select Free, Hybrid, or Premium export.",
          },
        ].map((step) => {
          const isActive = activeStep === step.key;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              className={[
                "relative flex-1 text-center px-3 py-4 rounded-2xl transition-all",
                "md:bg-transparent md:border-0 border border-sky-500/30 bg-slate-950/50",
                isActive
                  ? "md:-translate-y-0.5 opacity-100"
                  : "opacity-70 hover:opacity-100",
              ].join(" ")}
            >
              <div
                className={[
                  "mx-auto mb-2 w-4 h-4 rounded-full border-2 border-sky-400",
                  "bg-[radial-gradient(circle,#00a8ff_0,#0077ff_40%,#000e1c_100%)] shadow-[0_0_14px_rgba(0,168,255,0.8)]",
                ].join(" ")}
              />
              <div className="text-xs sm:text-sm font-semibold">
                {step.label}
              </div>
              <div className="text-[0.7rem] sm:text-xs text-slate-200/80 mt-0.5">
                {step.desc}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs sm:text-sm text-slate-200/80 mb-3">
        Export paths from SeaJourney to MCA-usable documents:
      </p>

      {/* Plan cards */}
      <div className="flex flex-col lg:flex-row gap-4 mt-2">
        {/* FREE */}
        <button
          type="button"
          onClick={() => {
            setActivePlan("free");
            setActiveStep("export");
          }}
          className={[
            "group flex-1 min-w-0 text-left rounded-2xl border bg-slate-950/70 px-4 py-4 transition-all relative overflow-hidden",
            activePlan === "free"
              ? "border-emerald-400 shadow-[0_18px_42px_rgba(0,0,0,0.7)] -translate-y-0.5 bg-slate-950"
              : "border-sky-500/40 hover:border-emerald-300/80 hover:-translate-y-0.5",
          ].join(" ")}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.4),transparent_55%)] pointer-events-none" />
          <header className="flex items-center gap-2 mb-2 relative z-10">
            <span className="px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] rounded-full border border-emerald-400 text-emerald-300">
              Free
            </span>
            <h2 className="text-sm sm:text-base font-semibold">
              Free Export – Captain Signed PDF
            </h2>
          </header>
          <ol className="list-decimal pl-5 space-y-1 text-[0.8rem] sm:text-[0.85rem] relative z-10">
            <li>Crew logs sea time locally on the device.</li>
            <li>User generates a basic SeaJourney PDF summary.</li>
            <li>Captain or Chief Officer signs the PDF.</li>
          </ol>
          <div className="mt-2 rounded-xl border border-emerald-400/60 bg-emerald-500/5 px-3 py-2 text-[0.78rem] sm:text-xs relative z-10">
            <h3 className="uppercase tracking-[0.18em] text-[0.65rem] mb-1 text-emerald-200">
              MCA Verification
            </h3>
            <p className="text-slate-100/90">
              MCA reviews the PDF as they would a paper logbook: captain
              signature + vessel details = primary proof of service.
            </p>
          </div>
          <p className="mt-2 text-[0.72rem] sm:text-[0.76rem] text-slate-200/80 relative z-10">
            No cloud needed. Ideal for crew who want offline-only logs.
          </p>
        </button>

        {/* HYBRID */}
        <button
          type="button"
          onClick={() => {
            setActivePlan("hybrid");
            setActiveStep("export");
          }}
          className={[
            "group flex-1 min-w-0 text-left rounded-2xl border bg-slate-950/70 px-4 py-4 transition-all relative overflow-hidden",
            activePlan === "hybrid"
              ? "border-amber-300 shadow-[0_18px_42px_rgba(0,0,0,0.7)] -translate-y-0.5 bg-slate-950"
              : "border-sky-500/40 hover:border-amber-200/80 hover:-translate-y-0.5",
          ].join(" ")}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity bg-[radial-gradient(circle_at_top_left,rgba(252,211,77,0.4),transparent_55%)] pointer-events-none" />
          <header className="flex items-center gap-2 mb-2 relative z-10">
            <span className="px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] rounded-full border border-amber-300 text-amber-200">
              Hybrid
            </span>
            <h2 className="text-sm sm:text-base font-semibold">
              Hybrid Export – PDF + QR + Cloud Snapshot
            </h2>
          </header>
          <ol className="list-decimal pl-5 space-y-1 text-[0.8rem] sm:text-[0.85rem] relative z-10">
            <li>User chooses “Official Export” in SeaJourney.</li>
            <li>
              App generates a PDF with{" "}
              <strong>QR code, entry ID and cryptographic hash</strong>.
            </li>
            <li>
              App uploads <strong>only that export snapshot</strong> (ID + hash
              + summary data) to the cloud.
            </li>
          </ol>
          <div className="mt-2 rounded-xl border border-amber-300/70 bg-amber-300/5 px-3 py-2 text-[0.78rem] sm:text-xs relative z-10">
            <h3 className="uppercase tracking-[0.18em] text-[0.65rem] mb-1 text-amber-100">
              MCA Verification
            </h3>
            <p className="text-slate-100/90">
              MCA scans the QR or enters the entry ID on the SeaJourney
              portal, and confirms the PDF matches the stored export, detecting
              any tampering.
            </p>
          </div>
          <p className="mt-2 text-[0.72rem] sm:text-[0.76rem] text-slate-200/80 relative z-10">
            Great balance for free users who still want verifiable exports.
          </p>
        </button>

        {/* PREMIUM */}
        <button
          type="button"
          onClick={() => {
            setActivePlan("premium");
            setActiveStep("export");
          }}
          className={[
            "group flex-1 min-w-0 text-left rounded-2xl border bg-slate-950/70 px-4 py-4 transition-all relative overflow-hidden",
            activePlan === "premium"
              ? "border-sky-400 shadow-[0_18px_42px_rgba(0,0,0,0.7)] -translate-y-0.5 bg-slate-950"
              : "border-sky-500/40 hover:border-sky-300 hover:-translate-y-0.5",
          ].join(" ")}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-40 transition-opacity bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.4),transparent_55%)] pointer-events-none" />
          <header className="flex items-center gap-2 mb-2 relative z-10">
            <span className="px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] rounded-full border border-sky-400 text-sky-200">
              Premium
            </span>
            <h2 className="text-sm sm:text-base font-semibold">
              Premium Export – Full Digital Verifiable Logbook
            </h2>
          </header>
          <ol className="list-decimal pl-5 space-y-1 text-[0.8rem] sm:text-[0.85rem] relative z-10">
            <li>
              All logs stored in the SeaJourney cloud with{" "}
              <strong>audit trail</strong> (timestamps, device, edits).
            </li>
            <li>
              Captain / management receives a secure sign-off request and
              approves via authenticated login.
            </li>
            <li>
              SeaJourney seals the entry with a digital signature and immutable
              hash.
            </li>
            <li>
              Exported PDFs include QR, verification link and signature
              metadata.
            </li>
          </ol>
          <div className="mt-2 rounded-xl border border-sky-400/70 bg-sky-400/5 px-3 py-2 text-[0.78rem] sm:text-xs relative z-10">
            <h3 className="uppercase tracking-[0.18em] text-[0.65rem] mb-1 text-sky-100">
              MCA Verification
            </h3>
            <p className="text-slate-100/90">
              MCA opens the SeaJourney portal and can see the original signed
              record, timestamps, audit trail and vessel sign-off, treating it
              as an official digital logbook.
            </p>
          </div>
          <p className="mt-2 text-[0.72rem] sm:text-[0.76rem] text-slate-200/80 relative z-10">
            Designed to be the “gold standard” for digital sea-time evidence.
          </p>
        </button>
      </div>

      {/* Summary */}
      <div className="mt-5 rounded-2xl border border-sky-400/70 bg-gradient-to-br from-sky-500/30 via-slate-950/90 to-slate-950 px-4 py-3">
        <h2 className="text-sm sm:text-base font-semibold mb-1">
          {summary.title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-50/95">{summary.body}</p>
      </div>
    </section>
  );
};
