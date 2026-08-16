import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadFeatureFlagState } from '@/lib/feature-flags/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * GET /api/feature-flags
 * Authenticated users: resolved enabled map for client UI gates.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const state = await loadFeatureFlagState();
    return NextResponse.json({
      ok: true,
      flags: state.map,
      fetchedAt: new Date(state.at).toISOString(),
    });
  } catch (error: any) {
    console.error('[feature-flags GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load feature flags' },
      { status: 500 },
    );
  }
}
