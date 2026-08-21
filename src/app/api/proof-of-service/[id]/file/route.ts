import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';
import {
  PROOF_OF_SERVICE_BUCKET,
  buildProofOfServicePdfPath,
  isProofOfServiceStoragePath,
} from '@/lib/proof-of-service/storage';
import { persistProofOfServicePdf } from '@/lib/proof-of-service/persist-pdf';

/**
 * GET /api/proof-of-service/[id]/file
 * Streams the frozen Proof of Service PDF. Allowed for the crew owner,
 * the vessel manager who generated it, or an admin. Regenerates once if
 * the file was never stored (older rows).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id: proofId } = await context.params;
    if (!proofId) {
      return NextResponse.json({ error: 'Missing proof of service id' }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('proof_of_service')
      .select('id, crew_user_id, vessel_id, vessel_user_id, pdf_path')
      .eq('id', proofId)
      .maybeSingle();

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Proof of service not found' }, { status: 404 });
    }

    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', auth.userId)
      .maybeSingle();

    const isOwner = row.crew_user_id === auth.userId;
    const isGenerator = row.vessel_user_id === auth.userId;
    const isAdmin = actor?.role === 'admin';
    const isVesselManagerForVessel =
      actor?.role === 'vessel' &&
      actor.active_vessel_id &&
      actor.active_vessel_id === row.vessel_id;

    if (!isOwner && !isGenerator && !isAdmin && !isVesselManagerForVessel) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Always regenerate so header branding (logo) stays current, then stream.
    const persistResult = await persistProofOfServicePdf(proofId);
    let path: string;
    if ('path' in persistResult) {
      path = persistResult.path;
    } else if ('skipped' in persistResult && row.pdf_path && isProofOfServiceStoragePath(row.pdf_path)) {
      path = row.pdf_path;
    } else if ('error' in persistResult) {
      return NextResponse.json(
        { error: 'Could not create PDF', details: persistResult.error },
        { status: 500 },
      );
    } else {
      path = buildProofOfServicePdfPath(row.crew_user_id, row.id);
    }

    const downloadOnce = async (objectPath: string) => {
      const { data, error } = await supabaseAdmin.storage
        .from(PROOF_OF_SERVICE_BUCKET)
        .download(objectPath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    };

    let bytes = await downloadOnce(path);
    if (!bytes) {
      return NextResponse.json(
        {
          error: 'PDF not found in storage',
          hint: 'Confirm the proof-of-service bucket exists (sql/create-proof-of-service-storage.sql).',
          details: persistResult,
        },
        { status: 404 },
      );
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="proof-of-service-${proofId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    console.error('[proof-of-service/file GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/proof-of-service/[id]/file
 * Explicitly generate + store the PDF after a vessel manager saves a row.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id: proofId } = await context.params;
    if (!proofId) {
      return NextResponse.json({ error: 'Missing proof of service id' }, { status: 400 });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from('proof_of_service')
      .select('id, crew_user_id, vessel_id, vessel_user_id')
      .eq('id', proofId)
      .maybeSingle();

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Proof of service not found' }, { status: 404 });
    }

    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', auth.userId)
      .maybeSingle();

    const allowed =
      row.vessel_user_id === auth.userId ||
      row.crew_user_id === auth.userId ||
      actor?.role === 'admin' ||
      (actor?.role === 'vessel' && actor.active_vessel_id === row.vessel_id);

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await persistProofOfServicePdf(proofId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      bucket: PROOF_OF_SERVICE_BUCKET,
      ...result,
    });
  } catch (e) {
    console.error('[proof-of-service/file POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
