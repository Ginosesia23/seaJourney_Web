import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parse, startOfDay } from 'date-fns';

function isAssignmentActive(a: { end_date?: string | null }): boolean {
  if (!a.end_date) return true;
  try {
    const day = String(a.end_date).slice(0, 10);
    const end = startOfDay(parse(day, 'yyyy-MM-dd', new Date()));
    if (Number.isNaN(end.getTime())) return true;
    return end > startOfDay(new Date());
  } catch {
    return true;
  }
}

/**
 * GET /api/vessel-crew/list?vesselId=
 * Returns past + present crew for a vessel (bypasses users RLS that
 * historically only exposed active-assignment profiles).
 * Caller must be the vessel manager for that vessel, or an admin.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    let user: { id: string } | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const {
        data: { user: u },
        error,
      } = await supabaseAdmin.auth.getUser(token);
      if (!error && u) user = u;
    }
    if (!user) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      user = session?.user ?? null;
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const vesselId = req.nextUrl.searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json(
        { error: 'Missing required query param: vesselId' },
        { status: 400 },
      );
    }

    const { data: actor, error: actorError } = await supabaseAdmin
      .from('users')
      .select('id, role, active_vessel_id')
      .eq('id', user.id)
      .maybeSingle();

    if (actorError || !actor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const role = String(actor.role || '').toLowerCase();
    const isAdmin = role === 'admin';
    const isVesselManagerForVessel =
      role === 'vessel' && actor.active_vessel_id === vesselId;

    if (!isAdmin && !isVesselManagerForVessel) {
      // Also allow the linked vessel_manager_id on vessels table
      const { data: vessel } = await supabaseAdmin
        .from('vessels')
        .select('id, vessel_manager_id')
        .eq('id', vesselId)
        .maybeSingle();
      if (!vessel || vessel.vessel_manager_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: assignments, error: assignmentsError } = await supabaseAdmin
      .from('vessel_assignments')
      .select('*')
      .eq('vessel_id', vesselId)
      .order('start_date', { ascending: false });

    if (assignmentsError) {
      return NextResponse.json(
        { error: assignmentsError.message || 'Failed to load assignments' },
        { status: 500 },
      );
    }

    const rows = assignments || [];
    if (rows.length === 0) {
      return NextResponse.json({ crew: [] });
    }

    const userIds = Array.from(new Set(rows.map((a) => a.user_id as string)));
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('users')
      .select('*')
      .in('id', userIds);

    if (profilesError) {
      return NextResponse.json(
        { error: profilesError.message || 'Failed to load profiles' },
        { status: 500 },
      );
    }

    const profileMap = new Map(
      (profiles || [])
        .filter((p) => String(p.role || '').toLowerCase() !== 'vessel')
        .map((profile) => [
          profile.id as string,
          {
            id: profile.id as string,
            email: (profile.email as string) || '',
            username: (profile.username as string) || '',
            firstName: (profile.first_name as string) || null,
            lastName: (profile.last_name as string) || null,
            role: (profile.role as string) || 'crew',
            position: (profile.position as string) || null,
            nationality: (profile.nationality as string) || null,
            dischargeBookNumber:
              (profile.discharge_book_number as string) || null,
            dateOfBirth: (profile.date_of_birth as string) || null,
            mobile: (profile.mobile as string) || null,
          },
        ]),
    );

    const byUser = new Map<string, typeof rows>();
    for (const a of rows) {
      const uid = a.user_id as string;
      if (!profileMap.has(uid)) continue;
      const list = byUser.get(uid) ?? [];
      list.push(a);
      byUser.set(uid, list);
    }

    const crew = [];
    for (const [userId, userAssignments] of byUser) {
      const profile = profileMap.get(userId)!;
      const sorted = [...userAssignments].sort((a, b) => {
        const aActive = isAssignmentActive(a);
        const bActive = isAssignmentActive(b);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return String(b.start_date).localeCompare(String(a.start_date));
      });
      const assignment = sorted[0]!;
      const isActive = isAssignmentActive(assignment);
      const positionLabel = String(
        assignment.position || profile.position || '',
      ).trim();

      crew.push({
        profile,
        assignment: {
          id: assignment.id as string,
          userId: assignment.user_id as string,
          vesselId: assignment.vessel_id as string,
          startDate: assignment.start_date as string,
          endDate: (assignment.end_date as string) || null,
          position: (assignment.position as string) || null,
          assignmentRole: (assignment.assignment_role as string) || null,
          onboard: Boolean(assignment.onboard),
          createdAt: assignment.created_at as string | undefined,
          updatedAt: assignment.updated_at as string | undefined,
        },
        isActive,
        positionLabel,
      });
    }

    crew.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const an = [a.profile.firstName, a.profile.lastName]
        .filter(Boolean)
        .join(' ');
      const bn = [b.profile.firstName, b.profile.lastName]
        .filter(Boolean)
        .join(' ');
      return an.localeCompare(bn);
    });

    return NextResponse.json({ crew });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[vessel-crew/list]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
