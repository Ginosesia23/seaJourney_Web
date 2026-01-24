'use client';

import { motion } from 'framer-motion';
import { Shield, CheckCircle2, Search, FileCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const VerificationCTA = () => {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28" style={{ backgroundColor: '#000b15' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-green-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center lg:text-left"
            >
              <div className="inline-block mb-6">
                <span className="inline-flex items-center rounded-full bg-green-800/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-green-100 border border-green-500/30">
                  <Shield className="mr-2 h-4 w-4" />
                  Public Verification
                </span>
              </div>
              
              <h2 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
                Verify Testimonials & Sea Service{' '}
                <span className="bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                  with a Unique Code
                </span>
                <br />
                <span className="text-3xl sm:text-4xl lg:text-5xl">— Instantly</span>
              </h2>
              
              <p className="text-lg sm:text-xl leading-relaxed text-blue-100/90 mb-8 max-w-2xl mx-auto lg:mx-0">
                Officials, employers, and maritime authorities can instantly verify the authenticity of any SeaJourney testimonial or sea service record using our secure verification system. No login required.
              </p>

              {/* Features */}
              <div className="space-y-4 mb-8 max-w-xl mx-auto lg:mx-0">
                {[
                  { icon: CheckCircle2, text: 'Instant verification results' },
                  { icon: FileCheck, text: 'Official record validation' },
                  { icon: Zap, text: 'No account required' },
                  { icon: Shield, text: 'Secure & tamper-proof' },
                ].map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center border border-green-500/30">
                        <Icon className="h-5 w-5 text-green-400" />
                      </div>
                      <span className="text-white text-base">{feature.text}</span>
                    </motion.div>
                  );
                })}
              </div>

              {/* CTA Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
              >
                <Button
                  asChild
                  size="lg"
                  className="rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/30 px-6 h-12 text-base font-semibold"
                >
                  <Link href="/verify">
                    <Search className="mr-2 h-4 w-4" />
                    Verify a Record
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-xl border-2 border-white/20 bg-white/5 hover:bg-white/10 text-white px-6 h-12 text-base font-semibold backdrop-blur-sm"
                >
                  <Link href="/how-verification-works" className="flex items-center gap-2">
                    Learn More
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </motion.div>
            </motion.div>

            {/* Right side - Visual */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative"
            >
              {/* Verification Card Mockup */}
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute -inset-8 bg-gradient-to-br from-green-500/30 via-blue-500/20 to-transparent rounded-3xl blur-3xl"></div>
                
                {/* Card */}
                <div
                  className="relative rounded-2xl border-2 p-8 backdrop-blur-xl"
                  style={{
                    backgroundColor: 'rgba(2, 22, 44, 0.8)',
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/30">
                      <Shield className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Verification System</h3>
                      <p className="text-sm text-blue-100/70">Enter verification code</p>
                    </div>
                  </div>

                  {/* Code Input Mockup */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-blue-100/70 mb-2 block">
                        Document Verification Code
                      </label>
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center sm:justify-start">
                        <span className="text-lg sm:text-xl font-bold text-green-400 shrink-0">SJ-</span>
                        <div className="flex gap-1 sm:gap-2 flex-wrap justify-center sm:justify-start">
                          {['9', '8', '2', 'F', '8', '4', '8', '4'].map((char, index) => (
                            <div
                              key={index}
                              className="w-8 h-10 sm:w-10 sm:h-12 md:w-12 md:h-14 rounded-lg border-2 flex items-center justify-center text-base sm:text-lg md:text-xl font-bold uppercase bg-background/50 border-green-500/30 text-white shrink-0"
                            >
                              {char}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Verified Badge */}
                    <div className="mt-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-green-400 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-400">Verified</p>
                        <p className="text-xs text-blue-100/70 mt-1">
                          Record matches official testimonial approved by Captain
                        </p>
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

export default VerificationCTA;
