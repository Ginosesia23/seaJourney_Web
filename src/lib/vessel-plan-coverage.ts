/**
 * Vessel plan coverage requests: crew must be approved by the vessel account
 * before a personal subscription can pause under Vessel Professional / Fleet.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendVesselPlanCoverageDecisionEmail,
  sendVesselPlanCoverageRequestEmail,
} from '@/lib/subscription-emails';
import { managerForVessel } from '@/lib/crew-vessel-feature-boost.server';

export type VesselPlanCoverageStatus = 'pending' | 'approved' | 'rejected';

export type VesselPlanCoverageRequest = {
  id: string;
  crew_user_id: string;
  vessel_id: string;
  vessel_name: string;
  vessel_manager_id: string | null;
  status: VesselPlanCoverageStatus;
  notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  vessel_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

async function vesselMeta(vesselId: string): Promise<{
  name: string;
  managerId: string | null;
}> {
  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('name, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  let managerId = (vessel?.vessel_manager_id as string | null) || null;
  if (!managerId) {
    const manager = await managerForVessel(vesselId);
    managerId = manager?.id ?? null;
  }

  return {
    name: (vessel?.name as string | undefined)?.trim() || 'your vessel',
    managerId,
  };
}

export async function getCoverageRequest(
  crewUserId: string,
  vesselId: string,
): Promise<VesselPlanCoverageRequest | null> {
  const { data, error } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .select('*')
    .eq('crew_user_id', crewUserId)
    .eq('vessel_id', vesselId)
    .maybeSingle();

  if (error) {
    console.error('[plan-coverage] lookup failed', error);
    return null;
  }
  return (data as VesselPlanCoverageRequest | null) ?? null;
}

export async function hasApprovedVesselPlanCoverage(
  crewUserId: string,
  vesselId: string,
): Promise<boolean> {
  const row = await getCoverageRequest(crewUserId, vesselId);
  return row?.status === 'approved';
}

async function notifyVesselOfPendingRequest(args: {
  requestId: string;
  vesselId: string;
  vesselName: string;
  managerId: string | null;
  crewUserId: string;
  alreadyNotified: boolean;
}): Promise<void> {
  if (args.alreadyNotified || !args.managerId) return;

  const [{ data: manager }, { data: crew }] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('email, first_name')
      .eq('id', args.managerId)
      .maybeSingle(),
    supabaseAdmin
      .from('users')
      .select('email, first_name, last_name, username')
      .eq('id', args.crewUserId)
      .maybeSingle(),
  ]);

  if (!manager?.email) return;

  const crewName =
    [crew?.first_name, crew?.last_name].filter(Boolean).join(' ').trim() ||
    crew?.username ||
    crew?.email ||
    'A crew member';

  try {
    await sendVesselPlanCoverageRequestEmail({
      toEmail: manager.email,
      vesselName: args.vesselName,
      crewName,
      crewEmail: crew?.email,
    });
    await supabaseAdmin
      .from('vessel_plan_coverage_requests')
      .update({ vessel_notified_at: new Date().toISOString() })
      .eq('id', args.requestId);
  } catch (error) {
    console.error('[plan-coverage] Failed to notify vessel', error);
  }
}

/**
 * Ensure a pending coverage request exists for this crew+vessel.
 * Does not overwrite an approved row. Re-opens rejected → pending.
 */
export async function ensurePendingVesselPlanCoverageRequest(args: {
  crewUserId: string;
  vesselId: string;
  notes?: string | null;
}): Promise<{
  request: VesselPlanCoverageRequest | null;
  status: VesselPlanCoverageStatus | 'noop';
  created: boolean;
}> {
  const existing = await getCoverageRequest(args.crewUserId, args.vesselId);
  if (existing?.status === 'approved') {
    return { request: existing, status: 'approved', created: false };
  }
  if (existing?.status === 'pending') {
    await notifyVesselOfPendingRequest({
      requestId: existing.id,
      vesselId: args.vesselId,
      vesselName: existing.vessel_name,
      managerId: existing.vessel_manager_id,
      crewUserId: args.crewUserId,
      alreadyNotified: !!existing.vessel_notified_at,
    });
    return { request: existing, status: 'pending', created: false };
  }

  const meta = await vesselMeta(args.vesselId);
  const payload = {
    crew_user_id: args.crewUserId,
    vessel_id: args.vesselId,
    vessel_name: meta.name,
    vessel_manager_id: meta.managerId,
    status: 'pending' as const,
    notes: args.notes ?? null,
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    vessel_notified_at: null,
  };

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('vessel_plan_coverage_requests')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !data) {
      console.error('[plan-coverage] Failed to re-open request', error);
      return { request: null, status: 'noop', created: false };
    }
    const request = data as VesselPlanCoverageRequest;
    await notifyVesselOfPendingRequest({
      requestId: request.id,
      vesselId: args.vesselId,
      vesselName: request.vessel_name,
      managerId: request.vessel_manager_id,
      crewUserId: args.crewUserId,
      alreadyNotified: false,
    });
    return { request, status: 'pending', created: false };
  }

  const { data, error } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    console.error('[plan-coverage] Failed to create request', error);
    return { request: null, status: 'noop', created: false };
  }

  const request = data as VesselPlanCoverageRequest;
  await notifyVesselOfPendingRequest({
    requestId: request.id,
    vesselId: args.vesselId,
    vesselName: request.vessel_name,
    managerId: request.vessel_manager_id,
    crewUserId: args.crewUserId,
    alreadyNotified: false,
  });
  return { request, status: 'pending', created: true };
}

