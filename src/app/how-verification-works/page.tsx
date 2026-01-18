import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Shield, CheckCircle2, Search, FileCheck, Lock, Globe, Clock, ArrowRight, Code, AlertCircle, XCircle, Users, Building2, Briefcase, Award, HelpCircle, Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export default function HowVerificationWorksPage() {
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#000b15' }}>
      <Header />
      <main className="flex-1">
        {/* Hero Section with How It Works - Combined */}
        <section className="relative overflow-hidden min-h-[85vh] flex flex-col justify-center py-20 sm:py-28" style={{ backgroundColor: '#000b15' }}>
          {/* Gradient Background - spans full section */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-green-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
          </div>

          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 z-10">
            {/* Header Content */}
            <div className="max-w-4xl mx-auto text-center mb-16">
              <div className="inline-block mb-6">
                <span className="inline-flex items-center rounded-full bg-green-800/30 backdrop-blur-sm px-4 py-1.5 text-sm font-semibold text-green-100 border border-green-500/30">
                  <Shield className="mr-2 h-4 w-4" />
                  Public Verification System
                </span>
              </div>
              
              <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
                How Verification{' '}
                <span className="bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                  Works
                </span>
              </h1>
              
              <p className="text-xl sm:text-2xl leading-relaxed text-blue-100/90 max-w-3xl mx-auto mb-10">
                Instantly verify the authenticity of SeaJourney testimonials and sea service records using our secure, tamper-proof verification system.
              </p>
            </div>

            {/* How It Works Steps */}
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    step: '1',
                    icon: Code,
                    title: 'Get Your Code',
                    description: 'Every approved testimonial includes a unique 8-character verification code (e.g., SJ-982F8484) in the PDF footer.',
                    color: 'blue',
                  },
                  {
                    step: '2',
                    icon: Search,
                    title: 'Enter the Code',
                    description: 'Visit our verification page and enter the code. No account or login required—verification is completely public.',
                    color: 'green',
                  },
                  {
                    step: '3',
                    icon: CheckCircle2,
                    title: 'View Results',
                    description: 'Instantly see verified details including crew member info, service dates, vessel details, and captain approval.',
                    color: 'purple',
                  },
                ].map((item, index) => {
                  const Icon = item.icon;
                  const colorClasses = {
                    blue: {
                      bg: 'bg-blue-500/20',
                      border: 'border-blue-500/30',
                      icon: 'text-blue-400',
                    },
                    green: {
                      bg: 'bg-green-500/20',
                      border: 'border-green-500/30',
                      icon: 'text-green-400',
                    },
                    purple: {
                      bg: 'bg-purple-500/20',
                      border: 'border-purple-500/30',
                      icon: 'text-purple-400',
                    },
                  };
                  const colors = colorClasses[item.color as keyof typeof colorClasses];

                  return (
                    <div
                      key={index}
                      className="relative rounded-2xl border-2 p-6 backdrop-blur-xl"
                      style={{
                        backgroundColor: 'rgba(2, 22, 44, 0.6)',
                        borderColor: colors.border.replace('border-', '').replace('/30', ''),
                      }}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`h-12 w-12 rounded-xl ${colors.bg} flex items-center justify-center border ${colors.border} flex-shrink-0`}>
                          <Icon className={`h-6 w-6 ${colors.icon}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-white/50">STEP {item.step}</span>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                          <p className="text-sm text-blue-100/70 leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 sm:py-20 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="font-headline text-3xl sm:text-4xl font-bold text-white mb-4">
                  Why Verification Matters
                </h2>
                <p className="text-lg text-blue-100/70">
                  Our verification system provides instant, reliable proof of authenticity for maritime professionals.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    icon: Lock,
                    title: 'Tamper-Proof',
                    description: 'Each verification code is cryptographically linked to the original approved testimonial. Any changes invalidate the code.',
                  },
                  {
                    icon: Globe,
                    title: 'Worldwide Access',
                    description: 'Verify records from anywhere in the world, 24/7. No regional restrictions or time zone limitations.',
                  },
                  {
                    icon: Clock,
                    title: 'Instant Results',
                    description: 'Get verification results in seconds. No waiting periods or manual processing required.',
                  },
                  {
                    icon: FileCheck,
                    title: 'Complete Details',
                    description: 'View full testimonial information including crew details, service dates, vessel information, and captain approval.',
                  },
                ].map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <Card
                      key={index}
                      className="border-2 backdrop-blur-xl"
                      style={{
                        backgroundColor: 'rgba(2, 22, 44, 0.6)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 flex-shrink-0">
                            <Icon className="h-6 w-6 text-blue-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                            <p className="text-sm text-blue-100/70 leading-relaxed">{feature.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* What Information is Shown Section */}
        <section className="py-16 sm:py-20 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="font-headline text-3xl sm:text-4xl font-bold text-white mb-4">
                  What Information is Verified?
                </h2>
                <p className="text-lg text-blue-100/70">
                  When you verify a record, you'll see complete details about the testimonial and sea service.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    icon: Users,
                    title: 'Crew Member Details',
                    items: ['Full name', 'Position/Rank', 'Service dates'],
                  },
                  {
                    icon: Building2,
                    title: 'Vessel Information',
                    items: ['Vessel name', 'IMO number (if available)', 'Service period'],
                  },
                  {
                    icon: Clock,
                    title: 'Service Breakdown',
                    items: ['Total days', 'Sea days', 'Standby days'],
                  },
                  {
                    icon: Award,
                    title: 'Captain Approval',
                    items: ['Captain name', 'License/certification', 'Approval date'],
                  },
                ].map((section, index) => {
                  const Icon = section.icon;
                  return (
                    <Card
                      key={index}
                      className="border-2 backdrop-blur-xl"
                      style={{
                        backgroundColor: 'rgba(2, 22, 44, 0.6)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                          <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 flex-shrink-0">
                            <Icon className="h-6 w-6 text-blue-400" />
                          </div>
                          <h3 className="text-xl font-bold text-white">{section.title}</h3>
                        </div>
                        <ul className="space-y-2 ml-16">
                          {section.items.map((item, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-blue-100/70">
                              <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Example Verification Section */}
        <section className="py-16 sm:py-20 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="font-headline text-3xl sm:text-4xl font-bold text-white mb-4">
                  Example Verification Results
                </h2>
                <p className="text-lg text-blue-100/70">
                  See what a verified record looks like
                </p>
              </div>

              <div className="space-y-6">
                {/* Verified Example */}
                <div
                  className="rounded-xl border-2 p-6 backdrop-blur-xl"
                  style={{
                    backgroundColor: 'rgba(2, 22, 44, 0.6)',
                    borderColor: 'rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                    <h3 className="text-xl font-bold text-green-400">Verified</h3>
                  </div>
                  <p className="text-sm text-blue-100/70 mb-4">
                    Code <code className="px-2 py-1 rounded bg-white/5 text-green-400 font-mono">SJ-982F8484</code> matches an official record approved by Captain John Smith
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-100/50">Crew Member:</span>
                      <p className="text-white font-semibold">Jane Doe</p>
                    </div>
                    <div>
                      <span className="text-blue-100/50">Position:</span>
                      <p className="text-white font-semibold">Second Officer</p>
                    </div>
                    <div>
                      <span className="text-blue-100/50">Vessel:</span>
                      <p className="text-white font-semibold">MV Ocean Star</p>
                    </div>
                    <div>
                      <span className="text-blue-100/50">Service:</span>
                      <p className="text-white font-semibold">180 days</p>
                    </div>
                  </div>
                </div>

                {/* Not Found Example */}
                <div
                  className="rounded-xl border-2 p-6 backdrop-blur-xl"
                  style={{
                    backgroundColor: 'rgba(2, 22, 44, 0.6)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <XCircle className="h-6 w-6 text-red-400" />
                    <h3 className="text-xl font-bold text-red-400">Code Not Found</h3>
                  </div>
                  <p className="text-sm text-blue-100/70">
                    The verification code you entered doesn't match any records in our system. Please double-check the code from the PDF footer.
                  </p>
                </div>

                {/* Voided Example */}
                <div
                  className="rounded-xl border-2 p-6 backdrop-blur-xl"
                  style={{
                    backgroundColor: 'rgba(2, 22, 44, 0.6)',
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <AlertCircle className="h-6 w-6 text-yellow-400" />
                    <h3 className="text-xl font-bold text-yellow-400">Voided</h3>
                  </div>
                  <p className="text-sm text-blue-100/70">
                    This record has been voided. The original testimonial is no longer valid or has been removed from the system.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who Can Use Section */}
        <section className="py-16 sm:py-20 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="font-headline text-3xl sm:text-4xl font-bold text-white mb-4">
                  Who Can Use Verification?
                </h2>
                <p className="text-lg text-blue-100/70">
                  Our verification system is designed for anyone who needs to verify maritime credentials.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    icon: Award,
                    title: 'Maritime Authorities',
                    description: 'MCA, flag state administrations, and certification bodies can instantly verify sea service records and testimonials submitted by applicants.',
                    useCase: 'Verify sea service for certification applications',
                  },
                  {
                    icon: Briefcase,
                    title: 'Employers & Recruiters',
                    description: 'Verify candidate credentials quickly and reliably before making hiring decisions. Ensure authenticity of sea service claims.',
                    useCase: 'Background checks during recruitment',
                  },
                  {
                    icon: Users,
                    title: 'Crew Members',
                    description: 'Verify your own testimonials to ensure they\'re correctly recorded and accessible to authorities or employers when needed.',
                    useCase: 'Confirm your records are properly stored',
                  },
                  {
                    icon: Building2,
                    title: 'Vessel Operators',
                    description: 'Verify testimonials issued by your vessels to confirm they\'re properly recorded and accessible for crew members.',
                    useCase: 'Audit testimonial records',
                  },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <Card
                      key={index}
                      className="border-2 backdrop-blur-xl"
                      style={{
                        backgroundColor: 'rgba(2, 22, 44, 0.6)',
                        borderColor: 'rgba(34, 197, 94, 0.3)',
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4 mb-3">
                          <div className="h-12 w-12 rounded-xl bg-green-500/20 flex items-center justify-center border border-green-500/30 flex-shrink-0">
                            <Icon className="h-6 w-6 text-green-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                            <p className="text-sm text-blue-100/70 leading-relaxed mb-3">{item.description}</p>
                            <div className="flex items-center gap-2 text-xs text-green-400/70">
                              <ExternalLink className="h-3 w-3" />
                              <span>{item.useCase}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 sm:py-20 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 mb-4">
                  <HelpCircle className="h-8 w-8 text-green-400" />
                  <h2 className="font-headline text-3xl sm:text-4xl font-bold text-white">
                    Frequently Asked Questions
                  </h2>
                </div>
                <p className="text-lg text-blue-100/70">
                  Common questions about our verification system
                </p>
              </div>

              <Accordion type="single" collapsible className="w-full space-y-4">
                {[
                  {
                    question: 'Do I need an account to verify records?',
                    answer: 'No, verification is completely public and requires no account or login. Anyone can verify a record using the verification code from the PDF footer.',
                  },
                  {
                    question: 'Where do I find the verification code?',
                    answer: 'The verification code appears in the footer of every approved testimonial PDF. It follows the format SJ-XXXX-XXXX (e.g., SJ-982F8484). The code is unique to each testimonial.',
                  },
                  {
                    question: 'What if the code is not found?',
                    answer: 'If a code is not found, it may mean: (1) The code was entered incorrectly, (2) The testimonial hasn\'t been approved yet, (3) The code is from an older system version. Please double-check the code from the PDF footer.',
                  },
                  {
                    question: 'Can verification codes be faked or tampered with?',
                    answer: 'No. Each verification code is cryptographically linked to the original approved testimonial in our secure database. Any modifications to the testimonial invalidate the code. The system uses tamper-proof technology to ensure authenticity.',
                  },
                  {
                    question: 'What information is shown in verification results?',
                    answer: 'Verification results show: crew member name and rank, vessel name and IMO number, service dates, service breakdown (total days, sea days, standby days), captain name and license, and approval date. This matches exactly what\'s in the original testimonial.',
                  },
                  {
                    question: 'Can I verify multiple records at once?',
                    answer: 'Currently, you can verify one record at a time. Simply enter each verification code separately on the verification page. This ensures accuracy and prevents confusion between different records.',
                  },
                  {
                    question: 'How long are verification codes valid?',
                    answer: 'Verification codes remain valid as long as the testimonial exists in our system. Even if the original testimonial is later voided or removed, the verification system will show the voided status, maintaining a complete audit trail.',
                  },
                  {
                    question: 'Is verification available worldwide?',
                    answer: 'Yes, our verification system is accessible from anywhere in the world, 24/7. There are no regional restrictions, and the system works on any device with internet access.',
                  },
                ].map((faq, index) => (
                  <AccordionItem
                    key={index}
                    value={`item-${index}`}
                    className="rounded-xl border-2 backdrop-blur-xl px-6"
                    style={{
                      backgroundColor: 'rgba(2, 22, 44, 0.6)',
                      borderColor: 'rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    <AccordionTrigger className="text-left text-white hover:no-underline py-4">
                      <span className="font-semibold">{faq.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-blue-100/70 pb-4 leading-relaxed">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-20 border-t border-white/10" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto text-center">
              <div className="rounded-2xl border-2 p-8 md:p-12 backdrop-blur-xl"
                style={{
                  backgroundColor: 'rgba(2, 22, 44, 0.6)',
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                }}
              >
                <Shield className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h2 className="font-headline text-2xl sm:text-3xl font-bold text-white mb-4">
                  Ready to Verify a Record?
                </h2>
                <p className="text-lg text-blue-100/70 mb-8">
                  Enter a verification code to instantly check the authenticity of any SeaJourney testimonial or sea service record.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
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
                    <Link href="/">
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Back to Home
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
