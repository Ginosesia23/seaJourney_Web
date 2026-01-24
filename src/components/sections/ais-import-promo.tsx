'use client';

import { 
  Download,
  Ship,
  Database,
  Zap,
  Route,
  Navigation,
  ArrowRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const AISImportPromo = () => {
  return (
    <section id="ais-import-promo" className="py-16 sm:py-24 border-t border-white/10 relative overflow-hidden" style={{ backgroundColor: '#000b15' }}>
      {/* Background Gradient Effects */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Side - Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="inline-block">
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-600/30 to-blue-600/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-purple-100 border border-purple-500/30 shadow-lg">
                  <Database className="h-4 w-4 mr-2" />
                  For Vessel Owners
                </span>
              </div>
              
              <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Import Past Vessel Data from{' '}
                <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  AIS
                </span>
              </h2>
              
              <p className="text-lg leading-8 text-blue-100">
                Automatically import your vessel's complete operational history including past passages 
                and vessel states since launch. Backfill years of data instantly—no manual entry required.
              </p>

              {/* Key Features */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                {[
                  { icon: Route, label: 'Past Passages', color: '#3b82f6' },
                  { icon: Navigation, label: 'Vessel States', color: '#8b5cf6' },
                  { icon: Zap, label: 'Instant Import', color: '#f59e0b' },
                  { icon: Ship, label: 'Complete History', color: '#10b981' },
                ].map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.2 + idx * 0.1 }}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: 'rgba(2, 22, 44, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                    >
                      <div 
                        className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" 
                        style={{ backgroundColor: `${feature.color}20` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: feature.color }} />
                      </div>
                      <span className="text-sm font-medium text-white">{feature.label}</span>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-4 pt-4">
                <Button 
                  asChild 
                  size="lg" 
                  className="rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg px-8 hover:scale-105 transition-transform duration-300"
                >
                  <Link href="/for-vessels">
                    Learn More
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button 
                  asChild 
                  variant="outline" 
                  size="lg" 
                  className="rounded-xl border-purple-400/30 text-white bg-purple-800/20 hover:bg-purple-800/30 backdrop-blur-sm hover:scale-105 transition-transform duration-300"
                >
                  <Link href="/signup/vessel">Get Started</Link>
                </Button>
              </div>
            </motion.div>

            {/* Right Side - Visual Preview */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-2xl p-6 border-2 backdrop-blur-md shadow-2xl overflow-hidden"
                style={{ 
                  borderColor: 'rgba(139, 92, 246, 0.4)', 
                  backgroundColor: 'rgba(2, 19, 36, 0.7)',
                  boxShadow: '0 20px 60px rgba(139, 92, 246, 0.2)'
                }}
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10"></div>
                
                <div className="relative z-10">
                  {/* Import Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(0, 22, 44, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Route className="h-4 w-4" style={{ color: '#60a5fa' }} />
                        <span className="text-xs font-semibold text-blue-200">Passages</span>
                      </div>
                      <div className="text-2xl font-bold text-white">1,247</div>
                      <div className="text-xs text-green-400 mt-1">✓ Imported</div>
                    </div>
                    <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(0, 22, 44, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Navigation className="h-4 w-4" style={{ color: '#a78bfa' }} />
                        <span className="text-xs font-semibold text-blue-200">States</span>
                      </div>
                      <div className="text-2xl font-bold text-white">3,652</div>
                      <div className="text-xs text-green-400 mt-1">✓ Imported</div>
                    </div>
                  </div>

                  {/* Sample Data */}
                  <div className="space-y-3">
                    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.3)' }}>
                      <div className="p-2 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.5)' }}>
                        <span className="text-xs font-semibold text-blue-200">Recent Passages</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {[
                          { from: 'Monaco', to: 'Porto Cervo', date: 'Jan 15' },
                          { from: 'Porto Cervo', to: 'Palma', date: 'Jan 20' },
                        ].map((passage, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-white">{passage.from} → {passage.to}</span>
                            <span className="text-blue-200">{passage.date}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Import Progress */}
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Download className="h-4 w-4 animate-pulse" style={{ color: '#a78bfa' }} />
                      <span className="text-xs font-semibold text-white">Import in Progress</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0, 22, 44, 0.5)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: '75%' }}
                        viewport={{ once: true }}
                        transition={{ duration: 2, delay: 0.5 }}
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)' }}
                      />
                    </div>
                    <div className="text-xs text-blue-200 mt-1">75% Complete</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AISImportPromo;