/** Vessel-initiated joins (invite crew) — coverage is approved immediately. */
export async function approveVesselPlanCoverageForInvite(args: {
  crewUserId: string;
  vesselId: string;
  reviewedBy?: string | null;
  notes?: string | null;
}): Promise<VesselPlanCoverageRequest | null> {
  const meta = await vesselMeta(args.vesselId);
  const now = new Date().toISOString();
  const payload = {
    crew_user_id: args.crewUserId,
    vessel_id: args.vesselId,
    vessel_name: meta.name,
    vessel_manager_id: meta.managerId,
    status: 'approved' as const,
    notes: args.notes ?? 'Auto-approved when vessel invited this crew member',
    rejection_reason: null,
    reviewed_by: args.reviewedBy || meta.managerId,
    reviewed_at: now,
    vessel_notified_at: now,
  };

  const existing = await getCoverageRequest(args.crewUserId, args.vesselId);
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('vessel_plan_coverage_requests')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) {
      console.error('[plan-coverage] invite approve update failed', error);
      return null;
    }
    return data as VesselPlanCoverageRequest;
  }

  const { data, error } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    console.error('[plan-coverage] invite approve insert failed', error);
    return null;
  }
  return data as VesselPlanCoverageRequest;
}

export async function decideVesselPlanCoverageRequest(args: {
  requestId: string;
  actorUserId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string | null;
}): Promise<{
  request: VesselPlanCoverageRequest | null;
  error?: string;
}> {
  const { data: request, error } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .select('*')
    .eq('id', args.requestId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error || !request) {
    return { request: null, error: 'Request not found or already processed' };
  }

  const row = request as VesselPlanCoverageRequest;
  const canManage =
    row.vessel_manager_id === args.actorUserId ||
    (await actorManagesVessel(args.actorUserId, row.vessel_id));

  if (!canManage) {
    const { data: actor } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', args.actorUserId)
      .maybeSingle();
    if ((actor?.role || '').toLowerCase() !== 'admin') {
      return { request: null, error: 'Forbidden' };
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .update({
      status: args.action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: args.actorUserId,
      reviewed_at: now,
      rejection_reason:
        args.action === 'reject' ? args.rejectionReason?.trim() || null : null,
    })
    .eq('id', args.requestId)
    .select('*')
    .single();

  if (updateError || !updated) {
    console.error('[plan-coverage] decide update failed', updateError);
    return { request: null, error: 'Failed to update request' };
  }

  const decided = updated as VesselPlanCoverageRequest;
  const { data: crew } = await supabaseAdmin
    .from('users')
    .select('email, first_name')
    .eq('id', decided.crew_user_id)
    .maybeSingle();

  if (crew?.email) {
    try {
      await sendVesselPlanCoverageDecisionEmail({
        toEmail: crew.email,
        firstName: crew.first_name,
        vesselName: decided.vessel_name,
        approved: args.action === 'approve',
        rejectionReason: decided.rejection_reason,
      });
    } catch (err) {
      console.error('[plan-coverage] decision email failed', err);
    }
  }

  return { request: decided };
}

async function actorManagesVessel(
  actorUserId: string,
  vesselId: string,
): Promise<boolean> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role, active_vessel_id')
    .eq('id', actorUserId)
    .maybeSingle();

  if ((user?.role || '').toLowerCase() === 'vessel' && user?.active_vessel_id === vesselId) {
    return true;
  }

  const { data: managed } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('id', vesselId)
    .eq('vessel_manager_id', actorUserId)
    .maybeSingle();

  return !!managed;
}

export async function listPendingCoverageForVessel(
  vesselId: string,
): Promise<VesselPlanCoverageRequest[]> {
  const { data, error } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .select('*')
    .eq('vessel_id', vesselId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[plan-coverage] list pending failed', error);
    return [];
  }
  return (data || []) as VesselPlanCoverageRequest[];
}

/** Pending requests across every vessel this login manages (RLS-safe on client). */
export async function listPendingCoverageForManager(
  managerUserId: string,
): Promise<VesselPlanCoverageRequest[]> {
  const vesselIds = new Set<string>();

  const { data: caller } = await supabaseAdmin
    .from('users')
    .select('role, active_vessel_id')
    .eq('id', managerUserId)
    .maybeSingle();

  if (
    (caller?.role || '').toLowerCase() === 'vessel' &&
    caller?.active_vessel_id
  ) {
    vesselIds.add(caller.active_vessel_id as string);
  }

  const { data: managed } = await supabaseAdmin
    .from('vessels')
    .select('id')
    .eq('vessel_manager_id', managerUserId);

  for (const row of managed || []) {
    if (row.id) vesselIds.add(row.id as string);
  }

  if (!vesselIds.size) return [];

  const { data, error } = await supabaseAdmin
    .from('vessel_plan_coverage_requests')
    .select('*')
    .in('vessel_id', [...vesselIds])
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[plan-coverage] list pending for manager failed', error);
    return [];
  }
  return (data || []) as VesselPlanCoverageRequest[];
}
