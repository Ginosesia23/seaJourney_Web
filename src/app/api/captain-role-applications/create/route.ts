import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, supportingDocuments, notes } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Verify user exists and has position="Captain" but role != "captain"
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, position, role')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      console.error('[CAPTAIN ROLE APPLICATION] Error fetching user:', userError);
      return NextResponse.json(
        { error: 'User not found', message: userError?.message },
        { status: 404 }
      );
    }

    // Check if user has position containing "Captain" (case-insensitive)
    const position = (userProfile.position || '').toLowerCase();
    const hasCaptainPosition = position.includes('captain');

    if (!hasCaptainPosition) {
      return NextResponse.json(
        { error: 'Only users with position "Captain" can apply for captain role' },
        { status: 400 }
      );
    }

    // Check if user already has captain role
    if (userProfile.role === 'captain') {
      return NextResponse.json(
        { error: 'User already has captain role' },
        { status: 400 }
      );
    }

    // Check if user already has a pending application
    const { data: existingApplication, error: checkError } = await supabaseAdmin
      .from('captain_role_applications')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (checkError) {
      console.error('[CAPTAIN ROLE APPLICATION] Error checking existing application:', checkError);
      return NextResponse.json(
        { error: 'Failed to check existing application', message: checkError.message },
        { status: 500 }
      );
    }

    if (existingApplication) {
      return NextResponse.json(
        { error: 'You already have a pending application' },
        { status: 400 }
      );
    }

    // Create the application
    const { data: application, error: insertError } = await supabaseAdmin
      .from('captain_role_applications')
      .insert({
        user_id: userId,
        status: 'pending',
        supporting_documents: supportingDocuments || [],
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CAPTAIN ROLE APPLICATION] Error creating application:', insertError);
      return NextResponse.json(
        { error: 'Failed to create application', message: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      application,
    });
  } catch (error: any) {
    console.error('[CAPTAIN ROLE APPLICATION] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
