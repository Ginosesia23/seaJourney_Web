import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function requireBearerUser(req: NextRequest): Promise<
  | { ok: true; userId: string; email: string | null; accessToken: string }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const accessToken = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    accessToken,
  };
}

export function clientMeta(req: NextRequest): {
  ipHashSalted: string | null;
  userAgent: string | null;
  rawIp: string | null;
} {
  const forwarded = req.headers.get('x-forwarded-for');
  const rawIp =
    forwarded?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  return {
    rawIp,
    ipHashSalted: rawIp,
    userAgent: req.headers.get('user-agent'),
  };
}
