'use client';

import { 
  Globe,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  FileText,
  Bell,
  Zap,
  ArrowRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

const Features = () => {
  const [selectedVisa, setSelectedVisa] = useState(0);

  const mockVisas = [
    {
      country: 'United States',
      countryCode: 'US',
      visaType: 'B1/B2 Tourist',
      issueDate: '2024-01-15',
      expiryDate: '2029-01-14',
      status: 'valid',
      daysRemaining: 1785,
      entryType: 'Multiple Entry',
      maxStay: '6 months',
      flag: '🇺🇸',
      color: '#3b82f6',
    },
    {
      country: 'Schengen Area',
      countryCode: 'EU',
      visaType: 'Schengen Visa',
      issueDate: '2024-03-01',
      expiryDate: '2024-09-01',
      status: 'expiring',
      daysRemaining: 45,
      entryType: 'Multiple Entry',
      maxStay: '90 days',
      flag: '🇪🇺',
      color: '#f59e0b',
    },
    {
      country: 'Australia',
      countryCode: 'AU',
      visaType: 'eVisitor',
      issueDate: '2023-11-20',
      expiryDate: '2024-11-19',
      status: 'expired',
      daysRemaining: -30,
      entryType: 'Multiple Entry',
      maxStay: '3 months',
      flag: '🇦🇺',
      color: '#ef4444',
    },
    {
      country: 'United Kingdom',
      countryCode: 'GB',
      visaType: 'Standard Visitor',
      issueDate: '2024-02-10',
      expiryDate: '2027-02-09',
      status: 'valid',
      daysRemaining: 1095,
      entryType: 'Multiple Entry',
      maxStay: '6 months',
      flag: '🇬🇧',
      color: '#10b981',
    },
  ];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'valid':
        return {
          bg: 'bg-green-500/20',
          border: 'border-green-500/30',
          text: 'text-green-400',
          icon: CheckCircle2,
          label: 'Valid',
        };
      case 'expiring':
        return {
          bg: 'bg-yellow-500/20',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          icon: AlertTriangle,
          label: 'Expiring Soon',
        };
      case 'expired':
        return {
          bg: 'bg-red-500/20',
          border: 'border-red-500/30',
          text: 'text-red-400',
          icon: AlertTriangle,
          label: 'Expired',
        };
      default:
        return {
          bg: 'bg-gray-500/20',
          border: 'border-gray-500/30',
          text: 'text-gray-400',
          icon: Clock,
          label: 'Unknown',
        };
    }
  };

  return (
    <section id="features" className="py-16 sm:py-24" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-block mb-6">
              <span className="inline-flex items-center rounded-full bg-purple-800/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-purple-100 border border-purple-500/30">
                <Globe className="h-4 w-4 mr-2" />
                Premium Feature
              </span>
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
              Visa Tracker
            </h2>
            <p className="text-lg leading-8 text-blue-100">
              Never miss a visa expiration date. Track all your visas in one place, get automatic reminders, and stay compliant with international travel requirements.
            </p>
          </motion.div>
        </div>

        {/* Visa Tracker Preview */}
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Left Side - Visa List */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-lg">Your Visas</h3>
                <div className="flex items-center gap-2 text-sm text-blue-200">
                  <Bell className="h-4 w-4" />
                  <span>Auto-reminders enabled</span>
                </div>
              </div>

              {mockVisas.map((visa, idx) => {
                const statusConfig = getStatusConfig(visa.status);
                const StatusIcon = statusConfig.icon;
                const isSelected = selectedVisa === idx;

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: idx * 0.1 }}
                    onClick={() => setSelectedVisa(idx)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`rounded-xl border p-4 cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-purple-500/50' : ''
                    }`}
                    style={{
                      backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(2, 22, 44, 0.6)',
                      borderColor: isSelected ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl">{visa.flag}</div>
                        <div>
                          <h4 className="font-bold text-white text-base mb-0.5">{visa.country}</h4>
                          <p className="text-xs text-blue-200">{visa.visaType}</p>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                      <div>
                        <p className="text-xs text-blue-200 mb-1">Expires</p>
                        <p className="text-sm font-semibold text-white">{visa.expiryDate}</p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-200 mb-1">
                          {visa.status === 'expired' ? 'Days Overdue' : 'Days Remaining'}
                        </p>
                        <p className={`text-sm font-bold ${
                          visa.status === 'expired' ? 'text-red-400' : 
                          visa.status === 'expiring' ? 'text-yellow-400' : 
                          'text-green-400'
                        }`}>
                          {Math.abs(visa.daysRemaining)} days
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Right Side - Visa Details */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="sticky top-8"
            >
              <div className="rounded-xl border p-6" style={{ backgroundColor: 'rgba(2, 22, 44, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(10px)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="text-4xl">{mockVisas[selectedVisa].flag}</div>
                  <div>
                    <h3 className="font-bold text-white text-xl mb-1">{mockVisas[selectedVisa].country}</h3>
                    <p className="text-sm text-blue-200">{mockVisas[selectedVisa].visaType}</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
                    <Calendar className="h-5 w-5" style={{ color: '#8b5cf6' }} />
                    <div className="flex-1">
                      <p className="text-xs text-blue-200 mb-0.5">Issue Date</p>
                      <p className="text-sm font-semibold text-white">{mockVisas[selectedVisa].issueDate}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
                    <Calendar className="h-5 w-5" style={{ color: mockVisas[selectedVisa].color }} />
                    <div className="flex-1">
                      <p className="text-xs text-blue-200 mb-0.5">Expiry Date</p>
                      <p className="text-sm font-semibold text-white">{mockVisas[selectedVisa].expiryDate}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
                    <FileText className="h-5 w-5" style={{ color: '#60a5fa' }} />
                    <div className="flex-1">
                      <p className="text-xs text-blue-200 mb-0.5">Entry Type</p>
                      <p className="text-sm font-semibold text-white">{mockVisas[selectedVisa].entryType}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)' }}>
                    <Clock className="h-5 w-5" style={{ color: '#4ade80' }} />
                    <div className="flex-1">
                      <p className="text-xs text-blue-200 mb-0.5">Maximum Stay</p>
                      <p className="text-sm font-semibold text-white">{mockVisas[selectedVisa].maxStay}</p>
                    </div>
                  </div>
                </div>

                {mockVisas[selectedVisa].status === 'expiring' && (
                  <div className="rounded-lg p-4 mb-4 border" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-300 mb-1">Renewal Reminder</p>
                        <p className="text-xs text-yellow-200">
                          Your visa expires in {mockVisas[selectedVisa].daysRemaining} days. Consider renewing soon to avoid travel disruptions.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {mockVisas[selectedVisa].status === 'expired' && (
                  <div className="rounded-lg p-4 mb-4 border" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-300 mb-1">Visa Expired</p>
                        <p className="text-xs text-red-200">
                          This visa expired {Math.abs(mockVisas[selectedVisa].daysRemaining)} days ago. You'll need to renew before traveling.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105" style={{ backgroundColor: 'rgba(139, 92, 246, 0.3)', border: '1px solid rgba(139, 92, 246, 0.5)' }}>
                    <FileText className="h-4 w-4" />
                    View Full Details
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Key Features */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {[
              {
                icon: Bell,
                title: 'Automatic Reminders',
                description: 'Get notified 30, 14, and 7 days before your visa expires. Never miss a renewal deadline.',
                color: '#f59e0b',
              },
              {
                icon: Globe,
                title: 'Multi-Country Tracking',
                description: 'Track visas for all countries you visit. Manage Schengen, US, UK, and more in one place.',
                color: '#8b5cf6',
              },
              {
                icon: CheckCircle2,
                title: 'Compliance Made Easy',
                description: 'Stay compliant with international travel regulations. Know your visa status at a glance.',
                color: '#10b981',
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.5 + idx * 0.1 }}
                  className="rounded-xl border p-5 text-center"
                  style={{ backgroundColor: 'rgba(2, 22, 44, 0.6)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${feature.color}20` }}>
                    <Icon className="h-6 w-6" style={{ color: feature.color }} />
                  </div>
                  <h4 className="font-semibold text-white text-sm mb-2">{feature.title}</h4>
                  <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>{feature.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Features;
