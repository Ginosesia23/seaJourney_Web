import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type UserEmailProfile = {
  id: string;
  email: string | null;
  role: string | null;
  first_name: string | null;
  last_name: string | null;
  is_testing: boolean | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Resolve account by email via public.users (auth.admin.getUserByEmail is unavailable in our SDK). */
export async function findUserProfileByEmail(
  email: string,
): Promise<UserEmailProfile | null> {
  const normalized = normalizeEmail(email);
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, role, first_name, last_name, is_testing')
    .ilike('email', normalized)
    .maybeSingle();

  if (error) {
    console.error('[admin/lookup-user-by-email] profile lookup failed', error);
    throw new Error(error.message || 'Failed to look up user by email');
  }

  return (data as UserEmailProfile | null) ?? null;
}

export async function isEmailRegisteredToOtherUser(
  email: string,
  excludeUserId?: string,
): Promise<{ available: true } | { available: false; userId: string; profile: UserEmailProfile }> {
  const profile = await findUserProfileByEmail(email);
  if (!profile) return { available: true };
  if (excludeUserId && profile.id === excludeUserId) return { available: true };
  return { available: false, userId: profile.id, profile };
}
