import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPassageLogsByVessel } from '@/supabase/database/queries';
import { isVesselLinkedFeatureGranted, vesselLinkedOwnedVesselId } from '@/lib/vessel-linked-features';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * GET /api/passage-logbook
 * Vessel-scoped passage logs for a granted vessel-linked Team account.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, active_vessel_id, managed_by_vessel_id, linked_account_features',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!isVesselLinkedFeatureGranted(profile, 'passage_logbook')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vesselId = vesselLinkedOwnedVesselId(profile);
    if (!vesselId) {
      return NextResponse.json({ passages: [] });
    }

    const requested = req.nextUrl.searchParams.get('vesselId');
    if (requested && requested !== vesselId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const passages = await getPassageLogsByVessel(supabaseAdmin, vesselId);
    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('id, name, type')
      .eq('id', vesselId)
      .maybeSingle();
    return NextResponse.json({ passages, vessel: vessel ?? null });
  } catch (err) {
    console.error('[passage-logbook GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load passages' },
      { status: 500 },
    );
  }
}
