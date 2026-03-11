'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { CheckCircle2, Clock, Sparkles, Rocket, Target, Zap, Shield, Globe, Users, BarChart3, FileText, Calendar, Bell, MapPin, Ship, ArrowRight, TrendingUp, Star, Lightbulb, Code, Play, Layers } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RoadmapItem {
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'planned' | 'upcoming';
  quarter?: string;
  category: 'platform' | 'features' | 'integrations' | 'mobile';
  icon: React.ComponentType<{ className?: string }>;
  progress?: number; // 0-100 for in-progress items
  completedDate?: string; // For completed items
  priority?: 'high' | 'medium' | 'low';
}

const roadmapItems: RoadmapItem[] = [
  // Completed
  {
    title: 'Digital Testimonials',
    description: 'Secure, verifiable digital testimonials with unique verification codes',
    status: 'completed',
    category: 'features',
    icon: FileText,
  },
  {
    title: 'Sea Time Tracking',
    description: 'Comprehensive sea service logging with vessel state management',
    status: 'completed',
    category: 'features',
    icon: Ship,
  },
  {
    title: 'Vessel Management',
    description: 'Vessel profiles, assignments, and state tracking for captains',
    status: 'completed',
    category: 'platform',
    icon: Ship,
  },
  {
    title: 'Public Verification System',
    description: 'Public verification portal for testimonial authenticity',
    status: 'completed',
    category: 'features',
    icon: Shield,
  },
  {
    title: 'Certificate Tracking',
    description: 'Track certifications, licenses, and expiration dates',
    status: 'completed',
    category: 'features',
    icon: Shield,
  },
  {
    title: 'MCA Application Forms',
    description: 'Auto-populated MCA Watch Rating Certificate applications (Nav Watch, OOW)',
    status: 'completed',
    category: 'features',
    icon: FileText,
  },
  {
    title: 'iOS Mobile App',
    description: 'Native iOS application for iPhone and iPad',
    status: 'completed',
    category: 'mobile',
    icon: Rocket,
  },
  
  // In Progress
  {
    title: 'Watch Logging',
    description: 'Officer watch time tracking and logging system',
    status: 'in-progress',
    category: 'features',
    icon: Clock,
    progress: 75,
    priority: 'high',
  },
  {
    title: 'Position History',
    description: 'Career progression tracking with position history management',
    status: 'in-progress',
    category: 'features',
    icon: BarChart3,
    progress: 90,
    priority: 'high',
  },
  {
    title: 'Android Mobile App',
    description: 'Native Android application for smartphones and tablets',
    status: 'in-progress',
    quarter: 'Q1 2026',
    category: 'mobile',
    icon: Rocket,
    progress: 40,
    priority: 'high',
  },
  
  // Planned
  {
    title: 'Advanced Analytics Dashboard',
    description: 'Detailed sea time analytics, trends, and career insights',
    status: 'planned',
    quarter: 'Q2 2026',
    category: 'features',
    icon: BarChart3,
  },
  {
    title: 'Document Export & Sharing',
    description: 'Export sea service records, testimonials, and certificates as PDF',
    status: 'planned',
    quarter: 'Q2 2026',
    category: 'features',
    icon: FileText,
  },
  {
    title: 'Visa Tracker Enhancements',
    description: 'Advanced visa day calculations and multi-country tracking',
    status: 'planned',
    quarter: 'Q2 2026',
    category: 'features',
    icon: Calendar,
  },
  {
    title: 'Notification System',
    description: 'Email and push notifications for certificate expirations, testimonials, and updates',
    status: 'planned',
    quarter: 'Q2 2026',
    category: 'platform',
    icon: Bell,
  },
  {
    title: 'AIS Integration',
    description: 'Automatic vessel tracking and position updates via AIS data',
    status: 'planned',
    quarter: 'Q3 2026',
    category: 'integrations',
    icon: MapPin,
  },
  {
    title: 'Fleet Management',
    description: 'Multi-vessel management tools for fleet operators',
    status: 'planned',
    quarter: 'Q3 2026',
    category: 'platform',
    icon: Ship,
  },
  {
    title: 'Crew Scheduling',
    description: 'Advanced crew scheduling and rotation management',
    status: 'planned',
    quarter: 'Q3 2026',
    category: 'features',
    icon: Calendar,
  },
  {
    title: 'API Access',
    description: 'RESTful API for third-party integrations and custom solutions',
    status: 'planned',
    quarter: 'Q3 2026',
    category: 'integrations',
    icon: Zap,
  },
  
  // Upcoming
  {
    title: 'International Port Database',
    description: 'Comprehensive database of ports worldwide with entry/exit logging',
    status: 'upcoming',
    quarter: 'Q4 2026',
    category: 'features',
    icon: Globe,
  },
  {
    title: 'Social Features',
    description: 'Crew networking, recommendations, and professional connections',
    status: 'upcoming',
    quarter: 'Q4 2026',
    category: 'platform',
    icon: Users,
  },
  {
    title: 'Training & Certification Tracking',
    description: 'Track STCW courses, medical certificates, and training records',
    status: 'upcoming',
    quarter: 'Q4 2026',
    category: 'features',
    icon: Shield,
  },
  {
    title: 'Payroll Integration',
    description: 'Integration with payroll systems for automated sea time verification',
    status: 'upcoming',
    quarter: '2026',
    category: 'integrations',
    icon: Zap,
  },
];

