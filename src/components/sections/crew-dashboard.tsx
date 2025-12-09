'use client';

import { Users, Search, Shield, CheckCircle2, BarChart3, FileText, UserCheck, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';

const crewFeatures = [
  {
    icon: <Users className="h-6 w-6 text-accent" />,
    title: 'Crew Management',
    description: 'View and manage all crew members in one centralized dashboard. Search by name, email, or username.',
  },
  {
    icon: <CheckCircle2 className="h-6 w-6 text-accent" />,
    title: 'Subscription Tracking',
    description: 'Monitor crew member subscription status and tiers at a glance to ensure everyone has access.',
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-accent" />,
    title: 'Activity Overview',
    description: 'Track crew activity, sea time logs, and engagement to understand how your team uses the platform.',
  },
  {
    icon: <UserCheck className="h-6 w-6 text-accent" />,
    title: 'Profile Management',
    description: 'Access crew member profiles, assign them to vessels, and manage their permissions.',
  },
  {
    icon: <Clock className="h-6 w-6 text-accent" />,
    title: 'Join Date Tracking',
    description: 'See when each crew member joined your team to better understand your crew history.',
  },
  {
    icon: <FileText className="h-6 w-6 text-accent" />,
    title: 'Testimonial Oversight',
    description: 'Monitor and oversee testimonial requests from crew members to maintain quality standards.',
  },
];

const CrewDashboard = () => {
  return (
    <section className="py-16 sm:py-24" style={{ backgroundColor: '#02162c' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center mb-16">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full mb-6 border" style={{ backgroundColor: 'rgba(0, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Shield className="h-7 w-7" style={{ color: '#a5b4fc' }} />
          </div>
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
            Built for Vessel Owners & Captains
          </h2>
          <p className="mt-4 text-lg leading-8 text-blue-100 max-w-2xl mx-auto">
            SeaJourney provides powerful crew management tools for vessel owners and captains. 
            Manage your entire crew, track unlimited vessels, monitor progress, and oversee sea time documentation all from one dashboard with light and dark mode support.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {crewFeatures.map((feature, index) => (
            <Card 
              key={index}
              className="transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl backdrop-blur-sm rounded-xl border"
              style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
            >
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white mb-4">
                  {feature.icon}
                </div>
                <CardTitle className="font-headline text-xl text-white">{feature.title}</CardTitle>
                <CardDescription className="text-blue-100 mt-2">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Dashboard Preview */}
        <div className="relative max-w-6xl mx-auto">
          <div className="relative rounded-2xl p-4 border-2 backdrop-blur-sm shadow-2xl" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(2, 19, 36, 0.5)' }}>
            {/* Mock Crew Dashboard Preview */}
            <div className="rounded-xl p-6 border" style={{ backgroundColor: 'rgba(0, 22, 44, 0.3)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Crew Members</h3>
                    <p className="text-sm" style={{ color: '#c7d2fe' }}>Manage your team</p>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#a5b4fc' }} />
                  <input
                    type="text"
                    placeholder="Search crew..."
                    className="pl-10 pr-4 py-2 rounded-lg border text-sm w-64 text-white"
                    style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(0, 22, 44, 0.3)' }}
                    disabled
                  />
                </div>
              </div>

              {/* Mock Table */}
              <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: 'rgba(0, 22, 44, 0.5)' }}>
                    <tr>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: '#c7d2fe' }}>User</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: '#c7d2fe' }}>Email</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: '#c7d2fe' }}>Subscription</th>
                      <th className="px-4 py-3 text-left font-medium" style={{ color: '#c7d2fe' }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(2, 22, 44, 0.3)' }}>
                    {[
                      { name: 'John Smith', email: 'john@example.com', tier: 'premium', date: 'Jan 15, 2024' },
                      { name: 'Sarah Johnson', email: 'sarah@example.com', tier: 'basic', date: 'Feb 20, 2024' },
                      { name: 'Mike Williams', email: 'mike@example.com', tier: 'premium', date: 'Mar 10, 2024' },
                    ].map((member, idx) => (
                      <tr key={idx} className="transition-colors" onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 22, 44, 0.3)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-medium text-white">
                              {member.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span className="font-medium text-white">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#c7d2fe' }}>{member.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                            member.tier === 'premium' 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-blue-800/50'
                          }`} style={member.tier === 'basic' ? { color: '#c7d2fe' } : {}}>
                            {member.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#c7d2fe' }}>{member.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <p className="text-lg text-blue-100 mb-6">
            Ready to streamline your crew management?
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg px-8">
              <Link href="/signup">Get Started as Vessel Owner</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-xl border-blue-400/30 text-white bg-blue-800/20 hover:bg-blue-800/30 backdrop-blur-sm">
              <Link href="/dashboard-offering">Learn More About Features</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CrewDashboard;

