'use client';

import { 
  FileText,
  Download,
  Zap,
  CheckCircle2,
  Clock,
  Shield,
  Printer,
  FileCheck
} from 'lucide-react';
import { motion } from 'framer-motion';

const OfficialForms = () => {
  const forms = [
    {
      name: 'MCA Watch Rating Certificate',
      code: 'MSF 4371',
      description: 'Official application for Navigational, Engine Room, or Electro-Technical Watch Rating certification',
      icon: FileText,
      color: '#3b82f6',
      popular: true,
    },
    {
      name: 'MCA Officer of the Watch',
      code: 'MSF 4370',
      description: 'Application for Officer of the Watch Certificate of Competency',
      icon: FileCheck,
      color: '#8b5cf6',
      popular: true,
    },
    {
      name: 'Sea Service Testimonials',
      code: 'Custom',
      description: 'Auto-generated testimonials from your logged sea time with captain signatures',
      icon: Shield,
      color: '#10b981',
      popular: false,
    },
  ];

  const benefits = [
    {
      icon: Zap,
      title: 'Instant Generation',
      description: 'Fill official forms in seconds using your logged sea time data',
      color: '#f59e0b',
    },
    {
      icon: CheckCircle2,
      title: 'Auto-Populated Data',
      description: 'Your vessel details, sea service, and personal info automatically filled',
      color: '#10b981',
    },
    {
      icon: Clock,
      title: 'Save & Re-download',
      description: 'Access your previously generated applications anytime',
      color: '#3b82f6',
    },
    {
      icon: Printer,
      title: 'Print-Ready PDFs',
      description: 'Official format PDFs ready to submit to maritime authorities',
      color: '#8b5cf6',
    },
  ];

  return (
    <section id="official-forms" className="py-16 sm:py-24 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-block mb-6">
              <span className="inline-flex items-center rounded-full bg-blue-800/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-blue-100 border border-blue-500/30">
                <Printer className="h-4 w-4 mr-2" />
                Official Applications
              </span>
            </div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
              Instant Official Applications
            </h2>
            <p className="text-lg leading-8 text-blue-100">
              Generate print-ready official applications like MCA Watch Rating, Officer of the Watch, and more. 
              Your sea service data automatically populates the forms.
            </p>
          </motion.div>
        </div>

        {/* Forms Grid */}
        <div className="max-w-6xl mx-auto mb-12">
          <div className="grid md:grid-cols-3 gap-6">
            {forms.map((form, idx) => {
              const Icon = form.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="rounded-xl border p-6 relative overflow-hidden group cursor-pointer"
                  style={{ 
                    backgroundColor: 'rgba(2, 22, 44, 0.6)', 
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {form.popular && (
                    <div className="absolute top-4 right-4">
                      <span className="inline-flex items-center rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-semibold text-yellow-300 border border-yellow-500/30">
                        Popular
                      </span>
                    </div>
                  )}
                  
                  <div 
                    className="h-14 w-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" 
                    style={{ backgroundColor: `${form.color}20` }}
                  >
                    <Icon className="h-7 w-7" style={{ color: form.color }} />
                  </div>
                  
                  <h3 className="font-bold text-white text-lg mb-2">{form.name}</h3>
                  <p className="text-xs text-blue-200 mb-3 font-mono">{form.code}</p>
                  <p className="text-sm leading-relaxed text-blue-100/80 mb-4">
                    {form.description}
                  </p>
                  
                  <div className="flex items-center gap-2 text-sm font-semibold group-hover:gap-3 transition-all" style={{ color: form.color }}>
                    <Download className="h-4 w-4" />
                    <span>Generate Form</span>
                  </div>
                  
                  {/* Hover Effect Border */}
                  <div 
                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ 
                      border: `2px solid ${form.color}40`,
                      boxShadow: `0 0 20px ${form.color}20`
                    }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Benefits Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="max-w-6xl mx-auto"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, idx) => {
              const Icon = benefit.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.4 + idx * 0.1 }}
                  className="rounded-xl border p-5 text-center"
                  style={{ backgroundColor: 'rgba(2, 22, 44, 0.4)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <div 
                    className="h-12 w-12 rounded-xl flex items-center justify-center mx-auto mb-3" 
                    style={{ backgroundColor: `${benefit.color}20` }}
                  >
                    <Icon className="h-6 w-6" style={{ color: benefit.color }} />
                  </div>
                  <h4 className="font-semibold text-white text-sm mb-2">{benefit.title}</h4>
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
          className="text-center mt-12"
        >
          <p className="text-sm text-blue-200 mb-4">
            More official forms coming soon including Chief Mate, Master, and Engineer certifications
          </p>
          <a
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.3)', 
              border: '1px solid rgba(59, 130, 246, 0.5)',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)'
            }}
          >
            <Zap className="h-4 w-4" />
            Start Generating Forms
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default OfficialForms;
