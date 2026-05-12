/**
 * POST /api/document-templates/[id]/resolve
 *   Given a template + a crew member (and optional user-provided sea-time
 *   blob), compute what value should go in each of the template's fields.
 *
 * Request JSON:
 *   {
 *     crewUserId: string,
 *     seaTimeData?: SeaTimeData,   // user-calculated sea time for the default row
 *   }
 *
 * Response:
 *   {
 *     values: Record<fieldId, string | null>,
 *     crewName: string,
 *     usedMultiVesselContext: boolean,
 *   }
 *
 * The client then downloads the original file and stamps these values
 * into the stored bboxes using the existing fill-scanned-document helper.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  matchFieldsToProfile,
  type SeaTimeData,
  type ExtractedField,
} from '@/ai/document-scan-flow';
import { buildScanRowContexts } from '@/lib/build-scan-row-contexts';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  evaluateAllCalculations,
  resolveFieldRowIndex,
  type SiteValueMap,
  type TemplateField,
  type VesselDocumentTemplateRow,
} from '@/lib/vessel-document-templates';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, role, active_vessel_id')
    .eq('id', user.id)
    .maybeSingle();
  return { user, profile };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authenticate(request);
    if ('error' in auth) return auth.error;
    const { user, profile } = auth;

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const crewUserId: string | null = body.crewUserId ?? null;
    if (!crewUserId) {
      return NextResponse.json({ error: 'crewUserId is required' }, { status: 400 });
    }

    // The Documents page sends this as `seaTime`; legacy callers used
    // `seaTimeData`. Accept either key so neither side has to change.
    const seaTimeData: SeaTimeData | null =
      body.seaTimeData ?? body.seaTime ?? null;

    const { data: templateRow } = await supabaseAdmin
      .from('vessel_document_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!templateRow) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    const template = templateRow as VesselDocumentTemplateRow;

    // Access: admin, vessel manager of the template's vessel, or crew
    // assigned to the vessel.
    const isAdmin = (profile as any)?.role === 'admin';
    const isManager =
      (profile as any)?.role === 'vessel' &&
      (profile as any)?.active_vessel_id === template.vessel_id;
    let hasAccess = isAdmin || isManager;
    if (!hasAccess) {
      const { data: assignment } = await supabaseAdmin
        .from('vessel_assignments')
        .select('id')
        .eq('user_id', user!.id)
        .eq('vessel_id', template.vessel_id)
        .maybeSingle();
      hasAccess = !!assignment;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Crew profile for auto-fill.
    const { data: crewProfile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', crewUserId)
      .maybeSingle();
    if (!crewProfile) {
      return NextResponse.json({ error: 'Crew member not found' }, { status: 404 });
    }

    // Vessel record for the active row — used when the template has
    // vessel-scoped fields that aren't row-numbered.
    const { data: vesselData } = await supabaseAdmin
      .from('vessels')
      .select('*')
      .eq('id', template.vessel_id)
      .maybeSingle();

    // Build per-row contexts so multi-vessel tables fill each row with the
    // right vessel.
    const rowContexts = await buildScanRowContexts(supabaseAdmin, crewUserId);

    // The match logic was designed for ExtractedField shape — adapt our
    // TemplateField entries. We feed the template's labels in as both
    // fieldName and description so the alias regex can still kick in when
    // profileKey is null.
    const templateFields: TemplateField[] = Array.isArray(template.fields)
      ? template.fields
      : [];

    // Adapt TemplateField → ExtractedField for the matcher. The matcher
    // also accepts an optional `rowIndex` on each item, which we supply
    // using the shared helper so structured `rowIndex` wins over label
    // parsing (critical when the user renames a label and the "Row N"
    // marker is no longer in the text).
    const asExtracted: Array<ExtractedField & { rowIndex?: number | null }> =
      templateFields.map((tf) => ({
        fieldName: tf.label || tf.originalLabel || 'field',
        fieldDescription: tf.originalLabel ?? undefined,
        profileKey: tf.profileKey ?? 'none',
        category: 'other',
        originalValue: tf.defaultValue ?? undefined,
        page: tf.page,
        bbox: tf.bbox,
        rowIndex: resolveFieldRowIndex(tf),
      }));

    const matched = matchFieldsToProfile(
      asExtracted,
      crewProfile,
      vesselData ?? null,
      null,
      seaTimeData,
      rowContexts.length ? rowContexts : null,
    );

    // Map back to { fieldId → value } keyed by the template field ids.
    const values: Record<string, string | null> = {};
    let usedMultiVesselContext = false;

    matched.forEach((m, idx) => {
      const tf = templateFields[idx];
      if (!tf) return;
      const rowIdx = resolveFieldRowIndex(tf);
      if (rowIdx != null && rowContexts[rowIdx]?.vessel) {
        usedMultiVesselContext = true;
      }
      values[tf.id] =
        m.suggestedValue ?? (tf.defaultValue ? tf.defaultValue : null);
    });

    // ---- Build the site value bag for calculations -----------------
    //
    // A `kind: 'siteValue'` calculation input pulls its value from here
    // rather than from another field on the form. The sea-time entries
    // come from the date range the user picked at fill time (passed in
    // as `body.seaTime`), the count entries come from the crew's
    // assignment history we already loaded for row contexts.
    //
    // Anything we can't compute (e.g. user didn't pick a range) is left
    // unset — the evaluator treats missing keys as "" and degrades to
    // an empty result instead of failing the whole fill.
    const siteValues: SiteValueMap = {};
    if (seaTimeData) {
      const numericKeys = [
        'totalDays',
        'atSeaDays',
        'standbyDays',
        'yardDays',
        'leaveDays',
        'underwayDays',
        'atAnchorDays',
        'inPortDays',
      ] as const;
      for (const k of numericKeys) {
        const v = seaTimeData[k];
        if (v != null) siteValues[k] = String(v);
      }
    }
    // rowContexts is 1-indexed with index 0 reserved as a placeholder,
    // so the real entries start at index 1. Filter for ones with an
    // actual vessel record to get the assignment count.
    const realRows = rowContexts.slice(1).filter((r) => r && r.vessel);
    siteValues.numberOfAssignments = String(realRows.length);
    siteValues.numberOfVessels = String(
      new Set(realRows.map((r) => r.vessel?.id).filter(Boolean)).size,
    );

    // Evaluate any calculated fields now that the plain fields have
    // candidate values. Run after matching so "sum of row-by-row days" etc
    // pick up the auto-filled numbers. The client can still overwrite
    // these when the user edits inputs in the fill dialog.
    const stringValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      stringValues[k] = v ?? '';
    }
    const resolved = evaluateAllCalculations(
      templateFields,
      stringValues,
      siteValues,
    );
    for (const f of templateFields) {
      if (f.type === 'calculated') {
        values[f.id] = resolved[f.id] || null;
      }
    }

    const crewName =
      [crewProfile.first_name, crewProfile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      crewProfile.username ||
      crewProfile.email ||
      'Crew member';

    return NextResponse.json({ values, crewName, usedMultiVesselContext });
  } catch (err) {
    console.error('[template resolve POST] unexpected', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
