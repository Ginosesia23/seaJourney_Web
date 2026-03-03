import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST: Vessel manager offers to send sea time records to a crew member (from startDate to endDate).
 * Crew will see the offer in Inbox and can accept or reject.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { crewUserId, startDate, endDate } = body;

    if (!crewUserId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: crewUserId, startDate, endDate' },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', user.id)
      .single();

    if (vesselUserError || !vesselUser?.active_vessel_id) {
      return NextResponse.json(
        { error: 'You must have an active vessel to offer sea time' },
        { status: 400 }
      );
    }

    const vesselId = vesselUser.active_vessel_id;

    const { data: assignment } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id')
      .eq('user_id', crewUserId)
      .eq('vessel_id', vesselId)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: 'This crew member is not assigned to your vessel' },
        { status: 400 }
      );
    }

    const { data: existingOffer } = await supabaseAdmin
      .from('vessel_sea_time_offers')
      .select('id, status')
      .eq('vessel_user_id', user.id)
      .eq('crew_user_id', crewUserId)
      .eq('vessel_id', vesselId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingOffer) {
      return NextResponse.json(
        { error: 'A pending offer already exists for this crew member. They can accept or reject it in their Inbox.' },
        { status: 400 }
      );
    }

    const { data: offer, error: createError } = await supabaseAdmin
      .from('vessel_sea_time_offers')
      .insert({
        vessel_user_id: user.id,
        crew_user_id: crewUserId,
        vessel_id: vesselId,
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
      })
      .select()
      .single();

    if (createError) {
      console.error('[VESSEL SEA TIME OFFER] Create error:', createError);
      const isMissingTable = createError.message?.includes('does not exist') || createError.code === '42P01';
      return NextResponse.json(
        {
          error: isMissingTable
            ? 'The vessel_sea_time_offers table has not been created. Run the migration: sql/create-vessel-sea-time-offers-table.sql'
            : 'Failed to create offer',
          details: createError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, offer });
  } catch (error: any) {
    console.error('[VESSEL SEA TIME OFFER] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