const statusConfig = {
  completed: {
    label: 'Completed',
    color: 'bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400',
    icon: CheckCircle2,
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400',
    icon: Clock,
  },
  planned: {
    label: 'Planned',
    color: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400',
    icon: Target,
  },
  upcoming: {
    label: 'Upcoming',
    color: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400',
    icon: Sparkles,
  },
};

const categoryConfig = {
  platform: { label: 'Platform', icon: Rocket },
  features: { label: 'Features', icon: Zap },
  integrations: { label: 'Integrations', icon: Globe },
  mobile: { label: 'Mobile', icon: Rocket },
};

export default function RoadmapPage() {
  const groupedItems = useMemo(() => {
    return roadmapItems.reduce((acc, item) => {
      if (!acc[item.status]) {
        acc[item.status] = [];
      }
      acc[item.status].push(item);
      return acc;
    }, {} as Record<string, RoadmapItem[]>);
  }, []);

  const stats = useMemo(() => {
    return {
      completed: roadmapItems.filter(i => i.status === 'completed').length,
      inProgress: roadmapItems.filter(i => i.status === 'in-progress').length,
      planned: roadmapItems.filter(i => i.status === 'planned').length,
      upcoming: roadmapItems.filter(i => i.status === 'upcoming').length,
      total: roadmapItems.length,
    };
  }, []);


  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#000b15' }}>
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 sm:py-28" style={{ backgroundColor: '#000b15' }}>
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
          </div>

          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mx-auto max-w-3xl text-center"
            >
              <div className="inline-block mb-6">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-4 py-1.5">
                  <Rocket className="mr-2 h-4 w-4" />
                  Product Roadmap
                </Badge>
              </div>
              <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
                Our Journey Ahead
              </h1>
              <p className="text-lg sm:text-xl leading-relaxed text-blue-100/90 mb-8">
                Explore what we're building next and the exciting features coming to SeaJourney. 
                We're committed to continuously improving your maritime career management experience.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Statistics Bar */}
        <section className="border-y border-white/10 py-8 relative overflow-hidden" style={{ backgroundColor: '#000b15' }}>
          {/* Animated background gradient */}
          <div className="absolute inset-0 opacity-20">
            <motion.div
              animate={{
                backgroundPosition: ['0% 0%', '100% 100%'],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                repeatType: 'reverse',
              }}
              className="absolute inset-0 bg-gradient-to-r from-green-500/20 via-blue-500/20 via-purple-500/20 to-orange-500/20"
              style={{ backgroundSize: '200% 200%' }}
            />
          </div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, type: 'spring' }}
                whileHover={{ scale: 1.1 }}
                className="text-center p-4 rounded-xl bg-green-500/5 border border-green-500/20 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="text-4xl font-bold text-green-400 mb-2"
                >
                  {stats.completed}
                </motion.div>
                <div className="text-sm text-blue-100/70 font-medium">Completed</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1, type: 'spring' }}
                whileHover={{ scale: 1.1 }}
                className="text-center p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, type: 'spring' }}
                  className="text-4xl font-bold text-blue-400 mb-2"
                >
                  {stats.inProgress}
                </motion.div>
                <div className="text-sm text-blue-100/70 font-medium">In Progress</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
                whileHover={{ scale: 1.1 }}
                className="text-center p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, type: 'spring' }}
                  className="text-4xl font-bold text-purple-400 mb-2"
                >
                  {stats.planned}
                </motion.div>
                <div className="text-sm text-blue-100/70 font-medium">Planned</div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3, type: 'spring' }}
                whileHover={{ scale: 1.1 }}
                className="text-center p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, type: 'spring' }}
                  className="text-4xl font-bold text-orange-400 mb-2"
                >
                  {stats.upcoming}
                </motion.div>
                <div className="text-sm text-blue-100/70 font-medium">Upcoming</div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Development Timeline */}
        <section className="py-12 sm:py-16 relative overflow-hidden" style={{ backgroundColor: '#000b15' }}>
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-1/4 left-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
          </div>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Our Development Journey</h2>
              <p className="text-lg text-blue-100/80 max-w-2xl mx-auto">
                From concept to launch and beyond - tracking our growth and milestones
              </p>
            </motion.div>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500/50 via-blue-500/50 via-cyan-500/50 via-green-500/50 via-purple-500/50 to-orange-500/50 transform md:-translate-x-1/2 hidden md:block"></div>

              {/* Timeline milestones */}
              <div className="space-y-12 md:space-y-16">
                {/* Idea Phase */}
                <motion.div
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className="relative md:flex md:items-center"
                >
                  <div className="md:w-1/2 md:pr-12 md:text-right">
                    <Card className="rounded-2xl border-2 bg-gradient-to-br from-yellow-500/10 via-card/50 to-card/50 backdrop-blur-sm border-yellow-500/30 overflow-hidden group hover:shadow-xl hover:shadow-yellow-500/20 transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 md:justify-end mb-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-yellow-500/30 to-yellow-500/10 flex items-center justify-center border-2 border-yellow-500/40">
                            <Lightbulb className="h-6 w-6 text-yellow-400" />
                          </div>
                          <div className="md:text-right">
                            <CardTitle className="text-xl font-bold text-white">The Idea</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">Q1 2024</p>
                          </div>
                        </div>
                        <CardDescription className="text-base text-blue-100/80">
                          Conceptualizing SeaJourney - a platform to revolutionize maritime career management and sea time tracking
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="absolute left-0 md:left-1/2 top-6 md:top-1/2 transform md:-translate-x-1/2 md:-translate-y-1/2 flex items-center justify-center z-10">
                    <div className="absolute inset-0 bg-yellow-500/30 blur-md rounded-full"></div>
                    <div className="relative h-6 w-6 rounded-full bg-yellow-500 border-2 border-yellow-400 ring-4 ring-yellow-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="md:w-1/2 md:pl-12"></div>
                </motion.div>

                {/* Development Phase */}
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="relative md:flex md:items-center md:flex-row-reverse"
                >
                  <div className="md:w-1/2 md:pl-12">
                    <Card className="rounded-2xl border-2 bg-gradient-to-br from-blue-500/10 via-card/50 to-card/50 backdrop-blur-sm border-blue-500/30 overflow-hidden group hover:shadow-xl hover:shadow-blue-500/20 transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-500/10 flex items-center justify-center border-2 border-blue-500/40">
                            <Code className="h-6 w-6 text-blue-400" />
                          </div>
                          <div>
                            <CardTitle className="text-xl font-bold text-white">Development Begins</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">Q2-Q3 2024</p>
                          </div>
                        </div>
                        <CardDescription className="text-base text-blue-100/80">
                          Building the core platform - user authentication, vessel management, and sea time tracking systems
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="absolute left-0 md:left-1/2 top-6 md:top-1/2 transform md:-translate-x-1/2 md:-translate-y-1/2 flex items-center justify-center z-10">
                    <div className="absolute inset-0 bg-blue-500/30 blur-md rounded-full"></div>
                    <div className="relative h-6 w-6 rounded-full bg-blue-500 border-2 border-blue-400 ring-4 ring-blue-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="md:w-1/2 md:pr-12"></div>
                </motion.div>

                {/* Beta Launch Phase */}
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="relative md:flex md:items-center md:flex-row-reverse"
                >
                  <div className="md:w-1/2 md:pl-12">
                    <Card className="rounded-2xl border-2 bg-gradient-to-br from-cyan-500/10 via-card/50 to-card/50 backdrop-blur-sm border-cyan-500/30 overflow-hidden group hover:shadow-xl hover:shadow-cyan-500/20 transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 flex items-center justify-center border-2 border-cyan-500/40">
                            <Rocket className="h-6 w-6 text-cyan-400" />
                          </div>
                          <div>
                            <CardTitle className="text-xl font-bold text-white">Beta Launch</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">Q4 2025</p>
                          </div>
                        </div>
                        <CardDescription className="text-base text-blue-100/80">
                          Beta release with early adopters - testing core features, gathering feedback, and refining the platform
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="absolute left-0 md:left-1/2 top-6 md:top-1/2 transform md:-translate-x-1/2 md:-translate-y-1/2 flex items-center justify-center z-10">
                    <div className="absolute inset-0 bg-cyan-500/30 blur-md rounded-full"></div>
                    <div className="relative h-6 w-6 rounded-full bg-cyan-500 border-2 border-cyan-400 ring-4 ring-cyan-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="md:w-1/2 md:pr-12"></div>
                </motion.div>

                {/* Public Launch Phase */}
                <motion.div
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="relative md:flex md:items-center"
                >
                  <div className="md:w-1/2 md:pr-12 md:text-right">
                    <Card className="rounded-2xl border-2 bg-gradient-to-br from-green-500/10 via-card/50 to-card/50 backdrop-blur-sm border-green-500/30 overflow-hidden group hover:shadow-xl hover:shadow-green-500/20 transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 md:justify-end mb-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500/30 to-green-500/10 flex items-center justify-center border-2 border-green-500/40">
                            <Play className="h-6 w-6 text-green-400" />
                          </div>
                          <div className="md:text-right">
                            <CardTitle className="text-xl font-bold text-white">Public Launch</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">Q1 2026</p>
                          </div>
                        </div>
                        <CardDescription className="text-base text-blue-100/80">
                          SeaJourney officially launches! Core features including digital testimonials, sea time tracking, and vessel management are available to all users
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="absolute left-0 md:left-1/2 top-6 md:top-1/2 transform md:-translate-x-1/2 md:-translate-y-1/2 flex items-center justify-center z-10">
                    <div className="absolute inset-0 bg-green-500/30 blur-md rounded-full animate-pulse"></div>
                    <div className="relative h-6 w-6 rounded-full bg-green-500 border-2 border-green-400 ring-4 ring-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white drop-shadow-sm" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="md:w-1/2 md:pl-12 flex items-center">
                    <div className="w-full rounded-2xl border-2 border-green-500/40 bg-gradient-to-br from-green-500/20 to-green-500/5 p-5 sm:p-6 text-center md:text-left shadow-lg shadow-green-500/20">
                      <div className="inline-flex h-14 w-14 rounded-full bg-green-500/30 border-2 border-green-400/50 items-center justify-center mb-3">
                        <Rocket className="h-7 w-7 text-green-400" />
                      </div>
                      <p className="text-lg font-bold text-white mb-1">We&apos;ve launched!</p>
                      <p className="text-sm text-green-200/90">SeaJourney is live. This is where we are now.</p>
                    </div>
                  </div>
                </motion.div>

                {/* Features & Growth Phase */}
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="relative md:flex md:items-center md:flex-row-reverse"
                >
                  <div className="md:w-1/2 md:pl-12">
                    <Card className="rounded-2xl border-2 bg-gradient-to-br from-purple-500/10 via-card/50 to-card/50 backdrop-blur-sm border-purple-500/30 overflow-hidden group hover:shadow-xl hover:shadow-purple-500/20 transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-500/10 flex items-center justify-center border-2 border-purple-500/40">
                            <Layers className="h-6 w-6 text-purple-400" />
                          </div>
                          <div>
                            <CardTitle className="text-xl font-bold text-white">Feature Expansion</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">Q2 2026 - Present</p>
                          </div>
                        </div>
                        <CardDescription className="text-base text-blue-100/80">
                          Continuous innovation - iOS app launch, watch logging, position history, MCA applications, Android app, and many more features
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="absolute left-0 md:left-1/2 top-6 md:top-1/2 transform md:-translate-x-1/2 md:-translate-y-1/2 flex items-center justify-center z-10">
                    <div className="relative h-6 w-6 rounded-full bg-transparent border-2 border-purple-400 ring-4 ring-purple-500/20"></div>
                  </div>
                  <div className="md:w-1/2 md:pr-12"></div>
                </motion.div>

                {/* Future Phase */}
                <motion.div
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  className="relative md:flex md:items-center"
                >
                  <div className="md:w-1/2 md:pr-12 md:text-right">
                    <Card className="rounded-2xl border-2 bg-gradient-to-br from-orange-500/10 via-card/50 to-card/50 backdrop-blur-sm border-orange-500/30 overflow-hidden group hover:shadow-xl hover:shadow-orange-500/20 transition-all">
                      <CardHeader>
                        <div className="flex items-center gap-3 md:justify-end mb-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500/30 to-orange-500/10 flex items-center justify-center border-2 border-orange-500/40">
                            <Rocket className="h-6 w-6 text-orange-400" />
                          </div>
                          <div className="md:text-right">
                            <CardTitle className="text-xl font-bold text-white">Future Growth</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">2027+</p>
                          </div>
                        </div>
                        <CardDescription className="text-base text-blue-100/80">
                          Advanced analytics, AIS integration, fleet management, social features, and more exciting innovations on the horizon
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </div>
                  <div className="absolute left-0 md:left-1/2 top-6 md:top-1/2 transform md:-translate-x-1/2 md:-translate-y-1/2 flex items-center justify-center z-10">
                    <div className="relative h-6 w-6 rounded-full bg-transparent border-2 border-orange-400 ring-4 ring-orange-500/20"></div>
                  </div>
                  <div className="md:w-1/2 md:pl-12"></div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap Content */}
        <section className="py-12 sm:py-16" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-12">
              {/* Completed */}
              {groupedItems.completed && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className="relative"
                >
                  <div className="flex items-center gap-3 mb-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full"></div>
                      <CheckCircle2 className="h-8 w-8 text-green-400 relative z-10" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white">Completed</h2>
                      <p className="text-sm text-muted-foreground mt-1">Features we've shipped and you're using today</p>
                    </div>
                  </div>
                  <div className="relative">
                    {/* Connecting line */}
                    <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500/30 via-green-500/20 to-transparent hidden md:block"></div>
                    <div className="space-y-6 md:space-y-8">
                      {groupedItems.completed.map((item, index) => {
                        const StatusIcon = statusConfig[item.status].icon;
                        const CategoryIcon = categoryConfig[item.category].icon;
                        return (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="relative md:pl-20"
                          >
                            {/* Timeline dot */}
                            <div className="absolute left-0 top-6 hidden md:flex items-center justify-center">
                              <div className="absolute inset-0 bg-green-500/30 blur-md rounded-full"></div>
                              <div className="relative h-4 w-4 rounded-full bg-green-500 border-2 border-green-400 ring-4 ring-green-500/20"></div>
                            </div>
                            <motion.div
                              whileHover={{ scale: 1.02, x: 8 }}
                              transition={{ duration: 0.2 }}
                            >
                              <Card className="rounded-2xl border-2 bg-gradient-to-br from-green-500/5 via-card/50 to-card/50 backdrop-blur-sm hover:shadow-xl hover:shadow-green-500/20 transition-all border-green-500/30 overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-green-500/20 transition-colors"></div>
                                <CardHeader className="relative">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-green-500/20 to-green-500/10 flex items-center justify-center border border-green-500/30 group-hover:scale-110 transition-transform">
                                        <item.icon className="h-7 w-7 text-green-400" />
                                      </div>
                                      <div>
                                        <CardTitle className="text-xl font-bold text-white group-hover:text-green-400 transition-colors">{item.title}</CardTitle>
                                        <div className="flex items-center gap-2 mt-1">
                                          <CategoryIcon className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-xs text-muted-foreground">{categoryConfig[item.category].label}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <Badge variant="outline" className={cn(statusConfig[item.status].color, "border-2")}>
                                      <StatusIcon className="h-3 w-3 mr-1" />
                                      Done
                                    </Badge>
                                  </div>
                                  <CardDescription className="text-base text-blue-100/80 mt-2">{item.description}</CardDescription>
                                </CardHeader>
                              </Card>
                            </motion.div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* In Progress */}
              {groupedItems['in-progress'] && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="relative"
                >
                  <div className="flex items-center gap-3 mb-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full animate-pulse"></div>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                      >
                        <Clock className="h-8 w-8 text-blue-400 relative z-10" />
                      </motion.div>
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white">In Progress</h2>
                      <p className="text-sm text-muted-foreground mt-1">Currently being built - coming soon!</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedItems['in-progress'].map((item, index) => {
                      const StatusIcon = statusConfig[item.status].icon;
                      const CategoryIcon = categoryConfig[item.category].icon;
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: index * 0.1 }}
                          whileHover={{ scale: 1.05, y: -4 }}
                        >
                          <Card className="rounded-2xl border-2 bg-gradient-to-br from-blue-500/10 via-card/50 to-card/50 backdrop-blur-sm hover:shadow-2xl hover:shadow-blue-500/30 transition-all border-blue-500/40 overflow-hidden group relative">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-blue-500/20 transition-colors"></div>
                            <CardHeader className="relative">
                              <div className="flex items-start justify-between mb-3">
                                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-500/10 flex items-center justify-center border-2 border-blue-500/40 group-hover:rotate-12 transition-transform">
                                  <item.icon className="h-7 w-7 text-blue-400" />
                                </div>
                                <Badge variant="outline" className={cn(statusConfig[item.status].color, "border-2 animate-pulse")}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  Building
                                </Badge>
                              </div>
                              <CardTitle className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{item.title}</CardTitle>
                              <CardDescription className="text-base text-blue-100/80 mt-2">{item.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 relative">
                              {item.progress !== undefined && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground font-medium">Progress</span>
                                    <span className="font-bold text-blue-400 text-lg">{item.progress}%</span>
                                  </div>
                                  <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden border border-blue-500/20">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      whileInView={{ width: `${item.progress}%` }}
                                      viewport={{ once: true }}
                                      transition={{ duration: 1, delay: 0.3 }}
                                      className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full shadow-lg shadow-blue-500/50"
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center justify-between pt-3 border-t border-blue-500/20">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <CategoryIcon className="h-4 w-4" />
                                  <span className="font-medium">{categoryConfig[item.category].label}</span>
                                </div>
                                {item.quarter && (
                                  <Badge variant="secondary" className="text-xs font-semibold">
                                    {item.quarter}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Planned */}
              {groupedItems.planned && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="relative"
                >
                  <div className="flex items-center gap-3 mb-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full"></div>
                      <Target className="h-8 w-8 text-purple-400 relative z-10" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white">Planned</h2>
                      <p className="text-sm text-muted-foreground mt-1">On our roadmap for 2026</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedItems.planned.map((item, index) => {
                      const StatusIcon = statusConfig[item.status].icon;
                      const CategoryIcon = categoryConfig[item.category].icon;
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: index * 0.1 }}
                          whileHover={{ scale: 1.03, y: -4 }}
                        >
                          <Card className="rounded-2xl border-2 bg-gradient-to-br from-purple-500/5 via-card/50 to-card/50 backdrop-blur-sm hover:shadow-xl hover:shadow-purple-500/20 transition-all border-purple-500/30 overflow-hidden group relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-purple-500/20 transition-colors"></div>
                            <CardHeader className="relative">
                              <div className="flex items-start justify-between mb-3">
                                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/10 flex items-center justify-center border border-purple-500/30 group-hover:scale-110 transition-transform">
                                  <item.icon className="h-7 w-7 text-purple-400" />
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  {item.priority === 'high' && (
                                    <Badge variant="destructive" className="text-xs border-2">
                                      <Star className="h-3 w-3 mr-1" />
                                      Priority
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className={cn(statusConfig[item.status].color, "border-2")}>
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    Planned
                                  </Badge>
                                </div>
                              </div>
                              <CardTitle className="text-xl font-bold text-white group-hover:text-purple-400 transition-colors">{item.title}</CardTitle>
                              <CardDescription className="text-base text-blue-100/80 mt-2">{item.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="relative">
                              <div className="flex items-center justify-between pt-3 border-t border-purple-500/20">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <CategoryIcon className="h-4 w-4" />
                                  <span className="font-medium">{categoryConfig[item.category].label}</span>
                                </div>
                                {item.quarter && (
                                  <Badge variant="secondary" className="text-xs font-semibold bg-purple-500/20 text-purple-300 border-purple-500/30">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    {item.quarter}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Upcoming */}
              {groupedItems.upcoming && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="relative"
                >
                  <div className="flex items-center gap-3 mb-8">
                    <div className="relative">
                      <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full"></div>
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                      >
                        <Sparkles className="h-8 w-8 text-orange-400 relative z-10" />
                      </motion.div>
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white">Upcoming</h2>
                      <p className="text-sm text-muted-foreground mt-1">Future innovations we're exploring</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedItems.upcoming.map((item, index) => {
                      const StatusIcon = statusConfig[item.status].icon;
                      const CategoryIcon = categoryConfig[item.category].icon;
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.4, delay: index * 0.1 }}
                          whileHover={{ scale: 1.03, y: -4 }}
                        >
                          <Card className="rounded-2xl border-2 bg-gradient-to-br from-orange-500/5 via-card/50 to-card/50 backdrop-blur-sm hover:shadow-xl hover:shadow-orange-500/20 transition-all border-orange-500/30 overflow-hidden group relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-orange-500/20 transition-colors"></div>
                            <CardHeader className="relative">
                              <div className="flex items-start justify-between mb-3">
                                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 flex items-center justify-center border border-orange-500/30 group-hover:scale-110 transition-transform">
                                  <item.icon className="h-7 w-7 text-orange-400" />
                                </div>
                                <Badge variant="outline" className={cn(statusConfig[item.status].color, "border-2")}>
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Future
                                </Badge>
                              </div>
                              <CardTitle className="text-xl font-bold text-white group-hover:text-orange-400 transition-colors">{item.title}</CardTitle>
                              <CardDescription className="text-base text-blue-100/80 mt-2">{item.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="relative">
                              <div className="flex items-center justify-between pt-3 border-t border-orange-500/20">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <CategoryIcon className="h-4 w-4" />
                                  <span className="font-medium">{categoryConfig[item.category].label}</span>
                                </div>
                                {item.quarter && (
                                  <Badge variant="secondary" className="text-xs font-semibold bg-orange-500/20 text-orange-300 border-orange-500/30">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    {item.quarter}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Call to Action */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-20 text-center relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 blur-3xl opacity-50"></div>
              <Card className="rounded-2xl border-2 bg-gradient-to-br from-primary/20 via-primary/10 to-purple-500/10 border-primary/30 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -ml-32 -mb-32"></div>
                <CardContent className="pt-8 pb-8 relative z-10">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="inline-block mb-4"
                  >
                    <Rocket className="h-12 w-12 text-primary mx-auto" />
                  </motion.div>
                  <h3 className="text-3xl font-bold text-white mb-4">Have a Feature Request?</h3>
                  <p className="text-blue-100/90 mb-8 max-w-2xl mx-auto text-lg">
                    We're always looking to improve SeaJourney. If you have ideas for features or improvements, 
                    we'd love to hear from you!
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <motion.a
                      href="/dashboard/feedback"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/50 transition hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/50"
                    >
                      Submit Feedback
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </motion.a>
                    <motion.a
                      href="/dashboard"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center justify-center rounded-xl border-2 border-white/30 bg-white/10 hover:bg-white/20 text-white px-8 py-4 text-base font-semibold backdrop-blur-sm transition shadow-lg"
                    >
                      Get Started
                      <TrendingUp className="ml-2 h-4 w-4" />
                    </motion.a>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
