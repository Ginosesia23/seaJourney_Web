/**
 * Helpers for Supabase password-recovery links only.
 * Do not treat arbitrary URL hashes (e.g. #membership) as recovery.
 */

export function getRecoveryFromHash(hash: string): {
  accessToken: string;
  refreshToken: string;
} | null {
  if (!hash || hash === '#') return null;

  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  if (params.get('type') !== 'recovery') return null;

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}

export function hasRecoveryInSearch(search: string): boolean {
  if (!search) return false;

  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  if (params.get('type') !== 'recovery') return false;

  return !!(params.get('token_hash') || params.get('token'));
}

export function hasRecoveryInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    getRecoveryFromHash(window.location.hash) !== null ||
    hasRecoveryInSearch(window.location.search)
  );
}
