'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  TrainingRecordsAttribution,
  TrainingRecordsDisclaimer,
  TrainingRecordsEmpty,
  TrainingRecordsPageHeader,
  TrainingRecordsSection,
  TrainingStatusPill,
} from '@/components/dashboard/training-records-page-ui';
import { TRB_DISCLAIMER } from '@/lib/trb/constants';
import {
  MCA_PILOT_ATTRIBUTION,
  MCA_PILOT_CONSENT_VERSION,
  MCA_PILOT_DISCLAIMER,
  MCA_PILOT_DISCLAIMER_VERSION,
  MCA_PILOT_OGL_URL,
  MCA_PILOT_PROGRAM_CODE,
  MCA_PILOT_SOURCE_URL,
} from '@/lib/trb/pilot';
import { bearerHeaders } from '@/lib/applications/client';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';

type Program = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_official?: boolean;
  isOfficial?: boolean;
  isMcaPilot?: boolean;
  isOowYachts3000?: boolean;
  recognitionStatus?: string;
  recognition_status?: string;
  sourceAuthority?: string | null;
  sourceUrl?: string | null;
  source_url?: string | null;
  sourcePublishedAt?: string | null;
  sourceRevisionLabel?: string | null;
  companionNotice?: string | null;
  versions: {
    id: string;
    version: string;
    status: string;
    disclaimer: string;
    companionNotice?: string;
    pilot_disclaimer?: string;
    pilotDisclaimer?: string;
    attribution_html?: string;
    attributionHtml?: string;
    sourceVersionReference?: string | null;
  }[];
};

type Enrollment = {
  id: string;
  status: string;
  started_at: string;
  program_version_id: string;
  trb_program_versions: {
    version: string;
    status: string;
    disclaimer: string;
    trb_programs: { name: string; code: string; is_official: boolean } | null;
  } | null;
};

const emptyConsent = {
  understandsTrial: false,
  doesNotReplaceOfficialTrb: false,
  willMaintainOfficialTrb: false,
  feedbackMayBeAnalysed: false,
  noMcaPyaApprovalImplied: false,
};

