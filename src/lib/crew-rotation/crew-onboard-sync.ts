/**
 * Pure decision for syncing a crew member's daily state with the
 * vessel Onboard Tracker. Server applies the write; the browser only
 * asks for a refresh after a log save.
 */

export type CrewOnboardSyncIntent = 'mark_off' | 'mark_on' | 'none';

export function crewDailyStateOnboardIntent(args: {
  todayIso: string;
  dateIso: string;
  state: string;
  hasOpenToggleLeave: boolean;
  isVesselAccount: boolean;
}): CrewOnboardSyncIntent {
  if (args.isVesselAccount) return 'none';
  if (args.dateIso !== args.todayIso) return 'none';
  if (args.state === 'on-leave') return 'mark_off';
  if (args.hasOpenToggleLeave) return 'mark_on';
  return 'none';
}

/** After the crew saves their own daily log, ask the server to match the vessel toggle. */
export function requestCrewOnboardSync(args: {
  vesselId: string;
  accessToken: string | null | undefined;
}): void {
  if (typeof window === 'undefined') return;
  if (!args.vesselId || !args.accessToken) return;
  void fetch('/api/crew-rotation/crew-state-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({ vesselId: args.vesselId }),
  }).catch((error) => {
    console.warn('[crew-onboard-sync]', error);
  });
}
