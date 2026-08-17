import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  fetchPostHogAnalytics,
  getPostHogConfigError,
  type MatchedSeaJourneyUser,
  type PostHogAnalytics,
  type PostHogRange,
} from '@/lib/posthog';

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) return user.id;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

async function requireAdmin(req: NextRequest): Promise<
  | { ok: true; actorId: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const actorId = await getAuthedUserId(req);
  if (!actorId) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  const { data: actor, error } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', actorId)
    .single();
  if (error || !actor || actor.role !== 'admin') {
    return { ok: false, status: 403, body: { error: 'Forbidden' } };
  }
  return { ok: true, actorId };
}

function parseRange(value: string | null): PostHogRange {
  if (value === '7d' || value === '90d') return value;
  return '30d';
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function displayName(row: {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return full || row.username || row.email || 'Unknown';
}

function toMatched(row: {
  id: string;
  email?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
}): MatchedSeaJourneyUser {
  return {
    id: row.id,
    name: displayName(row),
    email: row.email || '',
    role: row.role || '',
    username: row.username || '',
  };
}

async function attachMatchedUsers(data: PostHogAnalytics): Promise<PostHogAnalytics> {
  const ids = new Set<string>();
  const emails = new Set<string>();

  const collect = (distinctId?: string, email?: string) => {
    if (distinctId && UUID_RE.test(distinctId)) ids.add(distinctId);
    const e = email?.trim().toLowerCase();
    if (e && e.includes('@')) emails.add(e);
  };

  data.recentEvents.forEach((row) => collect(row.distinctId, row.email));
  data.people.forEach((row) => collect(row.distinctId, row.email));
  data.exceptions.forEach((row) => collect(row.distinctId, row.email));
  data.locatedPeople.forEach((row) => collect(row.distinctId, row.email));

  const byId = new Map<string, MatchedSeaJourneyUser>();
  const byEmail = new Map<string, MatchedSeaJourneyUser>();

  const idList = [...ids];
  const emailList = [...emails];

  const [byIdRes, byEmailRes] = await Promise.all([
    idList.length
      ? supabaseAdmin
          .from('users')
          .select('id, email, username, first_name, last_name, role')
          .in('id', idList)
      : Promise.resolve({ data: [] as never[] }),
    emailList.length
      ? supabaseAdmin
          .from('users')
          .select('id, email, username, first_name, last_name, role')
          .in('email', emailList)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  for (const row of [...(byIdRes.data || []), ...(byEmailRes.data || [])]) {
    const matched = toMatched(row);
    byId.set(matched.id, matched);
    if (matched.email) byEmail.set(matched.email.toLowerCase(), matched);
  }

  const resolve = (distinctId: string, email: string): MatchedSeaJourneyUser | null => {
    if (distinctId && byId.has(distinctId)) return byId.get(distinctId) ?? null;
    const key = email.trim().toLowerCase();
    if (key && byEmail.has(key)) return byEmail.get(key) ?? null;
    return null;
  };

  return {
    ...data,
    recentEvents: data.recentEvents.map((row) => ({
      ...row,
      matchedUser: resolve(row.distinctId, row.email),
    })),
    people: data.people.map((row) => ({
      ...row,
      matchedUser: resolve(row.distinctId, row.email),
    })),
    exceptions: data.exceptions.map((row) => ({
      ...row,
      matchedUser: resolve(row.distinctId, row.email),
    })),
    locatedPeople: data.locatedPeople.map((row) => ({
      ...row,
      matchedUser: resolve(row.distinctId, row.email),
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireAdmin(req);
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    const configError = getPostHogConfigError();
    if (configError) {
      return NextResponse.json(
        { configured: false, error: configError },
        { status: 503 },
      );
    }

    const range = parseRange(req.nextUrl.searchParams.get('range'));
    const raw = await fetchPostHogAnalytics(range);
    const data = await attachMatchedUsers(raw);
    return NextResponse.json({ configured: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load PostHog analytics';
    console.error('[admin/posthog]', err);
    return NextResponse.json({ configured: true, error: message }, { status: 502 });
  }
}

