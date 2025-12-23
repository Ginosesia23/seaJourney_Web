import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, reviewedBy } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing required field: requestId' },
        { status: 400 }
      );
    }

    if (!reviewedBy) {
      return NextResponse.json(
        { error: 'Missing required field: reviewedBy' },
        { status: 400 }
      );
    }

    // 1. First, fetch the request to get captain and vessel IDs
    const { data: claimRequest, error: fetchError } = await supabaseAdmin
      .from('vessel_claim_requests')
      .select('id, vessel_id, requested_by, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !claimRequest) {
      console.error('[APPROVE CAPTAINCY API] Error fetching request:', fetchError);
      return NextResponse.json(
        { error: 'Request not found', message: fetchError?.message },
        { status: 404 }
      );
    }

    if (claimRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'Request is not pending', currentStatus: claimRequest.status },
        { status: 400 }
      );
    }

    const captainUserId = claimRequest.requested_by;
    const vesselId = claimRequest.vessel_id;

    // 2. Update the request status to approved
    const { error: updateRequestError } = await supabaseAdmin
      .from('vessel_claim_requests')
      .update({
        status: 'approved',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateRequestError) {
      console.error('[APPROVE CAPTAINCY API] Error updating request:', updateRequestError);
      return NextResponse.json(
        { error: 'Failed to update request', message: updateRequestError.message },
        { status: 500 }
      );
    }

    // 3. Get captain's current position (or default to 'Captain')
    const { data: captainProfile } = await supabaseAdmin
      .from('users')
      .select('position')
      .eq('id', captainUserId)
      .single();

    const position = captainProfile?.position || 'Captain';

    // 4. End any existing active assignments for the captain
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const { data: activeAssignments } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id, vessel_id')
      .eq('user_id', captainUserId)
      .is('end_date', null);

    if (activeAssignments && activeAssignments.length > 0) {
      for (const assignment of activeAssignments) {
        if (assignment.vessel_id !== vesselId) {
          await supabaseAdmin
            .from('vessel_assignments')
            .update({ end_date: today })
            .eq('id', assignment.id);
        }
      }
    }

    // 5. Check if there's already an active assignment for this vessel
    const { data: existingAssignment } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id')
      .eq('user_id', captainUserId)
      .eq('vessel_id', vesselId)
      .is('end_date', null)
      .maybeSingle();

    // 6. Create vessel assignment if it doesn't exist
    if (!existingAssignment) {
      const { error: assignmentError } = await supabaseAdmin
        .from('vessel_assignments')
        .insert({
          user_id: captainUserId,
          vessel_id: vesselId,
          start_date: today,
          end_date: null, // Active assignment
          position: position,
        });

      if (assignmentError) {
        console.error('[APPROVE CAPTAINCY API] Error creating vessel assignment:', assignmentError);
        // Don't fail the approval if assignment creation fails - log and continue
        // The request is already approved
      } else {
        console.log('[APPROVE CAPTAINCY API] Created vessel assignment for captain:', captainUserId, 'vessel:', vesselId);
      }
    } else {
      // Update position if assignment already exists
      await supabaseAdmin
        .from('vessel_assignments')
        .update({ position: position })
        .eq('id', existingAssignment.id);
    }

    // 7. Update vessel's vessel_manager_id if not already set (ensures vessel has a manager reference)
    // This helps approved captains find the vessel manager's logs
    const { data: vesselData } = await supabaseAdmin
      .from('vessels')
      .select('vessel_manager_id')
      .eq('id', vesselId)
      .single();
    
    if (vesselData && !vesselData.vessel_manager_id) {
      // Find the vessel manager (user with role='vessel' and active_vessel_id matching this vessel)
      const { data: vesselManager } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'vessel')
        .eq('active_vessel_id', vesselId)
        .limit(1)
        .maybeSingle();
      
      if (vesselManager) {
        await supabaseAdmin
          .from('vessels')
          .update({ vessel_manager_id: vesselManager.id })
          .eq('id', vesselId);
        console.log('[APPROVE CAPTAINCY API] Set vessel_manager_id:', vesselManager.id, 'for vessel:', vesselId);
      }
    }

    // 8. Update captain's active_vessel_id
    const { error: updateProfileError } = await supabaseAdmin
      .from('users')
      .update({ active_vessel_id: vesselId })
      .eq('id', captainUserId);

    if (updateProfileError) {
      console.error('[APPROVE CAPTAINCY API] Error updating captain profile:', updateProfileError);
      // Don't fail the approval if profile update fails - log and continue
    } else {
      console.log('[APPROVE CAPTAINCY API] Updated captain active_vessel_id:', captainUserId, 'vessel:', vesselId);
    }

    // 9. Handle vessel_signing_authorities table
    // End any existing active primary signing authorities for this vessel (to satisfy the unique constraint)
    const { data: existingActivePrimary, error: existingCheckError } = await supabaseAdmin
      .from('vessel_signing_authorities')
      .select('id')
      .eq('vessel_id', vesselId)
      .eq('is_primary', true)
      .is('end_date', null);

    if (existingCheckError) {
      console.error('[APPROVE CAPTAINCY API] Error checking existing signing authorities:', existingCheckError);
    } else if (existingActivePrimary && existingActivePrimary.length > 0) {
      // End existing active primary signing authorities
      const { error: endExistingError } = await supabaseAdmin
        .from('vessel_signing_authorities')
        .update({ end_date: today })
        .eq('vessel_id', vesselId)
        .eq('is_primary', true)
        .is('end_date', null);

      if (endExistingError) {
        console.error('[APPROVE CAPTAINCY API] Error ending existing signing authorities:', endExistingError);
      } else {
        console.log('[APPROVE CAPTAINCY API] Ended', existingActivePrimary.length, 'existing active primary signing authorities for vessel:', vesselId);
      }
    }

    // Insert new signing authority record for the approved captain
    const { error: signingAuthorityError } = await supabaseAdmin
      .from('vessel_signing_authorities')
      .insert({
        vessel_id: vesselId,
        captain_user_id: captainUserId,
        start_date: today,
        end_date: null, // Active (current)
        is_primary: true, // Primary signing authority
      });

    if (signingAuthorityError) {
      console.error('[APPROVE CAPTAINCY API] Error creating signing authority:', signingAuthorityError);
      // Don't fail the approval if signing authority creation fails - log and continue
      // The request is already approved, vessel assignment created, etc.
    } else {
      console.log('[APPROVE CAPTAINCY API] Created signing authority for captain:', captainUserId, 'vessel:', vesselId);
    }

    return NextResponse.json({
      success: true,
      requestId,
      captainUserId,
      vesselId,
    });
  } catch (error: any) {
    console.error('[APPROVE CAPTAINCY API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

