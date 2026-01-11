import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FileText, Users, Shield, CreditCard, Lock, AlertTriangle, XCircle, Scale, Mail, CheckCircle2 } from 'lucide-react';

export default function TermsOfServicePage() {
  const currentDate = new Date().toLocaleDateString('en-GB', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#000b15' }}>
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 sm:py-24 relative">
          <div className="absolute inset-0 opacity-10" style={{ overflow: 'hidden', clipPath: 'inset(0)' }}>
            <div className="absolute -top-48 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-48 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
          </div>
          
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                <FileText className="h-8 w-8 text-blue-400" />
              </div>
              <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">
                Terms & Conditions
              </h1>
              <p className="text-lg text-blue-100 mb-2">
                SeaJourney
              </p>
              <p className="text-sm text-blue-200/60 mb-4">
                Last updated: {currentDate}
              </p>
              <p className="text-base text-blue-100/80 max-w-2xl mx-auto">
                By using SeaJourney, you agree to these Terms.
              </p>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 pb-24" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="space-y-6">
                {/* Section 1 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <FileText className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">1. Service Description</h2>
                    </div>
                    <p className="text-blue-100 mb-4">SeaJourney provides digital tools for:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-4 ml-4">
                      {['Logging sea service', 'Tracking vessel assignments', 'Managing crew data', 'Generating testimonials', 'Managing vessel records'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="rounded-lg p-4 mt-4" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                      <p className="text-orange-200 text-sm">
                        <strong className="text-orange-100">Important:</strong> SeaJourney is not a maritime authority and does not certify or approve sea service.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Section 2 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Users className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">2. User Responsibilities</h2>
                    </div>
                    <p className="text-blue-100 mb-4">You agree to:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-4 ml-4">
                      {['Provide accurate information', 'Use the platform lawfully', 'Not falsify records', 'Respect data integrity', 'Keep login details secure'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="rounded-lg p-4 mt-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <p className="text-red-200 text-sm">
                        False information may result in account suspension or termination.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Section 3 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Shield className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">3. Testimonials & Sign-Offs</h2>
                    </div>
                    <ul className="space-y-3 text-blue-100/90 ml-4">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span>Captains are responsible for the accuracy of testimonials</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span>SeaJourney only provides the digital tools</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span>Acceptance by MCA, PYA, or other authorities is not guaranteed</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                {/* Section 4 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Users className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">4. Accounts</h2>
                    </div>
                    <p className="text-blue-100 mb-4">You must:</p>
                    <ul className="space-y-2 text-blue-100/90 ml-4">
                      {['Be at least 18 years old', 'Maintain accurate account information', 'Not share your account'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Section 5 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <CreditCard className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">5. Subscriptions & Payments</h2>
                    </div>
                    <ul className="space-y-2 text-blue-100/90 ml-4">
                      {['Payments are handled via Stripe', 'Subscriptions renew automatically', 'You can cancel anytime', 'No refunds unless legally required'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-blue-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Section 6 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Lock className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">6. Intellectual Property</h2>
                    </div>
                    <p className="text-blue-100/90">
                      All platform content, branding, and software belong to SeaJourney. You may not copy, resell, or redistribute the service.
                    </p>
                  </CardContent>
                </Card>

                {/* Section 7 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">7. Prohibited Use</h2>
                    </div>
                    <p className="text-blue-100 mb-4">You may not:</p>
                    <ul className="space-y-2 text-blue-100/90 ml-4">
                      {['Misuse the system', 'Upload false data', 'Attempt unauthorized access', 'Harm the platform or users'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Section 8 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <AlertTriangle className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">8. Limitation of Liability</h2>
                    </div>
                    <p className="text-blue-100 mb-4">SeaJourney is not responsible for:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-4 ml-4">
                      {['Rejected testimonials', 'Career outcomes', 'Incorrect user data', 'Regulatory decisions'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-blue-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="rounded-lg p-4 mt-4" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                      <p className="text-orange-200 text-sm">
                        Use is at your own risk.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Sections 9-10 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
                          <XCircle className="h-4 w-4 text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">9. Termination</h3>
                      </div>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        We may suspend or terminate accounts that breach these Terms.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                          <Scale className="h-4 w-4 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">10. Governing Law</h3>
                      </div>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        These Terms are governed by UK law.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Section 11 - Contact */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Mail className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">11. Contact</h2>
                    </div>
                    <div className="space-y-3 text-blue-100">
                      <p>
                        Email: <a href="mailto:team@seajourney.co.uk" className="text-blue-400 hover:text-blue-300 underline font-medium">team@seajourney.co.uk</a>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
