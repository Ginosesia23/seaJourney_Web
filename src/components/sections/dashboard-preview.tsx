
'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Waves, Calendar, ArrowRight, GraduationCap, Briefcase, TrendingUp, Zap, Database, Globe, Anchor, Building, Ship, Target, Award, Clock, TrendingDown, BarChart3 } from 'lucide-react';

const chartData = [
    { name: 'Jan', value: 80 }, { name: 'Feb', value: 120 },
    { name: 'Mar', value: 180 }, { name: 'Apr', value: 150 },
    { name: 'May', value: 220 }, { name: 'Jun', value: 140 },
    { name: 'Jul', value: 250 }, { name: 'Aug', value: 190 },
    { name: 'Sep', value: 160 }, { name: 'Oct', value: 200 },
    { name: 'Nov', value: 210 }, { name: 'Dec', value: 280 }
];

// Certifications & Qualifications Preview
const CertificationsPreview = () => {
  const certifications = [
    { name: 'STCW Basic Safety Training', expiry: '2025-06-15', status: 'Valid', daysRemaining: 120 },
    { name: 'Engine Room Resource Management', expiry: '2025-03-20', status: 'Valid', daysRemaining: 45 },
    { name: 'Medical First Aid', expiry: '2024-12-30', status: 'Expiring Soon', daysRemaining: 15 },
  ];

    return (
    <div className="w-full h-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg" style={{ color: '#e0e7ff' }}>Certifications & Qualifications</h3>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
          Coming Soon
        </span>
      </div>
      
      <div className="space-y-4 flex-grow">
        {certifications.map((cert, idx) => (
                    <motion.div
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className="rounded-xl border p-5" 
            style={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.6)', 
              borderColor: cert.status === 'Expiring Soon' ? 'rgba(249, 115, 22, 0.4)' : 'rgba(255, 255, 255, 0.15)'
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(249, 115, 22, 0.2)' }}>
                  <GraduationCap className="h-5 w-5" style={{ color: '#fb923c' }} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-white text-sm mb-1">{cert.name}</h4>
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#94a3b8' }}>
                    <span>Expires: {cert.expiry}</span>
                    <span>•</span>
                    <span>{cert.daysRemaining} days remaining</span>
                  </div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                cert.status === 'Valid' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              }`}>
                {cert.status}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t text-center" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <p className="text-xs" style={{ color: '#c7d2fe' }}>
          Track all your qualifications, certifications, and training records in one place
        </p>
      </div>
    </div>
  );
};

// Career Opportunities Preview
const CareerOpportunitiesPreview = () => {
  const opportunities = [
    { position: 'Chief Engineer - Motor Yacht', location: 'Mediterranean', vessel: '120m Motor Yacht', salary: 'Competitive', type: 'Full-time' },
    { position: 'Deck Officer - Sailing Yacht', location: 'Caribbean', vessel: '45m Sailing Yacht', salary: '€3,500/mo', type: 'Contract' },
    { position: 'Chef - Superyacht', location: 'Monaco', vessel: '80m Motor Yacht', salary: '€4,200/mo', type: 'Full-time' },
  ];

  return (
    <div className="w-full h-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg" style={{ color: '#e0e7ff' }}>Career Opportunities</h3>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          Coming Soon
        </span>
      </div>
      
      <div className="space-y-4 flex-grow">
        {opportunities.map((job, idx) => (
                            <motion.div
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className="rounded-xl border p-5 hover:shadow-lg transition-all cursor-pointer" 
            style={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.6)', 
              borderColor: 'rgba(6, 182, 212, 0.3)'
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="h-4 w-4" style={{ color: '#22d3ee' }} />
                  <h4 className="font-bold text-white text-sm">{job.position}</h4>
                </div>
                <div className="space-y-1 text-xs" style={{ color: '#94a3b8' }}>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    <span>{job.location}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Waves className="h-3 w-3" />
                    <span>{job.vessel}</span>
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {job.type}
              </span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <span className="text-xs font-semibold text-white">{job.salary}</span>
              <span className="text-xs" style={{ color: '#22d3ee' }}>Apply Now →</span>
            </div>
                            </motion.div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t text-center" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <p className="text-xs" style={{ color: '#c7d2fe' }}>
          Discover new opportunities matched to your experience and qualifications
        </p>
      </div>
    </div>
  );
};

// Advanced Analytics Preview
const AnalyticsPreview = () => {
  // Mock analytics data
  const analytics = {
    daysToOfficer: 235,
    currentSeaTime: 315,
    requiredSeaTime: 550,
    progressPercent: 57,
    certificationProgress: 78,
    rankProgress: 65,
    avgDaysPerMonth: 26.5,
    efficiency: 92,
  };

  return (
    <div className="w-full h-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg" style={{ color: '#e0e7ff' }}>Advanced Analytics</h3>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-pink-500/20 text-pink-300 border border-pink-500/30">
          Coming Soon
        </span>
      </div>
      
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4" style={{ color: '#ec4899' }} />
            <span className="text-xs font-medium text-white">Career Growth</span>
          </div>
          <p className="text-2xl font-bold text-white mb-1">+28%</p>
          <p className="text-xs" style={{ color: '#94a3b8' }}>vs last year</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4" style={{ color: '#ec4899' }} />
            <span className="text-xs font-medium text-white">Efficiency</span>
          </div>
          <p className="text-2xl font-bold text-white mb-1">{analytics.efficiency}%</p>
          <p className="text-xs" style={{ color: '#94a3b8' }}>Time utilization</p>
        </div>
      </div>

      {/* Days to Officer - Primary Feature */}
      <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(236, 72, 153, 0.2)' }}>
              <Target className="h-6 w-6" style={{ color: '#ec4899' }} />
            </div>
            <div>
              <h4 className="font-semibold text-white text-base mb-1">Days to Officer Qualification</h4>
              <p className="text-xs" style={{ color: '#94a3b8' }}>Progress toward next rank</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-white">{analytics.daysToOfficer}</p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>days remaining</p>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-2">
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${analytics.rankProgress}%`,
                background: 'linear-gradient(90deg, #ec4899 0%, #f472b6 100%)',
                boxShadow: '0 0 10px rgba(236, 72, 153, 0.5)'
              }}
            ></div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: '#94a3b8' }}>Current: Deck Cadet</span>
          <span style={{ color: '#94a3b8' }}>Target: Officer of the Watch</span>
        </div>
      </div>

      {/* Sea Time Progress */}
      <div className="rounded-xl border p-5 mb-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5" style={{ color: '#ec4899' }} />
            <div>
              <h4 className="font-semibold text-white text-sm mb-1">Sea Time Progress</h4>
              <p className="text-xs" style={{ color: '#94a3b8' }}>Required for Officer rank</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{analytics.currentSeaTime}</p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>/ {analytics.requiredSeaTime} days</p>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-2">
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${analytics.progressPercent}%`,
                background: 'linear-gradient(90deg, #ec4899 0%, #f472b6 100%)',
                boxShadow: '0 0 10px rgba(236, 72, 153, 0.5)'
              }}
            ></div>
          </div>
        </div>
        <p className="text-xs text-center" style={{ color: '#94a3b8' }}>
          {analytics.progressPercent}% complete • {analytics.requiredSeaTime - analytics.currentSeaTime} days to go
        </p>
      </div>

      {/* Additional Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="h-4 w-4" style={{ color: '#ec4899' }} />
            <span className="text-xs font-medium text-white">Certifications</span>
          </div>
          <p className="text-2xl font-bold text-white mb-1">{analytics.certificationProgress}%</p>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div 
              className="h-full rounded-full"
              style={{ 
                width: `${analytics.certificationProgress}%`,
                backgroundColor: '#ec4899'
              }}
            ></div>
          </div>
          <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>Requirements met</p>
        </div>
        
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4" style={{ color: '#ec4899' }} />
            <span className="text-xs font-medium text-white">Avg Days/Month</span>
          </div>
          <p className="text-2xl font-bold text-white mb-1">{analytics.avgDaysPerMonth}</p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingDown className="h-3 w-3" style={{ color: '#22c55e' }} />
            <p className="text-xs" style={{ color: '#94a3b8' }}>+12% from last month</p>
          </div>
        </div>
      </div>
      
      <div className="mt-2 pt-4 border-t text-center" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <p className="text-xs" style={{ color: '#c7d2fe' }}>
          Visualize your career progress with detailed analytics and insights
        </p>
      </div>
    </div>
  );
};

// Passage Tracking Preview (Coming Soon)
const PassageTrackingPreview = () => {
  const mockPassages = [
    { from: 'Monaco', to: 'Ibiza', date: 'Mar 15, 2024', duration: '2 days', status: 'Completed' },
    { from: 'Ibiza', to: 'Palma', date: 'Mar 20, 2024', duration: '1 day', status: 'Completed' },
    { from: 'Palma', to: 'Barcelona', date: 'Apr 5, 2024', duration: '1 day', status: 'In Progress' },
  ];

  return (
    <div className="w-full h-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg" style={{ color: '#e0e7ff' }}>Passage Tracking</h3>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
          Coming Soon
        </span>
      </div>

      {/* Mock Map View */}
      <div className="rounded-xl border p-6 mb-6 relative overflow-hidden" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(168, 85, 247, 0.3)' }}>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)' }}>
              <MapPin className="h-6 w-6" style={{ color: '#a78bfa' }} />
            </div>
            <div>
              <p className="font-semibold text-white">Route Visualization</p>
              <p className="text-sm" style={{ color: '#c7d2fe' }}>Track your voyages on an interactive map</p>
            </div>
          </div>
          
          {/* Route Container */}
          <div className="relative" style={{ height: '200px', padding: '20px 0' }}>
            {/* SVG Route Lines */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1, overflow: 'visible' }}>
              {/* Route 1: Monaco to Ibiza (Completed) */}
              <path 
                d="M 60 100 Q 180 80, 240 100" 
                stroke="#a78bfa" 
                strokeWidth="3.5" 
                fill="none" 
                opacity="0.9"
                style={{ filter: 'drop-shadow(0 0 4px rgba(167, 139, 250, 0.5))' }}
              />
              
              {/* Route 2: Ibiza to Palma (Completed) */}
              <path 
                d="M 240 100 Q 340 95, 400 100" 
                stroke="#a78bfa" 
                strokeWidth="3.5" 
                fill="none" 
                opacity="0.9"
                style={{ filter: 'drop-shadow(0 0 4px rgba(167, 139, 250, 0.5))' }}
              />
              
              {/* Route 3: Palma to Barcelona (In Progress - halfway completed) */}
              {/* Completed portion (solid, first half) */}
              <path 
                d="M 400 100 Q 450 97.5, 490 98.75" 
                stroke="#fbbf24" 
                strokeWidth="3.5" 
                fill="none" 
                opacity="0.9"
                style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.5))' }}
              />
              {/* Remaining portion (dashed, second half) */}
              <path 
                d="M 490 98.75 Q 500 97.5, 580 100" 
                stroke="#fbbf24" 
                strokeWidth="3.5" 
                strokeDasharray="8,6" 
                fill="none" 
                opacity="0.6"
                style={{ filter: 'drop-shadow(0 0 2px rgba(251, 191, 36, 0.3))' }}
              />
            </svg>
            
            {/* Port Markers - Horizontally aligned */}
            <div className="relative h-full flex items-center justify-between px-4">
              {/* Monaco - Start */}
              <div className="flex flex-col items-center relative z-10" style={{ flex: '0 0 auto' }}>
                <div className="relative mb-3">
                  <div className="absolute inset-0 rounded-full bg-green-400/30 animate-ping"></div>
                  <div className="relative h-5 w-5 rounded-full bg-green-400 border-3 border-white shadow-lg" style={{ borderWidth: '3px' }}></div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white mb-0.5">Monaco</p>
                  <p className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">Start</p>
                </div>
              </div>
              
              {/* Ibiza */}
              <div className="flex flex-col items-center relative z-10" style={{ flex: '0 0 auto' }}>
                <div className="relative mb-3">
                  <div className="relative h-5 w-5 rounded-full bg-green-400 border-3 border-white shadow-lg" style={{ borderWidth: '3px' }}></div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white mb-0.5">Ibiza</p>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>Stop 1</p>
                </div>
              </div>
              
              {/* Palma */}
              <div className="flex flex-col items-center relative z-10" style={{ flex: '0 0 auto' }}>
                <div className="relative mb-3">
                  <div className="relative h-5 w-5 rounded-full bg-green-400 border-3 border-white shadow-lg" style={{ borderWidth: '3px' }}></div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white mb-0.5">Palma</p>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>Stop 2</p>
                </div>
              </div>
              
              {/* Barcelona - End */}
              <div className="flex flex-col items-center relative z-10" style={{ flex: '0 0 auto' }}>
                <div className="relative mb-3">
                  <div className="absolute inset-0 rounded-full bg-yellow-400/30 animate-pulse"></div>
                  <div className="relative h-5 w-5 rounded-full bg-yellow-400 border-3 border-white shadow-lg" style={{ borderWidth: '3px' }}></div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white mb-0.5">Barcelona</p>
                  <p className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">In Progress</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Legend */}
          <div className="mt-6 pt-4 border-t flex items-center justify-center gap-6 flex-wrap" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-2.5">
              <div className="h-3.5 w-10 rounded" style={{ backgroundColor: '#a78bfa', opacity: 0.9 }}></div>
              <span className="text-xs font-medium" style={{ color: '#c7d2fe' }}>Completed</span>
            </div>
            <div className="flex items-center gap-2.5">
              <svg className="h-3.5 w-10" style={{ overflow: 'visible' }}>
                {/* Solid portion (left half) */}
                <line 
                  x1="0" 
                  y1="50%" 
                  x2="50%" 
                  y2="50%" 
                  stroke="#fbbf24" 
                  strokeWidth="3.5" 
                  opacity="0.9"
                />
                {/* Dashed portion (right half) */}
                <line 
                  x1="50%" 
                  y1="50%" 
                  x2="100%" 
                  y2="50%" 
                  stroke="#fbbf24" 
                  strokeWidth="3.5" 
                  strokeDasharray="8,6" 
                  opacity="0.6"
                />
              </svg>
              <span className="text-xs font-medium" style={{ color: '#c7d2fe' }}>In Progress</span>
            </div>
          </div>
        </div>
      </div>

      {/* Passage List */}
      <div className="space-y-3 flex-grow">
        {mockPassages.map((passage, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className="rounded-xl border p-5 hover:shadow-lg transition-all" 
            style={{ 
              backgroundColor: 'rgba(15, 23, 42, 0.6)', 
              borderColor: passage.status === 'In Progress' ? 'rgba(251, 191, 36, 0.4)' : passage.status === 'Upcoming' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.15)'
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ 
                  backgroundColor: passage.status === 'In Progress' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(168, 85, 247, 0.2)' 
                }}>
                  <Waves className="h-5 w-5" style={{ color: passage.status === 'In Progress' ? '#fbbf24' : '#a78bfa' }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">{passage.from}</span>
                    <ArrowRight className="h-4 w-4" style={{ color: passage.status === 'In Progress' ? '#fbbf24' : '#a78bfa' }} />
                    <span className="font-bold text-white text-sm">{passage.to}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#94a3b8' }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {passage.date}
                    </span>
                    <span>•</span>
                    <span>{passage.duration}</span>
                  </div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                passage.status === 'Completed' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : passage.status === 'In Progress'
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              }`}>
                {passage.status}
              </span>
            </div>
                    </motion.div>
                ))}
            </div>

      {/* Coming Soon Footer */}
      <div className="mt-4 pt-4 border-t text-center" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <p className="text-xs" style={{ color: '#c7d2fe' }}>
          Record voyages, track routes, and visualize your passage history
        </p>
      </div>
    </div>
  );
};

