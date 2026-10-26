export const VESSEL_PLAN_ACCESS_MARKER = '[vessel-plan-coverage]';

export function isAutoGrantedVesselAccessNote(notes: string | null | undefined): boolean {
  return String(notes || '').includes(VESSEL_PLAN_ACCESS_MARKER);
}
