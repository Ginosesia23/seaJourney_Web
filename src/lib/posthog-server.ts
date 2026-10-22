const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');

/**
 * Server-side capture through the public ingestion API (no posthog-node).
 * Never throws — analytics must not break the request that calls it.
 * Dev servers stay out of the production project, same as the browser client.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!POSTHOG_KEY) return;
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_POSTHOG_CAPTURE_LOCALHOST !== 'true'
  ) {
    return;
  }

  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.warn(`[posthog] ${event} capture failed:`, err);
  }
}
