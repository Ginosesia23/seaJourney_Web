/** Client-safe helpers for application API calls (no server imports). */

export function bearerHeaders(
  accessToken: string | null | undefined,
  extra?: HeadersInit,
): HeadersInit {
  const headers: Record<string, string> = {
    ...(extra as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

/** Download a protected file using the session Bearer token. */
export async function downloadWithAuth(
  url: string,
  accessToken: string,
  fallbackName = 'download',
): Promise<void> {
  const res = await fetch(url, {
    headers: bearerHeaders(accessToken),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(
      (json as { error?: string }).error || `Download failed (${res.status})`,
    );
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const name = match?.[1] || fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
