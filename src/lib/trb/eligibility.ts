/**
 * Signer eligibility for Digital TRB Companion tasks.
 * Requires explicit vessel_trb_signoff_authorities grant — vessel managers
 * and roster officers are NOT assessors by default.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrbRequiredSignerRole } from '@/lib/trb/constants';

export type TrbSignerSource =
  | 'vessel_manager'
  | 'captain'
  | 'officer'
  | 'signing_authority'
  | 'assignment'
  | 'external_invite';

export type EligibleSigner = {
  userId: string | null;
  email: string;
  fullName: string;
  rank: string | null;
  assignmentRole: string | null;
  assignmentId: string | null;
  vesselId: string;
  vesselName: string | null;
  source: TrbSignerSource;
  /** Alias for UI — same as assignmentRole / derived vessel role. */
  vesselRole: string | null;
  /** Alias for source used in API payloads. */
  authorityType: TrbSignerSource;
  credentialVerificationStatus: string | null;
  selfDeclared: boolean;
  isVesselManager: boolean;
  authorityId: string | null;
  authorityExpiresAt: string | null;
  eligibilityLabel: string;
  canSignTrainingRecords: boolean;
  /** Safe public CoC / qualification summary when already stored on the user. */
  qualificationSummary: string | null;
};

export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
  code?: string;
  vesselId: string | null;
  vesselName: string | null;
  candidateAssignmentId: string | null;
  signer: EligibleSigner | null;
  roster: EligibleSigner[];
};

function normalizeRole(role: string | null | undefined): string {
  return (role || '').trim().toLowerCase();
}

function deriveSource(opts: {
  isVesselManager: boolean;
  isSigningAuthority: boolean;
  assignmentRole: string | null;
}): TrbSignerSource {
  if (opts.isVesselManager) return 'vessel_manager';
  const ar = normalizeRole(opts.assignmentRole);
  if (ar === 'captain') return 'captain';
  if (ar === 'officer') return 'officer';
  if (opts.isSigningAuthority) return 'signing_authority';
  return 'assignment';
}

function eligibilityLabel(source: TrbSignerSource, isVesselManager: boolean): string {
  if (isVesselManager || source === 'vessel_manager') {
    return 'Vessel manager · Training Record authority';
  }
  if (source === 'captain') {
    return 'Captain · Training Record authority';
  }
  if (source === 'officer') {
    return 'Officer · Training Record authority';
  }
  return 'Authorised Training Record signer';
}

export async function getCandidateActiveVessel(
  admin: SupabaseClient,
  userId: string,
): Promise<{
  vesselId: string | null;
  vesselName: string | null;
  assignmentId: string | null;
}> {
  const { data: assignment } = await admin
    .from('vessel_assignments')
    .select('id, vessel_id')
    .eq('user_id', userId)
    .is('end_date', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignment?.vessel_id) {
    const { data: vessel } = await admin
      .from('vessels_public_identity')
      .select('id, name')
      .eq('id', assignment.vessel_id)
      .maybeSingle();
    return {
      vesselId: assignment.vessel_id,
      vesselName: vessel?.name ?? null,
      assignmentId: assignment.id,
    };
  }

  const { data: user } = await admin
    .from('users')
    .select('active_vessel_id')
    .eq('id', userId)
    .maybeSingle();

  if (!user?.active_vessel_id) {
    return { vesselId: null, vesselName: null, assignmentId: null };
  }

  const { data: vessel } = await admin
    .from('vessels_public_identity')
    .select('id, name')
    .eq('id', user.active_vessel_id)
    .maybeSingle();

  return {
    vesselId: user.active_vessel_id,
    vesselName: vessel?.name ?? null,
    assignmentId: null,
  };
}

