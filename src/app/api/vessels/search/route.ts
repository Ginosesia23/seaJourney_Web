import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { searchTerm } = body;

    if (!searchTerm || searchTerm.trim().length < 2) {
      return NextResponse.json({
        success: true,
        vessels: [],
      });
    }

    // Search for vessels by name (case-insensitive)
    const { data, error } = await supabaseAdmin
      .from('vessels')
      .select('id, name, type, imo')
      .ilike('name', `%${searchTerm.trim()}%`)
      .limit(10)
      .order('name', { ascending: true });

    if (error) {
      console.error('[SEARCH VESSELS API] Error:', error);
      return NextResponse.json(
        {
          error: 'Failed to search vessels',
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      vessels: (data || []).map((v) => ({
        id: v.id,
        name: v.name,
        type: v.type,
        officialNumber: v.imo,
      })),
    });
  } catch (error: any) {
    console.error('[SEARCH VESSELS API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

