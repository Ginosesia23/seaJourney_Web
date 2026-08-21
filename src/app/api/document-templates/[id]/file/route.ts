/**
 * GET /api/document-templates/[id]/file
 *   Stream the original PDF/image bytes for a template, gated by the same
 *   access rules as the DB row. Used by the "Use template" flow so the
 *   client has the source file to stamp values onto, and by the builder
 *   when re-editing an existing template.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATE_BUCKET } from '@/lib/vessel-document-templates';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formBuilderAccessDenied } from '@/lib/vessel-form-builder-access';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PROFILE_SELECT =
  'id, role, active_vessel_id, subscription_tier, subscription_status, stripe_subscription_id, cancel_at_period_end, current_period_end';

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();
  return { user, profile };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const { user, profile } = auth;

  const { data: template } = await supabaseAdmin
    .from('vessel_document_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Same read rule as the list endpoint — admin, vessel manager, or crew
  // assigned to the template's vessel.
  const isAdmin = (profile as any)?.role === 'admin';
  const isManager =
    (profile as any)?.role === 'vessel' &&
    (profile as any)?.active_vessel_id === template.vessel_id;
  let hasAccess = isAdmin || isManager;
  if (!hasAccess) {
    const { data: assignment } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id')
      .eq('user_id', user!.id)
      .eq('vessel_id', template.vessel_id)
      .maybeSingle();
    hasAccess = !!assignment;
  }
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tierDenied = formBuilderAccessDenied(profile as any);
  if (tierDenied) return tierDenied;

  const { data: fileBlob, error } = await supabaseAdmin.storage
    .from(TEMPLATE_BUCKET)
    .download(template.file_path);

  if (error || !fileBlob) {
    console.error('[template file GET] download failed', error);
    return NextResponse.json(
      { error: error?.message ?? 'Failed to read template file' },
      { status: 500 },
    );
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': template.file_type || 'application/octet-stream',
      'Content-Length': String(arrayBuffer.byteLength),
      'Cache-Control': 'private, max-age=300',
    },
  });
}
