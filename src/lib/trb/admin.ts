/**
 * Programme administration — draft/pilot/active/retired versions.
 * Published (pilot/active) versions are immutable; edits require a new version.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function requireTrbAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.role !== 'admin') {
    return { ok: false, status: 403, error: 'Admin access required' };
  }
  return { ok: true };
}

export async function listProgramsForAdmin(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('trb_programs')
    .select(
      'id, code, name, description, programme_type, issuing_body, is_official, is_active, recognition_status, source_authority, source_title, source_url, created_at, updated_at',
    )
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function listVersionsForProgram(
  admin: SupabaseClient,
  programId: string,
) {
  const { data, error } = await admin
    .from('trb_program_versions')
    .select(
      'id, program_id, version, status, disclaimer, pilot_disclaimer, attribution_html, effective_from, published_at, source_version_reference, created_at',
    )
    .eq('program_id', programId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getVersionTree(
  admin: SupabaseClient,
  versionId: string,
) {
  const { data: version, error } = await admin
    .from('trb_program_versions')
    .select(
      'id, program_id, version, status, disclaimer, pilot_disclaimer, attribution_html, effective_from, published_at, source_version_reference, trb_programs ( id, code, name )',
    )
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  if (!version) return null;

  const { data: sections } = await admin
    .from('trb_sections')
    .select(
      'id, title, description, sort_order, source_section_reference, source_page_start, source_page_end',
    )
    .eq('program_version_id', versionId)
    .order('sort_order');

  const sectionIds = (sections || []).map((s) => s.id);
  const { data: tasks } = sectionIds.length
    ? await admin
        .from('trb_tasks')
        .select(
          'id, section_id, task_code, title, description, official_title, official_description, seajourney_summary, seajourney_completion_guidance, seajourney_guidance, evidence_guidance, required_signer_role, sort_order, is_required, source_task_reference, source_page_reference, source_page_start, source_page_end, prerequisites',
        )
        .in('section_id', sectionIds)
        .order('sort_order')
    : { data: [] as never[] };

  return { version, sections: sections || [], tasks: tasks || [] };
}

const MUTABLE_VERSION_STATUSES = new Set(['draft']);

export async function assertVersionMutable(
  admin: SupabaseClient,
  versionId: string,
): Promise<void> {
  const { data } = await admin
    .from('trb_program_versions')
    .select('id, status')
    .eq('id', versionId)
    .maybeSingle();
  if (!data) throw new Error('Version not found');
  if (!MUTABLE_VERSION_STATUSES.has(data.status as string)) {
    throw new Error(
      'Published programme versions cannot be edited in place. Create a new version.',
    );
  }
}

export async function createDraftProgram(
  admin: SupabaseClient,
  args: {
    code: string;
    name: string;
    description?: string;
    programmeType?: string;
    issuingBody?: string;
    recognitionStatus?: string;
  },
) {
  const { data: program, error } = await admin
    .from('trb_programs')
    .insert({
      code: args.code.trim(),
      name: args.name.trim(),
      description: args.description ?? null,
      programme_type: args.programmeType ?? 'demonstration',
      issuing_body: args.issuingBody ?? null,
      is_official: false,
      is_active: true,
      recognition_status: args.recognitionStatus ?? 'not_recognised',
    })
    .select('id, code, name')
    .single();
  if (error) throw error;

  const { data: version, error: vErr } = await admin
    .from('trb_program_versions')
    .insert({
      program_id: program.id,
      version: '0.1.0-draft',
      status: 'draft',
      disclaimer:
        'Draft programme content. Not an official MCA/PYA Training Record Book.',
    })
    .select('id, version, status')
    .single();
  if (vErr) throw vErr;

  return { program, version };
}

export async function publishVersion(
  admin: SupabaseClient,
  versionId: string,
  nextStatus: 'pilot' | 'active',
) {
  const { data: version } = await admin
    .from('trb_program_versions')
    .select('id, status')
    .eq('id', versionId)
    .maybeSingle();
  if (!version) throw new Error('Version not found');
  if (version.status !== 'draft' && version.status !== 'pilot') {
    throw new Error('Only draft or pilot versions can be published this way');
  }

  const { error } = await admin
    .from('trb_program_versions')
    .update({
      status: nextStatus,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', versionId);
  if (error) throw error;
  return { id: versionId, status: nextStatus };
}

export async function retireVersion(admin: SupabaseClient, versionId: string) {
  const { error } = await admin
    .from('trb_program_versions')
    .update({
      status: 'retired',
      updated_at: new Date().toISOString(),
    })
    .eq('id', versionId);
  if (error) throw error;
  return { id: versionId, status: 'retired' as const };
}

export async function upsertDraftTask(
  admin: SupabaseClient,
  args: {
    versionId: string;
    sectionId: string;
    taskId?: string;
    taskCode: string;
    officialTitle: string;
    officialDescription?: string;
    seajourneySummary?: string;
    seajourneyCompletionGuidance?: string;
    evidenceGuidance?: string;
    requiredSignerRole?: string;
    sourceTaskReference?: string;
    sourcePageReference?: string;
    sortOrder?: number;
    isRequired?: boolean;
  },
) {
  await assertVersionMutable(admin, args.versionId);

  const { data: section } = await admin
    .from('trb_sections')
    .select('id, program_version_id')
    .eq('id', args.sectionId)
    .maybeSingle();
  if (!section || section.program_version_id !== args.versionId) {
    throw new Error('Section does not belong to this draft version');
  }

  const payload = {
    section_id: args.sectionId,
    task_code: args.taskCode,
    title: args.officialTitle,
    description: args.officialDescription ?? null,
    official_title: args.officialTitle,
    official_description: args.officialDescription ?? null,
    seajourney_summary: args.seajourneySummary ?? null,
    seajourney_completion_guidance: args.seajourneyCompletionGuidance ?? null,
    seajourney_guidance: args.seajourneySummary ?? null,
    evidence_guidance: args.evidenceGuidance ?? null,
    required_signer_role: args.requiredSignerRole || 'captain',
    source_task_reference: args.sourceTaskReference ?? null,
    source_page_reference: args.sourcePageReference ?? null,
    sort_order: args.sortOrder ?? 0,
    is_required: args.isRequired ?? true,
    updated_at: new Date().toISOString(),
  };

  if (args.taskId) {
    const { data, error } = await admin
      .from('trb_tasks')
      .update(payload)
      .eq('id', args.taskId)
      .select('id')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin
    .from('trb_tasks')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}
