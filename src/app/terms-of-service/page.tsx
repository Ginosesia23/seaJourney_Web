'use client';

import {
  FileText,
  Users,
  Shield,
  CreditCard,
  Lock,
  AlertTriangle,
  XCircle,
  Scale,
  Mail,
} from 'lucide-react';
import {
  WkPageShell,
  WkPageHero,
  WkSectionCard,
} from '@/components/wk/wk-page-shell';

export default function TermsOfServicePage() {
  const currentDate = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="SeaJourney"
        icon={<FileText className="h-7 w-7" />}
        title="Terms & Conditions"
        description="By using SeaJourney, you agree to these Terms."
        meta={`Last updated · ${currentDate}`}
      />

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <WkSectionCard
              icon={<FileText className="h-5 w-5" />}
              title="1. Service Description"
            >
              <p>SeaJourney provides digital tools for:</p>
              <ul>
                <li>Logging sea service</li>
                <li>Tracking vessel assignments</li>
                <li>Managing crew data</li>
                <li>Generating testimonials</li>
                <li>Managing vessel records</li>
              </ul>
              <div className="wk-callout" data-tone="warn">
                <strong>Important:</strong> SeaJourney is not a maritime
                authority and does not certify or approve sea service.
              </div>
            </WkSectionCard>

            <WkSectionCard
              icon={<Users className="h-5 w-5" />}
              title="2. User Responsibilities"
            >
              <p>You agree to:</p>
              <ul>
                <li>Provide accurate information</li>
                <li>Use the platform lawfully</li>
                <li>Not falsify records</li>
                <li>Respect data integrity</li>
                <li>Keep login details secure</li>
              </ul>
              <div className="wk-callout" data-tone="bad">
                False information may result in account suspension or
                termination.
              </div>
            </WkSectionCard>

            <WkSectionCard
              icon={<Shield className="h-5 w-5" />}
              title="3. Testimonials & Sign-Offs"
            >
              <ul>
                <li>Captains are responsible for the accuracy of testimonials.</li>
                <li>SeaJourney only provides the digital tools.</li>
                <li>Acceptance by the MCA or other authorities is not guaranteed.</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<Users className="h-5 w-5" />}
              title="4. Accounts"
            >
              <p>You must:</p>
              <ul>
                <li>Be at least 18 years old</li>
                <li>Maintain accurate account information</li>
                <li>Not share your account</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<CreditCard className="h-5 w-5" />}
              title="5. Subscriptions & Payments"
            >
              <ul>
                <li>Payments are handled via Stripe.</li>
                <li>Subscriptions renew automatically.</li>
                <li>You can cancel anytime.</li>
                <li>No refunds unless legally required.</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<Lock className="h-5 w-5" />}
              title="6. Intellectual Property"
            >
              <p>
                All platform content, branding, and software belong to
                SeaJourney. You may not copy, resell, or redistribute the
                service.
              </p>
            </WkSectionCard>

            <WkSectionCard
              icon={<AlertTriangle className="h-5 w-5" />}
              title="7. Prohibited Use"
            >
              <p>You may not:</p>
              <ul>
                <li>Misuse the system</li>
                <li>Upload false data</li>
                <li>Attempt unauthorised access</li>
                <li>Harm the platform or users</li>
              </ul>
            </WkSectionCard>

            <WkSectionCard
              icon={<AlertTriangle className="h-5 w-5" />}
              title="8. Limitation of Liability"
            >
              <p>SeaJourney is not responsible for:</p>
              <ul>
                <li>Rejected testimonials</li>
                <li>Career outcomes</li>
                <li>Incorrect user data</li>
                <li>Regulatory decisions</li>
              </ul>
              <div className="wk-callout" data-tone="warn">
                Use is at your own risk.
              </div>
            </WkSectionCard>

            <div className="grid gap-6 md:grid-cols-2">
              <WkSectionCard
                compact
                icon={<XCircle className="h-5 w-5" />}
                title="9. Termination"
              >
                <p>
                  We may suspend or terminate accounts that breach these Terms.
                </p>
              </WkSectionCard>

              <WkSectionCard
                compact
                icon={<Scale className="h-5 w-5" />}
                title="10. Governing Law"
              >
                <p>These Terms are governed by UK law.</p>
              </WkSectionCard>
            </div>

            <WkSectionCard
              icon={<Mail className="h-5 w-5" />}
              title="11. Contact"
            >
              <p>
                Email:{' '}
                <a href="mailto:team@seajourney.co.uk">
                  team@seajourney.co.uk
                </a>
              </p>
            </WkSectionCard>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
