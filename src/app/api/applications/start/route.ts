import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/applications/auth';

/**
 * POST /api/applications/start
 * Body: { templateId }
 * Creates or re-opens a crew_application for a published template.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const templateId =
      typeof body.templateId === 'string' ? body.templateId.trim() : '';
    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const { data: template } = await supabaseAdmin
      .from('application_templates')
      .select('id, status, title')
      .eq('id', templateId)
      .maybeSingle();

    if (!template || template.status !== 'published') {
      return NextResponse.json(
        { error: 'Application is not available' },
        { status: 404 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from('crew_applications')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('template_id', templateId)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'withdrawn') {
        const { data: reopened, error } = await supabaseAdmin
          .from('crew_applications')
          .update({
            status: 'in_progress',
            progress_pct: 0,
            completed_manual_ids: [],
          })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ application: reopened, created: false });
      }
      return NextResponse.json({ application: existing, created: false });
    }

    const { data: created, error } = await supabaseAdmin
      .from('crew_applications')
      .insert({
        template_id: templateId,
        user_id: auth.userId,
        status: 'in_progress',
        progress_pct: 0,
        completed_manual_ids: [],
      })
      .select('*')
      .single();

    if (error || !created) {
      return NextResponse.json(
        { error: error?.message || 'Failed to start application' },
        { status: 500 },
      );
    }

    return NextResponse.json({ application: created, created: true });
  } catch (e) {
    console.error('[applications/start]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
