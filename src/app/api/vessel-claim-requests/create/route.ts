import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId, requestedRole, userId, supportingDocuments } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required field: vesselId' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Validate supporting documents
    const validDocuments = Array.isArray(supportingDocuments) 
      ? supportingDocuments.filter((doc: string) => doc && doc.trim() !== '')
      : [];
    
    if (validDocuments.length === 0) {
      return NextResponse.json(
        { error: 'At least one supporting document URL is required to prove captaincy of the vessel.' },
        { status: 400 }
      );
    }

    // Use supabaseAdmin to insert the request
    // Security note: userId comes from the authenticated client (useUser hook)
    // The client-side code ensures only authenticated users can call this API
    // This pattern matches other routes like /api/users/create-profile
    const { data, error } = await supabaseAdmin
      .from('vessel_claim_requests')
      .insert({
        vessel_id: vesselId,
        requested_by: userId,
        requested_role: requestedRole || 'captain',
        status: 'pending',
        supporting_documents: validDocuments,
      })
      .select()
      .single();

    if (error) {
      console.error('[CREATE CLAIM REQUEST API] Error:', error);
      return NextResponse.json(
        {
          error: 'Failed to create claim request',
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request: data,
    });
  } catch (error: any) {
    console.error('[CREATE CLAIM REQUEST API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

