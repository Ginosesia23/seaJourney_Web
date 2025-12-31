import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testimonialId } = body;

    if (!testimonialId) {
      return NextResponse.json(
        { error: 'Missing required field: testimonialId' },
        { status: 400 }
      );
    }

    // Fetch the testimonial to verify it's approved
    // Explicitly select only the columns we need to avoid issues with non-existent columns
    const { data: testimonial, error: testimonialError } = await supabaseAdmin
      .from('testimonials')
      .select('id, user_id, vessel_id, start_date, end_date, total_days, at_sea_days, standby_days, yard_days, leave_days, status, testimonial_code, captain_name, captain_email, captain_position, captain_user_id, updated_at')
      .eq('id', testimonialId)
      .maybeSingle();

    if (testimonialError) {
      console.error('[SNAPSHOT API] Error fetching testimonial:', testimonialError);
      return NextResponse.json(
        { error: 'Failed to fetch testimonial', details: testimonialError.message },
        { status: 500 }
      );
    }

    if (!testimonial) {
      return NextResponse.json(
        { error: 'Testimonial not found' },
        { status: 404 }
      );
    }

    // Verify testimonial is approved and get the testimonial_code
    // Note: There might be a slight delay between updating the testimonial and the code being generated
    // So we'll retry a few times if needed
    let currentStatus = testimonial.status;
    let currentTestimonialCode = testimonial.testimonial_code;
    let retries = 0;
    const maxRetries = 10; // Increased retries to wait for code generation
    
    while ((currentStatus !== 'approved' || !currentTestimonialCode) && retries < maxRetries) {
      if (retries > 0) {
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 200 * retries));
      }
      
      const { data: recheckTestimonial, error: recheckError } = await supabaseAdmin
        .from('testimonials')
        .select('status, testimonial_code')
        .eq('id', testimonialId)
        .maybeSingle();
      
      if (recheckError) {
        console.error('[SNAPSHOT API] Error rechecking testimonial:', recheckError);
        break;
      }
      
      if (recheckTestimonial) {
        currentStatus = recheckTestimonial.status;
        currentTestimonialCode = recheckTestimonial.testimonial_code;
        if (currentStatus === 'approved' && currentTestimonialCode) {
          // Update testimonial object with latest data
          testimonial.status = currentStatus;
          testimonial.testimonial_code = currentTestimonialCode;
          break;
        }
      }
      
      retries++;
    }
    
    if (currentStatus !== 'approved') {
      console.error('[SNAPSHOT API] Testimonial not approved after retries:', {
        testimonialId,
        initialStatus: testimonial.status,
        finalStatus: currentStatus,
        retries,
      });
      return NextResponse.json(
        { 
          error: 'Testimonial is not approved', 
          initialStatus: testimonial.status,
          finalStatus: currentStatus,
          testimonialId,
          message: `Testimonial status is '${currentStatus}', expected 'approved'. Please ensure the testimonial has been approved before creating a snapshot.`,
        },
        { status: 400 }
      );
    }

    if (!currentTestimonialCode) {
      console.warn('[SNAPSHOT API] Testimonial code not generated after retries:', {
        testimonialId,
        retries,
        status: currentStatus,
      });
      // Don't fail - we'll save NULL and it can be updated later if needed
    }

    // Check if snapshot already exists
    const { data: existingSnapshot } = await supabaseAdmin
      .from('approved_testimonials')
      .select('id')
      .eq('testimonial_id', testimonialId)
      .maybeSingle();

    if (existingSnapshot) {
      console.log('[SNAPSHOT API] Snapshot already exists for testimonial:', testimonialId);
      return NextResponse.json({
        success: true,
        message: 'Snapshot already exists',
        snapshot: existingSnapshot,
      });
    }

    // Fetch crew member profile
    const { data: crewProfile, error: crewError } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name, position')
      .eq('id', testimonial.user_id)
      .maybeSingle();

    if (crewError) {
      console.error('[SNAPSHOT API] Error fetching crew profile:', crewError);
    }

    // Fetch vessel information
    const { data: vesselData, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('name, imo')
      .eq('id', testimonial.vessel_id)
      .maybeSingle();

    if (vesselError) {
      console.error('[SNAPSHOT API] Error fetching vessel:', vesselError);
    }

    // Get captain name and position
    const captainName = testimonial.captain_name || 'Unknown';
    const captainPosition = testimonial.captain_position || null;
    const captainLicense = captainPosition || null;

    // Prepare snapshot data
    const crewName = crewProfile 
      ? `${crewProfile.first_name || ''} ${crewProfile.last_name || ''}`.trim() || 'Unknown'
      : 'Unknown';
    const rank = crewProfile?.position || 'Unknown';
    const vesselName = vesselData?.name || 'Unknown';
    const imo = vesselData?.imo || null;

    const snapshotData = {
      testimonial_id: testimonial.id,
      crew_name: crewName,
      rank: rank,
      vessel_name: vesselName,
      imo: imo,
      start_date: testimonial.start_date,
      end_date: testimonial.end_date,
      total_days: testimonial.total_days,
      sea_days: testimonial.at_sea_days,
      standby_days: testimonial.standby_days,
      captain_name: captainName,
      captain_license: captainLicense,
      document_id: testimonial.id, // The UUID used as Document ID
      testimonial_code: currentTestimonialCode || testimonial.testimonial_code || null, // Use the fetched code
      approved_at: testimonial.updated_at || new Date().toISOString(),
    };

    console.log('[SNAPSHOT API] Creating snapshot with code:', {
      testimonial_code: snapshotData.testimonial_code,
      testimonial_id: snapshotData.testimonial_id,
    });

    console.log('[SNAPSHOT API] Inserting snapshot:', {
      testimonial_id: snapshotData.testimonial_id,
      crew_name: snapshotData.crew_name,
      vessel_name: snapshotData.vessel_name,
    });

    // Insert snapshot into approved_testimonials
    const { data: insertedData, error: snapshotError } = await supabaseAdmin
      .from('approved_testimonials')
      .insert(snapshotData)
      .select()
      .single();

    if (snapshotError) {
      console.error('[SNAPSHOT API] Error creating snapshot:', {
        error: snapshotError,
        message: snapshotError.message,
        code: snapshotError.code,
        details: snapshotError.details,
        hint: snapshotError.hint,
        snapshotData,
      });
      return NextResponse.json(
        {
          error: 'Failed to create snapshot',
          message: snapshotError.message,
          code: snapshotError.code,
          details: snapshotError.details,
          hint: snapshotError.hint,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      snapshot: insertedData,
    });
  } catch (error: any) {
    console.error('[SNAPSHOT API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}

