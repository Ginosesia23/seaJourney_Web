'use client';

import { 
  Download,
  Ship,
  MapPin,
  Calendar,
  Clock,
  Database,
  Zap,
  CheckCircle2,
  Route,
  Navigation,
  TrendingUp,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const AISImport = () => {
  const features = [
    {
      icon: Route,
      title: 'Past Passages',
      description: 'Import complete passage history including departure/arrival ports, dates, and routes from AIS data',
      color: '#3b82f6',
    },
    {
      icon: Ship,
      title: 'Vessel State History',
      description: 'Automatically populate vessel state logs (underway, at anchor, in port) since vessel launch',
      color: '#8b5cf6',
    },
    {
      icon: Database,
      title: 'Historical Data',
      description: 'Backfill years of operational data instantly - no manual entry required',
      color: '#10b981',
    },
    {
      icon: Zap,
      title: 'Instant Import',
      description: 'One-click import process that processes AIS data and creates logs automatically',
      color: '#f59e0b',
    },
  ];

  const benefits = [
    {
      icon: CheckCircle2,
      title: 'Complete History',
      description: 'Get your full vessel operational history from day one',
      color: '#10b981',
    },
    {
      icon: Clock,
      title: 'Time Saved',
      description: 'Save hundreds of hours of manual data entry',
      color: '#3b82f6',
    },
    {
      icon: FileText,
      title: 'Accurate Records',
      description: 'AIS data ensures precise timestamps and locations',
      color: '#8b5cf6',
    },
    {
      icon: TrendingUp,
      title: 'Better Analytics',
      description: 'Complete historical data enables powerful insights and reporting',
      color: '#f59e0b',
    },
  ];

  return (
    <section id="ais-import" className="py-16 sm:py-24 border-t border-white/10 relative overflow-hidden" style={{ backgroundColor: '#000b15' }}>
      {/* Background Gradient Effects */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-block mb-6">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-600/30 to-blue-600/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-purple-100 border border-purple-500/30 shadow-lg">
                <Database className="h-4 w-4 mr-2" />
                AIS Data Import
              </span>
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
              Import Past Vessel Data from AIS
            </h2>
            <p className="text-lg leading-8 text-blue-100">
              Automatically import your vessel's complete operational history including past passages, 
              vessel states, and movement data since launch. No manual entry required.
            </p>
          </motion.div>
        </div>

        {/* Visual Preview */}
        <div className="max-w-6xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative rounded-2xl p-8 border-2 backdrop-blur-md shadow-2xl overflow-hidden"
            style={{ 
              borderColor: 'rgba(139, 92, 246, 0.4)', 
              backgroundColor: 'rgba(2, 19, 36, 0.7)',
              boxShadow: '0 20px 60px rgba(139, 92, 246, 0.2)'
            }}
          >
            {/* Animated background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10"></div>
            <div className="relative z-10">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left Side - Import Process */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)' }}>
                    <Download className="h-6 w-6" style={{ color: '#a78bfa' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">AIS Data Import</h3>
                    <p className="text-sm text-blue-200">One-click import process</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {[
                    { step: '1', label: 'Connect AIS Data Source', status: 'complete' },
                    { step: '2', label: 'Select Date Range', status: 'complete' },
                    { step: '3', label: 'Process & Import Data', status: 'processing' },
                    { step: '4', label: 'Review & Confirm', status: 'pending' },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ backgroundColor: 'rgba(0, 22, 44, 0.4)' }}
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        item.status === 'complete' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        item.status === 'processing' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-pulse' :
                        'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                        {item.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : item.step}
                      </div>
                      <span className="text-sm text-white">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side - Data Preview */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                    <Ship className="h-6 w-6" style={{ color: '#60a5fa' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">Imported Data</h3>
                    <p className="text-sm text-blue-200">Sample preview</p>
                  </div>
                </div>

                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.3)' }}>
                  <div className="p-3 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.5)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-200">Passage Logs</span>
                      <span className="text-xs text-green-400">1,247 imported</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {[
                      { from: 'Monaco', to: 'Porto Cervo', date: '2024-01-15', status: 'imported' },
                      { from: 'Porto Cervo', to: 'Palma', date: '2024-01-20', status: 'imported' },
                      { from: 'Palma', to: 'Barcelona', date: '2024-01-25', status: 'imported' },
                    ].map((passage, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" style={{ color: '#60a5fa' }} />
                          <span className="text-xs text-white">{passage.from} → {passage.to}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" style={{ color: '#94a3b8' }} />
                          <span className="text-xs text-blue-200">{passage.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.3)' }}>
                  <div className="p-3 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.5)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-200">Vessel States</span>
                      <span className="text-xs text-green-400">3,652 imported</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {[
                      { state: 'Underway', date: '2024-01-15', days: '5 days' },
                      { state: 'At Anchor', date: '2024-01-20', days: '2 days' },
                      { state: 'In Port', date: '2024-01-22', days: '3 days' },
                    ].map((state, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                        <div className="flex items-center gap-2">
                          <Navigation className="h-3 w-3" style={{ color: '#8b5cf6' }} />
                          <span className="text-xs text-white">{state.state}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" style={{ color: '#94a3b8' }} />
                          <span className="text-xs text-blue-200">{state.date} ({state.days})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto mb-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.4 + idx * 0.1 }}
                  className="rounded-xl border p-5 text-center hover:scale-105 transition-transform duration-300 group"
                  style={{ 
                    backgroundColor: 'rgba(2, 22, 44, 0.6)', 
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${feature.color}40`;
                    e.currentTarget.style.boxShadow = `0 10px 30px ${feature.color}20`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div 
                    className="h-12 w-12 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300" 
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <Icon className="h-6 w-6" style={{ color: feature.color }} />
                  </div>
                  <h4 className="font-semibold text-white text-sm mb-2">{feature.title}</h4>
                  <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Benefits Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="max-w-6xl mx-auto mb-12"
        >
          <div className="text-center mb-8">
            <h3 className="font-headline text-2xl font-bold text-white mb-2">Why Import AIS Data?</h3>
            <p className="text-blue-200 text-sm">Complete your vessel's operational history instantly</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, idx) => {
              const Icon = benefit.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.6 + idx * 0.1 }}
                  className="rounded-xl border p-5 hover:scale-105 transition-transform duration-300 group"
                  style={{ 
                    backgroundColor: 'rgba(2, 22, 44, 0.4)', 
                    borderColor: 'rgba(255, 255, 255, 0.1)' 
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${benefit.color}40`;
                    e.currentTarget.style.boxShadow = `0 10px 30px ${benefit.color}20`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div 
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300" 
                    style={{ backgroundColor: `${benefit.color}20` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: benefit.color }} />
                  </div>
                  <h4 className="font-semibold text-white text-sm mb-1">{benefit.title}</h4>
                  <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                    {benefit.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center"
        >
          <p className="text-sm text-blue-200 mb-6">
            Import your vessel's complete operational history from AIS data sources. 
            Supports major AIS providers and historical data archives.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              asChild 
              size="lg" 
              className="rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg px-8 hover:scale-105 transition-transform duration-300"
            >
              <Link href="/signup/vessel">Get Started with AIS Import</Link>
            </Button>
            <Button 
              asChild 
              variant="outline" 
              size="lg" 
              className="rounded-xl border-purple-400/30 text-white bg-purple-800/20 hover:bg-purple-800/30 backdrop-blur-sm hover:scale-105 transition-transform duration-300"
            >
              <Link href="/for-vessels">Learn More</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AISImport;
