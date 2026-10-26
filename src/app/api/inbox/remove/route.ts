import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const KINDS = ['testimonial', 'access', 'sea_time', 'plan_coverage', 'captaincy'] as const;
type InboxKind = (typeof KINDS)[number];

function hideKey(kind: InboxKind, id: string): string {
  return `${kind}:${id}`;
}

async function persistHidden(userId: string, key: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('inbox_hidden_items')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[inbox/remove] hidden list read skipped:', error.message);
    return false;
  }
  const current = Array.isArray(data?.inbox_hidden_items) ? data.inbox_hidden_items : [];
  const next = Array.from(new Set([...current, key]));
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ inbox_hidden_items: next })
    .eq('id', userId);
  if (updateError) {
    console.warn('[inbox/remove] hidden list write skipped:', updateError.message);
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind as InboxKind;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!KINDS.includes(kind) || !id) {
      return NextResponse.json({ error: 'Missing kind or id' }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'vessel' || !profile.active_vessel_id) {
      return NextResponse.json({ error: 'Only vessel accounts can remove inbox items' }, { status: 403 });
    }

    const vesselId = profile.active_vessel_id as string;
    const withdrawnNote = 'Removed from inbox';
    let withdrawn = false;

    if (kind === 'testimonial') {
      const { data: row } = await supabaseAdmin
        .from('testimonials')
        .select('id, status, vessel_id, generated_by_user_id')
        .eq('id', id)
        .maybeSingle();
      if (
        row &&
        (row.vessel_id === vesselId || row.generated_by_user_id === user.id) &&
        (row.status === 'pending_captain' || row.status === 'pending_official')
      ) {
        const { error } = await supabaseAdmin
          .from('testimonials')
          .update({
            status: 'rejected',
            rejection_reason: withdrawnNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        withdrawn = !error;
      }
    } else if (kind === 'access') {
      const { data: row } = await supabaseAdmin
        .from('vessel_sea_time_access_requests')
        .select('id, status, vessel_id, vessel_user_id')
        .eq('id', id)
        .maybeSingle();
      if (row && (row.vessel_id === vesselId || row.vessel_user_id === user.id) && row.status === 'pending') {
        const { error } = await supabaseAdmin
          .from('vessel_sea_time_access_requests')
          .update({
            status: 'rejected',
            rejection_reason: withdrawnNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        withdrawn = !error;
      }
    } else if (kind === 'sea_time') {
      const { data: row } = await supabaseAdmin
        .from('sea_time_requests')
        .select('id, status, vessel_id')
        .eq('id', id)
        .maybeSingle();
      if (row && row.vessel_id === vesselId && row.status === 'pending') {
        const { error } = await supabaseAdmin
          .from('sea_time_requests')
          .update({
            status: 'rejected',
            rejection_reason: withdrawnNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        withdrawn = !error;
      }
    } else if (kind === 'plan_coverage') {
      const { data: row } = await supabaseAdmin
        .from('vessel_plan_coverage_requests')
        .select('id, status, vessel_id')
        .eq('id', id)
        .maybeSingle();
      if (row && row.vessel_id === vesselId && row.status === 'pending') {
        const { error } = await supabaseAdmin
          .from('vessel_plan_coverage_requests')
          .update({
            status: 'rejected',
            rejection_reason: withdrawnNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        withdrawn = !error;
      }
    } else if (kind === 'captaincy') {
      const { data: row } = await supabaseAdmin
        .from('vessel_claim_requests')
        .select('id, status, vessel_id')
        .eq('id', id)
        .maybeSingle();
      if (row && row.vessel_id === vesselId && (row.status === 'pending' || row.status === 'admin_approved')) {
        const { error } = await supabaseAdmin
          .from('vessel_claim_requests')
          .update({
            status: 'rejected',
            review_notes: withdrawnNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        withdrawn = !error;
      }
    }

    const hidden = await persistHidden(user.id, hideKey(kind, id));

    return NextResponse.json({ ok: true, withdrawn, hidden });
  } catch (err) {
    console.error('[inbox/remove]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
