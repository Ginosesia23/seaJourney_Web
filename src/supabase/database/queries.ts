/**
 * Database query helpers for Supabase
 * These functions provide a Firestore-like API for common operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { timestampToISO } from './helpers';
import type { StateLog, PassageLog, BridgeWatchLog, VesselAssignment, DailyStatus } from '@/lib/types';

function scheduleCrewPlanReconcile(
  supabase: SupabaseClient,
  userId: string,
  vesselId?: string | null,
) {
  void (async () => {
    try {
      if (typeof window === 'undefined') {
        const { reconcileCrewPersonalPlanForUser } = await import(
          '@/lib/crew-personal-plan-on-vessel'
        );
        await reconcileCrewPersonalPlanForUser(userId);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Coverage request first so the vessel inbox updates even if pause reconcile is a no-op.
      if (vesselId && token) {
        const coverageRes = await fetch('/api/vessel-plan-coverage', {
          method: 'POST',
          headers,
          body: JSON.stringify({ vesselId }),
        });
        if (!coverageRes.ok) {
          const body = await coverageRes.json().catch(() => ({}));
          console.error(
            '[crew-plan] Coverage request failed',
            coverageRes.status,
            body,
          );
        }
      }

      await fetch('/api/crew/reconcile-vessel-plan', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });
    } catch (error) {
      console.error(
        '[crew-plan] Failed to reconcile personal plan after assignment change',
        error,
      );
    }
  })();
}

/**
 * Get user profile by user ID
 */
export async function getUserProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;

  // Transform to match UserProfile interface
  return {
    id: data.id,
    email: data.email,
    username: data.username,
    firstName: data.first_name,
    lastName: data.last_name,
    profilePicture: data.profile_picture,
    bio: data.bio,
    registrationDate: data.registration_date,
    role: data.role,
    subscriptionTier: data.subscription_tier,
    subscriptionStatus: data.subscription_status,
    activeVesselId: data.active_vessel_id,
    startDate: data.start_date || null,
  };
}

/**
 * Get all vessels (vessels are shared, not owned by users)
 */
export async function getUserVessels(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('vessels')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((vessel) => ({
    id: vessel.id,
    name: vessel.name,
    type: vessel.type,
    officialNumber: vessel.imo,
  }));
}

/**
 * Get sea service records for a user and vessel
 */
export async function getVesselSeaService(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string
) {
  const { data, error } = await supabase
    .from('daily_state_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .order('date', { ascending: false });

  if (error) throw error;

  return (data || []).map((record) => ({
    id: record.id,
    userId: record.user_id,
    vesselId: record.vessel_id,
    date: normalizeStateLogDate(record.date ?? record.log_date) ?? '',
    state: record.state as DailyStatus,
  }));
}

/**
 * Normalize a daily_state_logs date from the DB to `yyyy-MM-dd` so it matches
 * calendar keys from `format(day, 'yyyy-MM-dd')`. Some clients/rows return ISO
 * timestamps (e.g. `2024-03-15T00:00:00.000Z`), which would otherwise miss lookups.
 */
export function normalizeStateLogDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Transform database state log record to TypeScript interface
 */
function transformStateLog(dbLog: any): StateLog | null {
  const dateValue = dbLog.date ?? dbLog.log_date;
  const date = normalizeStateLogDate(dateValue);
  if (!date) {
    console.warn('[transformStateLog] Skipping row with missing or invalid date', dbLog?.id);
    return null;
  }

  return {
    id: dbLog.id,
    userId: dbLog.user_id,
    vesselId: dbLog.vessel_id,
    state: dbLog.state as DailyStatus,
    date,
    isPartOfActivePassage: dbLog.is_part_of_active_passage || false,
    notes: dbLog.notes || undefined,
    createdAt: dbLog.created_at,
    updatedAt: dbLog.updated_at,
  };
}

function mapRowsToStateLogs(rows: any[] | null): StateLog[] {
  return (rows || []).map(transformStateLog).filter((log): log is StateLog => log !== null);
}

/**
 * Get state logs for a vessel (and optionally filtered by user)
 */
export async function getVesselStateLogs(
  supabase: SupabaseClient,
  vesselId: string,
  userId?: string
): Promise<StateLog[]> {
  let query = supabase
    .from('daily_state_logs')
    .select('*')
    .eq('vessel_id', vesselId);
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  // Try 'date' first, if that fails due to column name, we'll handle in transform
  const { data, error } = await query.order('date', { ascending: true });

  if (error) {
    // If 'date' column doesn't exist, try 'log_date'
    if (error.message?.includes('column "date"') || error.code === '42703') {
      console.log('[getVesselStateLogs] Retrying with log_date column');
      let retryQuery = supabase
        .from('daily_state_logs')
        .select('*')
        .eq('vessel_id', vesselId);
      
      if (userId) {
        retryQuery = retryQuery.eq('user_id', userId);
      }
      
      const { data: retryData, error: retryError } = await retryQuery.order('log_date', { ascending: true });
      
      if (retryError) throw retryError;
      return mapRowsToStateLogs(retryData);
    }
    throw error;
  }

  return mapRowsToStateLogs(data);
}

/**
 * All state logs for a user across every vessel (RLS permitting).
 * Use to merge with per-vessel fetches so rows are not dropped when assignments
 * are missing or a vessel was never added to vessel_assignments.
 */
export async function getAllStateLogsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<StateLog[]> {
  const { data, error } = await supabase
    .from('daily_state_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) {
    if (error.message?.includes('column "date"') || error.code === '42703') {
      const { data: retryData, error: retryError } = await supabase
        .from('daily_state_logs')
        .select('*')
        .eq('user_id', userId)
        .order('log_date', { ascending: true });
      if (retryError) throw retryError;
      return mapRowsToStateLogs(retryData);
    }
    throw error;
  }

  return mapRowsToStateLogs(data);
}

/**
 * Create a vessel (vessels are shared, not owned by users)
 */
export async function createVessel(
  _supabase: SupabaseClient,
  vesselData: {
    name: string;
    type: string;
    officialNumber?: string;
    isOfficial?: boolean;
    mmsi?: string | null;
    call_sign?: string | null;
    flag?: string | null;
    length_m?: number | null;
    beam?: number | null;
    draft?: number | null;
    gross_tonnage?: number | null;
    build_year?: number | null;
  }
) {
  const response = await fetch('/api/vessels/find-or-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vesselData),
  });

  const body = (await response.json().catch(() => ({}))) as {
    vessel?: { id: string; name: string; type: string; officialNumber?: string | null };
    error?: string;
    message?: string;
  };

  if (!response.ok || !body.vessel) {
    throw new Error(body.error || body.message || 'Failed to create vessel');
  }

  return {
    id: body.vessel.id,
    name: body.vessel.name,
    type: body.vessel.type,
    officialNumber: body.vessel.officialNumber,
  };
}

