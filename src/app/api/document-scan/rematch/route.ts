import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  matchFieldsToProfile,
  fuzzyMatchProfileKey,
  type SeaTimeData,
  type ExtractedField,
} from '@/ai/document-scan-flow';
import { buildScanRowContexts } from '@/lib/build-scan-row-contexts';
import { formBuilderAccessDenied } from '@/lib/vessel-form-builder-access';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Re-match a saved scan template against a different crew member.
 * No AI call needed — just fetches profile/vessel data and re-runs field matching.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabaseAuth = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: requestingUser } = await supabase
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end',
      )
      .eq('id', user.id)
      .maybeSingle();

    const tierDenied = formBuilderAccessDenied(requestingUser as any);
    if (tierDenied) return tierDenied;

    const body = await request.json();
    const { fields, crewUserId, vesselId, seaTimeData } = body as {
      fields: ExtractedField[];
      crewUserId: string;
      vesselId: string;
      seaTimeData?: SeaTimeData | null;
    };

    if (!fields?.length || !crewUserId || !vesselId) {
      return NextResponse.json({ error: 'fields, crewUserId, and vesselId are required' }, { status: 400 });
    }

    // Fetch crew profile
    const { data: crewProfile } = await supabase
      .from('users').select('*').eq('id', crewUserId).maybeSingle();
    if (!crewProfile) {
      return NextResponse.json({ error: 'Crew member not found' }, { status: 404 });
    }

    // Fetch vessel
    const { data: vesselData } = await supabase
      .from('vessels').select('*').eq('id', vesselId).maybeSingle();
    if (!vesselData) {
      return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
    }

    // Captain
    let captainName: string | null = null;
    const { data: signingAuth } = await supabase
      .from('vessel_signing_authorities')
      .select('captain_user_id')
      .eq('vessel_id', vesselId)
      .is('end_date', null)
      .order('is_primary', { ascending: false })
      .limit(1);

    if (signingAuth?.length) {
      const { data: captainUser } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', signingAuth[0].captain_user_id)
        .maybeSingle();
      if (captainUser) {
        captainName = [captainUser.first_name, captainUser.last_name].filter(Boolean).join(' ').trim() || null;
      }
    }

    // Build per-row contexts so multi-vessel service tables re-match
    // correctly — each row gets its own vessel and sea-time numbers.
    const rowContexts = await buildScanRowContexts(supabase, crewProfile.id);

    // CPU-only fuzzy upgrade for fields the original scan didn't bind.
    // We don't run the AI second-pass here — rematch is invoked frequently
    // (every time the user switches crew) and re-doing the binding pass
    // each time would waste quota. The fuzzy fallback alone catches ~20%
    // of the long-tail labels the first scan missed.
    const enhancedFields: ExtractedField[] = fields.map((f) => {
      if (f.profileKey && f.profileKey !== 'none') return f;
      const match = fuzzyMatchProfileKey(f.fieldName, f.fieldDescription);
      if (!match) return f;
      return { ...f, profileKey: match.key };
    });

    // Re-match fields
    const matchedFields = matchFieldsToProfile(
      enhancedFields,
      crewProfile,
      vesselData,
      captainName,
      seaTimeData ?? null,
      rowContexts.length ? rowContexts : null,
    );
    const matched = matchedFields.filter((f) => f.suggestedValue !== null);
    const unmatched = matchedFields.filter((f) => f.suggestedValue === null);

    return NextResponse.json({
      fields: matched,
      unmatchedFields: unmatched,
      crewName: [crewProfile.first_name, crewProfile.last_name].filter(Boolean).join(' ').trim() || crewProfile.username || crewProfile.email,
      vesselName: vesselData.name,
    });
  } catch (error: any) {
    console.error('[document-scan/rematch] Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to rematch' }, { status: 500 });
  }
}