// API Integration Preview
const APIIntegrationPreview = () => {
  return (
    <div className="w-full h-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-lg" style={{ color: '#e0e7ff' }}>API Integration</h3>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
          Coming Soon
        </span>
      </div>
      
      <div className="space-y-4 flex-grow">
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)' }}>
              <Database className="h-5 w-5" style={{ color: '#818cf8' }} />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm mb-1">Connect Your Systems</h4>
              <p className="text-xs" style={{ color: '#94a3b8' }}>Integrate with third-party platforms</p>
            </div>
          </div>
          <div className="space-y-3">
            {['HR Systems', 'Payroll Platforms', 'Crew Management Software', 'Document Storage'].map((service, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)' }}>
                <span className="text-xs text-white">{service}</span>
                <Zap className="h-3 w-3" style={{ color: '#818cf8' }} />
              </div>
            ))}
          </div>
        </div>
        
        <div className="rounded-xl border p-5" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
          <div className="flex items-center gap-3 mb-3">
            <Globe className="h-5 w-5" style={{ color: '#818cf8' }} />
            <h4 className="font-bold text-white text-sm">Developer API</h4>
          </div>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            Build custom integrations and automate workflows with our REST API
          </p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t text-center" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <p className="text-xs" style={{ color: '#c7d2fe' }}>
          Seamlessly connect your maritime data with other platforms and services
        </p>
            </div>
        </div>
    );
};


