import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  mergeCatalogWithSeed,
  mapCatalogRow,
  type CertificatePreset,
} from '@/lib/certificates/presets';

let cache: { at: number; list: CertificatePreset[] } | null = null;
const CACHE_MS = 30_000;

export function invalidateCertificateCatalogCache() {
  cache = null;
}

/**
 * Load active certificate catalog for matching / dropdowns.
 * Falls back to seed when the table is missing or empty.
 */
export async function loadCertificateCatalog(opts?: {
  includeInactive?: boolean;
  includeOther?: boolean;
  force?: boolean;
}): Promise<CertificatePreset[]> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_MS && !opts?.includeInactive) {
    return mergeCatalogWithSeed(cache.list, {
      includeOther: opts?.includeOther,
      includeInactive: false,
    });
  }

  try {
    let query = supabaseAdmin
      .from('certificate_catalog')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (!opts?.includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[certificate-catalog] load failed:', error.message);
      return mergeCatalogWithSeed([], {
        includeOther: opts?.includeOther,
        includeInactive: opts?.includeInactive,
      });
    }

    const mapped = (data || []).map((row) =>
      mapCatalogRow(row as Record<string, unknown>),
    );

    if (!opts?.includeInactive) {
      cache = { at: Date.now(), list: mapped };
    }

    return mergeCatalogWithSeed(mapped, {
      includeOther: opts?.includeOther,
      includeInactive: opts?.includeInactive,
    });
  } catch (e) {
    console.warn('[certificate-catalog] load error', e);
    return mergeCatalogWithSeed([], {
      includeOther: opts?.includeOther,
      includeInactive: opts?.includeInactive,
    });
  }
}

export async function getCatalogPresetById(
  id: string,
): Promise<CertificatePreset | undefined> {
  const list = await loadCertificateCatalog({ includeOther: true });
  return list.find((p) => p.id === id);
}