/**
 * Create or update a daily state log record (for a specific date)
 * Only the state can be updated if the record already exists
 */
export async function createSeaServiceRecord(
  supabase: SupabaseClient,
  recordData: {
    userId: string;
    vesselId: string;
    date: Date | string; // The specific date this state applies to
    state: string; // The state for this date
  }
) {
  // Convert date to YYYY-MM-DD format
  const dateStr = typeof recordData.date === 'string' 
    ? recordData.date.split('T')[0] // Extract date part if ISO string
    : recordData.date.toISOString().split('T')[0];

  // If state is 'underway', automatically set is_part_of_active_passage to false
  // Underway already means the vessel is at sea, so marking as part of passage is redundant
  const isUnderway = recordData.state === 'underway';
  
  // Use upsert to create or update (only state can change)
  const { data, error } = await supabase
    .from('daily_state_logs')
    .upsert({
      user_id: recordData.userId,
      vessel_id: recordData.vesselId,
      date: dateStr,
      state: recordData.state,
      is_part_of_active_passage: isUnderway ? false : undefined, // Only set if underway, otherwise leave existing value
    }, {
      onConflict: 'user_id,vessel_id,date',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    vesselId: data.vessel_id,
    date: data.date,
    state: data.state,
  };
}

/**
 * Update only the state of a daily state log record
 * If state is 'underway', automatically set is_part_of_active_passage to false
 */
export async function updateDailyStateLogState(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  date: string,
  newState: string
) {
  // If state is 'underway', automatically set is_part_of_active_passage to false
  const isUnderway = newState === 'underway';
  const updateData: { state: string; is_part_of_active_passage?: boolean } = { state: newState };
  if (isUnderway) {
    updateData.is_part_of_active_passage = false;
  }
  
  const { data, error } = await supabase
    .from('daily_state_logs')
    .update(updateData)
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .eq('date', date)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    vesselId: data.vessel_id,
    date: data.date,
    state: data.state,
  };
}

/**
 * Create or update a single state log entry
 * If state is 'underway', automatically set is_part_of_active_passage to false
 */
