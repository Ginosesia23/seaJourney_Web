
'use client';

import { Calendar, FileText, History, User } from 'lucide-react';

const Hero = () => {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28" style={{ backgroundColor: '#000b15' }}>
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <div className="inline-block mb-4">
              <span className="inline-flex items-center rounded-full bg-blue-800/50 px-3 py-1 text-sm font-semibold text-blue-100">
                #1 Maritime Career App
              </span>
            </div>
            <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Your Complete<br />Maritime Logbook
                </h1>
            <p className="mt-6 text-lg leading-8 text-blue-100 max-w-3xl mx-auto">
              Track unlimited vessel states, manage your sea time, generate professional testimonials, and advance your career—all in one powerful platform. Built for crew members and vessel owners alike.
            </p>
          </div>
        </div>
        
        {/* Feature Highlights - Full Width */}
        <div className="mt-10 w-full px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-5 w-full items-start">
              {/* Card 1 - Vessel Tracking */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)',
                  border: '1px solid rgba(96, 165, 250, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(59, 130, 246, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.4) 0%, rgba(37, 99, 235, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-400/50 to-transparent"></div>
                      <svg className="h-6 w-6 text-blue-300 relative z-10 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Unlimited Vessel State Tracking</p>
                      <p className="text-xs text-blue-300/80">Track as many vessels as you need</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-blue-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-blue-200/90">Track unlimited vessels with full state management</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-blue-200/90">Real-time updates on vessel status and location</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-blue-200/90">Complete service history for each vessel</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 2 - Passage Tracking */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%)',
                  border: '1px solid rgba(196, 181, 253, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(168, 85, 247, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-purple-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.4) 0%, rgba(147, 51, 234, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(168, 85, 247, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-400/50 to-transparent"></div>
                      <svg className="h-6 w-6 text-purple-300 relative z-10 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Passage Tracking</p>
                      <p className="text-xs text-purple-300/80">Coming soon</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-purple-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-purple-200/90">Visual route mapping with interactive maps</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-purple-200/90">Track departures, arrivals, and destinations</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-purple-200/90">Complete passage history and statistics</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 3 - Light & Dark Modes */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(71, 85, 105, 0.15) 0%, rgba(51, 65, 85, 0.1) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(71, 85, 105, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/0 via-slate-500/5 to-slate-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(71, 85, 105, 0.4) 0%, rgba(51, 65, 85, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(71, 85, 105, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-400/50 to-transparent"></div>
                      <svg className="h-6 w-6 text-slate-300 relative z-10 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Light & Dark Modes</p>
                      <p className="text-xs text-slate-300/80">Choose your preferred theme</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-slate-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-slate-200/90">Seamless theme switching with one click</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-slate-200/90">System preference detection</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-slate-200/90">Reduced eye strain for all lighting conditions</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-slate-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 4 - Digital Testimonials */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%)',
                  border: '1px solid rgba(134, 239, 172, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(34, 197, 94, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/0 via-green-500/5 to-green-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.4) 0%, rgba(22, 163, 74, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-green-400/50 to-transparent"></div>
                      <svg className="h-6 w-6 text-green-300 relative z-10 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Digital Testimonials</p>
                      <p className="text-xs text-green-300/80">Get captain sign-offs instantly</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-green-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-green-200/90">Request testimonials directly from captains</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-green-200/90">Digital signatures and verification</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-green-200/90">Professional PDF format for portfolios</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 5 - Year Calendar View */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(8, 145, 178, 0.1) 100%)',
                  border: '1px solid rgba(103, 232, 249, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(6, 182, 212, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.4) 0%, rgba(8, 145, 178, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(6, 182, 212, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/50 to-transparent"></div>
                      <Calendar className="h-6 w-6 text-cyan-300 relative z-10 drop-shadow-lg" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Year Calendar View</p>
                      <p className="text-xs text-cyan-300/80">Visualize your entire service history</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-cyan-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-cyan-200/90">Full-year visual overview of sea time</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-cyan-200/90">Color-coded vessel assignments</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-cyan-200/90">Quick date range selection and filtering</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 6 - PDF Export */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.1) 100%)',
                  border: '1px solid rgba(251, 146, 60, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/0 via-orange-500/5 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.4) 0%, rgba(234, 88, 12, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(249, 115, 22, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-400/50 to-transparent"></div>
                      <FileText className="h-6 w-6 text-orange-300 relative z-10 drop-shadow-lg" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">PDF Export</p>
                      <p className="text-xs text-orange-300/80">Export professional documentation</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-orange-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-orange-200/90">Generate professional logbook PDFs</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-orange-200/90">Customizable date ranges and formats</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-orange-200/90">Print-ready formats for official submissions</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-orange-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 7 - Service History */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(219, 39, 119, 0.1) 100%)',
                  border: '1px solid rgba(244, 114, 182, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(236, 72, 153, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/0 via-pink-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.4) 0%, rgba(219, 39, 119, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(236, 72, 153, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-pink-400/50 to-transparent"></div>
                      <History className="h-6 w-6 text-pink-300 relative z-10 drop-shadow-lg" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Service History</p>
                      <p className="text-xs text-pink-300/80">Track your complete career journey</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-pink-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-pink-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-pink-200/90">Complete chronological service record</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-pink-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-pink-200/90">Detailed activity timeline with filters</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-pink-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-pink-200/90">Career milestones and achievements</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-pink-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>

              {/* Card 8 - Career Profile */}
              <div className="group relative rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 hover:z-20 hover:mb-20"
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0.1) 100%)',
                  border: '1px solid rgba(165, 180, 252, 0.3)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 8px 32px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  minHeight: '90px'
                }}>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"></div>
                <div className="relative p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0 h-12 w-12 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.4) 0%, rgba(79, 70, 229, 0.3) 100%)',
                        boxShadow: '0 0 20px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                      }}>
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/50 to-transparent"></div>
                      <User className="h-6 w-6 text-indigo-300 relative z-10 drop-shadow-lg" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm leading-tight mb-1">Career Profile</p>
                      <p className="text-xs text-indigo-300/80">Manage your professional profile</p>
                    </div>
                  </div>
                  
                  {/* Expanded Content - Expands within the card */}
                  <div className="max-h-0 overflow-hidden transition-all duration-500 group-hover:max-h-40 opacity-0 group-hover:opacity-100">
                    <div className="pt-3 mt-3 border-t border-indigo-500/20 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-indigo-200/90">Comprehensive professional profile</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-indigo-200/90">Total sea time and experience summary</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0"></div>
                        <p className="text-xs text-indigo-200/90">Qualifications and certifications tracking</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"></div>
              </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
