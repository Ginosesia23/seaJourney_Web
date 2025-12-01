/**
 * Database query helpers for Supabase
 * These functions provide a Firestore-like API for common operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { timestampToISO } from './helpers';

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
    activeSeaServiceId: data.active_sea_service_id,
  };
}

/**
 * Get vessels for a user
 */
export async function getUserVessels(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('vessels')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((vessel) => ({
    id: vessel.id,
    name: vessel.name,
    type: vessel.type,
    officialNumber: vessel.official_number,
    ownerId: vessel.owner_id,
  }));
}

/**
 * Get sea service records for a vessel
 */
export async function getVesselSeaService(
  supabase: SupabaseClient,
  vesselId: string
) {
  const { data, error } = await supabase
    .from('sea_service_records')
    .select('*')
    .eq('vessel_id', vesselId)
    .order('start_date', { ascending: false });

  if (error) throw error;

  return (data || []).map((record) => ({
    id: record.id,
    vesselId: record.vessel_id,
    position: record.position,
    startDate: timestampToISO(record.start_date),
    endDate: record.end_date ? timestampToISO(record.end_date) : undefined,
    isCurrent: record.is_current,
    notes: record.notes,
  }));
}

/**
 * Get state logs for a vessel
 */
export async function getVesselStateLogs(
  supabase: SupabaseClient,
  vesselId: string
) {
  const { data, error } = await supabase
    .from('state_logs')
    .select('*')
    .eq('vessel_id', vesselId)
    .order('date', { ascending: true });

  if (error) throw error;

  return (data || []).map((log) => ({
    id: log.date, // Use date as ID to match Firestore structure
    date: log.date,
    state: log.state,
  }));
}

/**
 * Create a vessel
 */
export async function createVessel(
  supabase: SupabaseClient,
  vesselData: {
    ownerId: string;
    name: string;
    type: string;
    officialNumber?: string;
  }
) {
  const { data, error } = await supabase
    .from('vessels')
    .insert({
      owner_id: vesselData.ownerId,
      name: vesselData.name,
      type: vesselData.type,
      official_number: vesselData.officialNumber || null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    officialNumber: data.official_number,
    ownerId: data.owner_id,
  };
}

/**
 * Create a sea service record
 */
export async function createSeaServiceRecord(
  supabase: SupabaseClient,
  recordData: {
    vesselId: string;
    position: string;
    startDate: Date | string;
    isCurrent?: boolean;
    notes?: string;
  }
) {
  const { data, error } = await supabase
    .from('sea_service_records')
    .insert({
      vessel_id: recordData.vesselId,
      position: recordData.position,
      start_date: typeof recordData.startDate === 'string' 
        ? recordData.startDate 
        : recordData.startDate.toISOString(),
      is_current: recordData.isCurrent ?? true,
      notes: recordData.notes || null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    vesselId: data.vessel_id,
    position: data.position,
    startDate: timestampToISO(data.start_date),
    endDate: data.end_date ? timestampToISO(data.end_date) : undefined,
    isCurrent: data.is_current,
    notes: data.notes,
  };
}

/**
 * Update state logs in batch
 */
export async function updateStateLogsBatch(
  supabase: SupabaseClient,
  vesselId: string,
  logs: Array<{ date: string; state: string }>
) {
  // Use upsert to handle both inserts and updates
  const { error } = await supabase.from('state_logs').upsert(
    logs.map((log) => ({
      vessel_id: vesselId,
      date: log.date,
      state: log.state,
    })),
    {
      onConflict: 'vessel_id,date',
    }
  );

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
    activeSeaServiceId: string | null;
    username: string;
    firstName: string;
    lastName: string;
    bio: string;
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
  if (updates.activeSeaServiceId !== undefined) updateData.active_sea_service_id = updates.activeSeaServiceId;
  if (updates.username !== undefined) updateData.username = updates.username;
  if (updates.firstName !== undefined) updateData.first_name = updates.firstName;
  if (updates.lastName !== undefined) updateData.last_name = updates.lastName;
  if (updates.bio !== undefined) updateData.bio = updates.bio;
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

