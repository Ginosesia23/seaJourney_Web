import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrewDocumentKind } from '@/lib/notification-emails';

/**
 * Email the crew member that a vessel manager created a document for them.
 * Fire-and-forget — never blocks or fails the create flow.
 */
export async function notifyCrewOfDocumentCreated(
  supabase: SupabaseClient,
  args: {
    crewUserId: string;
    documentKind: CrewDocumentKind;
    documentLabel: string;
    vesselId?: string | null;
  },
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return;
    await fetch('/api/crew-documents/notify-created', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(args),
    });
  } catch (err) {
    console.error('[notifyCrewOfDocumentCreated] Failed:', err);
  }
}
