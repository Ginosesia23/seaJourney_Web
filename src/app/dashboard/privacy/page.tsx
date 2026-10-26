'use client';

import Link from 'next/link';
import {
  Shield,
  Database,
  Eye,
  Lock,
  Share2,
  Clock,
  Scale,
  Mail,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const lastUpdated = new Date().toLocaleDateString('en-GB', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default function DashboardPrivacyPage() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Data &amp; privacy</h1>
        <p className="text-muted-foreground">
          How SeaJourney stores and uses your account data under the UK GDPR
          and EU GDPR. This page is for every account type — crew, captain,
          vessel, and admin.
        </p>
        <p className="text-xs text-muted-foreground">Last updated · {lastUpdated}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Why we hold your data
          </CardTitle>
          <CardDescription>
            We only process what we need to run your sea-time account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            SeaJourney is a sea-service record platform. We store the details
            you enter so we can keep your log, calculate sea time, produce
            documents, and share records with people you choose — such as a
            vessel manager or a captain signing a testimonial.
          </p>
          <p>
            The legal bases we rely on are: performing our contract with you,
            legitimate interests in running a secure service, legal obligations
            (for example billing records), and consent where you opt in.
          </p>
          <p>
            This page explains the practice. The formal notice is the{' '}
            <Link href="/privacy-policy" className="font-medium text-foreground underline">
              Privacy Policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            What we store
          </CardTitle>
          <CardDescription>
            Data sits in your account until you change or delete it, or you ask
            us to erase it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Account</h3>
            <p className="mt-1 text-muted-foreground">
              Name, email, role, position, nationality, date of birth, contact
              details, discharge book number, signature, and profile photo if
              you add them. Sign-in is handled by our authentication provider;
              we do not store your password in plain text.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Sea service</h3>
            <p className="mt-1 text-muted-foreground">
              Daily state logs, vessel assignments, passages, watch hours, and
              the calculations we derive from them.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Documents &amp; training</h3>
            <p className="mt-1 text-muted-foreground">
              Testimonials, proof of service, certificates, visas, generated
              PDFs, training records, and digital sign-offs you send or receive.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Vessel &amp; AIS</h3>
            <p className="mt-1 text-muted-foreground">
              Vessel identity, stamp, and crew lists for vessel accounts. When
              AIS tracking is switched on, we store position and status updates
              so the daily log can stay complete.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Billing &amp; technical</h3>
            <p className="mt-1 text-muted-foreground">
              Subscription status and invoices through Stripe — we do not store
              card numbers. We also keep login times, device and browser data,
              and IP address to secure the account. Payments and cookies are
              described in our{' '}
              <Link href="/cookie-policy" className="font-medium text-foreground underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            How we use it
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Create and keep your account working</li>
            <li>Record sea time and apply the yacht or commercial calculation rules</li>
            <li>Generate and store career documents you request</li>
            <li>Send Inbox items you start — sign-offs, sea-time offers, coverage requests</li>
            <li>Fill vessel logs from AIS when you have tracking enabled</li>
            <li>Process subscriptions and send service email</li>
            <li>Keep the platform secure and meet legal duties</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Who can see it
          </CardTitle>
          <CardDescription>
            We do not sell your data. Access is limited to you and people you
            involve
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            You can always see your own records. A vessel manager can view crew
            sea time only after you approve an access request. A captain or
            officer sees the document you send them to sign. Linked team
            accounts only see what that vessel has granted.
          </p>
          <p>
            SeaJourney staff may access an account to fix a support issue or
            protect the service. Processors that host the app — database and
            login (Supabase), payments (Stripe), email, AIS providers, and
            hosting — receive only what they need to provide that function.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            How we protect it
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Data is stored in our cloud database with encrypted connections and
            role-based access. Each account can only query the rows it is
            allowed to see. Some processing may happen outside the UK or EU;
            those transfers use GDPR-standard safeguards.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            How long we keep it
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            We keep account and sea-service records while you use SeaJourney,
            because those records are the service. Billing data is kept for as
            long as tax and accounting law requires. If you close the account
            or ask us to erase it, we delete or anonymise what we no longer
            need, unless a legal duty says we must hold it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Your rights
          </CardTitle>
          <CardDescription>
            You can exercise these at any time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Access a copy of the personal data we hold</li>
            <li>Correct details that are wrong — most of this is on your Profile</li>
            <li>Ask us to delete your account and personal data</li>
            <li>
              Export your records — download reports from your account where
              that tool is available, or email us for a copy
            </li>
            <li>Restrict or object to certain processing</li>
            <li>Withdraw consent where we relied on it</li>
            <li>
              Complain to the{' '}
              <a
                href="https://ico.org.uk/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline"
              >
                Information Commissioner&apos;s Office
              </a>
            </li>
          </ul>
          <p className="text-muted-foreground">
            Email{' '}
            <a
              href="mailto:team@seajourney.co.uk"
              className="font-medium text-foreground underline"
            >
              team@seajourney.co.uk
            </a>{' '}
            for access, correction, or deletion. We will respond as soon as we
            can, and within one month.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Full legal documents
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/privacy-policy">Privacy Policy</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/terms-of-service">Terms of Service</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/cookie-policy">Cookie Policy</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="mailto:team@seajourney.co.uk">
              <Mail className="mr-2 h-4 w-4" />
              Contact us
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
