import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Cookie, Info, Settings, Shield, Globe, Mail, CheckCircle2 } from 'lucide-react';

export default function CookiePolicyPage() {
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
                <Cookie className="h-8 w-8 text-blue-400" />
              </div>
              <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">
                Cookie Policy
              </h1>
              <p className="text-lg text-blue-100 mb-2">
                SeaJourney
              </p>
              <p className="text-sm text-blue-200/60 mb-4">
                Last updated: {currentDate}
              </p>
              <p className="text-base text-blue-100/80 max-w-2xl mx-auto">
                SeaJourney uses cookies to improve your experience.
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
                        <Info className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">1. What Are Cookies?</h2>
                    </div>
                    <p className="text-blue-100/90 leading-relaxed">
                      Cookies are small files stored on your device that help websites function properly.
                    </p>
                  </CardContent>
                </Card>

                {/* Section 2 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Cookie className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">2. Types of Cookies We Use</h2>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Essential Cookies</h3>
                        <p className="text-blue-100/90">
                          Required for login, security, and functionality.
                        </p>
                      </div>

                      <Separator className="border-white/10" />

                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Analytics Cookies</h3>
                        <p className="text-blue-100/90">
                          Help us understand how users use the platform.
                        </p>
                      </div>

                      <Separator className="border-white/10" />

                      <div>
                        <h3 className="text-lg font-semibold text-blue-200 mb-3">Preference Cookies</h3>
                        <p className="text-blue-100/90">
                          Save your settings and preferences.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Section 3 */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Settings className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">3. Managing Cookies</h2>
                    </div>
                    <p className="text-blue-100 mb-4">You can:</p>
                    <ul className="space-y-2 text-blue-100/90 mb-4 ml-4">
                      {['Disable cookies in your browser', 'Clear stored cookies', 'Adjust preferences'].map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="rounded-lg p-4 mt-4" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                      <p className="text-orange-200 text-sm">
                        Some features may not work without cookies.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Sections 4-5 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                          <Globe className="h-4 w-4 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">4. Third-Party Cookies</h3>
                      </div>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        Services like Stripe or analytics tools may place cookies.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                          <Shield className="h-4 w-4 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">5. Changes</h3>
                      </div>
                      <p className="text-blue-100/90 text-sm leading-relaxed">
                        We may update this policy when needed.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Section 6 - Contact */}
                <Card className="border-white/10 rounded-xl" style={{ backgroundColor: 'rgba(2, 22, 44, 0.5)', backdropFilter: 'blur(10px)' }}>
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <Mail className="h-5 w-5 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">6. Contact</h2>
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
