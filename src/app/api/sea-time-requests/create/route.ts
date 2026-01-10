import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { crewUserId, vesselId, startDate, endDate } = body;

    // Validation
    if (!crewUserId || !vesselId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: crewUserId, vesselId, startDate, endDate' },
        { status: 400 }
      );
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Check if crew user has an assignment for this vessel
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id, start_date, end_date')
      .eq('user_id', crewUserId)
      .eq('vessel_id', vesselId)
      .maybeSingle();

    if (assignmentError) {
      console.error('[SEA TIME REQUEST] Error checking assignment:', assignmentError);
      return NextResponse.json(
        { error: 'Failed to verify vessel assignment' },
        { status: 500 }
      );
    }

    if (!assignment) {
      return NextResponse.json(
        { error: 'You must be assigned to this vessel to request sea time' },
        { status: 400 }
      );
    }

    // Check if request date range overlaps with assignment
    const assignmentStart = new Date(assignment.start_date);
    const assignmentEnd = assignment.end_date ? new Date(assignment.end_date) : new Date(); // Use today if no end date
    
    if (start < assignmentStart || end > assignmentEnd) {
      return NextResponse.json(
        { error: 'Request date range must be within your vessel assignment period' },
        { status: 400 }
      );
    }

    // Check for existing pending request for this date range
    const { data: existingRequest, error: existingError } = await supabaseAdmin
      .from('sea_time_requests')
      .select('id, status')
      .eq('crew_user_id', crewUserId)
      .eq('vessel_id', vesselId)
      .eq('status', 'pending')
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`)
      .maybeSingle();

    if (existingError) {
      console.error('[SEA TIME REQUEST] Error checking existing request:', existingError);
    }

    if (existingRequest) {
      return NextResponse.json(
        { error: 'You already have a pending request for this date range' },
        { status: 400 }
      );
    }

    // Create the request
    const { data, error } = await supabaseAdmin
      .from('sea_time_requests')
      .insert({
        crew_user_id: crewUserId,
        vessel_id: vesselId,
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('[SEA TIME REQUEST] Error creating request:', error);
      return NextResponse.json(
        { error: 'Failed to create sea time request', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: {
        id: data.id,
        crewUserId: data.crew_user_id,
        vesselId: data.vessel_id,
        startDate: data.start_date,
        endDate: data.end_date,
        status: data.status,
        createdAt: data.created_at,
      },
    });
  } catch (error: any) {
    console.error('[SEA TIME REQUEST] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

