'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, FileText, AlertCircle } from 'lucide-react';
import { generateTestimonialPDF, generateMCADeckhandTestimonial, generateMCAOfficerTestimonial } from '@/lib/pdf-generator';
import type { TestimonialPDFData, TestimonialPDFFormat } from '@/lib/pdf-generator';

function DocumentViewContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid link. No token provided.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/vessel-document/view?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'This link is invalid or has expired.');
          return;
        }

        const { testimonialData, pdfFormat } = data as {
          testimonialData: TestimonialPDFData;
          pdfFormat: TestimonialPDFFormat;
        };

        const rawFmt = pdfFormat as string;
        const format: TestimonialPDFFormat =
          rawFmt === 'mca' || rawFmt === 'pya'
            ? 'mca'
            : rawFmt === 'amsa'
              ? 'amsa'
              : 'seajourney';

        if (format === 'mca') {
          const position = (testimonialData.userProfile.position || '').toLowerCase();
          const officerPositions = [
            'captain', 'master', 'chief officer', 'first officer', 'first mate',
            'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
            'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer',
          ];
          const isOfficer = officerPositions.some((op) => position.includes(op));
          const withReceipt = {
            ...testimonialData,
            receiptData: {
              documentId: testimonialData.testimonial.id,
              sjCode: null,
              documentType: 'testimonial' as const,
              generatedAt: new Date().toISOString(),
              generatedBy: { userId: undefined, email: undefined, name: testimonialData.testimonial.captain_name ?? undefined },
            },
          };
          if (isOfficer) {
            await generateMCAOfficerTestimonial(withReceipt, 'download');
          } else {
            await generateMCADeckhandTestimonial(withReceipt, 'download');
          }
        } else {
          const payload =
            format === 'amsa'
              ? {
                  ...testimonialData,
                  receiptData: {
                    documentId: testimonialData.testimonial.id,
                    sjCode: testimonialData.testimonial.testimonial_code || null,
                    documentType: 'testimonial' as const,
                    generatedAt: new Date().toISOString(),
                    generatedBy: { userId: undefined, email: undefined },
                  },
                }
              : testimonialData;

          await generateTestimonialPDF(payload, format, 'download');
        }

        if (!cancelled) {
          setStatus('success');
          setMessage('Your document has been downloaded. This link has now expired.');
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setMessage(e instanceof Error ? e.message : 'Something went wrong.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Preparing your document…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Invalid or expired link</h1>
        <p className="text-muted-foreground text-center max-w-md">{message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-6">
      <FileText className="h-12 w-12 text-primary" />
      <h1 className="text-xl font-semibold">Document downloaded</h1>
      <p className="text-muted-foreground text-center max-w-md">{message}</p>
    </div>
  );
}

export default function DocumentViewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-6">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <DocumentViewContent />
    </Suspense>
  );
}
