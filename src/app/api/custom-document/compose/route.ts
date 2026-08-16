import { NextRequest, NextResponse } from 'next/server';

import { composeCustomDocument } from '@/ai/custom-document-flow';
import { requireUser } from '@/lib/applications/auth';
import type {
  CustomDocumentFacts,
  CustomDocumentInclude,
  CustomDocumentRequest,
} from '@/lib/custom-document';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function parseInclude(raw: unknown): CustomDocumentInclude {
  const o = isRecord(raw) ? raw : {};
  return {
    crewIdentity: o.crewIdentity !== false,
    vesselParticulars: o.vesselParticulars !== false,
    seaTime: o.seaTime !== false,
    standbyPeriods: o.standbyPeriods !== false,
    assignment: o.assignment !== false,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const { data: actor } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', auth.userId)
    .maybeSingle();
  const role = String(actor?.role || '').toLowerCase();
  if (role !== 'vessel' && role !== 'admin') {
    return NextResponse.json({ error: 'Vessel accounts only' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isRecord(body) || !isRecord(body.request) || !isRecord(body.facts)) {
    return NextResponse.json(
      { error: 'request and facts are required' },
      { status: 400 },
    );
  }

  const request: CustomDocumentRequest = {
    title: String(body.request.title || ''),
    purpose: String(body.request.purpose || 'other'),
    instructions: String(body.request.instructions || ''),
    include: parseInclude(body.request.include),
  };
  const facts = body.facts as unknown as CustomDocumentFacts;
  if (!facts?.crew?.name || !facts?.vessel?.name) {
    return NextResponse.json(
      { error: 'Crew and vessel names are required' },
      { status: 400 },
    );
  }

  const composed = await composeCustomDocument({ request, facts });
  return NextResponse.json({ document: composed });
}
