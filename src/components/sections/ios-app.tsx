'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Smartphone, BookOpen, ArrowRight, CheckCircle2, Ship, Anchor, Building, LifeBuoy, Waves } from 'lucide-react';
import { AppStoreIcon } from '@/components/sections/cta';
import { motion, AnimatePresence } from 'framer-motion';

const features = [
  'Log sea time on the go',
  'Track vessel states instantly',
  'Quick daily status updates',
  'Syncs with your dashboard',
];

const iosAppFeatures = [
  {
    icon: <BookOpen className="h-6 w-6" style={{ color: '#60a5fa' }} />,
    title: 'Mobile Logbook',
    description: 'Log your sea time anywhere, anytime with our intuitive mobile app.',
  },
  {
    icon: <Smartphone className="h-6 w-6" style={{ color: '#60a5fa' }} />,
    title: 'Quick Logging',
    description: 'Fast and easy state logging directly from your phone.',
  },
  {
    icon: <ArrowRight className="h-6 w-6" style={{ color: '#60a5fa' }} />,
    title: 'Seamless Sync',
    description: 'All your data syncs automatically to the crew portal for advanced features.',
  },
];

type VesselState = 'underway' | 'at-anchor' | 'in-port' | 'on-leave';

const vesselStates = {
  'underway': { name: 'Underway', icon: Waves, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' },
  'at-anchor': { name: 'At Anchor', icon: Anchor, color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)', borderColor: 'rgba(249, 115, 22, 0.3)' },
  'in-port': { name: 'In Port', icon: Building, color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)' },
  'on-leave': { name: 'On Leave', icon: LifeBuoy, color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' },
};

const IOSApp = () => {
  const [selectedState, setSelectedState] = useState<VesselState>('underway');

  const currentState = vesselStates[selectedState];

  return (
    <section className="py-16 sm:py-24 border-y border-white/10" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Content */}
          <div>
            <div className="inline-block mb-4">
              <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold border" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.2)', color: '#60a5fa' }}>
                <Smartphone className="h-4 w-4 mr-2" />
                iOS Companion App
              </span>
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
              Log Sea Time on the Go
            </h2>
            <p className="text-lg leading-8 mb-6" style={{ color: '#c7d2fe' }}>
              Use our iOS app as your mobile logbook to quickly log your sea time and vessel states. Then access advanced features like testimonials, exports, and crew management on the web portal.
            </p>

            {/* Feature List */}
            <div className="space-y-3 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color: '#4ade80' }} />
                  <span className="text-white">{feature}</span>
                </div>
              ))}
            </div>

            {/* App Store Button */}
            <Button
              asChild
              size="lg"
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg px-8 mb-8"
            >
              <Link href="https://apps.apple.com/gb/app/seajourney/id6751553072" target="_blank" rel="noopener noreferrer">
                <AppStoreIcon className="mr-2 h-5 w-5" />
                Download on App Store
              </Link>
            </Button>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
              {iosAppFeatures.map((feature, index) => (
                <div
                  key={index}
                  className="rounded-xl border p-4" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <div className="mb-3">{feature.icon}</div>
                  <h3 className="font-semibold text-white text-sm mb-1">{feature.title}</h3>
                  <p className="text-xs" style={{ color: '#c7d2fe' }}>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side - App Preview */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-blue-600/20 rounded-[2.5rem] blur-3xl"></div>
              <div className="relative">
                {/* iPhone Frame */}
                <div className="rounded-[2.5rem] border-8 border-black/90 shadow-2xl overflow-hidden" style={{ width: '300px', height: '620px' }}>
                  {/* Status Bar */}
                  <div className="bg-gradient-to-b from-slate-900 to-slate-800 pt-8 px-6 pb-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs text-white font-semibold">9:41</span>
                      <div className="flex gap-1 items-center">
                        <div className="flex gap-0.5">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="w-1 h-1.5 rounded-full bg-white/60"></div>
                          ))}
                        </div>
                        <div className="w-8 h-3.5 rounded-sm border border-white/40 bg-white/20 ml-1"></div>
                        <div className="w-1 h-1 rounded-full bg-white/60 ml-0.5"></div>
                      </div>
                    </div>
                    
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-white font-bold text-xl">SeaJourney</h2>
                        <p className="text-xs" style={{ color: '#9ca3af' }}>Today, March 15</p>
                      </div>
                      <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">JS</span>
                      </div>
                    </div>
                  </div>

                  {/* App Content */}
                  <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 h-full px-5 py-6 flex flex-col" style={{ height: 'calc(100% - 100px)' }}>
                    {/* Active Vessel Card */}
                    <div className="mb-5">
                      <motion.div 
                        key={selectedState}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="rounded-2xl border overflow-hidden"
                        style={{ 
                          backgroundColor: currentState.bgColor, 
                          borderColor: currentState.borderColor 
                        }}
                      >
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <p className="text-xs font-medium mb-1" style={{ color: '#93c5fd' }}>ACTIVE VESSEL</p>
                              <h3 className="text-white font-bold text-base mb-1">MY OCEAN STAR</h3>
                              <p className="text-xs" style={{ color: '#9ca3af' }}>Motor Yacht • IMO 9876543</p>
                            </div>
                            <motion.div 
                              key={selectedState}
                              className="h-12 w-12 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: `${currentState.color}33` }}
                              initial={{ rotate: 0 }}
                              animate={{ rotate: [0, -10, 10, -10, 0] }}
                              transition={{ duration: 0.5 }}
                            >
                              <currentState.icon className="h-6 w-6" style={{ color: currentState.color }} />
                            </motion.div>
                          </div>
                          <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: `${currentState.color}33` }}>
                            <motion.div 
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: currentState.color }}
                              initial={{ scale: 1 }}
                              animate={{ scale: [1, 1.3, 1] }}
                              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                            />
                            <span className="text-sm font-medium text-white">{currentState.name}</span>
                            <span className="text-xs" style={{ color: '#9ca3af' }}>• 145 days logged</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>

                    {/* Quick Log Section */}
                    <div className="mb-5">
                      <h4 className="text-white font-semibold text-sm mb-3">Log Today's Status</h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        {(Object.entries(vesselStates) as [VesselState, typeof vesselStates[VesselState]][]).map(([stateKey, state]) => {
                          const isActive = selectedState === stateKey;
                          const StateIcon = state.icon;
                          return (
                            <motion.div
                              key={stateKey}
                              onClick={() => setSelectedState(stateKey)}
                              className={`rounded-xl p-3 border cursor-pointer transition-all ${
                                isActive ? 'ring-2' : 'hover:scale-105'
                              }`}
                            style={{
                                backgroundColor: isActive ? state.bgColor : 'rgba(30, 41, 59, 0.5)',
                                borderColor: isActive ? state.borderColor : 'rgba(255, 255, 255, 0.1)',
                                ringColor: `${state.color}80`
                            }}
                              whileTap={{ scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                          >
                            <div className="flex flex-col items-center gap-2">
                                <motion.div 
                                className="h-8 w-8 rounded-lg flex items-center justify-center"
                                  style={{ 
                                    backgroundColor: isActive ? state.color : 'rgba(148, 163, 184, 0.2)'
                                  }}
                                  animate={{
                                    scale: isActive ? [1, 1.1, 1] : 1,
                                  }}
                                  transition={{ duration: 0.3 }}
                              >
                                  <StateIcon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                                </motion.div>
                                <p className={`text-xs font-medium ${isActive ? 'text-white' : 'text-slate-400'}`}>
                                  {state.name}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stats Section */}
                    <div className="mb-5">
                      <div className="rounded-xl p-4 border" style={{ backgroundColor: 'rgba(30, 41, 59, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <p className="text-xs font-medium mb-3" style={{ color: '#9ca3af' }}>THIS MONTH</p>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'Days', value: '12', color: '#3b82f6' },
                            { label: 'Vessels', value: '1', color: '#8b5cf6' },
                            { label: 'Total', value: '145', color: '#06b6d4' },
                          ].map((stat, idx) => (
                            <div key={idx} className="text-center">
                              <p className="text-lg font-bold text-white mb-0.5">{stat.value}</p>
                              <p className="text-xs" style={{ color: '#9ca3af' }}>{stat.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Navigation Hint */}
                    <div className="mt-auto pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                      <div className="flex justify-center gap-8">
                        {['Home', 'Calendar', 'Vessels', 'Profile'].map((item, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1">
                            <div className={`h-1 w-1 rounded-full ${idx === 0 ? 'bg-blue-500' : 'bg-slate-600'}`}></div>
                            <p className={`text-xs ${idx === 0 ? 'text-blue-400 font-medium' : 'text-slate-500'}`}>{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Integration Message */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <ArrowRight className="h-5 w-5" style={{ color: '#60a5fa' }} />
            <p className="text-sm text-white">
              <span className="font-semibold">Log on mobile,</span> manage on web. Your data syncs seamlessly between the iOS app and crew portal.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default IOSApp;

