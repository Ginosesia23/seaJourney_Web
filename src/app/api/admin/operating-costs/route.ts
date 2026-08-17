import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const CATEGORIES = new Set([
  'database',
  'hosting',
  'domain',
  'tools',
  'marketing',
  'other',
]);
const CADENCES = new Set(['monthly', 'yearly', 'one_time']);

type CostBody = {
  name?: string;
  category?: string;
  amountGbp?: number;
  cadence?: string;
  billingDay?: number | null;
  startDate?: string | null;
  endDate?: string | null;
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

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  }
  return null;
}

function validatePayload(body: CostBody, partial = false) {
  const errors: string[] = [];

  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) errors.push('Name is required');
  }
  if (!partial || body.category !== undefined) {
    if (!body.category || !CATEGORIES.has(body.category)) {
      errors.push('Invalid category');
    }
  }
  if (!partial || body.amountGbp !== undefined) {
    const amount = parseAmount(body.amountGbp);
    if (amount === null) errors.push('Amount must be a non-negative number');
  }
  if (!partial || body.cadence !== undefined) {
    if (!body.cadence || !CADENCES.has(body.cadence)) {
      errors.push('Invalid cadence');
    }
  }
  if (body.billingDay != null) {
    const day = Number(body.billingDay);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      errors.push('Billing day must be between 1 and 28');
    }
  }

  return errors;
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    amountGbp: Number(row.amount_gbp),
    cadence: row.cadence as string,
    billingDay: (row.billing_day as number | null) ?? null,
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string | null) ?? null,
  };
}

/** Monthly equivalent for P&L (yearly ÷ 12; one_time excluded from recurring). */
export function monthlyEquivalentGbp(amount: number, cadence: string): number {
  if (cadence === 'yearly') return amount / 12;
  if (cadence === 'monthly') return amount;
  return 0;
}

/**
 * GET /api/admin/operating-costs
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  const { data, error } = await supabaseAdmin
    .from('admin_operating_costs')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('[operating-costs GET]', error);
    return NextResponse.json(
      {
        error:
          error.message?.includes('does not exist') || error.code === '42P01'
            ? 'Run sql/create-admin-operating-costs.sql in Supabase first'
            : error.message || 'Failed to load costs',
      },
      { status: 500 },
    );
  }

  const costs = (data || []).map((row) => mapRow(row as Record<string, unknown>));
  const monthlyRecurring = costs
    .filter((c) => c.isActive)
    .reduce((sum, c) => sum + monthlyEquivalentGbp(c.amountGbp, c.cadence), 0);

  return NextResponse.json({
    costs,
    monthlyRecurringGbp: Math.round(monthlyRecurring * 100) / 100,
    categories: Array.from(CATEGORIES),
    cadences: Array.from(CADENCES),
  });
}

/**
 * POST /api/admin/operating-costs
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let body: CostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const errors = validatePayload(body, false);
  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  const amount = parseAmount(body.amountGbp)!;
  const { data, error } = await supabaseAdmin
    .from('admin_operating_costs')
    .insert({
      name: body.name!.trim(),
      category: body.category!,
      amount_gbp: amount,
      cadence: body.cadence!,
      billing_day: body.billingDay ?? null,
      start_date: body.startDate || null,
      end_date: body.endDate || null,
      notes: body.notes?.trim() || null,
      is_active: body.isActive !== false,
      created_by: gate.actorId,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('[operating-costs POST]', error);
    return NextResponse.json({ error: error.message || 'Failed to create' }, { status: 500 });
  }

  return NextResponse.json({ cost: mapRow(data as Record<string, unknown>) }, { status: 201 });
}

/**
 * PATCH /api/admin/operating-costs
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let body: CostBody & { id?: string };
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

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.category !== undefined) patch.category = body.category;
  if (body.amountGbp !== undefined) patch.amount_gbp = parseAmount(body.amountGbp);
  if (body.cadence !== undefined) patch.cadence = body.cadence;
  if (body.billingDay !== undefined) patch.billing_day = body.billingDay;
  if (body.startDate !== undefined) patch.start_date = body.startDate || null;
  if (body.endDate !== undefined) patch.end_date = body.endDate || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.isActive !== undefined) patch.is_active = body.isActive;

  const { data, error } = await supabaseAdmin
    .from('admin_operating_costs')
    .update(patch)
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) {
    console.error('[operating-costs PATCH]', error);
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
  }

  return NextResponse.json({ cost: mapRow(data as Record<string, unknown>) });
}

/**
 * DELETE /api/admin/operating-costs?id=
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

  const { error } = await supabaseAdmin.from('admin_operating_costs').delete().eq('id', id);

  if (error) {
    console.error('[operating-costs DELETE]', error);
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