export default function TrainingRecordsPage() {
  const { session, supabase, user } = useSupabase();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [consentOpenFor, setConsentOpenFor] = useState<string | null>(null);
  const [consent, setConsent] = useState(emptyConsent);
  const [enrollmentToDelete, setEnrollmentToDelete] = useState<Enrollment | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/trb/enrollments', {
        headers: bearerHeaders(session.access_token),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setPrograms(json.programs || []);
      setEnrollments(json.enrollments || []);
    } catch (e) {
      toast({
        title: 'Could not load training records',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enrol(program: Program) {
    if (!session?.access_token) return;
    const isMca = program.isMcaPilot || program.code === MCA_PILOT_PROGRAM_CODE;
    if (isMca) {
      const all =
        consent.understandsTrial &&
        consent.doesNotReplaceOfficialTrb &&
        consent.willMaintainOfficialTrb &&
        consent.feedbackMayBeAnalysed &&
        consent.noMcaPyaApprovalImplied;
      if (!all) {
        toast({
          title: 'Consent required',
          description: 'Confirm all companion consent statements before enroling.',
          variant: 'destructive',
        });
        return;
      }
    }

    setEnrolling(true);
    try {
      const res = await fetch('/api/trb/enrollments', {
        method: 'POST',
        headers: {
          ...bearerHeaders(session.access_token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          programCode: program.code,
          ...(isMca
            ? {
                consent: {
                  understandsTrial: true as const,
                  doesNotReplaceOfficialTrb: true as const,
                  willMaintainOfficialTrb: true as const,
                  feedbackMayBeAnalysed: true as const,
                  noMcaPyaApprovalImplied: true as const,
                  consentVersion: MCA_PILOT_CONSENT_VERSION,
                  disclaimerVersion: MCA_PILOT_DISCLAIMER_VERSION,
                },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Enrolment failed');
      toast({
        title: json.alreadyEnrolled ? 'Already enrolled' : 'Enrolled',
        description: json.alreadyEnrolled
          ? 'Opening your existing programme.'
          : isMca
            ? 'OOW Training Record companion started. Continue maintaining your official TRB.'
            : 'Training record enrolment started.',
      });
      setConsentOpenFor(null);
      setConsent(emptyConsent);
      await load();
      if (json.enrollmentId) {
        window.location.href = `/dashboard/training-records/${json.enrollmentId}`;
      }
    } catch (e) {
      toast({
        title: 'Enrolment failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setEnrolling(false);
    }
  }


  function closeDeleteDialog() {
    if (isDeleting || isVerifyingPassword) return;
    setEnrollmentToDelete(null);
    setDeletePassword('');
    setPasswordError('');
  }

  async function confirmDeleteEnrollment() {
    if (!enrollmentToDelete || !session?.access_token || !supabase) return;
    const email = user?.email || session.user?.email;
    if (!email) {
      setPasswordError('Your account email is unavailable. Sign out and back in, then try again.');
      return;
    }
    if (!deletePassword.trim()) {
      setPasswordError('Password is required');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError('');
    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: deletePassword,
      });
      if (signInError || !authData.session?.access_token) {
        setPasswordError('Incorrect password. Please try again.');
        return;
      }

      setIsDeleting(true);
      const res = await fetch(`/api/trb/enrollments/${enrollmentToDelete.id}`, {
        method: 'DELETE',
        headers: bearerHeaders(authData.session.access_token),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete enrolment');
      }

      toast({
        title: 'Enrolment deleted',
        description:
          'All progress, evidence, and digital sign-offs for this programme have been permanently removed.',
      });
      setEnrollmentToDelete(null);
      setDeletePassword('');
      setPasswordError('');
      await load();
    } catch (e) {
      toast({
        title: 'Could not delete enrolment',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsVerifyingPassword(false);
      setIsDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2 border-b border-border pb-5">
          <Skeleton className="h-3 w-40 rounded-md" />
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>
        <Skeleton className="h-16 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TrainingRecordsPageHeader
        title="Training Records"
        description="Digital companion for officer-reviewed training evidence — not an official MCA/PYA Training Record Book."
      />

      <TrainingRecordsDisclaimer>{TRB_DISCLAIMER}</TrainingRecordsDisclaimer>

      <TrainingRecordsSection
        title="Your enrolments"
        description="Programmes you have started"
        flush={enrollments.length > 0}
      >
        {enrollments.length === 0 ? (
          <TrainingRecordsEmpty
            title="No enrolments yet"
            description="Enrol in an available Training Record programme below."
          />
        ) : (
          <ul className="divide-y divide-border">
            {enrollments.map((e) => {
              const prog = e.trb_program_versions?.trb_programs;
              const isMca = prog?.code === MCA_PILOT_PROGRAM_CODE;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {prog?.name || 'Training programme'}
                      </p>
                      <TrainingStatusPill status={e.status} />
                      {isMca ? (
                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          Digital companion · not MCA/PYA approved
                        </span>
                      ) : null}
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        v{e.trb_program_versions?.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Started {new Date(e.started_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" className="h-8 rounded-md text-xs">
                      <Link href={`/dashboard/training-records/${e.id}`}>
                        <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                        Open
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-md text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => {
                        setEnrollmentToDelete(e);
                        setDeletePassword('');
                        setPasswordError('');
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </TrainingRecordsSection>

      <TrainingRecordsSection
        title="Available programmes"
        description="Source-verified Training Record programmes available to your account"
        flush={programs.length > 0}
      >
        {programs.length === 0 ? (
          <TrainingRecordsEmpty
            title="No programmes available"
            description="If you expect to see a programme here, ask an admin to confirm Training Records is enabled for your account."
          />
        ) : (
          <ul className="divide-y divide-border">
            {programs.map((p) => {
              const isMca = Boolean(p.isMcaPilot) || p.code === MCA_PILOT_PROGRAM_CODE;
              const showConsent = consentOpenFor === p.code;
              return (
                <li key={p.id} className="px-4 py-3 sm:px-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      {p.description ? (
                        <p className="max-w-xl text-[11px] text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {p.code}
                        </span>
                        {isMca ? (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Digital companion · not MCA/PYA approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Training programme
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 rounded-md text-xs"
                      disabled={enrolling || !p.versions?.length}
                      onClick={() => {
                        if (isMca) {
                          setConsentOpenFor(p.code);
                          setConsent(emptyConsent);
                        } else {
                          void enrol(p);
                        }
                      }}
                    >
                      {enrolling ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {isMca ? 'Enrol in Training Record' : 'Enrol'}
                    </Button>
                  </div>

                  {showConsent && isMca ? (
                    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                      <TrainingRecordsDisclaimer title="About this digital record">
                        {p.companionNotice ||
                          p.versions[0]?.companionNotice ||
                          p.versions[0]?.pilot_disclaimer ||
                          p.versions[0]?.disclaimer ||
                          MCA_PILOT_DISCLAIMER}
                      </TrainingRecordsDisclaimer>
                      <TrainingRecordsAttribution
                        text={
                          p.versions[0]?.attributionHtml ||
                          p.versions[0]?.attribution_html ||
                          MCA_PILOT_ATTRIBUTION
                        }
                        sourceUrl={p.sourceUrl || p.source_url || MCA_PILOT_SOURCE_URL}
                        oglUrl={MCA_PILOT_OGL_URL}
                      />
                      {(p.sourceRevisionLabel || p.sourceAuthority || p.versions[0]?.sourceVersionReference) ? (
                        <div className="rounded-md border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                          <p>
                            <span className="font-medium text-foreground">Source:</span>{' '}
                            {p.sourceAuthority || 'Maritime and Coastguard Agency'}
                            {p.sourceRevisionLabel ? ` · ${p.sourceRevisionLabel}` : ''}
                          </p>
                          {p.sourcePublishedAt ? (
                            <p>Source revision date (GOV.UK): {p.sourcePublishedAt}</p>
                          ) : null}
                          <p>
                            Currently published in SeaJourney: Parts 1–5 signable task sections from
                            the MCA Yacht Training Record Book (personal details / service forms
                            excluded).
                          </p>
                          {(p.sourceUrl || MCA_PILOT_SOURCE_URL) ? (
                            <a
                              className="text-sky-700 underline"
                              href={p.sourceUrl || MCA_PILOT_SOURCE_URL}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View source
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                      {(
                        [
                          ['understandsTrial', 'I understand this is a SeaJourney digital companion, not an official MCA digital TRB.'],
                          [
                            'doesNotReplaceOfficialTrb',
                            'I understand it does not replace the official Training Record Book.',
                          ],
                          [
                            'willMaintainOfficialTrb',
                            'I will continue maintaining any record required by the MCA or my recognised verification body.',
                          ],
                          [
                            'feedbackMayBeAnalysed',
                            'I agree that activity and feedback may be analysed to improve the workflow.',
                          ],
                          [
                            'noMcaPyaApprovalImplied',
                            'I understand no MCA or PYA approval is implied.',
                          ],
                        ] as const
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={consent[key]}
                            onCheckedChange={(v) =>
                              setConsent((c) => ({ ...c, [key]: v === true }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="h-8 rounded-md text-xs"
                          disabled={enrolling}
                          onClick={() => void enrol(p)}
                        >
                          Confirm consent and enrol
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-md text-xs"
                          onClick={() => {
                            setConsentOpenFor(null);
                            setConsent(emptyConsent);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </TrainingRecordsSection>

      <AlertDialog
        open={Boolean(enrollmentToDelete)}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently remove this enrolment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This permanently deletes{' '}
                  <span className="font-medium text-foreground">
                    {enrollmentToDelete?.trb_program_versions?.trb_programs?.name ||
                      'this Training Record programme'}
                  </span>{' '}
                  from your account.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>All task progress and candidate notes</li>
                  <li>All uploaded evidence files</li>
                  <li>All digital sign-off requests and sign-offs</li>
                  <li>Batch review history and audit entries for this enrolment</li>
                </ul>
                <p className="font-medium text-destructive">
                  This cannot be undone. Your official paper Training Record Book is not affected.
                </p>
                <div className="space-y-2 pt-1">
                  <Label htmlFor="trb-delete-password">Confirm your password to continue</Label>
                  <Input
                    id="trb-delete-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={deletePassword}
                    disabled={isVerifyingPassword || isDeleting}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      setPasswordError('');
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        deletePassword &&
                        !isVerifyingPassword &&
                        !isDeleting
                      ) {
                        e.preventDefault();
                        void confirmDeleteEnrollment();
                      }
                    }}
                  />
                  {passwordError ? (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  ) : null}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting || isVerifyingPassword}
              onClick={() => {
                setDeletePassword('');
                setPasswordError('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={
                isDeleting || isVerifyingPassword || !deletePassword.trim()
              }
              onClick={() => void confirmDeleteEnrollment()}
            >
              {isDeleting || isVerifyingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isVerifyingPassword && !isDeleting ? 'Verifying…' : 'Deleting…'}
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete permanently
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
