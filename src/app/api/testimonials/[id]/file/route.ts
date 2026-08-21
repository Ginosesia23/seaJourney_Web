import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';
import {
  TESTIMONIALS_BUCKET,
  buildTestimonialPdfPath,
  isTestimonialStoragePath,
} from '@/lib/testimonials/storage';
import { persistApprovedTestimonialPdf } from '@/lib/testimonials/persist-approved-pdf';

/**
 * GET /api/testimonials/[id]/file
 * Streams the frozen approved PDF for a testimonial the caller may access
 * (crew owner, generating vessel manager, or admin). Regenerates once if
 * the file was never stored (older approvals).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id: testimonialId } = await context.params;
    if (!testimonialId) {
      return NextResponse.json({ error: 'Missing testimonial id' }, { status: 400 });
    }

    const { data: testimonial, error: tErr } = await supabaseAdmin
      .from('testimonials')
      .select('id, user_id, vessel_id, status, pdf_url, generated_by_user_id')
      .eq('id', testimonialId)
      .maybeSingle();

    if (tErr || !testimonial) {
      return NextResponse.json({ error: 'Testimonial not found' }, { status: 404 });
    }

    if (testimonial.status !== 'approved') {
      return NextResponse.json(
        { error: 'Testimonial is not approved yet' },
        { status: 400 },
      );
    }

    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', auth.userId)
      .maybeSingle();

    const isOwner = testimonial.user_id === auth.userId;
    const isGenerator = testimonial.generated_by_user_id === auth.userId;
    const isAdmin = actor?.role === 'admin';
    const isVesselManagerForVessel =
      actor?.role === 'vessel' &&
      actor.active_vessel_id &&
      actor.active_vessel_id === testimonial.vessel_id;

    if (!isOwner && !isGenerator && !isAdmin && !isVesselManagerForVessel) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Always regenerate so header branding (logo) stays current, then stream.
    const persistResult = await persistApprovedTestimonialPdf(testimonialId);
    let path: string;
    if ('path' in persistResult) {
      path = persistResult.path;
    } else if (
      'skipped' in persistResult &&
      testimonial.pdf_url &&
      isTestimonialStoragePath(testimonial.pdf_url)
    ) {
      path = testimonial.pdf_url;
    } else {
      path = buildTestimonialPdfPath(testimonial.user_id, testimonial.id);
      if ('error' in persistResult) {
        // Fall through to download attempt; may still have an older file
        console.warn('[testimonials/file] persist warning:', persistResult.error);
      }
    }

    const { data, error } = await supabaseAdmin.storage
      .from(TESTIMONIALS_BUCKET)
      .download(path);

    if (error || !data) {
      const result = await persistApprovedTestimonialPdf(testimonialId);
      if (!('path' in result)) {
        return NextResponse.json(
          { error: error?.message || 'PDF not found', details: result },
          { status: 404 },
        );
      }
      const retry = await supabaseAdmin.storage
        .from(TESTIMONIALS_BUCKET)
        .download(result.path);
      if (retry.error || !retry.data) {
        return NextResponse.json(
          { error: retry.error?.message || 'PDF not found' },
          { status: 404 },
        );
      }
      const bytes = Buffer.from(await retry.data.arrayBuffer());
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="sea-service-testimonial-${testimonialId.slice(0, 8)}.pdf"`,
          'Cache-Control': 'private, max-age=60',
        },
      });
    }

    const bytes = Buffer.from(await data.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sea-service-testimonial-${testimonialId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[testimonials/file GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
