import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseAmsaReferenceFromDb } from '@/lib/amsa-sea-service-reference';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const { data: doc, error: docError } = await supabaseAdmin
      .from('vessel_generated_testimonials')
      .select('*')
      .eq('share_token', token)
      .maybeSingle();

    if (docError) {
      console.error('[VESSEL-DOCUMENT VIEW] Error:', docError);
      return NextResponse.json(
        { error: 'Failed to load document' },
        { status: 500 }
      );
    }

    if (!doc) {
      return NextResponse.json(
        { error: 'Invalid or expired link' },
        { status: 404 }
      );
    }

    if (doc.share_token_expires_at) {
      const expiresAt = new Date(doc.share_token_expires_at);
      if (new Date() > expiresAt) {
        return NextResponse.json(
          { error: 'This link has expired' },
          { status: 403 }
        );
      }
    }

    if (doc.share_used_at) {
      return NextResponse.json(
        { error: 'This link has already been used' },
        { status: 403 }
      );
    }

    // Mark as used (one-time link)
    await supabaseAdmin
      .from('vessel_generated_testimonials')
      .update({
        share_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    // Fetch crew profile
    const { data: crewUser, error: crewError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, username, email, date_of_birth, position, discharge_book_number')
      .eq('id', doc.crew_user_id)
      .single();

    if (crewError || !crewUser) {
      return NextResponse.json(
        { error: 'Crew profile not found' },
        { status: 404 }
      );
    }

    // Fetch vessel
    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name, type, official_number, imo, flag_state, length_m, gross_tonnage, call_sign, management_company, company_address, company_contact, stamp')
      .eq('id', doc.vessel_id)
      .single();

    if (vesselError || !vessel) {
      return NextResponse.json(
        { error: 'Vessel not found' },
        { status: 404 }
      );
    }

    const testimonialData = {
      testimonial: {
        id: doc.id,
        start_date: doc.start_date,
        end_date: doc.end_date,
        total_days: doc.total_days,
        at_sea_days: doc.at_sea_days,
        standby_days: doc.standby_days,
        yard_days: doc.yard_days,
        leave_days: doc.leave_days,
        captain_name: doc.generated_by_name || null,
        captain_email: doc.generated_by_email || null,
        captain_position: null,
        captain_signature: null,
        captain_comment_conduct: null,
        captain_comment_ability: null,
        captain_comment_general: null,
        official_body: null,
        official_reference: null,
        notes: doc.notes || null,
        testimonial_code: null,
        status: 'approved' as const,
        signoff_used_at: null,
        approved_at: doc.created_at,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      },
      userProfile: {
        firstName: crewUser.first_name || undefined,
        lastName: crewUser.last_name || undefined,
        username: crewUser.username || '',
        email: crewUser.email || '',
        dateOfBirth: crewUser.date_of_birth || null,
        position: crewUser.position || null,
        dischargeBookNumber: crewUser.discharge_book_number || null,
      },
      vessel: {
        name: vessel.name,
        type: vessel.type || null,
        officialNumber: vessel.official_number || vessel.imo || null,
        flag_state: vessel.flag_state || null,
        length_m: vessel.length_m ?? null,
        gross_tonnage: vessel.gross_tonnage ?? null,
        call_sign: vessel.call_sign || null,
        stamp: vessel.stamp ?? null,
      },
      companyDetails: {
        name: vessel.management_company || null,
        address: vessel.company_address || null,
        contactDetails: vessel.company_contact || null,
      } || null,
      captainProfile: null,
      standbyPeriods: [],
      amsaReference: parseAmsaReferenceFromDb(
        (doc as { amsa_reference_data?: unknown }).amsa_reference_data,
      ),
    };

    return NextResponse.json({
      testimonialData,
      pdfFormat: doc.pdf_format || 'mca',
    });
  } catch (e) {
    console.error('[VESSEL-DOCUMENT VIEW] Error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
