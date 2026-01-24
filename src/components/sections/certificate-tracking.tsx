'use client';

import { 
  Award,
  Calendar,
  Bell,
  CheckCircle2,
  Clock,
  FileCheck,
  AlertTriangle,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const CertificateTracking = () => {
  const features = [
    {
      icon: Calendar,
      title: 'Expiration Alerts',
      description: 'Get notified before your certificates expire',
      color: '#3b82f6',
    },
    {
      icon: FileCheck,
      title: 'Renewal Tracking',
      description: 'Track renewal dates and requirements',
      color: '#10b981',
    },
    {
      icon: TrendingUp,
      title: 'Career Progress',
      description: 'Monitor your certification milestones',
      color: '#f59e0b',
    },
    {
      icon: CheckCircle2,
      title: 'Compliance Status',
      description: 'Ensure you meet all requirements',
      color: '#8b5cf6',
    },
  ];

  const certificateTypes = [
    { name: 'STCW Basic Safety', status: 'Valid', expires: '2025-12-15', daysLeft: 345 },
    { name: 'Medical Certificate', status: 'Expiring Soon', expires: '2024-03-20', daysLeft: 45 },
    { name: 'Watch Rating', status: 'Valid', expires: '2026-06-10', daysLeft: 500 },
  ];

  return (
    <section id="certificate-tracking" className="py-16 sm:py-24 border-t border-white/10 relative overflow-hidden" style={{ backgroundColor: '#000b15' }}>
      {/* Background Gradient Effects */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-400 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-yellow-400 rounded-full blur-3xl"></div>
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
                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-600/30 to-yellow-600/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-orange-100 border border-orange-500/30 shadow-lg">
                  <Award className="h-4 w-4 mr-2" />
                  New Feature
                </span>
              </div>
              
              <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Track Your{' '}
                <span className="bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
                  Certificates
                </span>
                {' '}& Stay Compliant
              </h2>
              
              <p className="text-lg leading-8 text-blue-100">
                Never miss a renewal deadline again. Track all your maritime certificates, 
                get expiration alerts, and monitor your compliance status—all in one place.
              </p>

              {/* Key Features */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                {features.map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.2 + idx * 0.1 }}
                      className="flex flex-col gap-2 p-4 rounded-xl"
                      style={{ backgroundColor: 'rgba(2, 22, 44, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" 
                          style={{ backgroundColor: `${feature.color}20` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: feature.color }} />
                        </div>
                        <span className="text-sm font-semibold text-white">{feature.title}</span>
                      </div>
                      <p className="text-xs text-blue-200/70 ml-[52px]">{feature.description}</p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-4 pt-4">
                <Button 
                  asChild 
                  size="lg" 
                  className="rounded-xl bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 text-white shadow-lg px-8 hover:scale-105 transition-transform duration-300"
                >
                  <Link href="/dashboard/certificates">
                    Track Certificates
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button 
                  asChild 
                  variant="outline" 
                  size="lg" 
                  className="rounded-xl border-orange-400/30 text-white bg-orange-800/20 hover:bg-orange-800/30 backdrop-blur-sm hover:scale-105 transition-transform duration-300"
                >
                  <Link href="/signup">Get Started</Link>
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
                  borderColor: 'rgba(249, 115, 22, 0.4)', 
                  backgroundColor: 'rgba(2, 19, 36, 0.7)',
                  boxShadow: '0 20px 60px rgba(249, 115, 22, 0.2)'
                }}
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-yellow-500/10"></div>
                
                <div className="relative z-10">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                        <Award className="h-5 w-5 text-orange-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">My Certificates</h3>
                        <p className="text-xs text-blue-200/70">3 Active Certificates</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                      <Bell className="h-3 w-3 text-green-400" />
                      <span className="text-xs font-semibold text-green-400">2 Alerts</span>
                    </div>
                  </div>

                  {/* Certificate List */}
                  <div className="space-y-3">
                    {certificateTypes.map((cert, idx) => {
                      const isExpiringSoon = cert.daysLeft < 90;
                      const StatusIcon = isExpiringSoon ? AlertTriangle : CheckCircle2;
                      const statusColor = isExpiringSoon ? '#f59e0b' : '#10b981';
                      
                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.3, delay: 0.4 + idx * 0.1 }}
                          className="rounded-lg border p-4"
                          style={{ 
                            backgroundColor: 'rgba(0, 22, 44, 0.4)', 
                            borderColor: isExpiringSoon ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.1)' 
                          }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="text-sm font-semibold text-white mb-1">{cert.name}</h4>
                              <div className="flex items-center gap-2">
                                <StatusIcon className="h-3 w-3" style={{ color: statusColor }} />
                                <span className="text-xs" style={{ color: statusColor }}>{cert.status}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-blue-200/70">Expires</div>
                              <div className="text-xs font-semibold text-white">{cert.expires}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-blue-300" />
                            <span className="text-xs text-blue-200">
                              {cert.daysLeft} days remaining
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Summary Stats */}
                  <div className="mt-6 pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <div className="text-lg font-bold text-white">3</div>
                        <div className="text-xs text-blue-200/70">Active</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-orange-400">1</div>
                        <div className="text-xs text-blue-200/70">Expiring</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-400">2</div>
                        <div className="text-xs text-blue-200/70">Alerts</div>
                      </div>
                    </div>
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

export default CertificateTracking;
