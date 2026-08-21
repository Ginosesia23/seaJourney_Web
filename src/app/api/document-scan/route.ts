import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  scanDocument,
  matchFieldsToProfile,
  fuzzyMatchProfileKey,
  isLikelyCalculatedLabel,
  AIQuotaExceededError,
  type ExtractedField,
  type SeaTimeData,
} from '@/ai/document-scan-flow';
import {
  autoBindFields,
  AUTO_BIND_APPLY_THRESHOLD,
  type AutoBindSuggestion,
} from '@/ai/auto-bind-flow';
import { buildScanRowContexts } from '@/lib/build-scan-row-contexts';
import { hasVesselPremiumPlusFeatures } from '@/supabase/database/subscription-helpers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

export async function POST(request: NextRequest) {
  try {
    // Verify auth from Authorization header
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const crewUserId = formData.get('crewUserId') as string | null;
    const vesselId = formData.get('vesselId') as string | null;
    const seaTimeDataRaw = formData.get('seaTimeData') as string | null;
    let seaTimeData: SeaTimeData | null = null;
    if (seaTimeDataRaw) {
      try { seaTimeData = JSON.parse(seaTimeDataRaw); } catch { /* ignore bad JSON */ }
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    // `crewUserId` is OPTIONAL now. The scanner supports an "analyze first"
    // flow: upload any document, we figure out what it's asking for, and
    // THEN we ask the user for the context required to fill it (crew, date
    // range, etc.). Without a crew we just skip the profile-matching step.
    if (!vesselId) {
      return NextResponse.json({ error: 'vesselId is required' }, { status: 400 });
    }

    // Validate file
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Accepted: PDF, PNG, JPEG, WebP.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.` },
        { status: 400 },
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Use service role client for fetching data
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the requesting user has vessel or admin role
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, active_vessel_id, subscription_tier, subscription_status, stripe_subscription_id, cancel_at_period_end, current_period_end')
      .eq('id', user.id)
      .maybeSingle();

    if (!requestingUser || (requestingUser.role !== 'vessel' && requestingUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Only vessel managers and admins can scan documents' }, { status: 403 });
    }

    if (requestingUser.role === 'vessel' && !hasVesselPremiumPlusFeatures(requestingUser)) {
      return NextResponse.json(
        { error: 'Form Builder requires Vessel Premium, Professional, or Fleet' },
        { status: 402 },
      );
    }

    // Fetch crew profile (only if a crew was picked). When the user scans
    // before picking a crew we just extract the document and match later
    // via /api/document-scan/rematch.
    let crewProfile: any = null;
    if (crewUserId) {
      const { data, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', crewUserId)
        .maybeSingle();

      if (profileError || !data) {
        return NextResponse.json({ error: 'Crew member not found' }, { status: 404 });
      }
      crewProfile = data;
    }

    // Fetch vessel data
    const { data: vesselData, error: vesselError } = await supabase
      .from('vessels')
      .select('*')
      .eq('id', vesselId)
      .maybeSingle();

    if (vesselError || !vesselData) {
      return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
    }

    // Fetch active captain name if available
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

    // Scan document with AI
    const scanResult = await scanDocument(base64, file.type);

    // ---------- Binding enhancement pass --------------------------------
    // Gemini's first scan binds the obvious fields (name, DOB, IMO, etc.)
    // but misses ~30% of the long tail. Before we run profile matching
    // we tighten the bindings on every extracted field using:
    //   1. A cheap CPU-only fuzzy matcher (token overlap on canonical
    //      phrases) — catches "Days alongside in port" → inPortDays.
    //   2. A second Gemini text-only call for whatever fuzzy still
    //      can't bind. Confidence >= AUTO_BIND_APPLY_THRESHOLD is
    //      applied directly; lower scores are surfaced as suggestions.
    // The result is plumbed through matchFieldsToProfile below so the
    // editor + the fill flow benefit from the same upgraded bindings.
    const fieldsForBinding: (ExtractedField & {
      autoBindSuggestion?: {
        profileKey: string | null;
        confidence: number;
        reason?: string | null;
      };
      isCalculableSuggestion?: boolean;
    })[] = scanResult.fields.map((f) => ({ ...f }));

    // Pass 1: cheap fuzzy fallback for fields the model didn't bind.
    for (const f of fieldsForBinding) {
      if (f.profileKey && f.profileKey !== 'none') continue;
      const match = fuzzyMatchProfileKey(f.fieldName, f.fieldDescription);
      if (match) {
        f.profileKey = match.key;
        f.autoBindSuggestion = {
          profileKey: match.key,
          confidence: match.score,
          reason: 'Token overlap with canonical label.',
        };
      }
    }

    // Pass 2: AI second-pass for whatever's still unbound. Batch them
    // into a single call to keep cost predictable.
    const unboundForAi = fieldsForBinding
      .map((f, idx) => ({ idx, field: f }))
      .filter(({ field }) => !field.profileKey || field.profileKey === 'none');
    if (unboundForAi.length) {
      const inputs = unboundForAi.map(({ idx, field }) => ({
        id: String(idx),
        fieldName: field.fieldName,
        fieldDescription: field.fieldDescription ?? null,
      }));
      let suggestions: AutoBindSuggestion[] = [];
      try {
        suggestions = await autoBindFields(inputs);
      } catch (err) {
        // Don't let the binding pass take down the whole scan — degrade
        // gracefully and keep the first-pass results.
        console.warn('[document-scan] auto-bind classifier failed:', err);
        suggestions = [];
      }
      for (const s of suggestions) {
        const idx = parseInt(s.id, 10);
        if (!Number.isFinite(idx) || !fieldsForBinding[idx]) continue;
        const field = fieldsForBinding[idx];
        if (s.profileKey && s.confidence >= AUTO_BIND_APPLY_THRESHOLD) {
          field.profileKey = s.profileKey;
        }
        // Always record the suggestion (even when applied) so the editor
        // can show provenance and the user can override.
        field.autoBindSuggestion = {
          profileKey: s.profileKey,
          confidence: s.confidence,
          reason: s.reason ?? null,
        };
        if (s.isCalculable || isLikelyCalculatedLabel(field.fieldName)) {
          field.isCalculableSuggestion = true;
        }
      }
    }

    // Local calc detection for fields the AI second-pass didn't tag.
    // Cheap, label-only — surfaces obvious cases like "Total = A + B".
    for (const f of fieldsForBinding) {
      if (f.isCalculableSuggestion) continue;
      if (isLikelyCalculatedLabel(f.fieldName)) {
        f.isCalculableSuggestion = true;
      }
    }

    // If we have a crew, try to auto-match values from their profile / the
    // vessel / the calculated sea-time. Otherwise return raw extracted
    // fields with no suggested values — the client will pull them in once
    // the user provides context.
    let matched: any[];
    let unmatched: any[];
    if (crewProfile) {
      // Build per-row contexts for multi-vessel service tables so each
      // "Row N" in the extracted fields is matched against the N-th
      // vessel the crew has served on (newest first) instead of the
      // active vessel being repeated across every row.
      const rowContexts = await buildScanRowContexts(supabase, crewProfile.id);

      const matchedFields = matchFieldsToProfile(
        fieldsForBinding,
        crewProfile,
        vesselData,
        captainName,
        seaTimeData,
        rowContexts.length ? rowContexts : null,
      );
      // Re-attach the binding suggestion + isCalculable hint by index,
      // so the editor can show "auto-bound by AI, X% confidence" and
      // pre-select the calculated widget where appropriate.
      const enriched = matchedFields.map((f, i) => ({
        ...f,
        autoBindSuggestion: fieldsForBinding[i]?.autoBindSuggestion ?? null,
        isCalculableSuggestion:
          fieldsForBinding[i]?.isCalculableSuggestion ?? false,
      }));
      matched = enriched.filter((f) => f.suggestedValue !== null);
      unmatched = enriched.filter((f) => f.suggestedValue === null);
    } else {
      matched = [];
      unmatched = fieldsForBinding.map((f) => ({
        ...f,
        suggestedValue: null,
        source: 'manual',
        autoBindSuggestion: f.autoBindSuggestion ?? null,
        isCalculableSuggestion: f.isCalculableSuggestion ?? false,
      }));
    }

    return NextResponse.json({
      documentTitle: scanResult.documentTitle,
      documentDescription: scanResult.documentDescription ?? null,
      fields: matched,
      unmatchedFields: unmatched,
      crewName: crewProfile
        ? [crewProfile.first_name, crewProfile.last_name].filter(Boolean).join(' ').trim()
          || crewProfile.username
          || crewProfile.email
        : '',
      vesselName: vesselData.name,
    });
  } catch (error: any) {
    console.error('[document-scan] Error:', error);

    if (error instanceof AIQuotaExceededError) {
      const wait =
        error.retryAfterSeconds !== null
          ? ` Try again in about ${Math.ceil(error.retryAfterSeconds)}s.`
          : ' Try again in a few minutes or upgrade the Gemini plan.';
      return NextResponse.json(
        {
          error: `AI scan quota exceeded on the free tier.${wait}`,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: 429,
          headers:
            error.retryAfterSeconds !== null
              ? { 'Retry-After': String(Math.ceil(error.retryAfterSeconds)) }
              : undefined,
        },
      );
    }

    if (error?.message?.includes('API key') || error?.message?.includes('GOOGLE')) {
      return NextResponse.json(
        { error: 'AI service is not configured. Please contact support.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to scan document' },
      { status: 500 },
    );
  }
}
