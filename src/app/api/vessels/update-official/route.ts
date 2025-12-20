import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId, isOfficial } = body;

    if (!vesselId || typeof isOfficial !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: vesselId and isOfficial (boolean)' },
        { status: 400 }
      );
    }

    // Update is_official for the vessel
    const { data, error } = await supabaseAdmin
      .from('vessels')
      .update({ is_official: isOfficial })
      .eq('id', vesselId)
      .select('id, name, is_official')
      .single();

    if (error) {
      console.error('[UPDATE VESSEL OFFICIAL API] Error:', error);
      return NextResponse.json(
        {
          error: 'Failed to update vessel is_official',
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      vessel: {
        id: data.id,
        name: data.name,
        is_official: data.is_official,
      },
    });
  } catch (error: any) {
    console.error('[UPDATE VESSEL OFFICIAL API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

