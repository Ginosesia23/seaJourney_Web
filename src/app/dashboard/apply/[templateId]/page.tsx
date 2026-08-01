'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  FolderArchive,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useSupabase } from '@/supabase';
import {
  bearerHeaders,
  downloadWithAuth,
} from '@/lib/applications/client';
import type {
  ApplicationTemplate,
  ApplicationTemplateFile,
  CertificateValidityStatus,
  CrewApplication,
  RequirementEvaluation,
} from '@/lib/applications/types';
import { cn } from '@/lib/utils';

function certificateStatusLabel(status?: CertificateValidityStatus): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'no_expiry':
      return 'On file';
    case 'expiring_soon':
      return 'Renew soon';
    case 'expired':
      return 'Expired';
    case 'missing':
    default:
      return 'Missing';
  }
}

function certificateStatusClasses(status?: CertificateValidityStatus): string {
  switch (status) {
    case 'valid':
    case 'no_expiry':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'expiring_soon':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'expired':
      return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    default:
      return 'border-muted-foreground/20 bg-muted text-muted-foreground';
  }
}

type ProgressResponse = {
  template: ApplicationTemplate & { files: ApplicationTemplateFile[] };
  application: CrewApplication | null;
  evaluations: RequirementEvaluation[];
  progress: {
    metRequired: number;
    totalRequired: number;
    percent: number;
    allRequiredMet: boolean;
  };
  documentedSea: {
    atSeaDays: number;
    totalDays: number;
    standbyDays: number;
  };
};