export async function upsertStateLog(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  date: string,
  state: string
) {
  // If state is 'underway', automatically set is_part_of_active_passage to false
  const isUnderway = state === 'underway';
  
  const { data, error } = await supabase
    .from('daily_state_logs')
    .upsert(
      {
        user_id: userId,
        vessel_id: vesselId,
        date: date,
        state: state,
        is_part_of_active_passage: isUnderway ? false : undefined, // Only set if underway, otherwise leave existing value
      },
      {
        onConflict: 'user_id,vessel_id,date',
      }
    )
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    vesselId: data.vessel_id,
    state: data.state,
    date: data.date,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update state logs in batch
 * If state is 'underway', automatically set is_part_of_active_passage to false
 * (underway already means at sea, so marking as part of passage would be redundant)
 */
export async function updateStateLogsBatch(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  logs: Array<{ date: string; state: string; is_part_of_active_passage?: boolean; notes?: string }>
) {
  // Use upsert to handle both inserts and updates
  const { error } = await supabase.from('daily_state_logs').upsert(
    logs.map((log) => {
      // If state is 'underway', automatically set is_part_of_active_passage to false
      // Underway already means the vessel is at sea, so marking as part of passage is redundant
      const isUnderway = log.state === 'underway';
      const isPartOfActivePassage = isUnderway ? false : (log.is_part_of_active_passage ?? false);
      
      return {
        user_id: userId,
        vessel_id: vesselId,
        date: log.date,
        state: log.state,
        is_part_of_active_passage: isPartOfActivePassage,
        notes: log.notes || null,
      };
    }),
    {
      onConflict: 'user_id,vessel_id,date',
    }
  );

  if (error) throw error;
}

/**
 * Delete all state logs for a specific user and vessel
 */
export async function deleteVesselStateLogs(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string
) {
  const { error } = await supabase
    .from('daily_state_logs')
    .delete()
    .eq('user_id', userId)
    .eq('vessel_id', vesselId);

  if (error) throw error;
}

/**
 * Delete state logs for specific dates for a user and vessel
 */
export async function deleteStateLogsForDates(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  dates: string[] // Array of dates in YYYY-MM-DD format
) {
  if (dates.length === 0) return;

  const { error } = await supabase
    .from('daily_state_logs')
    .delete()
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .in('date', dates);

  if (error) throw error;
}

/**
 * Delete daily state logs for a user/vessel that fall outside [startDate, endDate].
 * If endDate is null, only dates before startDate are removed.
 */
export async function deleteStateLogsOutsideAssignmentRange(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  startDate: string,
  endDate: string | null,
) {
  let query = supabase
    .from('daily_state_logs')
    .delete()
    .eq('user_id', userId)
    .eq('vessel_id', vesselId);

  if (endDate) {
    query = query.or(`date.lt.${startDate},date.gt.${endDate}`);
  } else {
    query = query.lt('date', startDate);
  }

  const { error } = await query;
  if (error) throw error;
}

/**
 * Update user profile (creates user if they don't exist)
 * Uses upsert to handle both insert and update cases gracefully
 * Automatically syncs vessel assignments when activeVesselId changes
 */
export async function updateUserProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<{
    activeVesselId: string | null;
    username: string;
    firstName: string;
    lastName: string;
    position: string;
    bio: string;
    profilePicture: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    email?: string;
    startDate?: string | null;
    dischargeBookNumber?: string | null;
  }>
) {
  // Get user email from auth if not provided (needed for user creation)
  let userEmail = updates.email;
  if (!userEmail) {
    const { data: { user } } = await supabase.auth.getUser(userId);
    userEmail = user?.email || '';
  }

  // Build update data (for when user exists)
  const updateData: any = {};
  if (updates.activeVesselId !== undefined) updateData.active_vessel_id = updates.activeVesselId;
  if (updates.username !== undefined) updateData.username = updates.username;
  if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
  if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
  if (updates.position !== undefined) updateData.position = updates.position;
  if (updates.bio !== undefined) updateData.bio = updates.bio;
  if (updates.profilePicture !== undefined) updateData.profile_picture = updates.profilePicture;
  if (updates.subscriptionTier !== undefined) updateData.subscription_tier = updates.subscriptionTier;
  if (updates.subscriptionStatus !== undefined) updateData.subscription_status = updates.subscriptionStatus;
  if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
  if (updates.dischargeBookNumber !== undefined) updateData.discharge_book_number = updates.dischargeBookNumber;

  // Build insert data (for when user doesn't exist - needs all required fields)
  const insertData: any = {
    id: userId,
    email: userEmail,
  };
  
  // Include all update fields in insert data
  Object.assign(insertData, updateData);

  // Check if user exists to determine if we need to set defaults for insert
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, username, role, subscription_tier, subscription_status, email')
    .eq('id', userId)
    .maybeSingle();

  if (!existingUser) {
    // User doesn't exist - set defaults for ALL required fields
    // Username is required, so we must set it
    if (!insertData.username) {
      insertData.username = `user_${userId.slice(0, 8)}`;
    }
    // Role is required
    if (!insertData.role) {
      insertData.role = 'crew';
    }
    // Subscription tier is required
    if (!insertData.subscription_tier) {
      insertData.subscription_tier = 'free';
    }
    // Subscription status is required
    if (!insertData.subscription_status) {
      insertData.subscription_status = 'inactive';
    }
    // Registration date is required
    if (!insertData.registration_date) {
      insertData.registration_date = new Date().toISOString();
    }
    // Email is required - ensure it's set
    if (!insertData.email) {
      insertData.email = userEmail || '';
    }

    // Insert new user with all required fields
    const { error: insertError } = await supabase
      .from('users')
      .insert(insertData);

    if (insertError) throw insertError;
  } else {
    // User exists - use UPDATE to only modify provided fields
    // This preserves existing values for fields we're not updating
    if (Object.keys(updateData).length === 0) {
      // No fields to update, nothing to do
      return;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (updateError) throw updateError;

    // If activeVesselId was updated, sync vessel assignments
    if (updates.activeVesselId !== undefined) {
      try {
        await syncVesselAssignmentForActiveVessel(
          supabase,
          userId,
          updates.activeVesselId,
          updates.position || undefined
        );
      } catch (assignmentError) {
        // Log error but don't fail the profile update
        console.error('[updateUserProfile] Error syncing vessel assignment:', assignmentError);
      }
    }
  }
}

/**
 * Get vessel assignments for a user
 */
export async function getVesselAssignments(
  supabase: SupabaseClient,
  userId: string
): Promise<VesselAssignment[]> {
  console.log('[getVesselAssignments] Fetching assignments for user:', userId);
  
  const { data, error } = await supabase
    .from('vessel_assignments')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('[getVesselAssignments] Error fetching assignments:', {
      error,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  console.log('[getVesselAssignments] Raw data from query:', {
    count: data?.length || 0,
    data: data,
  });

  const mapped = (data || []).map((assignment) => ({
    id: assignment.id,
    userId: assignment.user_id,
    vesselId: assignment.vessel_id,
    startDate: assignment.start_date,
    endDate: assignment.end_date || null,
    position: assignment.position || null,
    assignmentRole: assignment.assignment_role || null,
    createdAt: timestampToISO(assignment.created_at),
    updatedAt: timestampToISO(assignment.updated_at),
  }));

  console.log('[getVesselAssignments] Mapped assignments:', {
    count: mapped.length,
    assignments: mapped.map(a => ({
      id: a.id,
      vesselId: a.vesselId,
      startDate: a.startDate,
      endDate: a.endDate,
      isActive: !a.endDate,
    })),
  });

  return mapped;
}

/**
 * Get vessel assignment for a specific vessel
 */
export async function getVesselAssignment(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string
): Promise<VesselAssignment | null> {
  const { data, error } = await supabase
    .from('vessel_assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    vesselId: data.vessel_id,
    startDate: data.start_date,
    endDate: data.end_date || null,
    position: data.position || null,
    assignmentRole: data.assignment_role || null,
    createdAt: timestampToISO(data.created_at),
    updatedAt: timestampToISO(data.updated_at),
  };
}

/**
 * Get all active vessel assignments for a specific vessel (where end_date IS NULL)
 */
export async function getActiveVesselAssignmentsByVessel(
  supabase: SupabaseClient,
  vesselId: string
): Promise<VesselAssignment[]> {
  console.log('[getActiveVesselAssignmentsByVessel] Fetching assignments for vessel:', vesselId);
  
  const { data, error } = await supabase
    .from('vessel_assignments')
    .select('*')
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .order('start_date', { ascending: false });

  console.log('[getActiveVesselAssignmentsByVessel] Query result:', { data, error });

  if (error) {
    console.error('[getActiveVesselAssignmentsByVessel] Error:', error);
    throw error;
  }

  const mapped = (data || []).map((assignment) => ({
    id: assignment.id,
    userId: assignment.user_id,
    vesselId: assignment.vessel_id,
    startDate: assignment.start_date,
    endDate: assignment.end_date || null,
    position: assignment.position || null,
    assignmentRole: assignment.assignment_role || null,
    onboard: assignment.onboard || false,
    createdAt: timestampToISO(assignment.created_at),
    updatedAt: timestampToISO(assignment.updated_at),
  }));
  
  console.log('[getActiveVesselAssignmentsByVessel] Mapped assignments:', mapped);
  
  return mapped;
}

/**
 * Get all vessel assignments for a specific vessel (active and past; no end_date filter)
 */
export async function getAllVesselAssignmentsByVessel(
  supabase: SupabaseClient,
  vesselId: string
): Promise<VesselAssignment[]> {
  const { data, error } = await supabase
    .from('vessel_assignments')
    .select('*')
    .eq('vessel_id', vesselId)
    .order('start_date', { ascending: false });

  if (error) throw error;

  return (data || []).map((assignment) => ({
    id: assignment.id,
    userId: assignment.user_id,
    vesselId: assignment.vessel_id,
    startDate: assignment.start_date,
    endDate: assignment.end_date || null,
    position: assignment.position || null,
    assignmentRole: assignment.assignment_role || null,
    onboard: assignment.onboard || false,
    createdAt: timestampToISO(assignment.created_at),
    updatedAt: timestampToISO(assignment.updated_at),
  }));
}

/**
 * Create a vessel assignment
 */
export async function createVesselAssignment(
  supabase: SupabaseClient,
  assignmentData: {
    userId: string;
    vesselId: string;
    startDate: string; // YYYY-MM-DD format
    endDate?: string | null; // YYYY-MM-DD format, null if active
    position?: string | null;
  }
): Promise<VesselAssignment> {
  const { data, error } = await supabase
    .from('vessel_assignments')
    .insert({
      user_id: assignmentData.userId,
      vessel_id: assignmentData.vesselId,
      start_date: assignmentData.startDate,
      end_date: assignmentData.endDate || null,
      position: assignmentData.position || null,
    })
    .select()
    .single();

  if (error) throw error;

  scheduleCrewPlanReconcile(supabase, assignmentData.userId, assignmentData.vesselId);

  return {
    id: data.id,
    userId: data.user_id,
    vesselId: data.vessel_id,
    startDate: data.start_date,
    endDate: data.end_date || null,
    position: data.position || null,
    createdAt: timestampToISO(data.created_at),
    updatedAt: timestampToISO(data.updated_at),
  };
}

/**
 * Update vessel assignment (e.g., set end date when leaving, update start date)
 */
export async function updateVesselAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
  updates: {
    startDate?: string; // YYYY-MM-DD format
    endDate?: string | null; // YYYY-MM-DD format
    position?: string | null;
    assignmentRole?: string | null; // crew, officer, captain, admin
  }
): Promise<VesselAssignment> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.startDate !== undefined) {
    updateData.start_date = updates.startDate;
  }
  if (updates.endDate !== undefined) {
    updateData.end_date = updates.endDate;
  }
  if (updates.position !== undefined) {
    updateData.position = updates.position;
  }
  if (updates.assignmentRole !== undefined) {
    updateData.assignment_role = updates.assignmentRole;
  }

  const { data, error } = await supabase
    .from('vessel_assignments')
    .update(updateData)
    .eq('id', assignmentId)
    .select()
    .single();

  if (error) throw error;

  if (updates.endDate !== undefined) {
    scheduleCrewPlanReconcile(supabase, data.user_id);
  }

  return {
    id: data.id,
    userId: data.user_id,
    vesselId: data.vessel_id,
    startDate: data.start_date,
    endDate: data.end_date || null,
    position: data.position || null,
    assignmentRole: data.assignment_role || null,
    createdAt: timestampToISO(data.created_at),
    updatedAt: timestampToISO(data.updated_at),
  };
}

