import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/applications/auth';
import {
  CREW_RECORD_DOCUMENTS_BUCKET,
  careerCountingConflicts,
  isCrewRecordDocumentKind,
  isCrewRecordDocumentOrigin,
  mapCrewRecordDocumentRow,
  parseCrewRecordSeaTimeInput,
  seaTimeInsertFields,
} from '@/lib/crew-record-documents';
import { findSeaServiceDateConflicts } from '@/lib/crew-record-documents.server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { assertVesselCanAttachCrewRecord } from '@/lib/vessel-crew-access.server';

/**
 * PATCH /api/crew-record-documents/:id
 * Vessel managers (or admins) can update title, origin, notes, and sea-time numbers.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('crew_record_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const access = await assertVesselCanAttachCrewRecord(
      auth.userId,
      row.crew_user_id as string,
      row.vessel_id as string,
    );
    if ('error' in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title =
      typeof body.title === 'string' ? body.title.trim() : String(row.title ?? '');
    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const documentKindRaw =
      typeof body.documentKind === 'string'
        ? body.documentKind.trim()
        : String(row.document_kind ?? 'other');
    if (!isCrewRecordDocumentKind(documentKindRaw)) {
      return NextResponse.json({ error: 'Invalid document kind' }, { status: 400 });
    }

    const originRaw =
      typeof body.origin === 'string'
        ? body.origin.trim()
        : String(row.origin ?? 'manual');
    if (!isCrewRecordDocumentOrigin(originRaw)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 400 });
    }

    const issuedOnRaw =
      typeof body.issuedOn === 'string'
        ? body.issuedOn.trim()
        : typeof row.issued_on === 'string'
          ? row.issued_on
          : '';
    const issuedOn =
      issuedOnRaw && /^\d{4}-\d{2}-\d{2}$/.test(issuedOnRaw) ? issuedOnRaw : null;
    const notesRaw =
      typeof body.notes === 'string'
        ? body.notes.trim()
        : typeof row.notes === 'string'
          ? row.notes
          : '';

    const sea = parseCrewRecordSeaTimeInput(
      {
        startDate: body.startDate ?? row.start_date,
        endDate: body.endDate ?? row.end_date,
        totalDays: body.totalDays ?? row.total_days,
        atSeaDays: body.atSeaDays ?? row.at_sea_days,
        standbyDays: body.standbyDays ?? row.standby_days,
        yardDays: body.yardDays ?? row.yard_days,
        leaveDays: body.leaveDays ?? row.leave_days,
        countsTowardCareer: body.countsTowardCareer ?? row.counts_toward_career,
      },
      documentKindRaw,
    );
    if (!sea.ok) {
      return NextResponse.json({ error: sea.error }, { status: 400 });
    }

    if (sea.value.startDate && sea.value.endDate) {
      const conflicts = await findSeaServiceDateConflicts({
        crewUserId: row.crew_user_id as string,
        startDate: sea.value.startDate,
        endDate: sea.value.endDate,
        vesselId: row.vessel_id as string,
        excludeDocumentId: id,
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

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('crew_record_documents')
      .update({
        title,
        document_kind: documentKindRaw,
        origin: originRaw,
        issued_on: issuedOn,
        notes: notesRaw || null,
        ...seaTimeInsertFields(sea.value),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to update document' },
        { status: 500 },
      );
    }

    const { data: vessel } = await supabaseAdmin
      .from('vessels')
      .select('name')
      .eq('id', row.vessel_id as string)
      .maybeSingle();

    return NextResponse.json({
      document: mapCrewRecordDocumentRow(
        updated as Record<string, unknown>,
        (vessel?.name as string) || null,
      ),
    });
  } catch (e) {
    console.error('[crew-record-documents PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/crew-record-documents/:id
 * Vessel managers (or admins) can remove a document they attached.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('crew_record_documents')
      .select('id, crew_user_id, vessel_id, uploaded_by_user_id, storage_path')
      .eq('id', id)
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const access = await assertVesselCanAttachCrewRecord(
      auth.userId,
      row.crew_user_id as string,
      row.vessel_id as string,
    );
    if ('error' in access) return access.error;

    const { error: deleteError } = await supabaseAdmin
      .from('crew_record_documents')
      .delete()
      .eq('id', id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (row.storage_path) {
      await supabaseAdmin.storage
        .from(CREW_RECORD_DOCUMENTS_BUCKET)
        .remove([row.storage_path as string]);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crew-record-documents DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
