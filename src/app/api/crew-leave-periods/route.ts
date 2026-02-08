import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET: Fetch leave periods for a crew member
 * Query params: crewUserId, vesselId
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const crewUserId = searchParams.get('crewUserId');
    const vesselId = searchParams.get('vesselId');

    if (!crewUserId || !vesselId) {
      return NextResponse.json(
        { error: 'Missing required query params: crewUserId, vesselId' },
        { status: 400 }
      );
    }

    const { data: leavePeriods, error } = await supabaseAdmin
      .from('crew_leave_periods')
      .select('*')
      .eq('crew_user_id', crewUserId)
      .eq('vessel_id', vesselId)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('[CREW LEAVE PERIODS] Error fetching leave periods:', error);
      return NextResponse.json(
        { error: 'Failed to fetch leave periods', details: error.message },
        { status: 500 }
      );
    }

    // Transform to match TypeScript interface
    const transformed = (leavePeriods || []).map(period => ({
      id: period.id,
      crewUserId: period.crew_user_id,
      vesselId: period.vessel_id,
      vesselUserId: period.vessel_user_id,
      startDate: period.start_date,
      endDate: period.end_date,
      notes: period.notes || null,
      createdAt: period.created_at,
      updatedAt: period.updated_at,
    }));

    return NextResponse.json({ leavePeriods: transformed });
  } catch (error: any) {
    console.error('[CREW LEAVE PERIODS] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST: Create a new leave period
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { crewUserId, vesselId, vesselUserId, startDate, endDate, notes } = body;

    // Validate required fields
    if (!crewUserId || !vesselId || !vesselUserId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: crewUserId, vesselId, vesselUserId, startDate, endDate' },
        { status: 400 }
      );
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Verify vessel manager has access to this vessel
    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select('role, active_vessel_id')
      .eq('id', vesselUserId)
      .single();

    if (vesselUserError || !vesselUser) {
      return NextResponse.json(
        { error: 'Vessel user not found' },
        { status: 404 }
      );
    }

    if (vesselUser.role !== 'vessel' || vesselUser.active_vessel_id !== vesselId) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only log leave periods for crew on your active vessel' },
        { status: 403 }
      );
    }

    // Insert leave period
    const { data: newPeriod, error: insertError } = await supabaseAdmin
      .from('crew_leave_periods')
      .insert({
        crew_user_id: crewUserId,
        vessel_id: vesselId,
        vessel_user_id: vesselUserId,
        start_date: startDate,
        end_date: endDate,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CREW LEAVE PERIODS] Error creating leave period:', insertError);
      return NextResponse.json(
        { error: 'Failed to create leave period', details: insertError.message },
        { status: 500 }
      );
    }

    // Transform response
    const transformed = {
      id: newPeriod.id,
      crewUserId: newPeriod.crew_user_id,
      vesselId: newPeriod.vessel_id,
      vesselUserId: newPeriod.vessel_user_id,
      startDate: newPeriod.start_date,
      endDate: newPeriod.end_date,
      notes: newPeriod.notes || null,
      createdAt: newPeriod.created_at,
      updatedAt: newPeriod.updated_at,
    };

    return NextResponse.json({ leavePeriod: transformed }, { status: 201 });
  } catch (error: any) {
    console.error('[CREW LEAVE PERIODS] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
