'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Monitor, RefreshCw, ArrowRight, CheckCircle2, Ship, Calendar, FileText, Waves, Anchor, Building, Briefcase, Wrench, Target, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AppStoreIcon } from '@/components/sections/cta';

type VesselState = 'underway' | 'at-anchor' | 'in-port' | 'on-leave' | 'in-yard';

const vesselStates = {
  'underway': { name: 'Underway', icon: Waves, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' },
  'at-anchor': { name: 'At Anchor', icon: Anchor, color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)', borderColor: 'rgba(249, 115, 22, 0.3)' },
  'in-port': { name: 'In Port', icon: Building, color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)' },
  'on-leave': { name: 'On Leave', icon: Briefcase, color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.15)', borderColor: 'rgba(107, 114, 128, 0.3)' },
  'in-yard': { name: 'In Yard', icon: Ship, color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' },
};

const Hero = () => {
  const [selectedState, setSelectedState] = useState<VesselState>('in-port');

  const currentState = vesselStates[selectedState];

  return (
    <section className="relative overflow-hidden py-20 sm:py-28" style={{ backgroundColor: '#000b15' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-block mb-6">
                <span className="inline-flex items-center rounded-full bg-blue-800/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-blue-100 border border-blue-500/30">
                  Mobile App + Web Portal
                </span>
              </div>
              <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
                Log on Mobile. <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Manage on Web.</span>
              </h1>
              <p className="text-lg sm:text-xl leading-relaxed text-blue-100/90 max-w-4xl mx-auto mb-10">
                Use our iOS app to quickly log your sea time anywhere, anytime. Then access powerful features like digital testimonials, professional exports, and complete career management on the web portal.
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 px-6 h-12 text-base font-semibold"
                >
                  <Link href="https://apps.apple.com/gb/app/seajourney/id6751553072" target="_blank" rel="noopener noreferrer">
                    <AppStoreIcon className="mr-2 h-4 w-4" />
                    Download iOS App
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-xl border-2 border-white/20 bg-white/5 hover:bg-white/10 text-white px-6 h-12 text-base font-semibold backdrop-blur-sm"
                >
                  <Link href="/offers" className="flex items-center gap-2">
                    Explore Web Portal
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Platform Showcase */}
          <div className="relative mb-16">
            <div className="flex flex-col lg:flex-row gap-12 items-start">
              {/* Mobile App Side */}
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="flex flex-col items-center lg:items-start lg:flex-shrink-0 lg:-ml-4 w-full lg:w-auto"
              >
                <div className="relative">
                  {/* Glow effect */}
                  <div className="absolute -inset-8 bg-gradient-to-br from-blue-500/30 via-blue-600/20 to-transparent rounded-[3.5rem] blur-3xl"></div>
                  
                  {/* iPhone Frame */}
                  <div className="relative" style={{ width: '300px', height: '620px' }}>
                    {/* Outer bezel */}
                    <div 
                      className="absolute inset-0 rounded-[3rem] bg-gradient-to-b from-gray-900 via-black to-gray-900"
                      style={{ 
                        boxShadow: `
                          0 0 0 2px rgba(255, 255, 255, 0.05),
                          0 30px 80px rgba(0, 0, 0, 0.6),
                          inset 0 1px 0 rgba(255, 255, 255, 0.1)
                        `
                      }}
                    >
                      {/* Notch */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-b-xl"></div>
                    </div>
                    
                    {/* Screen */}
                    <div className="absolute inset-[6px] rounded-[2.5rem] overflow-hidden bg-white flex flex-col">
                      {/* Dark Blue Header */}
                      <div className="px-4 pt-4 pb-4 shadow-lg flex-shrink-0" style={{ backgroundColor: '#0D2D44' }}>
                        {/* Title Section */}
                        <div className="flex items-center gap-2.5 mb-4">
                          <div className="h-6 w-6 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-inner">
                            <FileText className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-white font-bold text-sm leading-tight mb-0.5">State Log</h2>
                            <p className="text-[9px] text-white/75 font-medium">Track and log vessel states</p>
                          </div>
                        </div>

                        {/* Active Vessel Section */}
                        <div className="flex items-start gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-md shadow-green-500/30 flex-shrink-0">
                            <Target className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] text-white/70 font-medium mb-1 uppercase tracking-wider">Active Vessel</p>
                            <h3 className="text-white font-bold text-xs mb-1.5 leading-tight">Sunrise</h3>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-white/85">
                              <div className="flex items-center gap-1">
                                <Ship className="h-2.5 w-2.5" />
                                <span className="font-medium">IMO: 896372</span>
                              </div>
                              <span className="font-medium">Flag: Cayman Island</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* White Content Area */}
                      <div className="bg-gray-50 px-4 py-3 flex-1 overflow-y-auto">
                        {/* Vessel State Buttons */}
                        <div className="grid grid-cols-5 gap-1 mb-3">
                          {(Object.entries(vesselStates) as [VesselState, typeof vesselStates[VesselState]][]).map(([stateKey, state]) => {
                            const Icon = state.icon;
                            const isActive = selectedState === stateKey;
                            return (
                              <motion.button
                                key={stateKey}
                                onClick={() => setSelectedState(stateKey)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={`rounded-lg p-1.5 text-center shadow-sm transition-all ${
                                  isActive 
                                    ? 'shadow-lg' 
                                    : 'bg-gray-100 hover:bg-gray-200'
                                }`}
                                style={{
                                  backgroundColor: isActive ? state.color : undefined,
                                }}
                              >
                                <Icon className={`h-3.5 w-3.5 mx-auto mb-0.5 ${
                                  isActive ? 'text-white' : 'text-gray-600'
                                }`} />
                                <p className={`text-[9px] font-medium leading-tight ${
                                  isActive ? 'text-white' : 'text-gray-700'
                                }`}>{state.name}</p>
                              </motion.button>
                            );
                          })}
                        </div>

                        {/* State History Card */}
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5">
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="h-5 w-5 rounded-lg bg-blue-50 flex items-center justify-center">
                              <Calendar className="h-3 w-3 text-blue-600" />
                            </div>
                            <h4 className="text-[10px] font-bold text-gray-900">State History</h4>
                          </div>

                          {/* Calendar Header */}
                          <div className="flex items-center justify-between mb-1.5 px-0.5">
                            <button className="h-5 w-5 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                              <ChevronLeft className="h-2.5 w-2.5 text-gray-600" />
                            </button>
                            <p className="text-[10px] font-bold text-gray-900">January 2026</p>
                            <button className="h-5 w-5 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                              <ChevronRight className="h-2.5 w-2.5 text-gray-600" />
                            </button>
                          </div>

                          {/* Calendar Days Header */}
                          <div className="grid grid-cols-7 gap-0.5 mb-1">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                              <div key={day} className="text-center text-[9px] text-gray-500 font-semibold py-0.5">
                                {day}
                              </div>
                            ))}
                          </div>

                          {/* Calendar Grid */}
                          <div className="grid grid-cols-7 gap-0.5">
                            {/* Empty days */}
                            {Array.from({ length: 0 }).map((_, i) => (
                              <div key={`empty-${i}`} className="aspect-square"></div>
                            ))}
                            {/* Days 1-11 with green (in-port) circles */}
                            {Array.from({ length: 11 }).map((_, i) => {
                              const day = i + 1;
                              const hasPurpleOutline = day <= 3;
                              return (
                                <div key={day} className="aspect-square flex items-center justify-center">
                                  <div 
                                    className={`h-6 w-6 rounded-full flex items-center justify-center shadow-sm ${
                                      hasPurpleOutline ? 'ring-1.5 ring-purple-500 ring-offset-0' : ''
                                    }`} 
                                    style={{ backgroundColor: '#22c55e' }}
                                  >
                                    <span className="text-[9px] font-bold text-white">{day}</span>
                                  </div>
                                </div>
                              );
                            })}
                            {/* Day 12 - Latest date, changes color based on selected state */}
                            <div className="aspect-square flex items-center justify-center">
                              <div 
                                className="h-6 w-6 rounded-full flex items-center justify-center shadow-sm" 
                                style={{ backgroundColor: vesselStates[selectedState].color }}
                              >
                                <span className="text-[9px] font-bold text-white">12</span>
                              </div>
                            </div>
                            {/* Days 13-31 faded */}
                            {Array.from({ length: 19 }).map((_, i) => {
                              const day = i + 13;
                              return (
                                <div key={day} className="aspect-square flex items-center justify-center">
                                  <span className="text-[9px] text-gray-300 font-medium">{day}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Dark Blue Footer Navigation */}
                      <div className="px-4 py-2.5 flex items-center justify-around border-t shadow-inner flex-shrink-0" style={{ backgroundColor: '#0D2D44', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="h-7 w-7 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                            <FileText className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-[9px] text-white font-semibold">Log</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 opacity-60">
                          <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center">
                            <Ship className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-[9px] text-white/70 font-medium">Vessels</span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5 opacity-60">
                          <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center">
                            <Briefcase className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-[9px] text-white/70 font-medium">Profile</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Label - Mobile only */}
                <div className="mt-8 text-center lg:hidden w-full">
                  <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full shadow-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', backdropFilter: 'blur(10px)' }}>
                    <Smartphone className="h-4 w-4 text-blue-400" />
                    <p className="text-sm font-semibold text-white">iOS App</p>
                  </div>
                  <p className="text-xs mt-2.5 text-blue-200/80">Quick logging on the go</p>
                </div>
              </motion.div>


              {/* Web Portal Side */}
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="flex flex-col items-center lg:items-start lg:flex-1 lg:min-w-0 w-full"
              >
                <div className="relative">
                  {/* Glow effect */}
                  <div className="absolute -inset-8 bg-gradient-to-br from-purple-500/30 via-purple-600/20 to-transparent rounded-3xl blur-3xl"></div>
                  
                  {/* Desktop Frame - Desktop View */}
                  <div className="hidden lg:block relative" style={{ width: '950px', height: '680px' }}>
                    {/* Mac-style browser frame */}
                    <div className="rounded-t-xl bg-gradient-to-b from-slate-800 to-slate-900 border-t border-x border-slate-700/60 px-5 py-4 shadow-xl">
                      <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                          <div className="h-3.5 w-3.5 rounded-full bg-red-500 shadow-sm"></div>
                          <div className="h-3.5 w-3.5 rounded-full bg-yellow-500 shadow-sm"></div>
                          <div className="h-3.5 w-3.5 rounded-full bg-green-500 shadow-sm"></div>
                        </div>
                        <div className="flex-1 bg-slate-700/90 rounded-xl px-5 py-2.5 border border-slate-600/50 shadow-inner">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-400"></div>
                            <p className="text-xs text-slate-300 font-medium">seajourney.com/dashboard</p>
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-slate-700/90 border border-slate-600/50 flex items-center justify-center hover:bg-slate-600/90 transition-colors cursor-pointer shadow-sm">
                          <RefreshCw className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    </div>

                    {/* Dashboard Content */}
                    <div className="rounded-b-xl border-x border-b border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-10 shadow-2xl">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-4 gap-4 mb-8">
                        {[
                          { label: 'Sea Time', value: '315', icon: Calendar, color: '#60a5fa' },
                          { label: 'Vessels', value: '3', icon: Ship, color: '#4ade80' },
                          { label: 'Testimonials', value: '5', icon: FileText, color: '#a78bfa' },
                          { label: 'This Month', value: '28', icon: BarChart3, color: '#f59e0b' },
                        ].map((stat, idx) => {
                          const Icon = stat.icon;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl p-4 border relative overflow-hidden group hover:scale-105 transition-transform"
                              style={{ 
                                backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" style={{ backgroundColor: stat.color }}></div>
                              <div className="relative">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="h-10 w-10 rounded-lg flex items-center justify-center shadow-md" style={{ backgroundColor: `${stat.color}20` }}>
                                    <Icon className="h-5 w-5" style={{ color: stat.color }} />
                                  </div>
                                  <p className="text-sm font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                                </div>
                                <p className="text-3xl font-bold text-white">{stat.value}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Two Column Layout */}
                      <div className="grid grid-cols-2 gap-6">
                        {/* Left Column - Activity Feed */}
                        <div className="rounded-xl p-6 border shadow-md" style={{ 
                          backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                          borderColor: 'rgba(255, 255, 255, 0.1)'
                        }}>
                          <div className="flex items-center gap-2 mb-5">
                            <div className="h-2.5 w-2.5 rounded-full bg-blue-400 shadow-md shadow-blue-400/50"></div>
                            <p className="text-sm font-bold text-white">Recent Activity</p>
                          </div>
                          <div className="space-y-4">
                            {[
                              { 
                                icon: Waves, 
                                text: 'State updated on MY OCEAN STAR', 
                                detail: 'Changed to Underway',
                                time: '2 hours ago', 
                                color: '#60a5fa' 
                              },
                              { 
                                icon: FileText, 
                                text: 'Testimonial approved', 
                                detail: 'Captain James Wilson',
                                time: '5 days ago', 
                                color: '#4ade80' 
                              },
                              { 
                                icon: Ship, 
                                text: 'New vessel assignment', 
                                detail: 'SV HORIZON',
                                time: '1 week ago', 
                                color: '#a78bfa' 
                              },
                              { 
                                icon: Calendar, 
                                text: 'Sea time exported', 
                                detail: 'PDF format',
                                time: '2 weeks ago', 
                                color: '#f59e0b' 
                              },
                            ].map((activity, idx) => {
                              const Icon = activity.icon;
                              return (
                              <div key={idx} className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                                <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm" style={{ backgroundColor: `${activity.color}20` }}>
                                  <Icon className="h-5 w-5" style={{ color: activity.color }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white mb-1">{activity.text}</p>
                                  <p className="text-sm text-slate-400 mb-1.5">{activity.detail}</p>
                                  <p className="text-xs text-slate-500">{activity.time}</p>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right Column - Active Vessels */}
                        <div className="space-y-6">
                          {/* Active Vessel Card */}
                          <div className="rounded-xl p-6 border shadow-md" style={{ 
                            backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                            borderColor: 'rgba(59, 130, 246, 0.3)'
                          }}>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-md shadow-green-400/50"></div>
                              <p className="text-sm font-bold text-white">Active Vessel</p>
                            </div>
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-lg flex items-center justify-center shadow-md" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                                <Ship className="h-6 w-6" style={{ color: '#60a5fa' }} />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-bold text-white text-base mb-1">MY OCEAN STAR</h4>
                                <p className="text-xs text-slate-400 mb-2">Motor Yacht • IMO: 9876543</p>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}>
                                    <Waves className="h-3.5 w-3.5" style={{ color: '#60a5fa' }} />
                                    <span className="text-xs font-semibold text-white">Underway</span>
                                  </div>
                                  <span className="text-xs text-slate-400">145 days logged</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="rounded-xl p-6 border shadow-md" style={{ 
                            backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                            borderColor: 'rgba(255, 255, 255, 0.1)'
                          }}>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="h-2.5 w-2.5 rounded-full bg-purple-400 shadow-md shadow-purple-400/50"></div>
                              <p className="text-sm font-bold text-white">Quick Actions</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { icon: FileText, label: 'Export', color: '#a78bfa' },
                                { icon: Calendar, label: 'Calendar', color: '#4ade80' },
                                { icon: Ship, label: 'Vessels', color: '#60a5fa' },
                                { icon: BarChart3, label: 'Analytics', color: '#f59e0b' },
                              ].map((action, idx) => {
                                const Icon = action.icon;
                                return (
                                  <div
                                    key={idx}
                                    className="rounded-lg p-3 border cursor-pointer hover:scale-105 transition-transform group"
                                    style={{ 
                                      backgroundColor: 'rgba(15, 23, 42, 0.6)', 
                                      borderColor: 'rgba(255, 255, 255, 0.1)'
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${action.color}20` }}>
                                        <Icon className="h-4 w-4" style={{ color: action.color }} />
                                      </div>
                                      <span className="text-xs font-semibold text-white">{action.label}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Mobile/Tablet View - Simplified */}
                  <div className="lg:hidden w-full max-w-md mx-auto mt-4">
                    <div className="rounded-xl border border-slate-700/60 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4 shadow-2xl">
                      {/* Stats Grid - 2 columns on mobile */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          { label: 'Sea Time', value: '315', icon: Calendar, color: '#60a5fa' },
                          { label: 'Vessels', value: '3', icon: Ship, color: '#4ade80' },
                          { label: 'Testimonials', value: '5', icon: FileText, color: '#a78bfa' },
                          { label: 'This Month', value: '28', icon: BarChart3, color: '#f59e0b' },
                        ].map((stat, idx) => {
                          const Icon = stat.icon;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl p-3 border relative overflow-hidden"
                              style={{ 
                                backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              <div className="relative">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <div className="h-6 w-6 rounded-lg flex items-center justify-center shadow-md" style={{ backgroundColor: `${stat.color}20` }}>
                                    <Icon className="h-3.5 w-3.5" style={{ color: stat.color }} />
                                  </div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{stat.label}</p>
                                </div>
                                <p className="text-xl font-bold text-white">{stat.value}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Activity Feed - Single column on mobile */}
                      <div className="rounded-xl p-3 border shadow-md" style={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                        borderColor: 'rgba(255, 255, 255, 0.1)'
                      }}>
                        <div className="flex items-center gap-1.5 mb-3">
                          <div className="h-2 w-2 rounded-full bg-blue-400 shadow-md shadow-blue-400/50"></div>
                          <p className="text-xs font-bold text-white">Recent Activity</p>
                        </div>
                        <div className="space-y-2">
                          {[
                            { 
                              icon: Waves, 
                              text: 'State updated', 
                              detail: 'MY OCEAN STAR',
                              time: '2h ago', 
                              color: '#60a5fa' 
                            },
                            { 
                              icon: FileText, 
                              text: 'Testimonial approved', 
                              detail: 'Captain Wilson',
                              time: '5d ago', 
                              color: '#4ade80' 
                            },
                          ].map((activity, idx) => {
                            const Icon = activity.icon;
                            return (
                              <div key={idx} className="flex items-start gap-2 pb-2 border-b last:border-0 last:pb-0" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                                <div className="h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm" style={{ backgroundColor: `${activity.color}20` }}>
                                  <Icon className="h-3 w-3" style={{ color: activity.color }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-white mb-0.5">{activity.text}</p>
                                  <p className="text-[10px] text-slate-400">{activity.detail} • {activity.time}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Label - Mobile only */}
                <div className="mt-8 text-center lg:hidden w-full">
                  <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full shadow-lg" style={{ backgroundColor: 'rgba(147, 51, 234, 0.15)', border: '1px solid rgba(147, 51, 234, 0.3)', backdropFilter: 'blur(10px)' }}>
                    <Monitor className="h-4 w-4 text-purple-400" />
                    <p className="text-sm font-semibold text-white">Web Portal</p>
                  </div>
                  <p className="text-xs mt-2.5 text-purple-200/80">Advanced features & management</p>
                </div>
              </motion.div>
            </div>
            
            {/* Labels Row - Positioned below previews on desktop */}
            <div className="hidden lg:flex flex-row justify-between items-start mt-24">
              <div className="text-left">
                <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full shadow-lg" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', backdropFilter: 'blur(10px)' }}>
                  <Smartphone className="h-4 w-4 text-blue-400" />
                  <p className="text-sm font-semibold text-white">iOS App</p>
                </div>
                <p className="text-xs mt-2.5 text-blue-200/80">Quick logging on the go</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full shadow-lg" style={{ backgroundColor: 'rgba(147, 51, 234, 0.15)', border: '1px solid rgba(147, 51, 234, 0.3)', backdropFilter: 'blur(10px)' }}>
                  <Monitor className="h-4 w-4 text-purple-400" />
                  <p className="text-sm font-semibold text-white">Web Portal</p>
                </div>
                <p className="text-xs mt-2.5 text-purple-200/80">Advanced features & management</p>
              </div>
            </div>
          </div>

          {/* Key Benefits - Inspired by IOSApp */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
          >
            {[
              {
                icon: Smartphone,
                title: 'Log Anywhere',
                description: 'Quick vessel state logging from your iPhone, even when offline. Perfect for busy crew schedules.',
                color: 'blue',
              },
              {
                icon: RefreshCw,
                title: 'Instant Sync',
                description: 'Your data syncs automatically between mobile and web. Never lose track of your sea time.',
                color: 'purple',
              },
              {
                icon: Monitor,
                title: 'Manage Everything',
                description: 'Access digital testimonials, professional exports, analytics, and complete career management.',
                color: 'green',
              },
            ].map((benefit, idx) => {
              const Icon = benefit.icon;
              const colorConfig = {
                blue: {
                  bg: 'bg-blue-500/20',
                  border: 'border-blue-500/30',
                  icon: 'text-blue-400',
                  text: 'text-blue-100',
                },
                purple: {
                  bg: 'bg-purple-500/20',
                  border: 'border-purple-500/30',
                  icon: 'text-purple-400',
                  text: 'text-purple-100',
                },
                green: {
                  bg: 'bg-green-500/20',
                  border: 'border-green-500/30',
                  icon: 'text-green-400',
                  text: 'text-green-100',
                },
              };
              const colors = colorConfig[benefit.color as keyof typeof colorConfig];

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.7 + idx * 0.1 }}
                  whileHover={{ y: -5 }}
                  className={`rounded-2xl border-2 p-6 text-center transition-all ${colors.bg} ${colors.border}`}
                  style={{ 
                    backgroundColor: 'rgba(2, 22, 44, 0.6)', 
                    backdropFilter: 'blur(20px)'
                  }}
                >
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${colors.bg} border ${colors.border}`}>
                    <Icon className={`h-7 w-7 ${colors.icon}`} />
                  </div>
                  <h3 className="font-bold text-white text-base mb-2">{benefit.title}</h3>
                  <p className={`text-sm leading-relaxed ${colors.text}`}>{benefit.description}</p>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Integration Message - Inspired by IOSApp */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-3 px-6 py-4 rounded-xl border shadow-lg" style={{ backgroundColor: 'rgba(2, 22, 44, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)' }}>
              <ArrowRight className="h-5 w-5" style={{ color: '#60a5fa' }} />
              <p className="text-sm text-white">
                <span className="font-semibold">Log on mobile,</span> manage on web. Your data syncs seamlessly between the iOS app and crew portal.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
