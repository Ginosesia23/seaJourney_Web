import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { format } from 'date-fns';

/**
 * PATCH: Update a crew member’s profile details (same fields as “Crew details” on the profile).
 * Caller must be a vessel manager; crewUserId must be assigned to the vessel manager's active vessel.
 * Body: { crewUserId, title?, dateOfBirth?, sex?, placeOfBirth?, countryOfBirth?, nationality?,
 *         telephone?, mobile?, addressLine1?, addressLine2?, addressDistrict?, addressTownCity?,
 *         addressCountyState?, addressPostCode?, addressCountry? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const accessToken = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { crewUserId, ...mcaFields } = body;

    if (!crewUserId || typeof crewUserId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid crewUserId' },
        { status: 400 }
      );
    }

    // Requester must be vessel role with active vessel
    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', user.id)
      .single();

    if (vesselUserError || !vesselUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (vesselUser.role !== 'vessel' || !vesselUser.active_vessel_id) {
      return NextResponse.json(
        { error: 'Only vessel managers can update crew details' },
        { status: 403 }
      );
    }

    // Crew must be assigned to this vessel (any assignment, active or past)
    const { data: assignment, error: assignError } = await supabaseAdmin
      .from('vessel_assignments')
      .select('id')
      .eq('vessel_id', vesselUser.active_vessel_id)
      .eq('user_id', crewUserId)
      .limit(1)
      .maybeSingle();

    if (assignError || !assignment) {
      return NextResponse.json(
        { error: 'Crew member is not assigned to your vessel' },
        { status: 403 }
      );
    }

    const dateOfBirth = mcaFields.dateOfBirth;
    const updatePayload: Record<string, unknown> = {};

    const setIfPresent = (key: string, column: string) => {
      if (!(key in mcaFields)) return;
      const raw = mcaFields[key];
      updatePayload[column] = raw === '' || raw == null ? null : raw;
    };

    setIfPresent('title', 'title');
    if ('dateOfBirth' in mcaFields) {
      updatePayload.date_of_birth = dateOfBirth
        ? typeof dateOfBirth === 'string'
          ? dateOfBirth
          : format(new Date(dateOfBirth), 'yyyy-MM-dd')
        : null;
    }
    setIfPresent('sex', 'sex');
    setIfPresent('placeOfBirth', 'place_of_birth');
    setIfPresent('countryOfBirth', 'country_of_birth');
    setIfPresent('nationality', 'nationality');
    setIfPresent('telephone', 'telephone');
    setIfPresent('mobile', 'mobile');
    setIfPresent('addressLine1', 'address_line1');
    setIfPresent('addressLine2', 'address_line2');
    setIfPresent('addressDistrict', 'address_district');
    setIfPresent('addressTownCity', 'address_town_city');
    setIfPresent('addressCountyState', 'address_county_state');
    setIfPresent('addressPostCode', 'address_post_code');
    setIfPresent('addressCountry', 'address_country');
    setIfPresent('dischargeBookNumber', 'discharge_book_number');
    setIfPresent('firstName', 'first_name');
    setIfPresent('lastName', 'last_name');
    setIfPresent('position', 'position');

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('id', crewUserId)
      .select()
      .single();

    if (updateError) {
      console.error('[CREW-MCA-DETAILS] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update crew details', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: updated });
  } catch (error: any) {
    console.error('[CREW-MCA-DETAILS] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
