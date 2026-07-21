/**
 * TEMPORARY — remove after notification testing.
 *
 * POST /api/dev/test-notification
 *   { "userId": "<uuid>", "title"?: "...", "body"?: "..." }
 *
 * Runs `sendUserNotification` end-to-end: inserts a row into
 * `app_user_notifications` and invokes the `user-notifications-push` Edge
 * Function so the target user's phone buzzes.
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendUserNotification } from '@/lib/notifications/send-user-notification';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || (profile.role as string) !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      title?: string;
      body?: string;
    };
    const targetUserId = body.userId?.trim() || user.id;
    const title = body.title?.trim() || 'Test push';
    const message = body.body?.trim() || 'Testing sendUserNotification helper.';

    const result = await sendUserNotification({
      userId: targetUserId,
      title,
      body: message,
      kind: 'system',
      metadata: { route: '/dashboard/current', test: true },
    });

    return NextResponse.json({ target: targetUserId, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