export default function ApplyDetailPage() {
  const params = useParams<{ templateId: string }>();
  const templateId = params.templateId;
  const router = useRouter();
  const { toast } = useToast();
  const { session } = useSupabase();
  const accessToken = session?.access_token;

  const [data, setData] = React.useState<ProgressResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [packaging, setPackaging] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${templateId}/progress`, {
        headers: bearerHeaders(accessToken),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e) {
      toast({
        title: 'Could not load application',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, templateId, toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function ensureStarted() {
    if (!accessToken) return;
    setStarting(true);
    try {
      const res = await fetch('/api/applications/start', {
        method: 'POST',
        headers: bearerHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ templateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start');
      await load();
    } catch (e) {
      toast({
        title: 'Could not start',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  }

  async function toggleManual(requirementId: string, completed: boolean) {
    if (!accessToken) return;
    setBusyId(requirementId);
    try {
      const res = await fetch(`/api/applications/${templateId}/progress`, {
        method: 'PATCH',
        headers: bearerHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ requirementId, completed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      setData(json);
    } catch (e) {
      toast({
        title: 'Could not update',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function downloadFile(file: ApplicationTemplateFile) {
    if (!accessToken || !data) return;
    try {
      await downloadWithAuth(
        `/api/application-templates/${data.template.id}/files/${file.id}`,
        accessToken,
        file.file_name,
      );
    } catch (e) {
      toast({
        title: 'Download failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

  async function downloadPackageZip() {
    if (!accessToken) {
      toast({
        title: 'Not signed in',
        description: 'Refresh the page and try again.',
        variant: 'destructive',
      });
      return;
    }
    setPackaging(true);
    try {
      await downloadWithAuth(
        `/api/applications/${templateId}/package`,
        accessToken,
        'application-package.zip',
      );
      toast({
        title: 'Package downloaded',
        description:
          "Use the ZIP to submit manually through the organization's official channel.",
      });
    } catch (e) {
      toast({
        title: 'Could not build package',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setPackaging(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/dashboard/apply')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">Application not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This application may have been unpublished.
          </p>
        </div>
      </div>
    );
  }

  const { template, application, evaluations, progress, documentedSea } = data;
  const files = template.files || [];
  const unmet = evaluations.filter((e) => e.isRequired && !e.met).length;

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-2 text-muted-foreground">
        <Link href="/dashboard/apply">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All applications
        </Link>
      </Button>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{template.organization}</Badge>
          {progress.allRequiredMet ? (
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              Ready
            </Badge>
          ) : application ? (
            <Badge variant="secondary">In progress</Badge>
          ) : null}
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{template.title}</h1>
          {template.description ? (
            <p className="mt-1 text-muted-foreground">{template.description}</p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Progress"
            value={`${progress.percent}%`}
            hint={`${progress.metRequired}/${progress.totalRequired} required`}
          />
          <Metric
            label="At sea"
            value={String(documentedSea.atSeaDays)}
            hint="from approved testimonials"
          />
          <Metric
            label="Still needed"
            value={String(unmet)}
            hint={unmet === 1 ? 'required item' : 'required items'}
          />
        </div>

        <Progress value={progress.percent} className="h-1.5" />

        {!application ? (
          <div>
            <Button disabled={starting} onClick={() => void ensureStarted()}>
              {starting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Start tracking this application
            </Button>
          </div>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Complete the checklist below, then download your ZIP package and
          submit through {template.organization}
          {template.external_url ? "'s official channel" : ''}. SeaJourney does
          not transmit applications yet.
        </span>
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div className="space-y-6">
          {template.instructions ? (
            <section className="rounded-2xl border bg-muted/20 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Instructions
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {template.instructions}
              </p>
            </section>
          ) : null}

          <section className="rounded-2xl border">
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">Requirements</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Updates automatically from your SeaJourney records.
              </p>
            </div>
            <ul className="divide-y">
              {evaluations.map((item) => {
                const isManual =
                  item.requirementType === 'manual_checklist' ||
                  item.requirementType === 'external_link';
                const isCert = item.requirementType === 'certificate';
                const certStatus = item.certificateStatus;
                const showCertWarning =
                  isCert &&
                  (certStatus === 'expiring_soon' ||
                    certStatus === 'expired' ||
                    certStatus === 'missing' ||
                    !item.met);
                const StatusIcon = !item.met
                  ? isCert && certStatus === 'expired'
                    ? XCircle
                    : Clock3
                  : certStatus === 'expiring_soon'
                    ? AlertTriangle
                    : CheckCircle2;

                return (
                  <li
                    key={item.requirementId}
                    className={cn(
                      'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start',
                      item.met &&
                        certStatus !== 'expiring_soon' &&
                        'bg-emerald-500/[0.03]',
                      isCert &&
                        certStatus === 'expiring_soon' &&
                        'bg-amber-500/[0.04]',
                      isCert &&
                        (certStatus === 'expired' || certStatus === 'missing') &&
                        'bg-red-500/[0.03]',
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        item.met && certStatus !== 'expiring_soon'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : certStatus === 'expiring_soon'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : certStatus === 'expired' || certStatus === 'missing'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                      )}
                    >
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        {!item.isRequired ? (
                          <Badge variant="outline" className="text-[10px]">
                            Optional
                          </Badge>
                        ) : null}
                        {isCert ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              certificateStatusClasses(certStatus),
                            )}
                          >
                            {certificateStatusLabel(certStatus)}
                          </Badge>
                        ) : null}
                        {typeof item.current === 'number' &&
                        typeof item.target === 'number' ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                            {item.current}/{item.target}
                          </span>
                        ) : null}
                      </div>
                      {item.description ? (
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {item.detail}
                      </p>

                      {isCert && item.matchedCertificates?.length ? (
                        <ul className="mt-2 space-y-1">
                          {item.matchedCertificates.map((cert) => (
                            <li
                              key={cert.id}
                              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                            >
                              <span className="font-medium text-foreground">
                                {cert.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  certificateStatusClasses(cert.status),
                                )}
                              >
                                {certificateStatusLabel(cert.status)}
                              </Badge>
                              {cert.expiryDate ? (
                                <span>
                                  Expires {cert.expiryDate}
                                  {cert.daysUntilExpiry != null
                                    ? cert.daysUntilExpiry < 0
                                      ? ` (${Math.abs(cert.daysUntilExpiry)}d ago)`
                                      : ` (${cert.daysUntilExpiry}d left)`
                                    : ''}
                                </span>
                              ) : (
                                <span>No expiry on file</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {isManual && application ? (
                        <label className="mt-2 inline-flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={item.met}
                            disabled={busyId === item.requirementId}
                            onCheckedChange={(checked) =>
                              void toggleManual(
                                item.requirementId,
                                checked === true,
                              )
                            }
                          />
                          Mark complete
                          {busyId === item.requirementId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                        </label>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      {isCert ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={item.href || '/dashboard/certificates'}>
                            {showCertWarning &&
                            (certStatus === 'missing' || !item.met)
                              ? 'Add certificate'
                              : certStatus === 'expired' ||
                                  certStatus === 'expiring_soon'
                                ? 'Renew / update'
                                : 'Certificates'}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : item.href && !isManual ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={item.href}>
                            Open
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : null}
                      {item.requirementType === 'external_link' &&
                      item.config.url ? (
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={item.config.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Visit
                            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {files.length > 0 ? (
            <section className="rounded-2xl border">
              <div className="border-b px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <FolderArchive className="h-4 w-4 text-muted-foreground" />
                  Reference documents
                </h2>
              </div>
              <ul className="divide-y">
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => void downloadFile(file)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="truncate font-medium">
                        {file.file_name}
                      </span>
                      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Anchor className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <h2 className="text-sm font-semibold">Package download</h2>
            </div>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              ZIP includes profile, testimonials, proof of service,
              certificates, sea-time report and reference files.
            </p>

            {progress.allRequiredMet ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                Checklist complete — ready for manual submission.
              </p>
            ) : (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
                {unmet} required item{unmet === 1 ? '' : 's'} still open. You
                can download a partial package now.
              </p>
            )}

            <Button
              className="mt-4 w-full gap-2"
              disabled={packaging}
              onClick={() => void downloadPackageZip()}
            >
              {packaging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {packaging ? 'Building ZIP…' : 'Download ZIP'}
            </Button>

            <div className="mt-3 flex flex-col gap-2">
              {template.external_url ? (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a
                    href={template.external_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official site
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/dashboard/export">Sea-time export</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border px-5 py-4 text-sm">
            <p className="font-medium">Documented sea time</p>
            <dl className="mt-3 space-y-2 text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>At sea</dt>
                <dd className="tabular-nums font-medium text-foreground">
                  {documentedSea.atSeaDays}d
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Total service</dt>
                <dd className="tabular-nums font-medium text-foreground">
                  {documentedSea.totalDays}d
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Standby</dt>
                <dd className="tabular-nums font-medium text-foreground">
                  {documentedSea.standbyDays}d
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
