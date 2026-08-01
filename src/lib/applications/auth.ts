import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function getAuthedUserId(req: NextRequest): Promise<string | null> {
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
  // Prefer getUser() over getSession() — validates the JWT from cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user.id;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function requireAdmin(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const { data: actor, error } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !actor || actor.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { userId, actor };
}

export async function requireUser(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { userId };
}

export function mapRequirement(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    template_id: row.template_id as string,
    sort_order: (row.sort_order as number) ?? 0,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    requirement_type: row.requirement_type,
    config: (row.config as Record<string, unknown>) || {},
    is_required: row.is_required !== false,
    created_at: row.created_at as string | undefined,
  };
}
