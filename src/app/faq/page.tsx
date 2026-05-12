'use client';

import { HelpCircle, Mail, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import {
  WkPageShell,
  WkPageHero,
  WkSectionCard,
} from '@/components/wk/wk-page-shell';

const faqData: Array<{ q: string; a: string }> = [
  {
    q: 'What is SeaJourney?',
    a: 'SeaJourney is a digital logbook designed for maritime professionals to easily track their sea time, manage testimonials, and prepare documentation for certificate applications.',
  },
  {
    q: 'Who is SeaJourney for?',
    a: 'SeaJourney is for all maritime professionals, including yacht crew, deckhands, engineers, and captains, who need to maintain an accurate record of their time at sea.',
  },
  {
    q: 'How do I log my sea time?',
    a: "You can easily add new entries for your sea time, including vessel details, dates, and your position. The app's intuitive interface makes logging quick and simple.",
  },
  {
    q: 'Can I get digital testimonials signed?',
    a: 'Yes, you can generate sea time testimonials within the app and have them digitally signed by your captain or chief engineer, making your documentation official and secure.',
  },
  {
    q: 'Is my data secure?',
    a: 'We take data security very seriously. All your information is securely stored and backed up, so you never have to worry about losing your valuable sea time records.',
  },
];

export default function FAQPage() {
  return (
    <WkPageShell>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .wk-faq-item {
              border: 1px solid var(--wk-line);
              background-color: var(--wk-card);
              border-radius: 14px;
              overflow: hidden;
              transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .wk-faq-item[open] {
              border-color: var(--wk-accent-ring);
              box-shadow: var(--wk-shadow-md);
            }
            .wk-faq-summary {
              cursor: pointer;
              list-style: none;
              padding: 18px 22px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              font-weight: 600;
              color: var(--wk-text);
              font-size: 1rem;
            }
            .wk-faq-summary::-webkit-details-marker { display: none; }
            .wk-faq-chevron {
              flex: none;
              transition: transform 0.25s ease, color 0.2s ease;
              color: var(--wk-text-muted);
            }
            .wk-faq-item[open] .wk-faq-chevron {
              transform: rotate(180deg);
              color: var(--wk-accent);
            }
            .wk-faq-body {
              padding: 0 22px 18px;
              color: var(--wk-text-soft);
              line-height: 1.65;
              font-size: 0.95rem;
            }
          `,
        }}
      />

      <WkPageHero
        eyebrow="Help center"
        icon={<HelpCircle className="h-7 w-7" />}
        title="Frequently asked questions"
        description="Have questions? We have answers. If you can't find what you're looking for, get in touch."
      />

      <section className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-3">
            {faqData.map((item, idx) => (
              <details
                key={idx}
                className="wk-faq-item"
                open={idx === 0}
              >
                <summary className="wk-faq-summary">
                  <span>{item.q}</span>
                  <ChevronDown className="wk-faq-chevron h-4 w-4" />
                </summary>
                <div className="wk-faq-body">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <WkSectionCard
              icon={<Mail className="h-5 w-5" />}
              title="Still need help?"
            >
              <p>
                We're a small, hands-on team — drop us a line and we'll get back
                to you as quickly as possible.
              </p>
              <p>
                <Link href="mailto:team@seajourney.co.uk">
                  team@seajourney.co.uk
                </Link>
              </p>
            </WkSectionCard>
          </div>
        </div>
      </section>
    </WkPageShell>
  );
}