/**
 * Ensure vessel assignment exists when user sets active_vessel_id
 * This creates or updates the assignment to reflect the current vessel
 */
export async function syncVesselAssignmentForActiveVessel(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string | null,
  position?: string | null
): Promise<void> {
  // If vesselId is null, we need to end all active assignments
  if (!vesselId) {
    // Find all active assignments for this user and end them
    const { data: activeAssignments } = await supabase
      .from('vessel_assignments')
      .select('id')
      .eq('user_id', userId)
      .is('end_date', null);

    if (activeAssignments && activeAssignments.length > 0) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      for (const assignment of activeAssignments) {
        await updateVesselAssignment(supabase, assignment.id, {
          endDate: today,
        });
      }
    } else {
      scheduleCrewPlanReconcile(supabase, userId);
    }
    return;
  }

  // Check if there's already an active assignment for this vessel
  const existingAssignment = await getVesselAssignment(supabase, userId, vesselId);
  
  if (existingAssignment && !existingAssignment.endDate) {
    // Assignment already exists and is active - just update position if provided
    if (position !== undefined) {
      await updateVesselAssignment(supabase, existingAssignment.id, {
        position,
      });
    }
    return;
  }

  // Check if user has any other active assignments that need to be ended first
  const { data: otherActiveAssignments } = await supabase
    .from('vessel_assignments')
    .select('id, vessel_id')
    .eq('user_id', userId)
    .is('end_date', null);

  if (otherActiveAssignments && otherActiveAssignments.length > 0) {
    // End all other active assignments
    const today = new Date().toISOString().split('T')[0];
    for (const assignment of otherActiveAssignments) {
      if (assignment.vessel_id !== vesselId) {
        await updateVesselAssignment(supabase, assignment.id, {
          endDate: today,
        });
      }
    }
  }

  // If there was an assignment but it's ended, we could resume it, but it's cleaner to create a new one
  // Create new active assignment
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  await createVesselAssignment(supabase, {
    userId,
    vesselId,
    startDate: today,
    endDate: null, // Active assignment
    position: position || null,
  });
}

