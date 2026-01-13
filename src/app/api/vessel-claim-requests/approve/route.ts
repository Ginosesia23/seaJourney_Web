import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, reviewedBy, approvalType } = body; // approvalType: 'vessel' | 'admin'

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

    if (!approvalType || !['vessel', 'admin'].includes(approvalType)) {
      return NextResponse.json(
        { error: 'Missing or invalid approvalType. Must be "vessel" or "admin"' },
        { status: 400 }
      );
    }

    // 1. First, fetch the request to get captain and vessel IDs
    const { data: claimRequest, error: fetchError } = await supabaseAdmin
      .from('vessel_claim_requests')
      .select('id, vessel_id, requested_by, status, vessel_approved_by, admin_approved_by')
      .eq('id', requestId)
      .single();

    if (fetchError || !claimRequest) {
      console.error('[APPROVE CAPTAINCY API] Error fetching request:', fetchError);
      return NextResponse.json(
        { error: 'Request not found', message: fetchError?.message },
        { status: 404 }
      );
    }

    // Check if already fully approved or rejected
    if (claimRequest.status === 'approved') {
      return NextResponse.json(
        { error: 'Request is already fully approved' },
        { status: 400 }
      );
    }

    if (claimRequest.status === 'rejected') {
      return NextResponse.json(
        { error: 'Request has been rejected and cannot be approved' },
        { status: 400 }
      );
    }

    // Check if this approval type has already been given
    if (approvalType === 'vessel' && claimRequest.vessel_approved_by) {
      return NextResponse.json(
        { error: 'Vessel approval has already been given' },
        { status: 400 }
      );
    }

    if (approvalType === 'admin' && claimRequest.admin_approved_by) {
      return NextResponse.json(
        { error: 'Admin approval has already been given' },
        { status: 400 }
      );
    }

    const captainUserId = claimRequest.requested_by;
    const vesselId = claimRequest.vessel_id;

    // 2. Check captain limit (max 2 captains per vessel) - only check when fully approving
    // We'll check this when the second approval comes in
    const currentStatus = claimRequest.status;
    const willBeFullyApproved = 
      (approvalType === 'vessel' && claimRequest.admin_approved_by) ||
      (approvalType === 'admin' && claimRequest.vessel_approved_by);

    if (willBeFullyApproved) {
      // Check current count of approved captains for this vessel
      const { data: approvedCaptains, error: countError } = await supabaseAdmin
        .from('vessel_claim_requests')
        .select('id')
        .eq('vessel_id', vesselId)
        .eq('status', 'approved');

      if (countError) {
        console.error('[APPROVE CAPTAINCY API] Error counting approved captains:', countError);
        return NextResponse.json(
          { error: 'Failed to check captain limit', message: countError.message },
          { status: 500 }
        );
      }

      const currentCaptainCount = approvedCaptains?.length || 0;
      if (currentCaptainCount >= 2) {
        return NextResponse.json(
          { 
            error: 'Maximum captain limit reached', 
            message: 'This vessel already has 2 approved captains. Maximum of 2 captains allowed per vessel for rotational partners.' 
          },
          { status: 400 }
        );
      }
    }

    // 3. Determine new status based on approval type
    let newStatus: string;
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (approvalType === 'vessel') {
      updateData.vessel_approved_by = reviewedBy;
      updateData.vessel_approved_at = new Date().toISOString();
      
      if (claimRequest.admin_approved_by) {
        // Both approvals now complete
        newStatus = 'approved';
      } else {
        // Only vessel approved so far
        newStatus = 'vessel_approved';
      }
    } else {
      // approvalType === 'admin'
      updateData.admin_approved_by = reviewedBy;
      updateData.admin_approved_at = new Date().toISOString();
      
      if (claimRequest.vessel_approved_by) {
        // Both approvals now complete
        newStatus = 'approved';
      } else {
        // Only admin approved so far
        newStatus = 'admin_approved';
      }
    }

    // Validate status before updating
    const validStatuses = ['pending', 'vessel_approved', 'admin_approved', 'approved', 'rejected'];
    if (!validStatuses.includes(newStatus)) {
      console.error('[APPROVE CAPTAINCY API] Invalid status value:', newStatus);
      return NextResponse.json(
        { error: 'Invalid status value', message: `Status must be one of: ${validStatuses.join(', ')}` },
        { status: 500 }
      );
    }

    updateData.status = newStatus;

    // 4. Update the request status
    const { error: updateRequestError } = await supabaseAdmin
      .from('vessel_claim_requests')
      .update(updateData)
      .eq('id', requestId);

    if (updateRequestError) {
      console.error('[APPROVE CAPTAINCY API] Error updating request:', updateRequestError);
      return NextResponse.json(
        { error: 'Failed to update request', message: updateRequestError.message },
        { status: 500 }
      );
    }

    // 5. Only create vessel assignment and signing authority if fully approved
    if (newStatus === 'approved') {
      // Get captain's current position (or default to 'Captain')
      const { data: captainProfile } = await supabaseAdmin
        .from('users')
        .select('position')
        .eq('id', captainUserId)
        .maybeSingle();

      const position = captainProfile?.position || 'Captain';

      // End any existing active assignments for the captain
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

      // Check if there's already an active assignment for this vessel
      const { data: existingAssignment } = await supabaseAdmin
        .from('vessel_assignments')
        .select('id')
        .eq('user_id', captainUserId)
        .eq('vessel_id', vesselId)
        .is('end_date', null)
        .maybeSingle();

      // Create vessel assignment if it doesn't exist
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

      // Update vessel's vessel_manager_id if not already set
      const { data: vesselData } = await supabaseAdmin
        .from('vessels')
        .select('vessel_manager_id')
        .eq('id', vesselId)
        .single();
      
      if (vesselData && !vesselData.vessel_manager_id) {
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
        }
      }

      // Update captain's active_vessel_id
      await supabaseAdmin
        .from('users')
        .update({ active_vessel_id: vesselId })
        .eq('id', captainUserId);

      // Handle vessel_signing_authorities table
      // End any existing active primary signing authorities for this vessel
      const { data: existingActivePrimary } = await supabaseAdmin
        .from('vessel_signing_authorities')
        .select('id')
        .eq('vessel_id', vesselId)
        .eq('is_primary', true)
        .is('end_date', null);

      if (existingActivePrimary && existingActivePrimary.length > 0) {
        await supabaseAdmin
          .from('vessel_signing_authorities')
          .update({ end_date: today })
          .eq('vessel_id', vesselId)
          .eq('is_primary', true)
          .is('end_date', null);
      }

      // Insert new signing authority record for the approved captain
      await supabaseAdmin
        .from('vessel_signing_authorities')
        .insert({
          vessel_id: vesselId,
          captain_user_id: captainUserId,
          start_date: today,
          end_date: null,
          is_primary: true,
        });
    }

    return NextResponse.json({
      success: true,
      requestId,
      captainUserId,
      vesselId,
      status: newStatus,
      fullyApproved: newStatus === 'approved',
    });
  } catch (error: any) {
    console.error('[APPROVE CAPTAINCY API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