/** Active, non-revoked, in-date TRB authority rows for a vessel. */
export async function listActiveTrbAuthorities(
  admin: SupabaseClient,
  vesselId: string,
  opts?: { programId?: string | null; programVersionId?: string | null },
) {
  const now = new Date().toISOString();
  let q = admin
    .from('vessel_trb_signoff_authorities')
    .select(
      'id, vessel_id, user_id, can_sign_training_records, program_id, program_version_id, valid_from, valid_until, revoked_at, notes',
    )
    .eq('vessel_id', vesselId)
    .eq('can_sign_training_records', true)
    .is('revoked_at', null)
    .lte('valid_from', now);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).filter((row) => {
    if (row.valid_until && new Date(row.valid_until as string) <= new Date()) {
      return false;
    }
    // Scope: null program = all programmes; otherwise must match when opts provided
    if (opts?.programId) {
      if (row.program_id && row.program_id !== opts.programId) return false;
    }
    if (opts?.programVersionId) {
      if (row.program_version_id && row.program_version_id !== opts.programVersionId) {
        return false;
      }
    }
    return true;
  });
}

async function loadVesselAttachmentContext(
  admin: SupabaseClient,
  vesselId: string,
  userIds: string[],
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const { data: vessel } = await admin
    .from('vessels')
    .select('id, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  const { data: authorities } = await admin
    .from('vessel_signing_authorities')
    .select('captain_user_id, is_primary')
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .in('captain_user_id', unique.length ? unique : ['00000000-0000-0000-0000-000000000000']);

  const { data: assignments } = await admin
    .from('vessel_assignments')
    .select('id, user_id, assignment_role')
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .in('user_id', unique.length ? unique : ['00000000-0000-0000-0000-000000000000']);

  const { data: users } = unique.length
    ? await admin
        .from('users')
        .select(
          'id, email, first_name, last_name, position, role, active_vessel_id, managed_by_vessel_id, last_sign_in_at',
        )
        .in('id', unique)
    : { data: [] as never[] };

  const signingAuthIds = new Set(
    (authorities || []).map((a) => a.captain_user_id as string).filter(Boolean),
  );
  const assignmentByUser = new Map(
    (assignments || []).map((a) => [a.user_id as string, a]),
  );
  const userById = new Map((users || []).map((u) => [u.id as string, u]));

  return {
    vesselManagerId: (vessel?.vessel_manager_id as string | null) ?? null,
    signingAuthIds,
    assignmentByUser,
    userById,
  };
}

function isAttachedToVessel(opts: {
  userId: string;
  vesselId: string;
  vesselManagerId: string | null;
  signingAuthIds: Set<string>;
  assignmentByUser: Map<string, { id: string; assignment_role: string | null }>;
  user: {
    active_vessel_id?: string | null;
    managed_by_vessel_id?: string | null;
    role?: string | null;
  } | null;
}): { attached: boolean; code?: string } {
  if (opts.vesselManagerId === opts.userId) return { attached: true };
  if (opts.signingAuthIds.has(opts.userId)) return { attached: true };
  if (opts.assignmentByUser.has(opts.userId)) return { attached: true };
  if (
    opts.user?.active_vessel_id === opts.vesselId &&
    (opts.user.role === 'vessel' ||
      opts.user.managed_by_vessel_id === opts.vesselId)
  ) {
    return { attached: true };
  }
  return { attached: false, code: 'SIGNER_NOT_ATTACHED_TO_VESSEL' };
}

/** Active TRB sign-off grants on this vessel. Task role is not used to hide
 *  granted accounts — `can_sign_training_records` is the permission. */
export async function listEligibleSignersForVessel(
  admin: SupabaseClient,
  vesselId: string,
  _requiredSignerRole: TrbRequiredSignerRole | string = 'captain',
  opts?: { programId?: string | null; programVersionId?: string | null },
): Promise<EligibleSigner[]> {
  const grants = await listActiveTrbAuthorities(admin, vesselId, opts);
  if (!grants.length) return [];

  const userIds = grants.map((g) => g.user_id as string);
  const ctx = await loadVesselAttachmentContext(admin, vesselId, userIds);

  const { data: vesselPublic } = await admin
    .from('vessels_public_identity')
    .select('name')
    .eq('id', vesselId)
    .maybeSingle();

  const roster: EligibleSigner[] = [];
  const seen = new Set<string>();

  for (const grant of grants) {
    const userId = grant.user_id as string;
    if (seen.has(userId)) continue;
    const user = ctx.userById.get(userId);
    if (!user) continue;

    const email = (user.email || '').trim().toLowerCase();
    if (!email) continue;

    const attach = isAttachedToVessel({
      userId,
      vesselId,
      vesselManagerId: ctx.vesselManagerId,
      signingAuthIds: ctx.signingAuthIds,
      assignmentByUser: ctx.assignmentByUser,
      user,
    });
    if (!attach.attached) continue;

    // Pending invite heuristic: linked account never signed in
    if (
      user.managed_by_vessel_id === vesselId &&
      !user.last_sign_in_at
    ) {
      continue;
    }

    const assignment = ctx.assignmentByUser.get(userId);
    const isVesselManager = ctx.vesselManagerId === userId;
    const isSigningAuthority = ctx.signingAuthIds.has(userId);
    const assignmentRole =
      (assignment?.assignment_role as string | null) ||
      (isVesselManager ? 'admin' : null);

    const source = deriveSource({
      isVesselManager,
      isSigningAuthority,
      assignmentRole,
    });

    const vesselRole = assignmentRole || user.position || user.role || null;
    const qualificationSummary =
      typeof user.position === 'string' && user.position.trim()
        ? user.position.trim()
        : null;

    seen.add(userId);
    roster.push({
      userId,
      email,
      fullName:
        [user.first_name, user.last_name].filter(Boolean).join(' ') || email,
      rank: user.position || assignmentRole || user.role || null,
      assignmentRole,
      assignmentId: (assignment?.id as string | null) ?? null,
      vesselId,
      vesselName: vesselPublic?.name ?? null,
      source,
      vesselRole,
      authorityType: source,
      credentialVerificationStatus: null,
      selfDeclared: false,
      isVesselManager,
      authorityId: grant.id as string,
      authorityExpiresAt: (grant.valid_until as string | null) ?? null,
      eligibilityLabel: eligibilityLabel(source, isVesselManager),
      canSignTrainingRecords: true,
      qualificationSummary,
    });
  }

  return roster;
}

export async function evaluateSignerEligibility(
  admin: SupabaseClient,
  opts: {
    candidateUserId: string;
    signerUserId?: string | null;
    signerEmail?: string | null;
    requiredSignerRole?: TrbRequiredSignerRole | string;
    allowExternalInvite?: boolean;
    programId?: string | null;
    programVersionId?: string | null;
  },
): Promise<EligibilityResult> {
  const required = opts.requiredSignerRole || 'captain';
  const vessel = await getCandidateActiveVessel(admin, opts.candidateUserId);

  if (!vessel.vesselId) {
    return {
      eligible: false,
      reason: 'Candidate has no active vessel assignment',
      code: 'SIGNER_NOT_ATTACHED_TO_VESSEL',
      vesselId: null,
      vesselName: null,
      candidateAssignmentId: null,
      signer: null,
      roster: [],
    };
  }

  const roster = await listEligibleSignersForVessel(
    admin,
    vessel.vesselId,
    required,
    {
      programId: opts.programId,
      programVersionId: opts.programVersionId,
    },
  );

  let match: EligibleSigner | undefined;
  if (opts.signerUserId) {
    match = roster.find((s) => s.userId === opts.signerUserId);
    if (!match) {
      // Diagnose why
      const { data: user } = await admin
        .from('users')
        .select('id, email')
        .eq('id', opts.signerUserId)
        .maybeSingle();
      if (!user) {
        return {
          eligible: false,
          reason: 'Signer account not found',
          code: 'SIGNER_NOT_FOUND',
          vesselId: vessel.vesselId,
          vesselName: vessel.vesselName,
          candidateAssignmentId: vessel.assignmentId,
          signer: null,
          roster,
        };
      }
      const grants = await listActiveTrbAuthorities(admin, vessel.vesselId, {
        programId: opts.programId,
        programVersionId: opts.programVersionId,
      });
      const hasGrant = grants.some((g) => g.user_id === opts.signerUserId);
      if (!hasGrant) {
        const expired = await admin
          .from('vessel_trb_signoff_authorities')
          .select('id, valid_until, revoked_at')
          .eq('vessel_id', vessel.vesselId)
          .eq('user_id', opts.signerUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const row = expired.data;
        let code = 'SIGNER_NOT_AUTHORIZED_FOR_TRAINING';
        if (row?.revoked_at) code = 'SIGNER_INACTIVE';
        else if (row?.valid_until && new Date(row.valid_until) <= new Date()) {
          code = 'SIGNER_AUTHORITY_EXPIRED';
        }
        return {
          eligible: false,
          reason: 'Signer does not have Training Record sign-off authority',
          code,
          vesselId: vessel.vesselId,
          vesselName: vessel.vesselName,
          candidateAssignmentId: vessel.assignmentId,
          signer: null,
          roster,
        };
      }

      const { data: targetUser } = await admin
        .from('users')
        .select('managed_by_vessel_id, last_sign_in_at')
        .eq('id', opts.signerUserId)
        .maybeSingle();
      if (
        targetUser?.managed_by_vessel_id === vessel.vesselId &&
        !targetUser.last_sign_in_at
      ) {
        return {
          eligible: false,
          reason: 'Signer invitation is still pending',
          code: 'SIGNER_INVITATION_PENDING',
          vesselId: vessel.vesselId,
          vesselName: vessel.vesselName,
          candidateAssignmentId: vessel.assignmentId,
          signer: null,
          roster,
        };
      }

      const attachCtx = await loadVesselAttachmentContext(admin, vessel.vesselId, [
        opts.signerUserId,
      ]);
      const attach = isAttachedToVessel({
        userId: opts.signerUserId,
        vesselId: vessel.vesselId,
        vesselManagerId: attachCtx.vesselManagerId,
        signingAuthIds: attachCtx.signingAuthIds,
        assignmentByUser: attachCtx.assignmentByUser,
        user: attachCtx.userById.get(opts.signerUserId) || null,
      });
      if (!attach.attached) {
        return {
          eligible: false,
          reason: 'Signer is not attached to this vessel',
          code: 'SIGNER_NOT_ATTACHED_TO_VESSEL',
          vesselId: vessel.vesselId,
          vesselName: vessel.vesselName,
          candidateAssignmentId: vessel.assignmentId,
          signer: null,
          roster,
        };
      }

      return {
        eligible: false,
        reason: 'Signer is not currently eligible for these tasks',
        code: 'SIGNER_ELIGIBILITY_CHANGED',
        vesselId: vessel.vesselId,
        vesselName: vessel.vesselName,
        candidateAssignmentId: vessel.assignmentId,
        signer: null,
        roster,
      };
    }
  } else if (opts.signerEmail) {
    const email = opts.signerEmail.trim().toLowerCase();
    match = roster.find((s) => s.email === email);
  }

  if (match) {
    return {
      eligible: true,
      vesselId: vessel.vesselId,
      vesselName: vessel.vesselName,
      candidateAssignmentId: vessel.assignmentId,
      signer: match,
      roster,
    };
  }

  // External invite no longer creates TRB eligibility without an authenticated grant
  if (opts.allowExternalInvite) {
    return {
      eligible: false,
      reason:
        'External email invites are not supported for Training Record sign-off. Grant authority to a SeaJourney user on the vessel.',
      code: 'SIGNER_NOT_AUTHORIZED_FOR_TRAINING',
      vesselId: vessel.vesselId,
      vesselName: vessel.vesselName,
      candidateAssignmentId: vessel.assignmentId,
      signer: null,
      roster,
    };
  }

  return {
    eligible: false,
    reason: 'Proposed signer is not on the eligible Training Record roster',
    code: 'SIGNER_ELIGIBILITY_CHANGED',
    vesselId: vessel.vesselId,
    vesselName: vessel.vesselName,
    candidateAssignmentId: vessel.assignmentId,
    signer: null,
    roster,
  };
}
