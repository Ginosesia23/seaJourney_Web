import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';
import {
  TESTIMONIALS_BUCKET,
  buildVesselGeneratedPdfPath,
  isTestimonialStoragePath,
} from '@/lib/testimonials/storage';
import { persistVesselGeneratedTestimonialPdf } from '@/lib/testimonials/persist-vessel-generated-pdf';

/**
 * GET /api/vessel-generated-testimonials/[id]/file
 * Streams (and archives if needed) a vessel-generated testimonial PDF.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('vessel_generated_testimonials')
      .select('id, crew_user_id, vessel_id, vessel_user_id, pdf_path')
      .eq('id', id)
      .maybeSingle();

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', auth.userId)
      .maybeSingle();

    const allowed =
      row.crew_user_id === auth.userId ||
      row.vessel_user_id === auth.userId ||
      actor?.role === 'admin' ||
      (actor?.role === 'vessel' && actor.active_vessel_id === row.vessel_id);

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Always regenerate so header branding (logo) stays current, then stream.
    const persistResult = await persistVesselGeneratedTestimonialPdf(id);
    let path: string;
    if ('path' in persistResult) {
      path = persistResult.path;
    } else if (
      'skipped' in persistResult &&
      row.pdf_path &&
      isTestimonialStoragePath(row.pdf_path)
    ) {
      path = row.pdf_path;
    } else if ('error' in persistResult) {
      return NextResponse.json(
        { error: 'Could not create PDF', details: persistResult.error },
        { status: 500 },
      );
    } else {
      path = buildVesselGeneratedPdfPath(row.crew_user_id, row.id);
    }

    const downloadOnce = async (objectPath: string) => {
      const { data, error } = await supabaseAdmin.storage
        .from(TESTIMONIALS_BUCKET)
        .download(objectPath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    };

    const bytes = await downloadOnce(path);
    if (!bytes) {
      return NextResponse.json(
        {
          error: 'PDF not found',
          details: persistResult,
        },
        { status: 404 },
      );
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="vessel-testimonial-${id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[vessel-generated-testimonials/file GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
