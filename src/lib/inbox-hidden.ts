export type InboxRemoveKind =
  | 'testimonial'
  | 'access'
  | 'sea_time'
  | 'plan_coverage'
  | 'captaincy';

export function inboxHideKey(kind: InboxRemoveKind, id: string): string {
  return `${kind}:${id}`;
}

function storageKey(userId: string): string {
  return `sea-inbox-hidden:${userId}`;
}

export function readHiddenInboxKeys(userId: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!userId || typeof window === 'undefined') return keys;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string') keys.add(item);
      }
    }
  } catch {
    // Ignore parse / quota errors.
  }
  return keys;
}

export function rememberHiddenInboxKey(userId: string, key: string): void {
  const next = readHiddenInboxKeys(userId);
  next.add(key);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify([...next]));
  } catch {
    // Ignore quota / private mode.
  }
}

export async function removeInboxItem(opts: {
  accessToken: string;
  userId: string;
  kind: InboxRemoveKind;
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/inbox/remove', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify({ kind: opts.kind, id: opts.id }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (payload as { error?: string }).error || 'Could not remove request' };
  }
  rememberHiddenInboxKey(opts.userId, inboxHideKey(opts.kind, opts.id));
  return { ok: true };
}
