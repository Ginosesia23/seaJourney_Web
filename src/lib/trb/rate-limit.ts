/**
 * Durable TRB rate limiting via Postgres (service-role).
 * Falls back to in-memory if the table is unavailable.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const row = memory.get(key);
  if (!row || row.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

/** Truncate window start to minute buckets for durable counters. */
function windowStart(windowMs: number): Date {
  const now = Date.now();
  const start = now - (now % windowMs);
  return new Date(start);
}

export async function checkTrbRateLimit(
  admin: SupabaseClient | null,
  opts: { key: string; limit: number; windowMs: number },
): Promise<boolean> {
  if (!admin) return memoryAllow(opts.key, opts.limit, opts.windowMs);

  const started = windowStart(opts.windowMs).toISOString();
  try {
    const { data: existing } = await admin
      .from('trb_rate_limits')
      .select('id, hit_count')
      .eq('bucket_key', opts.key)
      .eq('window_started_at', started)
      .maybeSingle();

    if (!existing) {
      const { error } = await admin.from('trb_rate_limits').insert({
        bucket_key: opts.key,
        window_started_at: started,
        hit_count: 1,
      });
      if (error) return memoryAllow(opts.key, opts.limit, opts.windowMs);
      return true;
    }

    if ((existing.hit_count as number) >= opts.limit) return false;

    const { error } = await admin
      .from('trb_rate_limits')
      .update({ hit_count: (existing.hit_count as number) + 1 })
      .eq('id', existing.id);
    if (error) return memoryAllow(opts.key, opts.limit, opts.windowMs);
    return true;
  } catch {
    return memoryAllow(opts.key, opts.limit, opts.windowMs);
  }
}
