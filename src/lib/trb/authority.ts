/**
 * Grant / revoke / list vessel Training Record sign-off authorities.
 * Service-role only for mutations; managers authorised via vessel_manager_id / role=vessel.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type TrbAuthorityRow = {
  id: string;
  vesselId: string;
  userId: string;
  grantedBy: string | null;
  canSignTrainingRecords: boolean;
  programId: string | null;
  programVersionId: string | null;
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    email: string | null;
    fullName: string;
    role: string | null;
    position: string | null;
  };
  isVesselManager?: boolean;
  assignmentRole?: string | null;
};

async function assertCanManageVessel(
  admin: SupabaseClient,
  actorUserId: string,
  vesselId: string,
): Promise<void> {
  const { data: actor } = await admin
    .from('users')
    .select('id, role, active_vessel_id')
    .eq('id', actorUserId)
    .maybeSingle();
  if (!actor) throw Object.assign(new Error('Forbidden'), { code: 'forbidden' });
  if (actor.role === 'admin') return;

  const { data: vessel } = await admin
    .from('vessels')
    .select('id, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();
  if (!vessel) throw Object.assign(new Error('Vessel not found'), { code: 'not_found' });

  const isManager =
    vessel.vessel_manager_id === actorUserId ||
    (actor.role === 'vessel' && actor.active_vessel_id === vesselId);

  if (!isManager) {
    throw Object.assign(new Error('Only vessel managers can manage Training Record authority'), {
      code: 'forbidden',
    });
  }
}

export async function listVesselTrbAuthorities(
  admin: SupabaseClient,
  actorUserId: string,
  vesselId: string,
  opts?: { includeRevoked?: boolean },
): Promise<TrbAuthorityRow[]> {
  await assertCanManageVessel(admin, actorUserId, vesselId);

  let q = admin
    .from('vessel_trb_signoff_authorities')
    .select('*')
    .eq('vessel_id', vesselId)
    .order('created_at', { ascending: false });
  if (!opts?.includeRevoked) q = q.is('revoked_at', null);

  const { data, error } = await q;
  if (error) throw error;

  const userIds = [...new Set((data || []).map((r) => r.user_id as string))];
  const { data: users } = userIds.length
    ? await admin
        .from('users')
        .select('id, email, first_name, last_name, role, position')
        .in('id', userIds)
    : { data: [] as never[] };
  const userById = new Map((users || []).map((u) => [u.id as string, u]));

  const { data: vessel } = await admin
    .from('vessels')
    .select('vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  const { data: assignments } = await admin
    .from('vessel_assignments')
    .select('user_id, assignment_role')
    .eq('vessel_id', vesselId)
    .is('end_date', null);

  const assignmentByUser = new Map(
    (assignments || []).map((a) => [a.user_id as string, a.assignment_role as string]),
  );

  return (data || []).map((r) => {
    const u = userById.get(r.user_id as string);
    return {
      id: r.id as string,
      vesselId: r.vessel_id as string,
      userId: r.user_id as string,
      grantedBy: (r.granted_by as string | null) ?? null,
      canSignTrainingRecords: Boolean(r.can_sign_training_records),
      programId: (r.program_id as string | null) ?? null,
      programVersionId: (r.program_version_id as string | null) ?? null,
      validFrom: r.valid_from as string,
      validUntil: (r.valid_until as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
      revokeReason: (r.revoke_reason as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      user: u
        ? {
            email: u.email ?? null,
            fullName:
              [u.first_name, u.last_name].filter(Boolean).join(' ') ||
              u.email ||
              r.user_id,
            role: u.role ?? null,
            position: u.position ?? null,
          }
        : undefined,
      isVesselManager: vessel?.vessel_manager_id === r.user_id,
      assignmentRole: assignmentByUser.get(r.user_id as string) ?? null,
    };
  });
}

/** Candidates who can receive a grant: manager, active assignments, linked accounts, signing authorities. */
export async function listVesselTrbAuthorityCandidates(
  admin: SupabaseClient,
  actorUserId: string,
  vesselId: string,
) {
  await assertCanManageVessel(admin, actorUserId, vesselId);

  const { data: vessel } = await admin
    .from('vessels')
    .select('vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  const ids = new Set<string>();
  if (vessel?.vessel_manager_id) ids.add(vessel.vessel_manager_id as string);

  const { data: assignments } = await admin
    .from('vessel_assignments')
    .select('user_id, assignment_role, position')
    .eq('vessel_id', vesselId)
    .is('end_date', null);
  for (const a of assignments || []) {
    if (a.user_id) ids.add(a.user_id as string);
  }

  const { data: linked } = await admin
    .from('users')
    .select('id')
    .eq('managed_by_vessel_id', vesselId);
  for (const u of linked || []) ids.add(u.id as string);

  const { data: authorities } = await admin
    .from('vessel_signing_authorities')
    .select('captain_user_id')
    .eq('vessel_id', vesselId)
    .is('end_date', null);
  for (const a of authorities || []) {
    if (a.captain_user_id) ids.add(a.captain_user_id as string);
  }

  const idList = [...ids];
  const { data: users } = idList.length
    ? await admin
        .from('users')
        .select('id, email, first_name, last_name, role, position, last_sign_in_at')
        .in('id', idList)
    : { data: [] as never[] };

  const activeGrants = await listVesselTrbAuthorities(admin, actorUserId, vesselId);
  const granted = new Set(activeGrants.map((g) => g.userId));

  const assignmentByUser = new Map(
    (assignments || []).map((a) => [
      a.user_id as string,
      { role: a.assignment_role as string | null, position: a.position as string | null },
    ]),
  );

  return (users || []).map((u) => ({
    userId: u.id as string,
    email: (u.email as string) || '',
    fullName:
      [u.first_name, u.last_name].filter(Boolean).join(' ') ||
      (u.email as string) ||
      u.id,
    role: u.role as string | null,
    position: u.position as string | null,
    assignmentRole: assignmentByUser.get(u.id as string)?.role ?? null,
    isVesselManager: vessel?.vessel_manager_id === u.id,
    hasTrainingAuthority: granted.has(u.id as string),
    invitationPending: !u.last_sign_in_at && u.id !== vessel?.vessel_manager_id,
  }));
}

export async function grantTrbSignoffAuthority(
  admin: SupabaseClient,
  actorUserId: string,
  args: {
    vesselId: string;
    userId: string;
    validUntil?: string | null;
    programId?: string | null;
    programVersionId?: string | null;
    notes?: string | null;
  },
) {
  await assertCanManageVessel(admin, actorUserId, args.vesselId);

  if (actorUserId === args.userId) {
    // Managers may grant themselves explicitly (required by product), but only after this call —
    // officers cannot call this API (assertCanManageVessel). Self-grant by manager is allowed.
  }

  const { data: target } = await admin
    .from('users')
    .select('id, email')
    .eq('id', args.userId)
    .maybeSingle();
  if (!target) {
    throw Object.assign(new Error('Signer account not found'), {
      code: 'SIGNER_NOT_FOUND',
    });
  }

  // Revoke any overlapping active grant first (same scope)
  await admin
    .from('vessel_trb_signoff_authorities')
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: 'superseded_by_new_grant',
      updated_at: new Date().toISOString(),
    })
    .eq('vessel_id', args.vesselId)
    .eq('user_id', args.userId)
    .is('revoked_at', null)
    .is('program_id', args.programId ?? null)
    .is('program_version_id', args.programVersionId ?? null);

  const { data, error } = await admin
    .from('vessel_trb_signoff_authorities')
    .insert({
      vessel_id: args.vesselId,
      user_id: args.userId,
      granted_by: actorUserId,
      can_sign_training_records: true,
      program_id: args.programId ?? null,
      program_version_id: args.programVersionId ?? null,
      valid_until: args.validUntil ?? null,
      notes: args.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await admin.from('vessel_trb_authority_events').insert({
    vessel_id: args.vesselId,
    authority_id: data.id,
    user_id: args.userId,
    actor_user_id: actorUserId,
    event_type: 'trb_authority_granted',
    event_data: {
      valid_until: args.validUntil ?? null,
      program_id: args.programId ?? null,
      program_version_id: args.programVersionId ?? null,
    },
  });

  return {
    id: data.id as string,
    vesselId: data.vessel_id as string,
    userId: data.user_id as string,
    validUntil: (data.valid_until as string | null) ?? null,
  };
}

export async function revokeTrbSignoffAuthority(
  admin: SupabaseClient,
  actorUserId: string,
  args: { authorityId: string; reason?: string | null },
) {
  const { data: row } = await admin
    .from('vessel_trb_signoff_authorities')
    .select('id, vessel_id, user_id, revoked_at')
    .eq('id', args.authorityId)
    .maybeSingle();
  if (!row) {
    throw Object.assign(new Error('Authority not found'), { code: 'not_found' });
  }
  await assertCanManageVessel(admin, actorUserId, row.vessel_id as string);

  if (row.revoked_at) {
    return { ok: true, alreadyRevoked: true };
  }

  const { error } = await admin
    .from('vessel_trb_signoff_authorities')
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: args.reason?.trim() || 'revoked_by_manager',
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.authorityId)
    .is('revoked_at', null);
  if (error) throw error;

  await admin.from('vessel_trb_authority_events').insert({
    vessel_id: row.vessel_id,
    authority_id: args.authorityId,
    user_id: row.user_id,
    actor_user_id: actorUserId,
    event_type: 'trb_authority_revoked',
    event_data: {
      reason: args.reason?.trim() || 'revoked_by_manager',
    },
  });

  return { ok: true, alreadyRevoked: false };
}
