/**
 * Signer eligibility for Digital TRB Companion tasks.
 * Prefer vessel_signing_authorities + active vessel_assignments.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrbRequiredSignerRole } from '@/lib/trb/constants';

export type EligibleSigner = {
  userId: string | null;
  email: string;
  fullName: string;
  rank: string | null;
  assignmentRole: string | null;
  assignmentId: string | null;
  vesselId: string;
  vesselName: string | null;
  source: 'signing_authority' | 'assignment' | 'external_invite';
  credentialVerificationStatus: string | null;
  selfDeclared: boolean;
};

export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
  vesselId: string | null;
  vesselName: string | null;
  candidateAssignmentId: string | null;
  signer: EligibleSigner | null;
  roster: EligibleSigner[];
};

function normalizeRole(role: string | null | undefined): string {
  return (role || '').trim().toLowerCase();
}

function roleSatisfies(
  required: TrbRequiredSignerRole | string,
  assignmentRole: string | null,
  isSigningAuthority: boolean,
): boolean {
  const req = normalizeRole(required) || 'captain';
  const ar = normalizeRole(assignmentRole);

  if (req === 'captain') {
    return isSigningAuthority || ar === 'captain';
  }
  if (req === 'captain_or_chief_officer') {
    return (
      isSigningAuthority ||
      ar === 'captain' ||
      ar === 'officer' ||
      ar === 'admin'
    );
  }
  if (req === 'deck_officer') {
    return (
      isSigningAuthority ||
      ar === 'captain' ||
      ar === 'officer' ||
      ar === 'admin'
    );
  }
  if (req === 'training_officer') {
    return isSigningAuthority || ar === 'officer' || ar === 'captain' || ar === 'admin';
  }
  return isSigningAuthority || ar === 'captain';
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

export async function listEligibleSignersForVessel(
  admin: SupabaseClient,
  vesselId: string,
  requiredSignerRole: TrbRequiredSignerRole | string = 'captain',
): Promise<EligibleSigner[]> {
  const roster: EligibleSigner[] = [];
  const seenEmails = new Set<string>();

  const { data: authorities } = await admin
    .from('vessel_signing_authorities')
    .select('captain_user_id, is_primary')
    .eq('vessel_id', vesselId)
    .is('end_date', null);

  const authorityUserIds = (authorities || [])
    .map((a) => a.captain_user_id as string)
    .filter(Boolean);

  if (authorityUserIds.length) {
    const { data: users } = await admin
      .from('users')
      .select('id, email, first_name, last_name, position, role')
      .in('id', authorityUserIds);

    for (const u of users || []) {
      const email = (u.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      if (!roleSatisfies(requiredSignerRole, 'captain', true)) continue;
      seenEmails.add(email);
      roster.push({
        userId: u.id,
        email,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || email,
        rank: u.position || u.role || 'Captain',
        assignmentRole: 'captain',
        assignmentId: null,
        vesselId,
        vesselName: null,
        source: 'signing_authority',
        credentialVerificationStatus: null,
        selfDeclared: false,
      });
    }
  }

  const { data: assignments } = await admin
    .from('vessel_assignments')
    .select('id, user_id, assignment_role')
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .in('assignment_role', ['captain', 'officer', 'admin']);

  const assignmentUserIds = (assignments || [])
    .map((a) => a.user_id as string)
    .filter(Boolean);

  if (assignmentUserIds.length) {
    const { data: users } = await admin
      .from('users')
      .select('id, email, first_name, last_name, position, role')
      .in('id', assignmentUserIds);

    const userById = new Map((users || []).map((u) => [u.id as string, u]));
    for (const a of assignments || []) {
      const u = userById.get(a.user_id as string);
      if (!u) continue;
      const email = (u.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      if (!roleSatisfies(requiredSignerRole, a.assignment_role as string, false)) {
        continue;
      }
      seenEmails.add(email);
      roster.push({
        userId: u.id,
        email,
        fullName: [u.first_name, u.last_name].filter(Boolean).join(' ') || email,
        rank: u.position || (a.assignment_role as string) || null,
        assignmentRole: a.assignment_role as string,
        assignmentId: a.id as string,
        vesselId,
        vesselName: null,
        source: 'assignment',
        credentialVerificationStatus: null,
        selfDeclared: false,
      });
    }
  }

  const { data: vessel } = await admin
    .from('vessels_public_identity')
    .select('name')
    .eq('id', vesselId)
    .maybeSingle();

  return roster.map((r) => ({ ...r, vesselName: vessel?.name ?? r.vesselName }));
}

export async function evaluateSignerEligibility(
  admin: SupabaseClient,
  opts: {
    candidateUserId: string;
    signerEmail: string;
    requiredSignerRole?: TrbRequiredSignerRole | string;
    allowExternalInvite?: boolean;
  },
): Promise<EligibilityResult> {
  const required = opts.requiredSignerRole || 'captain';
  const email = opts.signerEmail.trim().toLowerCase();
  const vessel = await getCandidateActiveVessel(admin, opts.candidateUserId);

  if (!vessel.vesselId) {
    return {
      eligible: false,
      reason: 'Candidate has no active vessel assignment',
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
  );

  const match = roster.find((s) => s.email === email);
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

  // External invite: allowed only when explicitly opted in; marked self-declared
  if (opts.allowExternalInvite) {
    return {
      eligible: true,
      reason: 'external_invite_self_declared',
      vesselId: vessel.vesselId,
      vesselName: vessel.vesselName,
      candidateAssignmentId: vessel.assignmentId,
      signer: {
        userId: null,
        email,
        fullName: email,
        rank: null,
        assignmentRole: null,
        assignmentId: null,
        vesselId: vessel.vesselId,
        vesselName: vessel.vesselName,
        source: 'external_invite',
        credentialVerificationStatus: 'self_declared',
        selfDeclared: true,
      },
      roster,
    };
  }

  return {
    eligible: false,
    reason: 'Proposed signer is not on the eligible vessel roster for this task',
    vesselId: vessel.vesselId,
    vesselName: vessel.vesselName,
    candidateAssignmentId: vessel.assignmentId,
    signer: null,
    roster,
  };
}
