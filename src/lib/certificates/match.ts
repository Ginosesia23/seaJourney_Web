/**
 * Strict matching between saved certificates and career/application requirements.
 * Prefer preset_id when present; never treat an empty filter as "match all".
 */

import {
  CERTIFICATE_PRESETS,
  getPresetById,
  type CertificatePreset,
} from '@/lib/certificates/presets';

export type CertificateMatchInput = {
  id?: string;
  certificate_name?: string | null;
  certificate_type?: string | null;
  certificateName?: string | null;
  certificateType?: string | null;
  /** Catalog preset id used when the certificate was added (preferred). */
  preset_id?: string | null;
  presetId?: string | null;
};

export type CertificateMatchConfig = {
  presetId?: string;
  certificateType?: string;
  nameContains?: string;
  minCount?: number;
};

function certName(c: CertificateMatchInput): string {
  return (c.certificate_name || c.certificateName || '').toString().trim();
}

function certType(c: CertificateMatchInput): string {
  return (c.certificate_type || c.certificateType || '').toString().trim();
}

function certPresetId(c: CertificateMatchInput): string | null {
  const raw = c.preset_id ?? c.presetId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word / phrase match — avoids "edh" matching unrelated strings. */
function nameMatchesAlias(certNameRaw: string, alias: string): boolean {
  const name = normalize(certNameRaw);
  const needle = normalize(alias);
  if (!name || !needle) return false;
  if (name === needle) return true;
  if (name.includes(needle)) return true;
  if (needle.length <= 5 && !needle.includes(' ')) {
    const tokens = name.split(/[\s/,_-]+/).filter(Boolean);
    return tokens.includes(needle);
  }
  return false;
}

export function aliasesForPreset(
  presetId: string,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): string[] {
  const preset = getPresetById(presetId, catalog);
  const aliases = [...(preset?.aliases || [])];
  if (preset && preset.id !== 'other') {
    const primary = preset.name.split('(')[0].trim();
    if (primary) aliases.unshift(primary);
    const paren = preset.name.match(/\(([^)]+)\)/);
    if (paren?.[1]) {
      for (const part of paren[1].split(/[/,]/)) {
        const code = part.trim();
        if (code) aliases.push(code);
      }
    }
  }
  return [...new Set(aliases.map((a) => a.trim()).filter(Boolean))];
}

export function certificateMatchesPreset(
  cert: CertificateMatchInput,
  presetId: string,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): boolean {
  const preset = getPresetById(presetId, catalog);
  if (!preset || preset.id === 'other') return false;

  const storedPreset = certPresetId(cert);
  if (storedPreset) {
    return storedPreset === presetId;
  }

  const name = certName(cert);
  if (!name) return false;

  const type = certType(cert);
  if (preset.type && type && type.toLowerCase() !== preset.type.toLowerCase()) {
    return false;
  }

  return aliasesForPreset(presetId, catalog).some((alias) =>
    nameMatchesAlias(name, alias),
  );
}

export function hasCertificateMatchFilters(
  config: CertificateMatchConfig | null | undefined,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): boolean {
  if (!config) return false;
  if (config.presetId && getPresetById(config.presetId, catalog)) return true;
  if ((config.certificateType || '').trim()) return true;
  if ((config.nameContains || '').trim()) return true;
  return false;
}

export function filterCertificatesForRequirement(
  certificates: CertificateMatchInput[],
  config: CertificateMatchConfig | null | undefined,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): CertificateMatchInput[] {
  if (!hasCertificateMatchFilters(config, catalog)) return [];

  const cfg = config!;

  if (cfg.presetId) {
    return certificates.filter((c) =>
      certificateMatchesPreset(c, cfg.presetId!, catalog),
    );
  }

  let matches = certificates;
  const typeWant = (cfg.certificateType || '').trim().toLowerCase();
  if (typeWant) {
    matches = matches.filter((c) => certType(c).toLowerCase() === typeWant);
  }
  const nameNeedle = (cfg.nameContains || '').trim();
  if (nameNeedle) {
    matches = matches.filter((c) => nameMatchesAlias(certName(c), nameNeedle));
  }
  return matches;
}

export function inferPresetIdFromCertificate(
  cert: CertificateMatchInput,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): string | null {
  const stored = certPresetId(cert);
  if (stored && getPresetById(stored, catalog)) return stored;

  for (const preset of catalog) {
    if (preset.id === 'other') continue;
    if (
      certificateMatchesPreset({ ...cert, preset_id: null }, preset.id, catalog)
    ) {
      return preset.id;
    }
  }
  return null;
}

export function getPresetLabel(
  presetId: string,
  catalog: CertificatePreset[] = CERTIFICATE_PRESETS,
): string {
  return getPresetById(presetId, catalog)?.name ?? presetId;
}
