import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST: Create a sea time access request (vessel manager requesting access)
 * PUT: Approve/reject a request (crew member responding)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselUserId, crewUserId, notes } = body;

    if (!vesselUserId || !crewUserId) {
      return NextResponse.json(
        { error: 'Missing required fields: vesselUserId, crewUserId' },
        { status: 400 }
      );
    }

    // Check if request already exists
    const { data: existingRequest } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .select('id, status')
      .eq('vessel_user_id', vesselUserId)
      .eq('crew_user_id', crewUserId)
      .maybeSingle();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json(
          { error: 'A pending request already exists for this crew member' },
          { status: 400 }
        );
      }
      // If approved or rejected, allow creating a new request
    }

    // Fetch vessel information from vessel user's active_vessel_id
    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select('active_vessel_id')
      .eq('id', vesselUserId)
      .single();

    if (vesselUserError || !vesselUser?.active_vessel_id) {
      return NextResponse.json(
        { error: 'Vessel manager does not have an active vessel' },
        { status: 400 }
      );
    }

    // Fetch vessel details
    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name')
      .eq('id', vesselUser.active_vessel_id)
      .single();

    if (vesselError || !vessel) {
      return NextResponse.json(
        { error: 'Vessel not found' },
        { status: 404 }
      );
    }

    // Create the request with vessel information
    const { data: request, error: createError } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .insert({
        vessel_user_id: vesselUserId,
        crew_user_id: crewUserId,
        vessel_id: vessel.id,
        vessel_name: vessel.name,
        status: 'pending',
        notes: notes || null,
      })
      .select()
      .single();

    if (createError) {
      console.error('[VESSEL SEA TIME ACCESS] Error creating request:', createError);
      return NextResponse.json(
        { error: 'Failed to create request', details: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ request });
  } catch (error: any) {
    console.error('[VESSEL SEA TIME ACCESS] Exception creating request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, crewUserId, action, rejectionReason } = body; // action: 'approve' | 'reject'

    if (!requestId || !crewUserId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: requestId, crewUserId, action' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Fetch the request
    const { data: request, error: requestError } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .select('*')
      .eq('id', requestId)
      .eq('crew_user_id', crewUserId) // Ensure the crew member owns this request
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return NextResponse.json(
        { error: 'Request not found or already processed' },
        { status: 404 }
      );
    }

    // Update request status
    const updateData: any = {
      status: action === 'approve' ? 'approved' : 'rejected',
      updated_at: new Date().toISOString(),
    };

    if (action === 'reject' && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      console.error('[VESSEL SEA TIME ACCESS] Error updating request:', updateError);
      return NextResponse.json(
        { error: 'Failed to update request', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('[VESSEL SEA TIME ACCESS] Exception updating request:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
