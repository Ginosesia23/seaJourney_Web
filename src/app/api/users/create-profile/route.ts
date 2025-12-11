import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * API route to create user profile
 * Uses admin client to bypass RLS policies
 * Called from signup page when user is created
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, username } = body;

    console.log('[CREATE PROFILE API] Request received:', { userId, email, username });

    if (!userId || !email) {
      console.error('[CREATE PROFILE API] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: userId and email' },
        { status: 400 }
      );
    }

    console.log('[CREATE PROFILE API] Creating profile for user:', { userId, email, username });
    console.log('[CREATE PROFILE API] Admin client configured:', !!supabaseAdmin);
    console.log('[CREATE PROFILE API] Using service role key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('[CREATE PROFILE API] Error checking for existing user:', checkError);
    }

    if (existingUser) {
      console.log('[CREATE PROFILE API] User profile already exists');
      return NextResponse.json({ success: true, message: 'Profile already exists' });
    }

    // Create user profile using admin client (bypasses RLS)
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        email: email,
        username: username || `user_${userId.slice(0, 8)}`,
        first_name: '',
        last_name: '',
        registration_date: new Date().toISOString(),
        role: 'crew',
        subscription_tier: 'free',
        subscription_status: 'inactive',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CREATE PROFILE API] Error creating profile:', insertError);
      console.error('[CREATE PROFILE API] Insert error details:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      });
      return NextResponse.json(
        { 
          error: 'Failed to create user profile', 
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
        },
        { status: 500 }
      );
    }

    console.log('[CREATE PROFILE API] User profile created successfully:', newUser?.id);
    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    console.error('[CREATE PROFILE API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
