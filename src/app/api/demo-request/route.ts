import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendDemoRequestEmails } from '@/lib/demo-request-email';

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).optional().nullable(),
  audience: z.enum(['crew', 'vessel', 'fleet', 'other']),
  interest: z.enum(['crew', 'vessel', 'both', 'not_sure']),
  message: z.string().trim().max(4000).optional().nullable(),
  /** Honeypot — must stay empty for real submissions. */
  website: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = demoRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please check the form and try again.' },
        { status: 400 },
      );
    }

    if (parsed.data.website?.trim()) {
      return NextResponse.json({ success: true });
    }

    const result = await sendDemoRequestEmails({
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company ?? null,
      audience: parsed.data.audience,
      interest: parsed.data.interest,
      message: parsed.data.message ?? null,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error:
            'We could not send your request right now. Please email hello@seajourneyapp.com and we will help you directly.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DEMO REQUEST API]', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again in a moment.' },
      { status: 500 },
    );
  }
}
