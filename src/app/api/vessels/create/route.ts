import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, officialNumber, isOfficial } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: name and type' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // First, check if vessel with this name already exists
    const { data: existingVessel, error: searchError } = await supabaseAdmin
      .from('vessels')
      .select('id, name, type, imo, is_official')
      .ilike('name', trimmedName) // Case-insensitive match
      .maybeSingle();

    if (searchError) {
      console.error('[CREATE VESSEL API] Search error:', searchError);
      return NextResponse.json(
        {
          error: 'Failed to check for existing vessel',
          message: searchError.message,
        },
        { status: 500 }
      );
    }

    // If vessel already exists, update is_official if vessel role user is taking control
    if (existingVessel) {
      if (isOfficial === true) {
        // Vessel role user is taking control - update is_official to true
        const { data: updatedVessel, error: updateError } = await supabaseAdmin
          .from('vessels')
          .update({ is_official: true })
          .eq('id', existingVessel.id)
          .select()
          .single();

        if (updateError) {
          console.error('[CREATE VESSEL API] Error updating is_official:', updateError);
        } else {
          console.log('[CREATE VESSEL API] Updated is_official to true for vessel:', existingVessel.id);
        }
      }

      // Fetch the latest vessel data (in case is_official was updated)
      const { data: finalVessel } = await supabaseAdmin
        .from('vessels')
        .select('id, name, type, imo, is_official')
        .eq('id', existingVessel.id)
        .single();

      return NextResponse.json({
        success: true,
        vessel: {
          id: finalVessel?.id || existingVessel.id,
          name: finalVessel?.name || existingVessel.name,
          type: finalVessel?.type || existingVessel.type,
          officialNumber: finalVessel?.imo || existingVessel.imo,
        },
        alreadyExists: true,
        isOfficial: finalVessel?.is_official || false,
      });
    }

    // Vessel doesn't exist, create it
    const isOfficialValue = isOfficial === true; // Explicitly convert to boolean
    console.log('[CREATE VESSEL API] Creating new vessel with is_official:', isOfficialValue, 'isOfficial param:', isOfficial);
    
    const insertData: any = {
      name: trimmedName,
      type: type,
      imo: officialNumber?.trim() || null,
    };
    
    // Only set is_official if the column exists and we have a value
    if (isOfficialValue !== undefined) {
      insertData.is_official = isOfficialValue;
    }
    
    const { data: newVessel, error: insertError } = await supabaseAdmin
      .from('vessels')
      .insert(insertData)
      .select('id, name, type, imo, is_official')
      .single();

    if (insertError) {
      console.error('[CREATE VESSEL API] Insert error:', insertError);
      console.error('[CREATE VESSEL API] Insert data was:', insertData);
      return NextResponse.json(
        {
          error: 'Failed to create vessel',
          message: insertError.message,
        },
        { status: 500 }
      );
    }

    console.log('[CREATE VESSEL API] Created vessel with is_official:', newVessel?.is_official);

    return NextResponse.json({
      success: true,
      vessel: {
        id: newVessel.id,
        name: newVessel.name,
        type: newVessel.type,
        officialNumber: newVessel.imo,
      },
      alreadyExists: false,
      isOfficial: newVessel.is_official,
    });
  } catch (error: any) {
    console.error('[CREATE VESSEL API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

