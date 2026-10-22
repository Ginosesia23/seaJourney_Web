import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import {
  CREW_RECORD_DOCUMENTS_BUCKET,
  buildCrewRecordDocumentPath,
  careerCountingConflicts,
  isCrewRecordDocumentKind,
  isCrewRecordDocumentOrigin,
  mapCrewRecordDocumentRow,
  parseCrewRecordSeaTimeInput,
  seaTimeInsertFields,
} from '@/lib/crew-record-documents';
import { findSeaServiceDateConflicts } from '@/lib/crew-record-documents.server';
import { sendUserNotification } from '@/lib/notifications/send-user-notification';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assertVesselCanAttachCrewRecord,
} from '@/lib/vessel-crew-access.server';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function loadActor(userId: string) {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, role, active_vessel_id, first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle();
  return data as {
    id: string;
    role?: string | null;
    active_vessel_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
}

/**
 * GET /api/crew-record-documents?crewUserId=&vesselId=
 * Vessel managers list documents they attached; crew lists their own.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const actor = await loadActor(auth.userId);
    if (!actor) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const role = String(actor.role || '').toLowerCase();
    const crewUserId = req.nextUrl.searchParams.get('crewUserId')?.trim() || null;
    const vesselIdParam = req.nextUrl.searchParams.get('vesselId')?.trim() || null;

    let query = supabaseAdmin
      .from('crew_record_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (role === 'admin') {
      if (crewUserId) query = query.eq('crew_user_id', crewUserId);
      if (vesselIdParam) query = query.eq('vessel_id', vesselIdParam);
    } else if (role === 'vessel') {
      const { data: managed } = await supabaseAdmin
        .from('vessels')
        .select('id')
        .eq('vessel_manager_id', auth.userId);
      const managedIds = (managed ?? []).map((v) => v.id as string);
      if (managedIds.length === 0) {
        return NextResponse.json({ documents: [] });
      }
      query = query.in('vessel_id', managedIds);
      if (crewUserId) query = query.eq('crew_user_id', crewUserId);
      if (vesselIdParam) query = query.eq('vessel_id', vesselIdParam);
    } else {
      query = query.eq('crew_user_id', auth.userId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[crew-record-documents GET]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const vesselIds = [...new Set(rows.map((r) => String(r.vessel_id)))];
    const nameById = new Map<string, string>();
    if (vesselIds.length > 0) {
      const { data: vessels } = await supabaseAdmin
        .from('vessels')
        .select('id, name')
        .in('id', vesselIds);
      for (const v of vessels ?? []) {
        nameById.set(v.id as string, (v.name as string) || 'Vessel');
      }
    }

    return NextResponse.json({
      documents: rows.map((row) =>
        mapCrewRecordDocumentRow(row, nameById.get(String(row.vessel_id)) ?? null),
      ),
    });
  } catch (e) {
    console.error('[crew-record-documents GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/crew-record-documents
 * Multipart: file, crewUserId, vesselId, title, documentKind, origin,
 * optional issuedOn, notes, sea-time dates/days, countsTowardCareer.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const form = await req.formData();
    const file = form.get('file') as File | null;
    const crewUserId = String(form.get('crewUserId') ?? '').trim();
    const vesselId = String(form.get('vesselId') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const documentKind = String(form.get('documentKind') ?? '').trim();
    const origin = String(form.get('origin') ?? '').trim();
    const issuedOnRaw = String(form.get('issuedOn') ?? '').trim();
    const notesRaw = String(form.get('notes') ?? '').trim();

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (!looksLikeUuid(crewUserId) || !looksLikeUuid(vesselId)) {
      return NextResponse.json(
        { error: 'crewUserId and vesselId are required' },
        { status: 400 },
      );
    }
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!isCrewRecordDocumentKind(documentKind)) {
      return NextResponse.json({ error: 'Invalid document kind' }, { status: 400 });
    }
    if (!isCrewRecordDocumentOrigin(origin)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use PDF, PNG, JPEG, or WebP.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 400 });
    }
    const issuedOn =
      issuedOnRaw && /^\d{4}-\d{2}-\d{2}$/.test(issuedOnRaw) ? issuedOnRaw : null;
    const sea = parseCrewRecordSeaTimeInput(
      {
        startDate: form.get('startDate'),
        endDate: form.get('endDate'),
        totalDays: form.get('totalDays'),
        atSeaDays: form.get('atSeaDays'),
        standbyDays: form.get('standbyDays'),
        yardDays: form.get('yardDays'),
        leaveDays: form.get('leaveDays'),
        countsTowardCareer: form.get('countsTowardCareer'),
      },
      documentKind,
    );
    if (!sea.ok) {
      return NextResponse.json({ error: sea.error }, { status: 400 });
    }

    const access = await assertVesselCanAttachCrewRecord(
      auth.userId,
      crewUserId,
      vesselId,
    );
    if ('error' in access) return access.error;

    if (sea.value.startDate && sea.value.endDate) {
      const conflicts = await findSeaServiceDateConflicts({
        crewUserId,
        startDate: sea.value.startDate,
        endDate: sea.value.endDate,
        vesselId,
      });
      const blocking = sea.value.countsTowardCareer
        ? careerCountingConflicts(conflicts)
        : [];
      if (blocking.length > 0) {
        return NextResponse.json(
          {
            error:
              'These dates overlap another sea-service record that already counts toward career tracking.',
            conflicts,
            blocking,
          },
          { status: 409 },
        );
      }
    }

    const documentId = crypto.randomUUID();
    const storagePath = buildCrewRecordDocumentPath(crewUserId, documentId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(CREW_RECORD_DOCUMENTS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      console.error('[crew-record-documents upload]', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('crew_record_documents')
      .insert({
        id: documentId,
        crew_user_id: crewUserId,
        vessel_id: vesselId,
        uploaded_by_user_id: auth.userId,
        title,
        document_kind: documentKind,
        origin,
        issued_on: issuedOn || sea.value.endDate,
        notes: notesRaw || null,
        ...seaTimeInsertFields(sea.value),
        storage_path: storagePath,
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
      })
      .select('*')
      .single();

    if (insertError || !inserted) {
      await supabaseAdmin.storage
        .from(CREW_RECORD_DOCUMENTS_BUCKET)
        .remove([storagePath]);
      console.error('[crew-record-documents insert]', insertError);
      return NextResponse.json(
        { error: insertError?.message || 'Failed to save document' },
        { status: 500 },
      );
    }

    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('name')
      .eq('id', vesselId)
      .maybeSingle();
    const vesselName = (vessel?.name as string) || 'your vessel';
    const originLabel =
      origin === 'pre_seajourney' ? 'from before SeaJourney' : 'added manually';

    await sendUserNotification({
      userId: crewUserId,
      title: 'Document added to your records',
      body: `${vesselName} added “${title}” to your career documents (${originLabel}).`,
      kind: 'testimonial',
      metadata: {
        vesselId,
        vesselName,
        documentId,
        documentKind,
        origin,
        route: '/dashboard/career-documents?tab=archive',
      },
    });

    return NextResponse.json({
      document: mapCrewRecordDocumentRow(
        inserted as Record<string, unknown>,
        vesselName,
      ),
    });
  } catch (e) {
    console.error('[crew-record-documents POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
