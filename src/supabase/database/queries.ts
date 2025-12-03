/**
 * Database query helpers for Supabase
 * These functions provide a Firestore-like API for common operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { timestampToISO } from './helpers';
import type { StateLog } from '@/lib/types';

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
    date: record.date,
    state: record.state,
  }));
}

/**
 * Transform database state log record to TypeScript interface
 */
function transformStateLog(dbLog: any): StateLog {
  return {
    id: dbLog.id,
    userId: dbLog.user_id,
    vesselId: dbLog.vessel_id,
    state: dbLog.state,
    date: dbLog.date,
    createdAt: dbLog.created_at,
    updatedAt: dbLog.updated_at,
  };
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
  
  const { data, error } = await query.order('date', { ascending: true });

  if (error) throw error;

  return (data || []).map(transformStateLog);
}

/**
 * Create a vessel (vessels are shared, not owned by users)
 */
export async function createVessel(
  supabase: SupabaseClient,
  vesselData: {
    name: string;
    type: string;
    officialNumber?: string;
  }
) {
  // Properly handle officialNumber - preserve the value if provided, null if empty/undefined
  const officialNumber = vesselData.officialNumber?.trim() || null;
  
  const { data, error } = await supabase
    .from('vessels')
    .insert({
      name: vesselData.name,
      type: vesselData.type,
      imo: officialNumber,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    officialNumber: data.imo,
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

  // Use upsert to create or update (only state can change)
  const { data, error } = await supabase
    .from('daily_state_logs')
    .upsert({
      user_id: recordData.userId,
      vessel_id: recordData.vesselId,
      date: dateStr,
      state: recordData.state,
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
 */
export async function updateDailyStateLogState(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  date: string,
  newState: string
) {
  const { data, error } = await supabase
    .from('daily_state_logs')
    .update({ state: newState })
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
 */
export async function upsertStateLog(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  date: string,
  state: string
) {
  const { data, error } = await supabase
    .from('daily_state_logs')
    .upsert(
      {
        user_id: userId,
        vessel_id: vesselId,
        date: date,
        state: state,
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
 */
export async function updateStateLogsBatch(
  supabase: SupabaseClient,
  userId: string,
  vesselId: string,
  logs: Array<{ date: string; state: string }>
) {
  // Use upsert to handle both inserts and updates
  const { error } = await supabase.from('daily_state_logs').upsert(
    logs.map((log) => ({
      user_id: userId,
      vessel_id: vesselId,
      date: log.date,
      state: log.state,
    })),
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
 * Update user profile (creates user if they don't exist)
 * Uses upsert to handle both insert and update cases gracefully
 */
export async function updateUserProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<{
    activeVesselId: string | null;
    username: string;
    firstName: string;
    lastName: string;
    bio: string;
    profilePicture: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    email?: string;
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
  if (updates.bio !== undefined) updateData.bio = updates.bio;
  if (updates.profilePicture !== undefined) updateData.profile_picture = updates.profilePicture;
  if (updates.subscriptionTier !== undefined) updateData.subscription_tier = updates.subscriptionTier;
  if (updates.subscriptionStatus !== undefined) updateData.subscription_status = updates.subscriptionStatus;

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
  }
}

