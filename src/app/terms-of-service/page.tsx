'use client';

import { CheckCircle2 } from 'lucide-react';
import { WkPageShell } from '@/components/wk/wk-page-shell';
import {
  LegalContact,
  LegalPageFrame,
  LegalPageHeader,
  LegalSection,
  LegalToc,
} from '@/components/wk/legal-page';

const SECTIONS = [
  { id: 'service', label: 'The service' },
  { id: 'responsibilities', label: 'Your responsibilities' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'payments', label: 'Payments' },
  { id: 'ip', label: 'Intellectual property' },
  { id: 'prohibited', label: 'Prohibited use' },
  { id: 'liability', label: 'Liability' },
  { id: 'termination', label: 'Termination' },
  { id: 'law', label: 'Governing law' },
  { id: 'contact', label: 'Contact' },
] as const;

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-3 rounded-xl px-3 py-2.5"
          style={{
            backgroundColor: 'var(--wk-bg-subtle)',
            border: '1px solid var(--wk-line)',
            color: 'var(--wk-text)',
          }}
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 flex-none"
            style={{ color: 'var(--wk-accent)' }}
          />
          <span className="text-sm">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TermsOfServicePage() {
  return (
    <WkPageShell>
      <LegalPageFrame
        header={
          <LegalPageHeader
            current="terms"
            title="Terms & Conditions"
            description="By using SeaJourney you agree to these terms. Please read them before you create an account or subscribe."
            extras={['UK law']}
          />
        }
        toc={<LegalToc sections={SECTIONS} />}
      >
        <LegalSection id="service" kicker="01" title="Service description">
          <p>SeaJourney provides digital tools for:</p>
          <CheckList
            items={[
              'Logging sea service',
              'Tracking vessel assignments',
              'Managing crew data',
              'Generating testimonials',
              'Managing vessel records',
            ]}
          />
          <div className="wk-callout" data-tone="warn">
            <strong>Important:</strong> SeaJourney is not a maritime authority
            and does not certify or approve sea service.
          </div>
        </LegalSection>

        <LegalSection id="responsibilities" kicker="02" title="User responsibilities">
          <p>You agree to:</p>
          <CheckList
            items={[
              'Provide accurate information',
              'Use the platform lawfully',
              'Not falsify records',
              'Respect data integrity',
              'Keep login details secure',
            ]}
          />
          <div className="wk-callout" data-tone="bad">
            False information may result in account suspension or termination.
          </div>
        </LegalSection>

        <LegalSection id="testimonials" kicker="03" title="Testimonials & sign-offs">
          <CheckList
            items={[
              'Captains are responsible for the accuracy of testimonials.',
              'SeaJourney only provides the digital tools.',
              'Acceptance by the MCA or other authorities is not guaranteed.',
            ]}
          />
        </LegalSection>

        <div className="grid gap-8 lg:grid-cols-2">
          <LegalSection id="accounts" kicker="04" title="Accounts">
            <p>You must:</p>
            <CheckList
              items={[
                'Be at least 18 years old',
                'Maintain accurate account information',
                'Not share your account',
              ]}
            />
          </LegalSection>
          <LegalSection id="payments" kicker="05" title="Subscriptions & payments">
            <CheckList
              items={[
                'Payments are handled via Stripe.',
                'Subscriptions renew automatically.',
                'You can cancel anytime.',
                'No refunds unless legally required.',
              ]}
            />
          </LegalSection>
        </div>

        <LegalSection id="ip" kicker="06" title="Intellectual property">
          <p>
            All platform content, branding, and software belong to SeaJourney.
            You may not copy, resell, or redistribute the service.
          </p>
        </LegalSection>

        <div className="grid gap-8 lg:grid-cols-2">
          <LegalSection id="prohibited" kicker="07" title="Prohibited use">
            <p>You may not:</p>
            <CheckList
              items={[
                'Misuse the system',
                'Upload false data',
                'Attempt unauthorised access',
                'Harm the platform or users',
              ]}
            />
          </LegalSection>
          <LegalSection id="liability" kicker="08" title="Limitation of liability">
            <p>SeaJourney is not responsible for:</p>
            <CheckList
              items={[
                'Rejected testimonials',
                'Career outcomes',
                'Incorrect user data',
                'Regulatory decisions',
              ]}
            />
            <div className="wk-callout" data-tone="warn">
              Use is at your own risk.
            </div>
          </LegalSection>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <LegalSection id="termination" kicker="09" title="Termination">
            <p>
              We may suspend or terminate accounts that breach these Terms.
            </p>
          </LegalSection>
          <LegalSection id="law" kicker="10" title="Governing law">
            <p>These Terms are governed by UK law.</p>
          </LegalSection>
        </div>

        <LegalContact
          kicker="11 · Contact"
          title="Questions about these terms"
          body="SeaJourney · Email us if you need clarification before you subscribe or if you believe an account action was wrong."
        />
      </LegalPageFrame>
    </WkPageShell>
  );
}
