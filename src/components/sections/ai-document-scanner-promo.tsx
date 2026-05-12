'use client';

import {
  ScanSearch,
  Sparkles,
  FileText,
  Upload,
  Wand2,
  Eye,
  ArrowRight,
  Check,
  User,
  Ship,
  Calculator,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const AIDocumentScannerPromo = () => {
  return (
    <section
      id="ai-document-scanner"
      className="py-16 sm:py-24 border-t border-white/10 relative overflow-hidden"
      style={{ backgroundColor: '#000b15' }}
    >
      {/* Background gradient blobs — cyan / emerald to distinguish from other sections */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 right-1/5 w-96 h-96 bg-cyan-500 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/5 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — Visual preview (flipped: sits left so the section alternates with AIS import) */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative order-2 lg:order-1"
            >
              <div
                className="relative rounded-2xl p-6 border-2 backdrop-blur-md shadow-2xl overflow-hidden"
                style={{
                  borderColor: 'rgba(34, 211, 238, 0.4)',
                  backgroundColor: 'rgba(2, 19, 36, 0.7)',
                  boxShadow: '0 20px 60px rgba(34, 211, 238, 0.2)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-emerald-500/10" />

                <div className="relative z-10">
                  {/* Mock: upload strip */}
                  <div
                    className="rounded-lg border p-3 mb-4 flex items-center gap-3"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,22,44,0.5)' }}
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(34, 211, 238, 0.15)' }}
                    >
                      <FileText className="h-4 w-4" style={{ color: '#22d3ee' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">AMSA_771_Form.pdf</div>
                      <div className="text-[10px] text-cyan-200/70">142 KB · Scanned just now</div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                      <Check className="h-3 w-3" /> Matched
                    </div>
                  </div>

                  {/* Mock: extracted fields */}
                  <div
                    className="rounded-lg border overflow-hidden mb-4"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,22,44,0.3)' }}
                  >
                    <div
                      className="px-3 py-2 border-b flex items-center gap-2"
                      style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,22,44,0.5)' }}
                    >
                      <Sparkles className="h-3.5 w-3.5" style={{ color: '#22d3ee' }} />
                      <span className="text-xs font-semibold text-white">Auto-filled from SeaJourney</span>
                      <span className="ml-auto text-[10px] font-semibold text-cyan-200">18/22</span>
                    </div>
                    <div className="p-3 space-y-2">
                      {[
                        { label: 'Name of seafarer', value: 'James Carter', source: 'profile' },
                        { label: 'Date of Birth', value: '14/03/1992', source: 'profile' },
                        { label: 'Vessel name', value: 'M/Y Serenity', source: 'vessel' },
                        { label: 'Days at sea', value: '182', source: 'calculated' },
                      ].map((row, idx) => {
                        const dot =
                          row.source === 'profile'
                            ? '#60a5fa'
                            : row.source === 'vessel'
                            ? '#34d399'
                            : '#818cf8';
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.35, delay: 0.15 + idx * 0.08 }}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: dot }}
                              />
                              <span className="text-blue-200 truncate">{row.label}</span>
                            </div>
                            <span className="font-medium text-white truncate max-w-[55%] text-right">
                              {row.value}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mock: readiness summary */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/25">
                      18/22 auto-filled
                    </span>
                    <span className="inline-flex items-center rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300 border border-cyan-500/25">
                      6 calculated
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/25">
                      4 need manual input
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right — Content */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6 order-1 lg:order-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-cyan-600/30 to-emerald-600/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-cyan-100 border border-cyan-500/30 shadow-lg">
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI-Powered
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-500/15 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-200 border border-amber-400/30 shadow-lg">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
                  Beta
                </span>
              </div>

              <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Scan any form. Fill it with your{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                  vessel &amp; crew data
                </span>
                .
              </h2>
              <p className="text-sm text-amber-200/80">
                This feature is in active beta — expect rapid improvements. Auto-fill accuracy and overlay positioning are still being refined.
              </p>

              <p className="text-lg leading-8 text-blue-100">
                Drop in any maritime document — AMSA 771, MCA testimonials, flag-specific certificates,
                or your own custom forms. Our AI reads the fields, matches them to the selected crew
                member and vessel, and auto-fills everything it can — including calculated sea time.
              </p>

              {/* Step preview */}
              <div className="space-y-2 pt-2">
                {[
                  { icon: Upload, text: 'Drop a PDF or image — no templates needed' },
                  { icon: Wand2, text: 'AI maps every blank to crew, vessel, or sea-time data' },
                  { icon: Eye, text: 'See the filled result overlaid on the original to verify' },
                ].map((step, idx) => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.15 + idx * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'rgba(34, 211, 238, 0.15)' }}
                      >
                        <Icon className="h-4 w-4" style={{ color: '#22d3ee' }} />
                      </div>
                      <span className="text-sm text-blue-100">{step.text}</span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Data sources grid */}
              <div className="grid grid-cols-3 gap-3 pt-4">
                {[
                  { icon: User, label: 'Crew profile', color: '#60a5fa' },
                  { icon: Ship, label: 'Vessel data', color: '#34d399' },
                  { icon: Calculator, label: 'Calculated sea time', color: '#818cf8' },
                ].map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.2 + idx * 0.1 }}
                      className="flex flex-col items-start gap-2 p-3 rounded-lg border"
                      style={{
                        backgroundColor: 'rgba(2, 22, 44, 0.4)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${feature.color}20` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: feature.color }} />
                      </div>
                      <span className="text-xs font-medium text-white">{feature.label}</span>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-4 pt-4">
                <Button
                  asChild
                  size="lg"
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-700 hover:to-emerald-700 text-white shadow-lg px-8 hover:scale-105 transition-transform duration-300"
                >
                  <Link href="/signup/vessel">
                    Try the Scanner
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-xl border-cyan-400/30 text-white bg-cyan-800/20 hover:bg-cyan-800/30 backdrop-blur-sm hover:scale-105 transition-transform duration-300"
                >
                  <Link href="/for-vessels">
                    <ScanSearch className="mr-2 h-4 w-4" />
                    Learn More
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AIDocumentScannerPromo;
