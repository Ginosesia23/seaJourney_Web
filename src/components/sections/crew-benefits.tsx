'use client';

import { motion } from 'framer-motion';
import { 
  Award, 
  FileCheck, 
  TrendingUp, 
  Clock, 
  Shield, 
  Download,
  CheckCircle2,
  Users,
  Calendar,
  Globe,
  Zap,
  ArrowRight,
  LayoutDashboard
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useUser } from '@/supabase';

const benefits = [
  {
    icon: Clock,
    title: 'Accurate Sea Time Tracking',
    description: 'Never lose track of your sea service. Log unlimited vessel states with precision and build a complete record of your maritime experience.',
    color: 'blue',
  },
  {
    icon: FileCheck,
    title: 'Digital Captain Testimonials',
    description: 'Request and receive digital testimonials directly from captains. Get instant sign-offs without paperwork delays.',
    color: 'green',
  },
  {
    icon: TrendingUp,
    title: 'Career Advancement Made Easy',
    description: 'Export professional PDFs and multi-format documents (Excel, CSV) to submit with job applications and certification requests.',
    color: 'purple',
  },
  {
    icon: Shield,
    title: 'MCA Compliant Calculations',
    description: 'Automatic sea time calculations that meet MCA requirements. Know exactly where you stand on your certification journey.',
    color: 'orange',
  },
  {
    icon: Calendar,
    title: 'Visual Career Timeline',
    description: 'See your entire service history at a glance with our year calendar view. Track your progress across multiple vessels.',
    color: 'cyan',
  },
  {
    icon: Globe,
    title: 'Work Anywhere, Track Everything',
    description: 'Log sea time on your phone, manage everything on the web. Your data syncs seamlessly across all devices.',
    color: 'indigo',
  },
];

const CrewBenefits = () => {
  const { user } = useUser();

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
                  Built for Crew Members
                </span>
              </div>
              <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
                Everything You Need to Build Your{' '}
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Maritime Career
                </span>
              </h1>
              <p className="text-xl sm:text-2xl lg:text-3xl font-semibold text-blue-100 max-w-4xl mx-auto mb-10 leading-relaxed">
                Track sea time, get captain-signed testimonials, and verify your career credentials instantly — worldwide
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {user ? (
                  <Button
                    asChild
                    size="lg"
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-500/30 px-8 h-12 text-base font-semibold"
                  >
                    <Link href="/dashboard" className="flex items-center gap-2">
                      <LayoutDashboard className="h-5 w-5" />
                      Go to Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      asChild
                      size="lg"
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 px-6 h-12 text-base font-semibold"
                    >
                      <Link href="/offers">
                        Start Your Journey
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="rounded-xl border-2 border-white/20 bg-white/5 hover:bg-white/10 text-white px-6 h-12 text-base font-semibold backdrop-blur-sm"
                    >
                      <Link href="#benefits-grid" className="flex items-center gap-2">
                        Explore Features
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {/* Benefits Grid */}
          <div id="benefits-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 scroll-mt-24">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              const colorClasses = {
                blue: {
                  bg: 'bg-blue-500/20',
                  border: 'border-blue-500/30',
                  icon: 'text-blue-400',
                  text: 'text-blue-100',
                },
                green: {
                  bg: 'bg-green-500/20',
                  border: 'border-green-500/30',
                  icon: 'text-green-400',
                  text: 'text-green-100',
                },
                purple: {
                  bg: 'bg-purple-500/20',
                  border: 'border-purple-500/30',
                  icon: 'text-purple-400',
                  text: 'text-purple-100',
                },
                orange: {
                  bg: 'bg-orange-500/20',
                  border: 'border-orange-500/30',
                  icon: 'text-orange-400',
                  text: 'text-orange-100',
                },
                cyan: {
                  bg: 'bg-cyan-500/20',
                  border: 'border-cyan-500/30',
                  icon: 'text-cyan-400',
                  text: 'text-cyan-100',
                },
                indigo: {
                  bg: 'bg-indigo-500/20',
                  border: 'border-indigo-500/30',
                  icon: 'text-indigo-400',
                  text: 'text-indigo-100',
                },
              };
              const colors = colorClasses[benefit.color as keyof typeof colorClasses];

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ y: -5 }}
                  className={`rounded-2xl border-2 p-6 transition-all duration-300 ${colors.border}`}
                  style={{
                    backgroundColor: 'rgba(2, 22, 44, 0.6)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div className={`h-14 w-14 rounded-xl flex items-center justify-center mb-4 ${colors.bg}`}>
                    <Icon className={`h-7 w-7 ${colors.icon}`} />
                  </div>
                  <h3 className="font-bold text-white text-lg mb-2">{benefit.title}</h3>
                  <p className={`text-sm leading-relaxed ${colors.text}`}>{benefit.description}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Key Features Highlight */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="rounded-2xl border-2 p-8 md:p-12"
            style={{
              backgroundColor: 'rgba(2, 22, 44, 0.6)',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-8 justify-center">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-500/20">
                  <Zap className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="font-headline text-2xl sm:text-3xl font-bold text-white">
                  Why Crew Members Choose SeaJourney
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {[
                  'Unlimited vessel tracking - no restrictions',
                  'MCA compliant sea time calculations',
                  'Instant digital captain testimonials',
                  'Professional PDF exports for applications',
                  'Multi-format exports (Excel, CSV)',
                  'Visual calendar view of your career',
                  'Mobile app for logging on the go',
                  'Complete service history tracking',
                  'Certificate tracking and expiration alerts',
                  'Official MCA application form generation',
                ].map((feature, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.7 + idx * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-400 mt-0.5" />
                    <span className="text-white text-sm">{feature}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CrewBenefits;
