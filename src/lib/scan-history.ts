/**
 * Utilities for saving and loading recent document scan templates
 * in localStorage. Stores the field structure (not the file) so
 * templates can be re-matched against different crew members instantly.
 */

const STORAGE_KEY = 'seajourney_recent_scans';
const MAX_SAVED = 20;

export interface SavedScanTemplate {
  id: string;
  documentTitle: string;
  documentDescription: string | null;
  fileName: string;
  fileType: string;
  /** The raw extracted fields (without suggestedValues — those are recalculated) */
  fields: Array<{
    fieldName: string;
    fieldDescription?: string;
    originalValue?: string;
    category?: string;
    profileKey?: string;
    page?: number;
    bbox?: { yMin: number; xMin: number; yMax: number; xMax: number };
  }>;
  vesselId: string;
  vesselName: string;
  savedAt: string; // ISO date
  savedBy: string; // user ID
}

/** Generate a simple unique ID */
function generateId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Get all saved scan templates, newest first */
export function getSavedScans(): SavedScanTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScanTemplate[];
    return parsed.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  } catch {
    return [];
  }
}

/** Save a scan template. Returns the saved template with generated ID. */
export function saveScanTemplate(
  template: Omit<SavedScanTemplate, 'id' | 'savedAt'>,
): SavedScanTemplate {
  const saved: SavedScanTemplate = {
    ...template,
    id: generateId(),
    savedAt: new Date().toISOString(),
  };

  const existing = getSavedScans();
  const updated = [saved, ...existing].slice(0, MAX_SAVED);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full — remove oldest and retry
    const trimmed = [saved, ...existing.slice(0, MAX_SAVED - 5)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  return saved;
}

/** Delete a saved scan template by ID */
export function deleteSavedScan(id: string): void {
  const existing = getSavedScans();
  const updated = existing.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/** Get scans for a specific vessel */
export function getSavedScansForVessel(vesselId: string): SavedScanTemplate[] {
  return getSavedScans().filter((s) => s.vesselId === vesselId);
}

/**
 * Update the `fields` array on a saved template (in-place merge by id).
 * Used when the user adjusts overlay bboxes so re-used templates remember them.
 */
export function updateSavedScanFields(
  id: string,
  fields: SavedScanTemplate['fields'],
): void {
  if (typeof window === 'undefined') return;
  const existing = getSavedScans();
  const next = existing.map((s) => (s.id === id ? { ...s, fields } : s));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors; adjustments are best-effort.
  }
}
