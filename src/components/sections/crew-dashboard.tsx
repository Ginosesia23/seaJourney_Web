'use client';

import { Users, Search, Shield, CheckCircle2, BarChart3, FileText, UserCheck, Clock, Ship, TrendingUp, Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

const crewFeatures = [
  {
    icon: Users,
    title: 'Crew Management',
    description: 'View and manage all crew members in one centralized dashboard. Search by name, email, or username.',
    color: '#3b82f6',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: CheckCircle2,
    title: 'Onboard Status',
    description: 'Track which crew members are currently onboard or offboard at a glance. Monitor crew presence in real-time.',
    color: '#10b981',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    icon: BarChart3,
    title: 'Activity Overview',
    description: 'Track crew activity, sea time logs, and engagement to understand how your team uses the platform.',
    color: '#8b5cf6',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: UserCheck,
    title: 'Profile Management',
    description: 'Access crew member profiles, assign them to vessels, and manage their permissions.',
    color: '#f59e0b',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Clock,
    title: 'Join Date Tracking',
    description: 'See when each crew member joined your team to better understand your crew history.',
    color: '#ec4899',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    icon: FileText,
    title: 'Testimonial Oversight',
    description: 'Monitor and oversee testimonial requests from crew members to maintain quality standards.',
    color: '#06b6d4',
    gradient: 'from-cyan-500 to-blue-500',
  },
];

const CrewDashboard = () => {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden" style={{ backgroundColor: '#000b15' }}>
      {/* Background Gradient Effects */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-4xl text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center"
          >
            <div className="flex flex-col items-center mb-6">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4 border-2 backdrop-blur-sm shadow-lg"
                style={{ 
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))',
                  borderColor: 'rgba(139, 92, 246, 0.4)'
                }}
              >
                <Shield className="h-8 w-8" style={{ color: '#a78bfa' }} />
              </div>
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-600/30 to-purple-600/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-blue-100 border border-blue-500/30 shadow-lg">
                <Ship className="h-4 w-4 mr-2" />
                Vessel Management Platform
              </span>
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4 bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
              Built for Vessel Owners & Captains
            </h2>
            <p className="mt-4 text-lg leading-8 text-blue-100 max-w-2xl mx-auto">
              SeaJourney provides powerful crew management tools for vessel owners and captains. 
              Manage your entire crew, track unlimited vessels, monitor progress, and oversee sea time documentation all from one dashboard.
            </p>
          </motion.div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {crewFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.05, y: -8 }}
                className="group"
              >
                <Card 
                  className="transform transition-all duration-300 hover:shadow-2xl backdrop-blur-sm rounded-xl border h-full relative overflow-hidden"
                  style={{ 
                    backgroundColor: 'rgba(2, 22, 44, 0.6)', 
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${feature.color}60`;
                    e.currentTarget.style.boxShadow = `0 20px 40px ${feature.color}30`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Gradient overlay on hover */}
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
                    style={{ 
                      background: `linear-gradient(135deg, ${feature.color}15, transparent)`
                    }}
                  />
                  
                  <CardHeader className="relative z-10">
                    <div 
                      className={`flex h-14 w-14 items-center justify-center rounded-xl mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}
                      style={{ 
                        background: `linear-gradient(135deg, ${feature.color}, ${feature.color}dd)`,
                      }}
                    >
                      <Icon className="h-7 w-7 text-white" />
                    </div>
                    <CardTitle className="font-headline text-xl text-white mb-2">{feature.title}</CardTitle>
                    <CardDescription className="text-blue-100 mt-2 leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Dashboard Preview */}
        <div className="relative max-w-6xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative rounded-2xl p-6 border-2 backdrop-blur-md shadow-2xl overflow-hidden"
            style={{ 
              borderColor: 'rgba(139, 92, 246, 0.4)', 
              backgroundColor: 'rgba(2, 19, 36, 0.7)',
              boxShadow: '0 20px 60px rgba(59, 130, 246, 0.2)'
            }}
          >
            {/* Animated background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10"></div>
            
            {/* Mock Crew Dashboard Preview */}
            <div className="relative z-10 rounded-xl p-6 border" style={{ backgroundColor: 'rgba(0, 22, 44, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Crew Members</h3>
                    <p className="text-sm flex items-center gap-2" style={{ color: '#c7d2fe' }}>
                      <TrendingUp className="h-3 w-3" />
                      Manage your team
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#a5b4fc' }} />
                  <input
                    type="text"
                    placeholder="Search crew..."
                    className="pl-10 pr-4 py-2.5 rounded-lg border text-sm w-64 text-white placeholder-blue-200/50"
                    style={{ borderColor: 'rgba(139, 92, 246, 0.3)', backgroundColor: 'rgba(0, 22, 44, 0.5)' }}
                    disabled
                  />
                </div>
              </div>

              {/* Mock Table */}
              <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <table className="w-full text-sm">
                  <thead style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))' }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: '#c7d2fe' }}>User</th>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: '#c7d2fe' }}>Email</th>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: '#c7d2fe' }}>Status</th>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: '#c7d2fe' }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(2, 22, 44, 0.3)' }}>
                    {[
                      { name: 'John Smith', email: 'john@example.com', onboard: true, date: 'Jan 15, 2024', avatar: 'JS' },
                      { name: 'Sarah Johnson', email: 'sarah@example.com', onboard: false, date: 'Feb 20, 2024', avatar: 'SJ' },
                      { name: 'Mike Williams', email: 'mike@example.com', onboard: true, date: 'Mar 10, 2024', avatar: 'MW' },
                    ].map((member, idx) => (
                      <motion.tr 
                        key={idx} 
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: 0.4 + idx * 0.1 }}
                        className="transition-colors hover:bg-blue-500/10 cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-semibold text-white shadow-md">
                              {member.avatar}
                            </div>
                            <span className="font-medium text-white">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#c7d2fe' }}>{member.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* Toggle Switch Style */}
                            <div className={`relative inline-flex items-center rounded-full transition-all duration-300 ${
                              member.onboard 
                                ? 'bg-gradient-to-r from-green-600 to-emerald-600' 
                                : 'bg-gray-700'
                            }`}>
                              <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                                member.onboard 
                                  ? 'text-white' 
                                  : 'text-gray-300'
                              }`}>
                                {member.onboard ? (
                                  <>
                                    <div className="h-2 w-2 rounded-full bg-white animate-pulse"></div>
                                    <span>Onboard</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                                    <span>Offboard</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#c7d2fe' }}>{member.date}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <Zap className="h-4 w-4" style={{ color: '#60a5fa' }} />
            <p className="text-sm font-semibold text-blue-200">Trusted by vessel owners worldwide</p>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            Ready to streamline your crew management?
          </h3>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Join vessel owners and captains who are already managing their crews more efficiently with SeaJourney.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              asChild 
              size="lg" 
              className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg px-8 hover:scale-105 transition-transform duration-300"
            >
              <Link href="/signup">
                Get Started as Vessel Owner
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button 
              asChild 
              variant="outline" 
              size="lg" 
              className="rounded-xl border-purple-400/30 text-white bg-purple-800/20 hover:bg-purple-800/30 backdrop-blur-sm hover:scale-105 transition-transform duration-300"
            >
              <Link href="/dashboard-offering">Learn More About Features</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CrewDashboard;

