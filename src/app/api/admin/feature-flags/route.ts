import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  FEATURE_FLAG_KEYS,
  getFeatureDefinition,
  type FeatureFlagKey,
} from '@/lib/feature-flags/catalog';
import {
  addFeatureFlagNote,
  getFeatureFlagsAdminView,
  setFeatureFlagEnabled,
} from '@/lib/feature-flags/server';

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

/**
 * GET /api/admin/feature-flags
 * Full catalog + enabled state + note history + toggle timestamps.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  try {
    const features = await getFeatureFlagsAdminView();
    return NextResponse.json({ ok: true, features });
  } catch (error: any) {
    console.error('[admin/feature-flags GET]', error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          'Failed to load flags. Run sql/create-platform-feature-flags.sql if the table is missing.',
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/feature-flags
 * Body: { key: FeatureFlagKey, enabled: boolean }
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  try {
    const body = (await req.json()) as {
      key?: string;
      enabled?: boolean;
    };
    const key = (body.key || '').trim() as FeatureFlagKey;
    if (!(FEATURE_FLAG_KEYS as string[]).includes(key)) {
      return NextResponse.json(
        { error: `Unknown feature key: ${body.key}` },
        { status: 400 },
      );
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled (boolean) is required' },
        { status: 400 },
      );
    }

    const def = getFeatureDefinition(key);
    try {
      await setFeatureFlagEnabled({
        key,
        enabled: body.enabled,
        actorId: gate.actorId,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error:
            error?.message?.includes('platform_feature_flags') ||
            error?.code === '42P01'
              ? 'Table missing. Run sql/create-platform-feature-flags.sql in Supabase.'
              : error?.message || 'Update failed',
        },
        { status: 500 },
      );
    }

    const features = await getFeatureFlagsAdminView();

    return NextResponse.json({
      ok: true,
      key,
      enabled: body.enabled,
      label: def?.label,
      features,
    });
  } catch (error: any) {
    console.error('[admin/feature-flags PATCH]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update feature flag' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/feature-flags
 * Append a note: { key, body }
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  try {
    const body = (await req.json()) as { key?: string; body?: string };
    const key = (body.key || '').trim() as FeatureFlagKey;
    if (!(FEATURE_FLAG_KEYS as string[]).includes(key)) {
      return NextResponse.json(
        { error: `Unknown feature key: ${body.key}` },
        { status: 400 },
      );
    }
    const noteBody = (body.body || '').trim();
    if (!noteBody) {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 });
    }

    await addFeatureFlagNote({
      key,
      body: noteBody,
      actorId: gate.actorId,
    });

    const features = await getFeatureFlagsAdminView();
    return NextResponse.json({ ok: true, key, features });
  } catch (error: any) {
    console.error('[admin/feature-flags POST]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to add note' },
      { status: 500 },
    );
  }
}
