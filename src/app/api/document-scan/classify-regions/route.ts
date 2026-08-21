/**
 * POST /api/document-scan/classify-regions
 *
 * The user drew bounding boxes on a form. Identify each region's printed
 * label, widget type, and profile binding. Multipart:
 *   - file     : original PDF/image
 *   - regions  : JSON array of { id, page, bbox }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  classifyDrawnRegions,
  fuzzyMatchProfileKey,
  AIQuotaExceededError,
  type DrawnRegion,
} from '@/ai/document-scan-flow';
import { formBuilderAccessDenied } from '@/lib/vessel-form-builder-access';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_REGIONS = 80;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export async function POST(request: NextRequest) {
  try {
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: requestingUser } = await supabase
      .from('users')
      .select(
        'role, subscription_tier, subscription_status, stripe_subscription_id, cancel_at_period_end, current_period_end',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (
      !requestingUser ||
      (requestingUser.role !== 'vessel' && requestingUser.role !== 'admin')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const denied = formBuilderAccessDenied(requestingUser);
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const regionsRaw = formData.get('regions') as string | null;
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    let regions: DrawnRegion[] = [];
    try {
      const parsed = JSON.parse(regionsRaw || '[]');
      if (!Array.isArray(parsed)) throw new Error('regions must be an array');
      regions = parsed
        .filter((r) => r && r.id && r.bbox)
        .map((r) => ({
          id: String(r.id),
          page: Number(r.page) > 0 ? Number(r.page) : 1,
          bbox: {
            xMin: Number(r.bbox.xMin),
            yMin: Number(r.bbox.yMin),
            xMax: Number(r.bbox.xMax),
            yMax: Number(r.bbox.yMax),
          },
        }));
    } catch {
      return NextResponse.json({ error: 'Invalid regions JSON' }, { status: 400 });
    }

    if (!regions.length) {
      return NextResponse.json({ regions: [] });
    }
    if (regions.length > MAX_REGIONS) {
      return NextResponse.json(
        { error: `Too many regions (${regions.length}). Max is ${MAX_REGIONS}.` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const classified = await classifyDrawnRegions(base64, file.type, regions);

    const regionsOut = classified.map((r) => {
      let profileKey = r.profileKey;
      if (!profileKey) {
        const fuzzy = fuzzyMatchProfileKey(r.fieldName, r.fieldDescription ?? null);
        if (fuzzy) profileKey = fuzzy.key;
      }
      return { ...r, profileKey };
    });

    return NextResponse.json({ regions: regionsOut });
  } catch (error: any) {
    if (error instanceof AIQuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('[document-scan/classify-regions]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to classify regions' },
      { status: 500 },
    );
  }
}
