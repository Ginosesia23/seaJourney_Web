/**
 * Accent colors aligned with marketing plan cards (membership CTA / landing).
 * Used for sidebar active-page highlight and other tier-tinted UI.
 */

export function getSubscriptionTierAccentColor(
  tier: string | null | undefined,
): string | null {
  const t = (tier || '').toLowerCase().trim();

  switch (t) {
    case 'standard':
    case 'vessel_lite':
      return '#0ea5e9'; // sky / blue
    case 'premium':
    case 'vessel_basic':
      return '#8b5cf6'; // violet / purple
    case 'pro':
    case 'professional':
    case 'vessel_pro':
      return '#10b981'; // emerald / green
    case 'vessel_fleet':
      return '#f97316'; // orange
    default:
      return null;
  }
}
