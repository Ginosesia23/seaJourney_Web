import { NextRequest, NextResponse } from 'next/server';
import {
  assertVesselIdentifierUpdateAllowed,
  normalizeImo,
  normalizeMmsi,
} from '@/lib/vessels/find-existing-vessel';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselId, updates } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required field: vesselId' },
        { status: 400 },
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'Missing or invalid updates object' },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.imo !== undefined) updateData.imo = normalizeImo(updates.imo);
    if (updates.length_m !== undefined) {
      updateData.length_m = updates.length_m ? parseFloat(updates.length_m) : null;
    }
    if (updates.beam !== undefined) {
      updateData.beam = updates.beam ? parseFloat(updates.beam) : null;
    }
    if (updates.draft !== undefined) {
      updateData.draft = updates.draft ? parseFloat(updates.draft) : null;
    }
    if (updates.gross_tonnage !== undefined) {
      updateData.gross_tonnage = updates.gross_tonnage
        ? parseFloat(updates.gross_tonnage)
        : null;
    }
    if (updates.number_of_crew !== undefined) {
      updateData.number_of_crew = updates.number_of_crew
        ? parseInt(updates.number_of_crew, 10)
        : null;
    }
    if (updates.build_year !== undefined) {
      updateData.build_year = updates.build_year
        ? parseInt(updates.build_year, 10)
        : null;
    }
    if (updates.flag !== undefined) updateData.flag = updates.flag?.trim() || null;
    if (updates.flag_state !== undefined && updates.flag === undefined) {
      updateData.flag = updates.flag_state?.trim() || null;
    }
    if (updates.call_sign !== undefined) {
      updateData.call_sign = updates.call_sign?.trim() || null;
    }
    if (updates.mmsi !== undefined) updateData.mmsi = normalizeMmsi(updates.mmsi);
    if (updates.description !== undefined) {
      updateData.description = updates.description?.trim() || null;
    }
    if (updates.vessel_manager_id !== undefined) {
      updateData.vessel_manager_id = updates.vessel_manager_id || null;
    }
    if (updates.management_company !== undefined) {
      updateData.management_company = updates.management_company?.trim() || null;
    }
    if (updates.company_address !== undefined) {
      updateData.company_address = updates.company_address?.trim() || null;
    }
    if (updates.company_contact !== undefined) {
      updateData.company_contact = updates.company_contact?.trim() || null;
    }
    if (updates.stamp !== undefined) {
      const stampValue = updates.stamp;
      if (stampValue === null || stampValue === '') {
        updateData.stamp = null;
      } else if (typeof stampValue === 'string' && stampValue.startsWith('data:image/')) {
        updateData.stamp = stampValue;
      } else {
        return NextResponse.json(
          {
            error:
              'Invalid stamp value. Expected an image data URL (data:image/...) or null.',
          },
          { status: 400 },
        );
      }
    }

    if (updateData.mmsi !== undefined || updateData.imo !== undefined) {
      const idCheck = await assertVesselIdentifierUpdateAllowed(
        supabaseAdmin,
        vesselId,
        {
          mmsi: updateData.mmsi as string | null | undefined,
          imo: updateData.imo as string | null | undefined,
        },
      );
      if (!idCheck.ok) {
        return NextResponse.json(
          { error: idCheck.error },
          { status: idCheck.status },
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from('vessels')
      .update(updateData)
      .eq('id', vesselId)
      .select(
        'id, name, type, imo, mmsi, flag, length_m, beam, draft, gross_tonnage, build_year, call_sign, description, vessel_manager_id, management_company, company_address, company_contact, is_official, ais_tracking_enabled',
      )
      .single();

    if (error) {
      console.error('[UPDATE VESSEL API] Error:', error);
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json(
        {
          error:
            status === 409
              ? 'MMSI or IMO already belongs to another vessel'
              : 'Failed to update vessel',
          message: error.message,
          details: error.details || error.hint || null,
        },
        { status },
      );
    }

    // Do not return stamp (large private blob) in the default response.
    return NextResponse.json({
      success: true,
      vessel: data,
    });
  } catch (error: unknown) {
    console.error('[UPDATE VESSEL API] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
