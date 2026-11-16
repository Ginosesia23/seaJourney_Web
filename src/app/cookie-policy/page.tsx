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
  { id: 'what', label: 'What cookies are' },
  { id: 'types', label: 'Types we use' },
  { id: 'managing', label: 'Managing cookies' },
  { id: 'third-parties', label: 'Third parties' },
  { id: 'changes', label: 'Changes' },
  { id: 'contact', label: 'Contact' },
] as const;

const TYPES = [
  {
    title: 'Essential',
    body: 'Required for login, security, and core site functions. The site cannot work properly without these.',
  },
  {
    title: 'Analytics',
    body: 'Help us understand how people use SeaJourney so we can improve the product.',
  },
  {
    title: 'Preference',
    body: 'Remember settings such as theme and other choices you make on the site.',
  },
] as const;

export default function CookiePolicyPage() {
  return (
    <WkPageShell>
      <LegalPageFrame
        header={
          <LegalPageHeader
            current="cookies"
            title="Cookie Policy"
            description="How SeaJourney uses cookies and similar technologies on the website and in the app."
          />
        }
        toc={<LegalToc sections={SECTIONS} />}
      >
        <LegalSection id="what" kicker="01" title="What are cookies?">
          <p>
            Cookies are small files stored on your device that help websites
            function properly. SeaJourney uses them to keep you signed in, remember
            preferences, and understand how the product is used.
          </p>
        </LegalSection>

        <LegalSection id="types" kicker="02" title="Types of cookies we use">
          <div className="grid gap-3 sm:grid-cols-3">
            {TYPES.map((type) => (
              <div
                key={type.title}
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: 'var(--wk-bg-subtle)',
                  border: '1px solid var(--wk-line)',
                }}
              >
                <h3 className="text-sm font-semibold" style={{ color: 'var(--wk-text)' }}>
                  {type.title}
                </h3>
                <p className="mt-1.5 text-sm" style={{ color: 'var(--wk-text-soft)' }}>
                  {type.body}
                </p>
              </div>
            ))}
          </div>
        </LegalSection>

        <LegalSection id="managing" kicker="03" title="Managing cookies">
          <p>You can control cookies from your browser:</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {['Disable cookies in your browser', 'Clear stored cookies', 'Adjust site preferences'].map(
              (item) => (
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
              ),
            )}
          </ul>
          <div className="wk-callout" data-tone="warn">
            Some features may not work without cookies — especially sign-in and
            saved preferences.
          </div>
        </LegalSection>

        <div className="grid gap-8 lg:grid-cols-2">
          <LegalSection id="third-parties" kicker="04" title="Third-party cookies">
            <p>
              Services we use, such as Stripe for payments and analytics tools,
              may place their own cookies. Those providers only receive what they
              need to run that function.
            </p>
          </LegalSection>
          <LegalSection id="changes" kicker="05" title="Changes">
            <p>
              We may update this policy when we add or change tools. Significant
              changes will be noted on this page.
            </p>
          </LegalSection>
        </div>

        <LegalContact
          kicker="06 · Contact"
          title="Questions about cookies"
          body="SeaJourney · Email us if you want to know how cookies are used on your account."
        />
      </LegalPageFrame>
    </WkPageShell>
  );
}
