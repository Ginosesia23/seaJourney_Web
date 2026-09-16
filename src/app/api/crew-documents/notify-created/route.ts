import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendCrewDocumentCreatedEmail,
  type CrewDocumentKind,
} from '@/lib/notification-emails';

const DOCUMENT_KINDS: CrewDocumentKind[] = [
  'certificate',
  'testimonial',
  'nav_watch',
  'proof_of_service',
  'application',
];

/**
 * Email a crew member when a vessel manager uploads or generates a document
 * on their behalf. Fire-and-forget from the client after a successful create.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (
      !body ||
      typeof body.crewUserId !== 'string' ||
      typeof body.documentKind !== 'string' ||
      !DOCUMENT_KINDS.includes(body.documentKind) ||
      typeof body.documentLabel !== 'string' ||
      !body.documentLabel.trim()
    ) {
      return NextResponse.json(
        {
          error:
            'Missing or invalid body: crewUserId, documentKind, and documentLabel required',
        },
        { status: 400 },
      );
    }

    const {
      crewUserId,
      documentKind,
      documentLabel,
      vesselId,
    } = body as {
      crewUserId: string;
      documentKind: CrewDocumentKind;
      documentLabel: string;
      vesselId?: string | null;
    };

    if (crewUserId === user.id) {
      return NextResponse.json({ success: true, skipped: 'self' });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id, first_name, last_name, email')
      .eq('id', user.id)
      .maybeSingle();

    const role = (callerProfile as { role?: string } | null)?.role;
    const isAdmin = role === 'admin';
    const isVessel = role === 'vessel';
    if (!isAdmin && !isVessel) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const activeVesselId =
      (callerProfile as { active_vessel_id?: string | null } | null)
        ?.active_vessel_id ?? null;
    const resolvedVesselId = vesselId || activeVesselId;
    if (isVessel && vesselId && activeVesselId && vesselId !== activeVesselId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [{ data: crewProfile }, { data: vessel }] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('email, first_name')
        .eq('id', crewUserId)
        .maybeSingle(),
      resolvedVesselId
        ? supabaseAdmin
            .from('vessels')
            .select('name')
            .eq('id', resolvedVesselId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const crewEmail = (crewProfile as { email?: string } | null)?.email;
    if (!crewEmail) {
      return NextResponse.json({ success: true, skipped: 'crew_has_no_email' });
    }

    const first =
      (callerProfile as { first_name?: string | null } | null)?.first_name?.trim() ||
      '';
    const last =
      (callerProfile as { last_name?: string | null } | null)?.last_name?.trim() ||
      '';
    const generatedByName =
      [first, last].filter(Boolean).join(' ') ||
      (callerProfile as { email?: string | null } | null)?.email ||
      'Vessel Manager';

    const result = await sendCrewDocumentCreatedEmail({
      to: crewEmail,
      recipientFirstName:
        (crewProfile as { first_name?: string | null } | null)?.first_name ?? null,
      vesselName: (vessel as { name?: string } | null)?.name || 'your vessel',
      generatedByName,
      documentKind,
      documentLabel: documentLabel.trim(),
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[NOTIFY CREW DOCUMENT] Unexpected error:', e);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
