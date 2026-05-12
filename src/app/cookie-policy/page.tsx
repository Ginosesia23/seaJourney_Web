'use client';

import { Cookie, Info, Settings, Shield, Globe, Mail } from 'lucide-react';
import {
  WkPageShell,
  WkPageHero,
  WkSectionCard,
} from '@/components/wk/wk-page-shell';

export default function CookiePolicyPage() {
  const currentDate = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <WkPageShell>
      <WkPageHero
        eyebrow="SeaJourney"
        icon={<Cookie className="h-7 w-7" />}
        title="Cookie Policy"
        description="SeaJourney uses cookies to improve your experience."
        meta={`Last updated · ${currentDate}`}
      />

      <section className="pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <WkSectionCard
              icon={<Info className="h-5 w-5" />}
              title="1. What Are Cookies?"
            >
              <p>
                Cookies are small files stored on your device that help websites
                function properly.
              </p>
            </WkSectionCard>

            <WkSectionCard
              icon={<Cookie className="h-5 w-5" />}
              title="2. Types of Cookies We Use"
            >
              <h3>Essential Cookies</h3>
              <p>Required for login, security, and functionality.</p>

              <h3>Analytics Cookies</h3>
              <p>Help us understand how users use the platform.</p>

              <h3>Preference Cookies</h3>
              <p>Save your settings and preferences.</p>
            </WkSectionCard>

            <WkSectionCard
              icon={<Settings className="h-5 w-5" />}
              title="3. Managing Cookies"
            >
              <p>You can:</p>
              <ul>
                <li>Disable cookies in your browser</li>
                <li>Clear stored cookies</li>
                <li>Adjust preferences</li>
              </ul>
              <div className="wk-callout" data-tone="warn">
                Some features may not work without cookies.
              </div>
            </WkSectionCard>

            <div className="grid gap-6 md:grid-cols-2">
              <WkSectionCard
                compact
                icon={<Globe className="h-5 w-5" />}
                title="4. Third-Party Cookies"
              >
                <p>
                  Services like Stripe or analytics tools may place cookies.
                </p>
              </WkSectionCard>

              <WkSectionCard
                compact
                icon={<Shield className="h-5 w-5" />}
                title="5. Changes"
              >
                <p>We may update this policy when needed.</p>
              </WkSectionCard>
            </div>

            <WkSectionCard
              icon={<Mail className="h-5 w-5" />}
              title="6. Contact"
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