/**
 * End an active vessel assignment (set end date)
 */
export async function endVesselAssignment(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  endDate: string // YYYY-MM-DD format
): Promise<VesselAssignment> {
  // Find the active assignment (end_date is NULL)
  const { data: activeAssignment, error: findError } = await supabase
    .from('vessel_assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (!activeAssignment) {
    throw new Error('No active assignment found for this vessel.');
  }

  return updateVesselAssignment(supabase, activeAssignment.id, { endDate });
}

/**
 * Transform database passage log record to TypeScript interface
 */
function transformPassageLog(dbLog: any): PassageLog {
  return {
    id: dbLog.id,
    crew_id: dbLog.crew_id,
    vessel_id: dbLog.vessel_id,
    start_time: dbLog.start_time,
    end_time: dbLog.end_time,
    departure_port: dbLog.departure_port,
    departure_country: dbLog.departure_country,
    arrival_port: dbLog.arrival_port,
    arrival_country: dbLog.arrival_country,
    departure_lat: dbLog.departure_lat,
    departure_lon: dbLog.departure_lon,
    arrival_lat: dbLog.arrival_lat,
    arrival_lon: dbLog.arrival_lon,
    distance_nm: dbLog.distance_nm,
    engine_hours: dbLog.engine_hours,
    avg_speed_knots: dbLog.avg_speed_knots,
    passage_type: dbLog.passage_type,
    weather_summary: dbLog.weather_summary,
    sea_state: dbLog.sea_state,
    notes: dbLog.notes,
    source: dbLog.source,
    ais_fingerprint: dbLog.ais_fingerprint ?? null,
    track_data: dbLog.track_data,
    created_at: dbLog.created_at,
    updated_at: dbLog.updated_at,
  };
}

/**
 * Get all passage logs for a user
 */
export async function getPassageLogs(
  supabase: SupabaseClient,
  userId: string
): Promise<PassageLog[]> {
  const { data, error } = await supabase
    .from('passage_logs')
    .select('*')
    .eq('crew_id', userId)
    .order('start_time', { ascending: false });

  if (error) throw error;

  return (data || []).map(transformPassageLog);
}

/**
 * Get all passage logs for a vessel (vessel manager view — any crew member’s logs on this vessel).
 */
export async function getPassageLogsByVessel(
  supabase: SupabaseClient,
  vesselId: string
): Promise<PassageLog[]> {
  const { data, error } = await supabase
    .from('passage_logs')
    .select('*')
    .eq('vessel_id', vesselId)
    .order('start_time', { ascending: false });

  if (error) throw error;

  return (data || []).map(transformPassageLog);
}

/**
 * Get a single passage log by ID
 */
