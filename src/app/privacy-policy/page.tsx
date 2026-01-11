import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Shield, Lock, Database, Mail, Globe, FileText, CheckCircle2 } from 'lucide-react';

export default function PrivacyPolicyPage() {
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
                <Shield className="h-8 w-8 text-blue-400" />
              </div>
              <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">
                Privacy Policy
              </h1>
              <p className="text-lg text-blue-100 mb-2">
                SeaJourney
              </p>
              <p className="text-sm text-blue-200/60">
                Last updated: {currentDate}
              </p>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 pb-24" style={{ backgroundColor: '#000b15' }}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              {/* Introduction Card */}
              <Card className="mb-8 border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                <CardContent className="p-8">
                  <p className="text-lg text-blue-100 leading-relaxed mb-4">
                    SeaJourney ("we", "our", "us") operates a digital platform designed to help maritime crew and vessels track sea time, vessel assignments, and generate professional testimonials.
                  </p>
                  <p className="text-base text-blue-200/80 leading-relaxed">
                    We are committed to protecting your personal data and respecting your privacy in accordance with the UK GDPR and EU GDPR.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {/* Section 1 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Database className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">1. Information We Collect</h2>
                    </div>
                    <p className="text-blue-100 mb-6">We may collect the following information:</p>
                    
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Personal Information</h3>
                        <ul className="space-y-2 text-blue-100/90 ml-4">
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Name</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Email address</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Position/role</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Nationality (if provided)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Account credentials</span>
                          </li>
                        </ul>
                      </div>

                      <Separator className="border-white/10" />

                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Usage & Service Data</h3>
                        <ul className="space-y-2 text-blue-100/90 ml-4">
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Sea time logs</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Vessel assignments</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Testimonials & sign-off records</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>App usage activity</span>
                          </li>
                        </ul>
                      </div>

                      <Separator className="border-white/10" />

                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Payment Data</h3>
                        <ul className="space-y-2 text-blue-100/90 ml-4">
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Payments are processed securely via Stripe.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>We do not store your card details.</span>
                          </li>
                        </ul>
                      </div>

                      <Separator className="border-white/10" />

                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Technical Data</h3>
                        <ul className="space-y-2 text-blue-100/90 ml-4">
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>IP address</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Device type</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Browser information</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>Login timestamps</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Section 2 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <FileText className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">2. How We Use Your Data</h2>
                    </div>
                    <p className="text-blue-100 mb-4">We use your data to:</p>
                    <ul className="space-y-2 text-blue-100/90 ml-4">
                      {['Create and manage user accounts', 'Track sea service and vessel assignments', 'Generate professional testimonials', 'Communicate with users', 'Process subscriptions', 'Improve platform functionality', 'Meet legal obligations'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Section 3 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <CheckCircle2 className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">3. Legal Basis for Processing</h2>
                    </div>
                    <p className="text-blue-100 mb-4">We process your data under:</p>
                    <ul className="space-y-2 text-blue-100/90 ml-4">
                      {['Contractual necessity', 'Legitimate interests', 'Legal obligations', 'Your consent (where required)'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-blue-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Section 4 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Lock className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">4. Data Storage & Security</h2>
                    </div>
                    <p className="text-blue-100 mb-4">Your data is securely stored using:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-4 ml-4">
                      {['Supabase (database & authentication)', 'Encrypted connections', 'Role-based access controls'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-blue-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-blue-100/80">We take reasonable measures to protect your information.</p>
                  </CardContent>
                </Card>

                {/* Section 5 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Globe className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">5. Third-Party Services</h2>
                    </div>
                    <p className="text-blue-100 mb-4">We use trusted third parties:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-4 ml-4">
                      {['Supabase – authentication & database', 'Stripe – payments', 'Resend / Email providers – communication', 'Hosting providers – infrastructure'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-blue-400 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-blue-100/80">Each provider complies with GDPR standards.</p>
                  </CardContent>
                </Card>

                {/* Section 6 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Shield className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">6. Your Rights (GDPR)</h2>
                    </div>
                    <p className="text-blue-100 mb-4">You have the right to:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-6 ml-4">
                      {['Access your data', 'Correct inaccurate data', 'Request deletion', 'Request data export', 'Withdraw consent', 'File a complaint'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                </ul>
                    <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                      <p className="text-blue-100">
                        Requests can be sent to: <a href="mailto:team@seajourney.co.uk" className="text-blue-400 hover:text-blue-300 underline font-medium">team@seajourney.co.uk</a>
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Sections 7-9 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold text-white mb-3">7. Data Retention</h3>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        We keep your data only as long as necessary to provide the service or meet legal obligations.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold text-white mb-3">8. International Transfers</h3>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        Some data may be processed outside the UK/EU, but always with GDPR-compliant safeguards.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold text-white mb-3">9. Changes to This Policy</h3>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        We may update this policy. Users will be notified of significant changes.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Section 10 - Contact */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Mail className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">10. Contact</h2>
                    </div>
                    <div className="space-y-3 text-blue-100">
                      <p className="text-lg font-semibold text-white">SeaJourney</p>
                      <p>
                        Email: <a href="mailto:team@seajourney.co.uk" className="text-blue-400 hover:text-blue-300 underline font-medium">team@seajourney.co.uk</a>
                      </p>
                      <p>
                        Website: <a href="https://www.seajourney.co.uk" className="text-blue-400 hover:text-blue-300 underline font-medium" target="_blank" rel="noopener noreferrer">www.seajourney.co.uk</a>
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
