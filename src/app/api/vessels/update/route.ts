import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId, updates } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required field: vesselId' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid updates object' },
        { status: 400 }
      );
    }

    // Build update object with only allowed fields
    const updateData: any = {};
    
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.imo !== undefined) updateData.imo = updates.imo?.trim() || null;
    if (updates.length_m !== undefined) updateData.length_m = updates.length_m ? parseFloat(updates.length_m) : null;
    if (updates.beam !== undefined) updateData.beam = updates.beam ? parseFloat(updates.beam) : null;
    if (updates.draft !== undefined) updateData.draft = updates.draft ? parseFloat(updates.draft) : null;
    if (updates.gross_tonnage !== undefined) updateData.gross_tonnage = updates.gross_tonnage ? parseFloat(updates.gross_tonnage) : null;
    if (updates.number_of_crew !== undefined) updateData.number_of_crew = updates.number_of_crew ? parseInt(updates.number_of_crew) : null;
    if (updates.build_year !== undefined) updateData.build_year = updates.build_year ? parseInt(updates.build_year) : null;
    if (updates.flag_state !== undefined) updateData.flag_state = updates.flag_state?.trim() || null;
    if (updates.call_sign !== undefined) updateData.call_sign = updates.call_sign?.trim() || null;
    if (updates.mmsi !== undefined) updateData.mmsi = updates.mmsi?.trim() || null;
    if (updates.description !== undefined) updateData.description = updates.description?.trim() || null;
    if (updates.vessel_manager_id !== undefined) updateData.vessel_manager_id = updates.vessel_manager_id || null;
    if (updates.management_company !== undefined) updateData.management_company = updates.management_company?.trim() || null;
    if (updates.company_address !== undefined) updateData.company_address = updates.company_address?.trim() || null;
    if (updates.company_contact !== undefined) updateData.company_contact = updates.company_contact?.trim() || null;

    console.log('[UPDATE VESSEL API] Updating vessel:', vesselId);
    console.log('[UPDATE VESSEL API] Update data:', JSON.stringify(updateData, null, 2));

    // Update the vessel
    const { data, error } = await supabaseAdmin
      .from('vessels')
      .update(updateData)
      .eq('id', vesselId)
      .select()
      .single();

    if (error) {
      console.error('[UPDATE VESSEL API] Error:', error);
      console.error('[UPDATE VESSEL API] Error details:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        {
          error: 'Failed to update vessel',
          message: error.message,
          details: error.details || error.hint || null,
        },
        { status: 500 }
      );
    }

    console.log('[UPDATE VESSEL API] Success. Updated vessel:', JSON.stringify(data, null, 2));

    return NextResponse.json({
      success: true,
      vessel: data,
    });
  } catch (error: any) {
    console.error('[UPDATE VESSEL API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
