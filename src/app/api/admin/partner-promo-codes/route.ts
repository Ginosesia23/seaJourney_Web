import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isValidPartnerCodeFormat,
  mapPartnerCodeRow,
  normalizePartnerCode,
  PARTNER_CODE_REWARD_TIERS,
} from '@/lib/partner-promo';

type CodeBody = {
  id?: string;
  companyName?: string;
  code?: string;
  rewardTier?: string;
  rewardDays?: number;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return user.id;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

async function requireAdmin(req: NextRequest): Promise<
  | { ok: true; actorId: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const actorId = await getAuthedUserId(req);
  if (!actorId) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  const { data: actor, error } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', actorId)
    .single();
  if (error || !actor || actor.role !== 'admin') {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }
  return { ok: true, actorId };
}

function validatePayload(body: CodeBody, partial = false) {
  const errors: string[] = [];
  if (!partial || body.companyName !== undefined) {
    if (!body.companyName?.trim()) errors.push('Company name is required');
  }
  if (!partial || body.code !== undefined) {
    const code = normalizePartnerCode(body.code);
    if (!isValidPartnerCodeFormat(code)) {
      errors.push('Code must be 3–32 characters: letters, numbers, hyphens');
    }
  }
  if (!partial || body.rewardTier !== undefined) {
    if (!body.rewardTier || !PARTNER_CODE_REWARD_TIERS.includes(body.rewardTier as never)) {
      errors.push('Reward must be standard, premium, or professional');
    }
  }
  if (!partial || body.rewardDays !== undefined) {
    const days = Number(body.rewardDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      errors.push('Reward days must be between 1 and 365');
    }
  }
  if (body.maxRedemptions != null) {
    const max = Number(body.maxRedemptions);
    if (!Number.isInteger(max) || max < 1) {
      errors.push('Max redemptions must be a positive integer');
    }
  }
  return errors;
}

function tableMissing(error: { message?: string; code?: string } | null) {
  return (
    !!error &&
    (error.code === '42P01' ||
      error.message?.includes('does not exist') ||
      error.message?.includes('schema cache'))
  );
}

/**
 * GET /api/admin/partner-promo-codes
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  const id = req.nextUrl.searchParams.get('id')?.trim();

  const { data, error } = await supabaseAdmin
    .from('partner_promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[partner-promo-codes GET]', error);
    return NextResponse.json(
      {
        error: tableMissing(error)
          ? 'Run sql/create-partner-promo-codes.sql in Supabase first'
          : error.message || 'Failed to load codes',
      },
      { status: 500 },
    );
  }

  const codes = (data || []).map((row) => mapPartnerCodeRow(row as Record<string, unknown>));

  if (id) {
    const { data: redemptions, error: redError } = await supabaseAdmin
      .from('partner_promo_redemptions')
      .select('id, user_id, reward_tier, period_end, applied_at')
      .eq('code_id', id)
      .order('applied_at', { ascending: false })
      .limit(200);

    if (redError) {
      return NextResponse.json({ codes, redemptions: [] });
    }

    const userIds = [...new Set((redemptions || []).map((r) => r.user_id))];
    let usersById: Record<string, { email: string | null; firstName: string | null; lastName: string | null }> =
      {};
    if (userIds.length) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name')
        .in('id', userIds);
      for (const u of users || []) {
        usersById[u.id] = {
          email: u.email,
          firstName: u.first_name,
          lastName: u.last_name,
        };
      }
    }

    return NextResponse.json({
      codes,
      redemptions: (redemptions || []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        rewardTier: r.reward_tier,
        periodEnd: r.period_end,
        appliedAt: r.applied_at,
        email: usersById[r.user_id]?.email ?? null,
        name: [usersById[r.user_id]?.firstName, usersById[r.user_id]?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim(),
      })),
    });
  }

  return NextResponse.json({ codes, rewardTiers: PARTNER_CODE_REWARD_TIERS });
}

/**
 * POST /api/admin/partner-promo-codes
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let body: CodeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const errors = validatePayload(body, false);
  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('partner_promo_codes')
    .insert({
      company_name: body.companyName!.trim(),
      code: normalizePartnerCode(body.code),
      reward_tier: body.rewardTier,
      reward_days: Number(body.rewardDays),
      max_redemptions: body.maxRedemptions ?? null,
      expires_at: body.expiresAt || null,
      notes: body.notes?.trim() || null,
      is_active: body.isActive !== false,
      created_by: gate.actorId,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('[partner-promo-codes POST]', error);
    const dup = error.code === '23505' || error.message?.includes('duplicate');
    return NextResponse.json(
      { error: dup ? 'That code already exists' : error.message || 'Failed to create' },
      { status: dup ? 409 : 500 },
    );
  }

  return NextResponse.json({ code: mapPartnerCodeRow(data as Record<string, unknown>) }, { status: 201 });
}

/**
 * PATCH /api/admin/partner-promo-codes
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let body: CodeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id?.trim()) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const errors = validatePayload(body, true);
  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.companyName !== undefined) patch.company_name = body.companyName.trim();
  if (body.code !== undefined) patch.code = normalizePartnerCode(body.code);
  if (body.rewardTier !== undefined) patch.reward_tier = body.rewardTier;
  if (body.rewardDays !== undefined) patch.reward_days = Number(body.rewardDays);
  if (body.maxRedemptions !== undefined) patch.max_redemptions = body.maxRedemptions;
  if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.isActive !== undefined) patch.is_active = body.isActive;

  const { data, error } = await supabaseAdmin
    .from('partner_promo_codes')
    .update(patch)
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) {
    console.error('[partner-promo-codes PATCH]', error);
    const dup = error.code === '23505' || error.message?.includes('duplicate');
    return NextResponse.json(
      { error: dup ? 'That code already exists' : error.message || 'Failed to update' },
      { status: dup ? 409 : 500 },
    );
  }

  return NextResponse.json({ code: mapPartnerCodeRow(data as Record<string, unknown>) });
}

/**
 * DELETE /api/admin/partner-promo-codes?id=
 */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('partner_promo_codes').delete().eq('id', id);
  if (error) {
    console.error('[partner-promo-codes DELETE]', error);
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
