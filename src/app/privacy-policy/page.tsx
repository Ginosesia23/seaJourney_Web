'use client';

import { Shield, Lock, Database, Mail, Globe, FileText, CheckCircle2 } from 'lucide-react';
import {
  WkPageShell,
  WkPageHero,
  WkSectionCard,
} from '@/components/wk/wk-page-shell';

export default function PrivacyPolicyPage() {
  const currentDate = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="SeaJourney"
        icon={<Shield className="h-7 w-7" />}
        title="Privacy Policy"
        description="How we collect, use, and protect your personal data."
        meta={`Last updated · ${currentDate}`}
      />

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <WkSectionCard>
              <p>
                <strong>SeaJourney</strong> ("we", "our", "us") operates a digital platform designed to help maritime crew and vessels track sea time, vessel assignments, and generate professional testimonials.
              </p>
              <p>
                We are committed to protecting your personal data and respecting your privacy in accordance with the UK GDPR and EU GDPR.
              </p>
            </WkSectionCard>

            <WkSectionCard
              icon={<Database className="h-5 w-5" />}
              title="1. Information We Collect"
            >
              <p>We may collect the following information:</p>

              <h3>Personal Information</h3>
              <ul>
                <li>Name</li>
                <li>Email address</li>
                <li>Position / role</li>
                <li>Nationality (if provided)</li>
                <li>Account credentials</li>
              </ul>

              <h3>Usage &amp; Service Data</h3>
              <ul>
                <li>Sea time logs</li>
                <li>Vessel assignments</li>
                <li>Testimonials &amp; sign-off records</li>
                <li>App usage activity</li>
              </ul>

              <h3>Payment Data</h3>
              <ul>
                <li>Payments are processed securely via Stripe.</li>
                <li>We do not store your card details.</li>
              </ul>

              <h3>Technical Data</h3>
              <ul>
                <li>IP address</li>
                <li>Device type</li>
                <li>Browser information</li>
                <li>Login timestamps</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<FileText className="h-5 w-5" />}
              title="2. How We Use Your Data"
            >
              <p>We use your data to:</p>
              <ul>
                <li>Create and manage user accounts</li>
                <li>Track sea service and vessel assignments</li>
                <li>Generate professional testimonials</li>
                <li>Communicate with users</li>
                <li>Process subscriptions</li>
                <li>Improve platform functionality</li>
                <li>Meet legal obligations</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="3. Legal Basis for Processing"
            >
              <p>We process your data under:</p>
              <ul>
                <li>Contractual necessity</li>
                <li>Legitimate interests</li>
                <li>Legal obligations</li>
                <li>Your consent (where required)</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<Lock className="h-5 w-5" />}
              title="4. Data Storage & Security"
            >
              <p>Your data is securely stored using:</p>
              <ul>
                <li>Supabase (database &amp; authentication)</li>
                <li>Encrypted connections</li>
                <li>Role-based access controls</li>
              </ul>
              <p>We take reasonable measures to protect your information.</p>
            </WkSectionCard>

            <WkSectionCard
              icon={<Globe className="h-5 w-5" />}
              title="5. Third-Party Services"
            >
              <p>We use trusted third parties:</p>
              <ul>
                <li>Supabase – authentication &amp; database</li>
                <li>Stripe – payments</li>
                <li>Resend / email providers – communication</li>
                <li>Hosting providers – infrastructure</li>
              </ul>
              <p>Each provider complies with GDPR standards.</p>
            </WkSectionCard>

            <WkSectionCard
              icon={<Shield className="h-5 w-5" />}
              title="6. Your Rights (GDPR)"
            >
              <p>You have the right to:</p>
              <ul>
                <li>Access your data</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion</li>
                <li>Request data export</li>
                <li>Withdraw consent</li>
                <li>File a complaint</li>
              </ul>
              <blockquote>
                Requests can be sent to{' '}
                <a href="mailto:team@seajourney.co.uk">team@seajourney.co.uk</a>.
              </blockquote>
            </WkSectionCard>

            <div className="grid gap-6 md:grid-cols-3">
              <WkSectionCard compact title="7. Data Retention">
                <p>
                  We keep your data only as long as necessary to provide the
                  service or meet legal obligations.
                </p>
              </WkSectionCard>

              <WkSectionCard compact title="8. International Transfers">
                <p>
                  Some data may be processed outside the UK / EU, but always
                  with GDPR-compliant safeguards.
                </p>
              </WkSectionCard>

              <WkSectionCard compact title="9. Changes to This Policy">
                <p>
                  We may update this policy. Users will be notified of
                  significant changes.
                </p>
              </WkSectionCard>
            </div>

            <WkSectionCard
              icon={<Mail className="h-5 w-5" />}
              title="10. Contact"
            >
              <p><strong>SeaJourney</strong></p>
              <p>
                Email:{' '}
                <a href="mailto:team@seajourney.co.uk">
                  team@seajourney.co.uk
                </a>
              </p>
              <p>
                Website:{' '}
                <a
                  href="https://www.seajourney.co.uk"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.seajourney.co.uk
                </a>
              </p>
            </WkSectionCard>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
