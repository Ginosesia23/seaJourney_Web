/**
 * POST /api/document-scan/auto-bind
 *
 * Re-runs the binding classifier on a batch of fields. Used by the
 * Form Builder editor: when the user opens an existing template (or a
 * fresh scan that still has unbound fields) they can hit "Re-bind with
 * AI" to take another pass at the labels we couldn't classify on the
 * first scan. Cheap text-only Gemini call — no document upload — so
 * it's safe to call on demand.
 *
 * Request body:
 *   {
 *     fields: Array<{ id: string; fieldName: string; fieldDescription?: string | null }>;
 *   }
 *
 * Response:
 *   {
 *     suggestions: Array<{
 *       id: string;
 *       profileKey: string | null;
 *       confidence: number;
 *       isCalculable?: boolean;
 *       reason?: string;
 *       source: 'fuzzy' | 'ai';  // which pass produced the binding
 *     }>;
 *   }
 *
 * No persistence — the client applies what it wants. Auth is required
 * to keep the endpoint scoped to logged-in vessel managers / admins so
 * Gemini quota can't be drained by anonymous traffic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  autoBindFields,
  AUTO_BIND_MIN_CONFIDENCE,
  type AutoBindSuggestion,
} from '@/ai/auto-bind-flow';
import {
  fuzzyMatchProfileKey,
  isLikelyCalculatedLabel,
} from '@/ai/document-scan-flow';
import { hasVesselPremiumPlusFeatures } from '@/supabase/database/subscription-helpers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_BATCH_SIZE = 60; // Safety net so a runaway client can't flood the model.

interface InputField {
  id: string;
  fieldName: string;
  fieldDescription?: string | null;
}

interface OutputSuggestion {
  id: string;
  profileKey: string | null;
  confidence: number;
  isCalculable?: boolean;
  reason?: string;
  source: 'fuzzy' | 'ai';
}

export async function POST(request: NextRequest) {
  try {
    // Auth — same shape as the main /api/document-scan route.
    const authHeader = request.headers.get('authorization');
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

    // Scope to vessel managers / admins (Pro-tier feature).
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: requestingUser } = await supabase
      .from('users')
      .select('role, subscription_tier, subscription_status, stripe_subscription_id, cancel_at_period_end, current_period_end')
      .eq('id', user.id)
      .maybeSingle();
    if (
      !requestingUser ||
      (requestingUser.role !== 'vessel' && requestingUser.role !== 'admin')
    ) {
      return NextResponse.json(
        { error: 'Only vessel managers and admins can use this endpoint' },
        { status: 403 },
      );
    }
    if (requestingUser.role === 'vessel' && !hasVesselPremiumPlusFeatures(requestingUser)) {
      return NextResponse.json(
        { error: 'Form Builder requires Vessel Premium, Professional, or Fleet' },
        { status: 402 },
      );
    }

    const body = (await request.json()) as { fields?: InputField[] };
    const fields = Array.isArray(body?.fields) ? body.fields : [];
    if (!fields.length) {
      return NextResponse.json({ suggestions: [] });
    }
    if (fields.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          error: `Too many fields (${fields.length}). Max per request is ${MAX_BATCH_SIZE}.`,
        },
        { status: 400 },
      );
    }

    const results: OutputSuggestion[] = [];

    // Pass 1: CPU-only fuzzy matcher. Anything that scores ≥ 0.55 is
    // returned with source: 'fuzzy' so the client can show a different
    // confidence colour.
    const stillUnboundForAi: InputField[] = [];
    for (const field of fields) {
      const fuzzy = fuzzyMatchProfileKey(
        field.fieldName,
        field.fieldDescription ?? null,
        0.55,
      );
      if (fuzzy) {
        results.push({
          id: field.id,
          profileKey: fuzzy.key,
          confidence: fuzzy.score,
          isCalculable: isLikelyCalculatedLabel(field.fieldName) || undefined,
          reason: 'Matched canonical label tokens.',
          source: 'fuzzy',
        });
      } else {
        stillUnboundForAi.push(field);
      }
    }

    // Pass 2: AI batched call for everything fuzzy couldn't bind.
    let aiSuggestions: AutoBindSuggestion[] = [];
    if (stillUnboundForAi.length) {
      try {
        aiSuggestions = await autoBindFields(stillUnboundForAi);
      } catch (err) {
        console.warn(
          '[auto-bind] AI classifier failed, falling back to fuzzy-only:',
          err,
        );
        aiSuggestions = [];
      }
    }
    const aiById = new Map<string, AutoBindSuggestion>(
      aiSuggestions.map((s) => [s.id, s]),
    );
    for (const field of stillUnboundForAi) {
      const ai = aiById.get(field.id);
      if (ai && ai.confidence >= AUTO_BIND_MIN_CONFIDENCE) {
        results.push({
          id: field.id,
          profileKey: ai.profileKey,
          confidence: ai.confidence,
          isCalculable:
            ai.isCalculable || isLikelyCalculatedLabel(field.fieldName)
              ? true
              : undefined,
          reason: ai.reason,
          source: 'ai',
        });
      }
    }

    return NextResponse.json({ suggestions: results });
  } catch (error: any) {
    console.error('[document-scan/auto-bind] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to auto-bind fields' },
      { status: 500 },
    );
  }
}
