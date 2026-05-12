'use client';

import { useState, useRef, useMemo, useEffect, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  FileText,
  ShieldCheck,
  AlertCircle,
  Anchor,
  BadgeCheck,
  Lock,
} from 'lucide-react';

import {
  WkAsideHero,
  WkAuthShell,
  WkPrimarySubmit,
} from '@/components/wk/wk-auth-shell';
import { createPublicSupabaseClient } from '@/lib/supabase-public';

type CodeType = 'sj' | 'pos';

const CODE_LENGTH = 8;

export default function VerificationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [codeType, setCodeType] = useState<CodeType>('sj');
  const [code, setCode] = useState<string[]>(() =>
    Array.from({ length: CODE_LENGTH }, () => ''),
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);

  const prefix = codeType === 'sj' ? 'SJ-' : 'POS-';
  const isCodeComplete =
    code.every((c) => c !== '') && code.join('').length === CODE_LENGTH;

  // Focus first cell on mount for fast keyboard entry.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleInputChange = (index: number, raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (cleaned.length > 1) {
      const chars = cleaned.split('').slice(0, CODE_LENGTH);
      const next = [...code];
      chars.forEach((ch, i) => {
        if (index + i < CODE_LENGTH) next[index + i] = ch;
      });
      setCode(next);
      if (notFound) setNotFound(false);

      const nextEmpty = next.findIndex((c, i) => i >= index && c === '');
      const focusIndex =
        nextEmpty !== -1
          ? nextEmpty
          : Math.min(index + chars.length, CODE_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    const next = [...code];
    next[index] = cleaned;
    setCode(next);
    if (notFound) setNotFound(false);

    if (cleaned && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && isCodeComplete && !isLoading) {
      void handleVerification();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!text.length) return;

    let codePart: string;
    if (text.startsWith('POS') && text.length >= 11) {
      codePart = text.slice(3, 11);
      setCodeType('pos');
    } else if (text.startsWith('SJ') && text.length >= 10) {
      codePart = text.slice(2, 10);
      setCodeType('sj');
    } else {
      codePart = text.slice(0, CODE_LENGTH);
    }

    const chars = codePart.split('').slice(0, CODE_LENGTH);
    const next = [...code];
    chars.forEach((ch, i) => {
      if (i < CODE_LENGTH) next[i] = ch;
    });
    setCode(next);
    if (notFound) setNotFound(false);

    const nextEmpty = next.findIndex((c) => c === '');
    const focusIndex = nextEmpty !== -1 ? nextEmpty : CODE_LENGTH - 1;
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerification = async () => {
    const fullCode = code
      .join('')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (fullCode.length !== CODE_LENGTH) return;

    setIsLoading(true);
    setNotFound(false);

    try {
      const codeWithPrefix = prefix + fullCode;
      const codeParam = encodeURIComponent(codeWithPrefix);
      const typeParam = codeType === 'sj' ? 'sj' : 'pos';

      if (codeType === 'pos') {
        const res = await fetch(
          `/api/verify/proof-of-service?code=${encodeURIComponent(codeWithPrefix)}`,
        );
        const json = res.ok ? await res.json() : {};
        if (json.found && json.record) {
          router.replace(`/verify/result?code=${codeParam}&type=${typeParam}`);
          return;
        }
      } else {
        const { data } = await supabase
          .from('approved_testimonials')
          .select('id')
          .eq('testimonial_code', codeWithPrefix)
          .maybeSingle();
        if (data) {
          router.replace(`/verify/result?code=${codeParam}&type=${typeParam}`);
          return;
        }
      }

      setNotFound(true);
    } catch (e) {
      console.error('[VERIFY PAGE] Verification failed:', e);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <WkAuthShell
      size="md"
      aside={
        <WkAsideHero
          eyebrow="Public verification"
          title={
            <>
              Confirm a record's{' '}
              <span className="wk-gradient-text">authenticity</span>.
            </>
          }
          description="Every SeaJourney testimonial and Proof of Service includes a unique code linked to a tamper-proof record. Enter the code from the PDF to instantly verify it was issued by a verified captain or vessel."
          bullets={[
            {
              label: 'Tamper-proof records',
              sub: 'Cryptographically anchored at issuance.',
              icon: <Lock className="h-4 w-4" />,
            },
            {
              label: 'Matches the official PDF',
              sub: 'Code in the document footer mirrors our database.',
              icon: <BadgeCheck className="h-4 w-4" />,
            },
            {
              label: 'No account required',
              sub: 'Anyone — auditors, agencies, employers — can verify.',
              icon: <Anchor className="h-4 w-4" />,
            },
          ]}
        />
      }
    >
      <div className="wk-auth-card p-7 sm:p-9" data-code-type={codeType}>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'var(--wk-accent-soft)',
              color: 'var(--wk-accent)',
              border: '1px solid var(--wk-accent-ring)',
            }}
          >
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--wk-text)' }}
            >
              <span className="wk-gradient-text">Verify</span> a record
            </h1>
            <p className="text-sm" style={{ color: 'var(--wk-text-muted)' }}>
              Enter the 8-character code from the PDF.
            </p>
          </div>
        </div>

        <div
          className="my-6 h-px w-full"
          style={{ backgroundColor: 'var(--wk-line)' }}
        />

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void handleVerification();
          }}
        >
          {/* Document type segmented pill */}
          <div className="flex flex-col items-center gap-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Document type
            </span>
            <div className="wk-pill-group" role="tablist">
              <button
                type="button"
                role="tab"
                aria-pressed={codeType === 'sj'}
                onClick={() => {
                  setCodeType('sj');
                  setNotFound(false);
                }}
                className="wk-pill"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>SJ · Testimonial</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={codeType === 'pos'}
                onClick={() => {
                  setCodeType('pos');
                  setNotFound(false);
                }}
                className="wk-pill"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>POS · Proof of Service</span>
              </button>
            </div>
          </div>

          {/* Code entry */}
          <div className="space-y-3">
            <span
              className="block text-center text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--wk-text-soft)' }}
            >
              Verification code
            </span>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <span
                className="shrink-0 text-base font-bold sm:text-2xl"
                style={{ color: 'var(--wk-accent)' }}
              >
                {prefix}
              </span>
              <div className="flex flex-nowrap items-center justify-center gap-1 sm:gap-2">
                {code.map((char, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="text"
                    maxLength={1}
                    value={char}
                    onChange={(e) => handleInputChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    className="wk-code-box"
                    disabled={isLoading}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    aria-label={`Character ${index + 1} of verification code`}
                  />
                ))}
              </div>
            </div>
            <p
              className="text-center text-xs"
              style={{ color: 'var(--wk-text-muted)' }}
            >
              The code appears in the footer of every issued PDF, after{' '}
              <code
                className="rounded px-1 py-0.5 font-mono text-[11px]"
                style={{
                  backgroundColor: 'var(--wk-bg-subtle)',
                  color: 'var(--wk-accent)',
                }}
              >
                {prefix}
              </code>
              .
            </p>
          </div>

          {/* Not-found alert */}
          {notFound ? (
            <div className="wk-status-banner" data-tone="bad" role="alert">
              <span className="wk-status-icon" data-tone="bad">
                <AlertCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div
                  className="text-sm font-semibold"
                  style={{ color: 'var(--wk-text)' }}
                >
                  Code not found
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: 'var(--wk-text-soft)' }}
                >
                  Double-check the code, or switch the document type above and
                  try again.
                </div>
              </div>
            </div>
          ) : null}

          <WkPrimarySubmit
            type="submit"
            loading={isLoading}
            disabled={!isCodeComplete}
            icon={<Search className="h-4 w-4" />}
          >
            {isLoading ? 'Verifying' : 'Verify Record'}
          </WkPrimarySubmit>
        </form>
      </div>
    </WkAuthShell>
  );
}
