import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, username, firstName, lastName, position, role } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and email' },
        { status: 400 }
      );
    }

    if (!position || position.trim() === '') {
      return NextResponse.json({ error: 'Position is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc('create_user_and_profile', {
      p_user_id: userId,
      p_email: email,
      p_username: username ?? null,
      p_first_name: firstName ?? null,
      p_last_name: lastName ?? null,
      p_position: position,
      p_role: role ?? 'crew',
    });

    if (error) {
      console.error('[CREATE PROFILE API] RPC error message:', error.message);
      console.error('[CREATE PROFILE API] RPC error details:', {
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    
      return NextResponse.json(
        {
          error: 'Failed to create user + profile',
          message: error.message,
          code: (error as any).code ?? null,
          details: (error as any).details ?? null,
          hint: (error as any).hint ?? null,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[CREATE PROFILE API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