type PreviewType = 'passage' | 'certifications' | 'career' | 'analytics' | 'api';

export default function DashboardPreview() {
  const [isClient, setIsClient] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<PreviewType>('passage');

  useEffect(() => {
    setIsClient(true);
  }, []);


  return (
    <section className="py-16 sm:py-24 border-y border-white/10" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Coming Soon
          </h2>
          <p className="mt-6 max-w-2xl mx-auto text-lg leading-8 text-blue-100">
            We're constantly working on new features to enhance your maritime career management. Explore what's coming next.
          </p>
          
          {/* Feature Pills */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setSelectedFeature('passage')}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium border transition-all cursor-pointer ${
                selectedFeature === 'passage' ? 'scale-105 shadow-lg' : 'hover:scale-105'
              }`}
              style={{
                backgroundColor: selectedFeature === 'passage' ? 'rgba(147, 51, 234, 0.3)' : 'rgba(2, 22, 44, 0.5)',
                borderColor: selectedFeature === 'passage' ? 'rgba(147, 51, 234, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                color: '#e0e7ff'
              }}
            >
              ⚡ Passage Tracking
            </button>
            <button
              onClick={() => setSelectedFeature('certifications')}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium border transition-all cursor-pointer ${
                selectedFeature === 'certifications' ? 'scale-105 shadow-lg' : 'hover:scale-105'
              }`}
              style={{
                backgroundColor: selectedFeature === 'certifications' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(2, 22, 44, 0.5)',
                borderColor: selectedFeature === 'certifications' ? 'rgba(249, 115, 22, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                color: '#e0e7ff'
              }}
            >
              🎓 Certifications & Qualifications
            </button>
            <button
              onClick={() => setSelectedFeature('career')}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium border transition-all cursor-pointer ${
                selectedFeature === 'career' ? 'scale-105 shadow-lg' : 'hover:scale-105'
              }`}
              style={{
                backgroundColor: selectedFeature === 'career' ? 'rgba(6, 182, 212, 0.3)' : 'rgba(2, 22, 44, 0.5)',
                borderColor: selectedFeature === 'career' ? 'rgba(6, 182, 212, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                color: '#e0e7ff'
              }}
            >
              💼 Career Opportunities
            </button>
            <button
              onClick={() => setSelectedFeature('analytics')}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium border transition-all cursor-pointer ${
                selectedFeature === 'analytics' ? 'scale-105 shadow-lg' : 'hover:scale-105'
              }`}
              style={{
                backgroundColor: selectedFeature === 'analytics' ? 'rgba(236, 72, 153, 0.3)' : 'rgba(2, 22, 44, 0.5)',
                borderColor: selectedFeature === 'analytics' ? 'rgba(236, 72, 153, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                color: '#e0e7ff'
              }}
            >
              📊 Advanced Analytics
            </button>
            <button
              onClick={() => setSelectedFeature('api')}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium border transition-all cursor-pointer ${
                selectedFeature === 'api' ? 'scale-105 shadow-lg' : 'hover:scale-105'
              }`}
              style={{
                backgroundColor: selectedFeature === 'api' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(2, 22, 44, 0.5)',
                borderColor: selectedFeature === 'api' ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                color: '#e0e7ff'
              }}
            >
              🔌 API Integration
            </button>
          </div>
        </div>

        <div className="relative mt-16 max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {isClient && (
              <motion.div
                key={selectedFeature}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                {selectedFeature === 'passage' && <PassageTrackingPreview />}
                {selectedFeature === 'certifications' && <CertificationsPreview />}
                {selectedFeature === 'career' && <CareerOpportunitiesPreview />}
                {selectedFeature === 'analytics' && <AnalyticsPreview />}
                {selectedFeature === 'api' && <APIIntegrationPreview />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