export async function getPassageLog(
  supabase: SupabaseClient,
  passageId: string
): Promise<PassageLog | null> {
  const { data, error } = await supabase
    .from('passage_logs')
    .select('*')
    .eq('id', passageId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return transformPassageLog(data);
}

/**
 * Create a new passage log
 */
export async function createPassageLog(
  supabase: SupabaseClient,
  passageData: {
    crewId: string;
    vesselId: string;
    startTime: Date | string;
    endTime: Date | string;
    departurePort?: string | null;
    departureCountry?: string;
    arrivalPort?: string | null;
    arrivalCountry?: string;
    departureLat?: number;
    departureLon?: number;
    arrivalLat?: number;
    arrivalLon?: number;
    distanceNm?: number;
    engineHours?: number;
    avgSpeedKnots?: number;
    passageType?: string;
    weatherSummary?: string;
    seaState?: string;
    notes?: string;
    source?: string;
    trackData?: any;
    aisFingerprint?: string | null;
  }
): Promise<PassageLog> {
  const startTime = typeof passageData.startTime === 'string' 
    ? passageData.startTime 
    : passageData.startTime.toISOString();
  
  const endTime = typeof passageData.endTime === 'string' 
    ? passageData.endTime 
    : passageData.endTime.toISOString();

  const { data, error } = await supabase
    .from('passage_logs')
    .insert({
      crew_id: passageData.crewId,
      vessel_id: passageData.vesselId,
      start_time: startTime,
      end_time: endTime,
      departure_port: passageData.departurePort?.trim() || null,
      departure_country: passageData.departureCountry?.trim() || null,
      arrival_port: passageData.arrivalPort?.trim() || null,
      arrival_country: passageData.arrivalCountry?.trim() || null,
      departure_lat: passageData.departureLat || null,
      departure_lon: passageData.departureLon || null,
      arrival_lat: passageData.arrivalLat || null,
      arrival_lon: passageData.arrivalLon || null,
      distance_nm: passageData.distanceNm || null,
      engine_hours: passageData.engineHours || null,
      avg_speed_knots: passageData.avgSpeedKnots || null,
      passage_type: passageData.passageType || null,
      weather_summary: passageData.weatherSummary || null,
      sea_state: passageData.seaState || null,
      notes: passageData.notes || null,
      source: passageData.source || 'manual',
      track_data: passageData.trackData || null,
      ais_fingerprint: passageData.aisFingerprint || null,
    })
    .select()
    .single();

  if (error) throw error;

  return transformPassageLog(data);
}

/**
 * Update an existing passage log
 */
export async function updatePassageLog(
  supabase: SupabaseClient,
  passageId: string,
  updates: Partial<{
    vesselId: string;
    startTime: Date | string;
    endTime: Date | string;
    departurePort?: string | null;
    departureCountry?: string;
    arrivalPort?: string | null;
    arrivalCountry?: string;
    departureLat?: number;
    departureLon?: number;
    arrivalLat?: number;
    arrivalLon?: number;
    distanceNm?: number;
    engineHours?: number;
    avgSpeedKnots?: number;
    passageType?: string;
    weatherSummary?: string;
    seaState?: string;
    notes?: string;
    source?: string;
    trackData?: any;
    aisFingerprint?: string | null;
  }>
): Promise<PassageLog> {
  const updateData: any = {};
  
  if (updates.vesselId !== undefined) updateData.vessel_id = updates.vesselId;
  if (updates.startTime !== undefined) {
    updateData.start_time = typeof updates.startTime === 'string' 
      ? updates.startTime 
      : updates.startTime.toISOString();
  }
  if (updates.endTime !== undefined) {
    updateData.end_time = typeof updates.endTime === 'string' 
      ? updates.endTime 
      : updates.endTime.toISOString();
  }
  if (updates.departurePort !== undefined) updateData.departure_port = updates.departurePort?.trim() || null;
  if (updates.departureCountry !== undefined) updateData.departure_country = updates.departureCountry?.trim() || null;
  if (updates.arrivalPort !== undefined) updateData.arrival_port = updates.arrivalPort?.trim() || null;
  if (updates.arrivalCountry !== undefined) updateData.arrival_country = updates.arrivalCountry?.trim() || null;
  if (updates.departureLat !== undefined) updateData.departure_lat = updates.departureLat || null;
  if (updates.departureLon !== undefined) updateData.departure_lon = updates.departureLon || null;
  if (updates.arrivalLat !== undefined) updateData.arrival_lat = updates.arrivalLat || null;
  if (updates.arrivalLon !== undefined) updateData.arrival_lon = updates.arrivalLon || null;
  if (updates.distanceNm !== undefined) updateData.distance_nm = updates.distanceNm || null;
  if (updates.engineHours !== undefined) updateData.engine_hours = updates.engineHours || null;
  if (updates.avgSpeedKnots !== undefined) updateData.avg_speed_knots = updates.avgSpeedKnots || null;
  if (updates.passageType !== undefined) updateData.passage_type = updates.passageType || null;
  if (updates.weatherSummary !== undefined) updateData.weather_summary = updates.weatherSummary || null;
  if (updates.seaState !== undefined) updateData.sea_state = updates.seaState || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;
  if (updates.source !== undefined) updateData.source = updates.source || null;
  if (updates.trackData !== undefined) updateData.track_data = updates.trackData || null;
  if (updates.aisFingerprint !== undefined) updateData.ais_fingerprint = updates.aisFingerprint || null;

  const { data, error } = await supabase
    .from('passage_logs')
    .update(updateData)
    .eq('id', passageId)
    .select()
    .single();

  if (error) throw error;

  return transformPassageLog(data);
}

/**
 * Delete a passage log
 */
export async function deletePassageLog(
  supabase: SupabaseClient,
  passageId: string
): Promise<void> {
  const { error } = await supabase
    .from('passage_logs')
    .delete()
    .eq('id', passageId);

  if (error) throw error;
}

/**
 * Transform database bridge watch log record to TypeScript interface
 */
function transformBridgeWatchLog(dbLog: any): BridgeWatchLog {
  return {
    id: dbLog.id,
    crew_id: dbLog.crew_id,
    vessel_id: dbLog.vessel_id,
    passage_id: dbLog.passage_id,
    start_time: dbLog.start_time,
    end_time: dbLog.end_time,
    state: dbLog.state,
    role: dbLog.role,
    is_night_watch: dbLog.is_night_watch,
    solo_watch: dbLog.solo_watch,
    supervised_by_name: dbLog.supervised_by_name,
    area: dbLog.area,
    traffic_density: dbLog.traffic_density,
    visibility: dbLog.visibility,
    weather_summary: dbLog.weather_summary,
    incidents: dbLog.incidents,
    equipment_used: dbLog.equipment_used,
    notes: dbLog.notes,
    created_at: dbLog.created_at,
    updated_at: dbLog.updated_at,
  };
}

/**
 * Get all bridge watch logs for a user
 */
export async function getBridgeWatchLogs(
  supabase: SupabaseClient,
  userId: string
): Promise<BridgeWatchLog[]> {
  const { data, error } = await supabase
    .from('bridge_watch_logs')
    .select('*')
    .eq('crew_id', userId)
    .order('start_time', { ascending: false });

  if (error) throw error;

  return (data || []).map(transformBridgeWatchLog);
}

/**
 * Get a single bridge watch log by ID
 */
export async function getBridgeWatchLog(
  supabase: SupabaseClient,
  watchId: string
): Promise<BridgeWatchLog | null> {
  const { data, error } = await supabase
    .from('bridge_watch_logs')
    .select('*')
    .eq('id', watchId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return transformBridgeWatchLog(data);
}

/**
 * Create a new bridge watch log
 */
export async function createBridgeWatchLog(
  supabase: SupabaseClient,
  watchData: {
    crewId: string;
    vesselId: string;
    passageId?: string | null;
    startTime: Date | string;
    endTime: Date | string;
    state: string;
    role: string;
    isNightWatch: boolean;
    soloWatch: boolean;
    supervisedByName?: string;
    area?: string;
    trafficDensity?: string;
    visibility?: string;
    weatherSummary?: string;
    incidents?: string;
    equipmentUsed?: string;
    notes?: string;
  }
): Promise<BridgeWatchLog> {
  const startTime = typeof watchData.startTime === 'string' 
    ? watchData.startTime 
    : watchData.startTime.toISOString();
  
  const endTime = typeof watchData.endTime === 'string' 
    ? watchData.endTime 
    : watchData.endTime.toISOString();

  const { data, error } = await supabase
    .from('bridge_watch_logs')
    .insert({
      crew_id: watchData.crewId,
      vessel_id: watchData.vesselId,
      passage_id: watchData.passageId || null,
      start_time: startTime,
      end_time: endTime,
      state: watchData.state,
      role: watchData.role,
      is_night_watch: watchData.isNightWatch,
      solo_watch: watchData.soloWatch,
      supervised_by_name: watchData.supervisedByName || null,
      area: watchData.area || null,
      traffic_density: watchData.trafficDensity || null,
      visibility: watchData.visibility || null,
      weather_summary: watchData.weatherSummary || null,
      incidents: watchData.incidents || null,
      equipment_used: watchData.equipmentUsed || null,
      notes: watchData.notes || null,
    })
    .select()
    .single();

  if (error) throw error;

  return transformBridgeWatchLog(data);
}

/**
 * Update an existing bridge watch log
 */
export async function updateBridgeWatchLog(
  supabase: SupabaseClient,
  watchId: string,
  updates: Partial<{
    vesselId: string;
    passageId?: string | null;
    startTime: Date | string;
    endTime: Date | string;
    state: string;
    role: string;
    isNightWatch: boolean;
    soloWatch: boolean;
    supervisedByName?: string;
    area?: string;
    trafficDensity?: string;
    visibility?: string;
    weatherSummary?: string;
    incidents?: string;
    equipmentUsed?: string;
    notes?: string;
  }>
): Promise<BridgeWatchLog> {
  const updateData: any = {};
  
  if (updates.vesselId !== undefined) updateData.vessel_id = updates.vesselId;
  if (updates.passageId !== undefined) updateData.passage_id = updates.passageId || null;
  if (updates.startTime !== undefined) {
    updateData.start_time = typeof updates.startTime === 'string' 
      ? updates.startTime 
      : updates.startTime.toISOString();
  }
  if (updates.endTime !== undefined) {
    updateData.end_time = typeof updates.endTime === 'string' 
      ? updates.endTime 
      : updates.endTime.toISOString();
  }
  if (updates.state !== undefined) updateData.state = updates.state;
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.isNightWatch !== undefined) updateData.is_night_watch = updates.isNightWatch;
  if (updates.soloWatch !== undefined) updateData.solo_watch = updates.soloWatch;
  if (updates.supervisedByName !== undefined) updateData.supervised_by_name = updates.supervisedByName || null;
  if (updates.area !== undefined) updateData.area = updates.area || null;
  if (updates.trafficDensity !== undefined) updateData.traffic_density = updates.trafficDensity || null;
  if (updates.visibility !== undefined) updateData.visibility = updates.visibility || null;
  if (updates.weatherSummary !== undefined) updateData.weather_summary = updates.weatherSummary || null;
  if (updates.incidents !== undefined) updateData.incidents = updates.incidents || null;
  if (updates.equipmentUsed !== undefined) updateData.equipment_used = updates.equipmentUsed || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  const { data, error } = await supabase
    .from('bridge_watch_logs')
    .update(updateData)
    .eq('id', watchId)
    .select()
    .single();

  if (error) throw error;

  return transformBridgeWatchLog(data);
}

/**
 * Delete a bridge watch log
 */
export async function deleteBridgeWatchLog(
  supabase: SupabaseClient,
  watchId: string
): Promise<void> {
  const { error } = await supabase
    .from('bridge_watch_logs')
    .delete()
    .eq('id', watchId);

  if (error) throw error;
}

/**
 * Feedback types
 */
export type FeedbackType = 'bug' | 'feature' | 'other';
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

/** Submitter profile (from users) for admin feedback list */
export interface FeedbackSubmitter {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

export interface Feedback {
  id: string;
  userId: string;
  type: FeedbackType;
  subject: string;
  message: string;
  status: FeedbackStatus;
  adminResponse: string | null;
  adminResponseAt: string | null;
  adminResponseReadAt: string | null;
  respondedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** When set, this is an admin message to this user (userId = admin, recipientId = target) */
  recipientId?: string | null;
  /** Populated by getAllFeedback for admin view */
  submitter?: FeedbackSubmitter | null;
  /** Populated by getAllFeedback for admin-sent messages (who received it) */
  recipient?: FeedbackSubmitter | null;
}

/**
 * Create a new feedback entry.
 * When recipientId is set, this is an admin message to that user (userId = sender admin).
 */
export async function createFeedback(
  supabase: SupabaseClient,
  feedbackData: {
    userId: string;
    type: FeedbackType;
    subject: string;
    message: string;
    recipientId?: string | null;
  }
): Promise<Feedback> {
  const insertData: Record<string, unknown> = {
    user_id: feedbackData.userId,
    type: feedbackData.type,
    subject: feedbackData.subject,
    message: feedbackData.message,
    status: 'open',
  };
  if (feedbackData.recipientId) {
    insertData.recipient_id = feedbackData.recipientId;
  }
  const { data, error } = await supabase
    .from('feedback')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    subject: data.subject,
    message: data.message,
    status: data.status,
    adminResponse: data.admin_response || null,
    adminResponseAt: data.admin_response_at || null,
    adminResponseReadAt: data.admin_response_read_at || null,
    respondedBy: data.responded_by || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    recipientId: data.recipient_id ?? null,
  };
}

/**
 * Get all feedback for a user: feedback they submitted (user_id = userId)
 * and messages sent to them (recipient_id = userId).
 */
export async function getUserFeedback(
  supabase: SupabaseClient,
  userId: string
): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .or(`user_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    id: item.id,
    userId: item.user_id,
    type: item.type,
    subject: item.subject,
    message: item.message,
    status: item.status,
    adminResponse: item.admin_response || null,
    adminResponseAt: item.admin_response_at || null,
    adminResponseReadAt: item.admin_response_read_at || null,
    respondedBy: item.responded_by || null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    recipientId: item.recipient_id ?? null,
  }));
}

/**
 * Get all feedback (admin only). Fetches feedback then looks up submitter from users by user_id
 * (avoids PostgREST join which requires FK relationship between feedback and users).
 */
export async function getAllFeedback(
  supabase: SupabaseClient,
  options?: {
    status?: FeedbackStatus;
    type?: FeedbackType;
    limit?: number;
  }
): Promise<Feedback[]> {
  let query = supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.type) {
    query = query.eq('type', options.type);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = data || [];
  const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
  const recipientIds = [...new Set(rows.map((r: any) => r.recipient_id).filter(Boolean))];
  const allUserIds = [...new Set([...userIds, ...recipientIds])];
  let userMap: Record<string, FeedbackSubmitter> = {};

  if (allUserIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, username')
      .in('id', allUserIds);
    if (users) {
      userMap = Object.fromEntries(
        users.map((u: any) => [
          u.id,
          {
            email: u.email ?? '',
            first_name: u.first_name ?? null,
            last_name: u.last_name ?? null,
            username: u.username ?? null,
          },
        ])
      );
    }
  }

  return rows.map((item: any) => ({
    id: item.id,
    userId: item.user_id,
    type: item.type,
    subject: item.subject,
    message: item.message,
    status: item.status,
    adminResponse: item.admin_response || null,
    adminResponseAt: item.admin_response_at || null,
    adminResponseReadAt: item.admin_response_read_at || null,
    respondedBy: item.responded_by || null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    recipientId: item.recipient_id ?? null,
    submitter: (item.user_id && userMap[item.user_id]) ? userMap[item.user_id] : null,
    recipient: (item.recipient_id && userMap[item.recipient_id]) ? userMap[item.recipient_id] : null,
  }));
}

/**
 * Mark admin response as read
 */
export async function markFeedbackResponseAsRead(
  supabase: SupabaseClient,
  feedbackId: string
): Promise<Feedback> {
  const { data, error } = await supabase
    .from('feedback')
    .update({
      admin_response_read_at: new Date().toISOString(),
    })
    .eq('id', feedbackId)
    .select()
    .single();

  if (error) {
    // Handle the case where no rows are returned (RLS or not found)
    if (error.code === 'PGRST116') {
      throw new Error('Feedback not found or you do not have permission to update it.');
    }
    throw error;
  }
  
  if (!data) {
    throw new Error('Feedback not found or you do not have permission to update it.');
  }

  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    subject: data.subject,
    message: data.message,
    status: data.status,
    adminResponse: data.admin_response || null,
    adminResponseAt: data.admin_response_at || null,
    adminResponseReadAt: data.admin_response_read_at || null,
    respondedBy: data.responded_by || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    recipientId: data.recipient_id ?? null,
  };
}

/**
 * Update feedback (admin only - to respond or change status)
 */
export async function updateFeedback(
  supabase: SupabaseClient,
  feedbackId: string,
  updates: {
    status?: FeedbackStatus;
    adminResponse?: string;
    respondedBy?: string;
  }
): Promise<Feedback> {
  const updateData: any = {};

  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }

  if (updates.adminResponse !== undefined) {
    updateData.admin_response = updates.adminResponse;
    if (updates.adminResponse) {
      updateData.admin_response_at = new Date().toISOString();
      // Reset read status when admin updates/responds (mark as unread)
      updateData.admin_response_read_at = null;
    } else {
      updateData.admin_response_at = null;
      updateData.admin_response_read_at = null;
    }
  }

  if (updates.respondedBy !== undefined) {
    updateData.responded_by = updates.respondedBy;
  }

  const { data, error } = await supabase
    .from('feedback')
    .update(updateData)
    .eq('id', feedbackId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    subject: data.subject,
    message: data.message,
    status: data.status,
    adminResponse: data.admin_response || null,
    adminResponseAt: data.admin_response_at || null,
    adminResponseReadAt: data.admin_response_read_at || null,
    respondedBy: data.responded_by || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    recipientId: data.recipient_id ?? null,
  };
}

/**
 * Delete a feedback entry (admin only)
 */
export async function deleteFeedback(
  supabase: SupabaseClient,
  feedbackId: string
): Promise<void> {
  const { error } = await supabase
    .from('feedback')
    .delete()
    .eq('id', feedbackId);

  if (error) throw error;
}
