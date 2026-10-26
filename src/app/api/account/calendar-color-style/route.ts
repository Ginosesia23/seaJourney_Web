import { NextRequest, NextResponse } from 'next/server';

import { parseCalendarColorStyle } from '@/lib/calendar-state-colors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    const cookieToken = req.cookies.get('sb-access-token')?.value;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = bearer || cookieToken;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const style = parseCalendarColorStyle(body?.style);
    if (!style) {
      return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ calendar_color_style: style })
      .eq('id', user.id);

    if (error) {
      // Column may not exist until the SQL is applied — still accept the request.
      console.warn('[calendar-color-style] persist skipped:', error.message);
      return NextResponse.json({ style, persisted: false });
    }

    return NextResponse.json({ style, persisted: true });
  } catch (err) {
    console.error('[calendar-color-style]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
