import type { SupabaseClient } from '@supabase/supabase-js';
import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';
import { VESSEL_PUBLIC_IDENTITY_SELECT } from '@/lib/vessels/public-identity';

export type ExistingVesselRecord = {
  id: string;
  name: string;
  type: string;
  imo: string | null;
  mmsi: string | null;
};

export type VesselIdentityConflict = {
  kind: 'mmsi_imo_mismatch';
  mmsiVessel: ExistingVesselRecord;
  imoVessel: ExistingVesselRecord;
  message: string;
};

export type FindCanonicalVesselResult =
  | { status: 'none' }
  | { status: 'found'; vessel: ExistingVesselRecord }
  | { status: 'conflict'; conflict: VesselIdentityConflict };

export function normalizeMmsi(value?: string | null): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

export function normalizeImo(value?: string | null): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique');
}

async function lookupByMmsi(
  supabase: SupabaseClient,
  mmsi: string,
): Promise<ExistingVesselRecord | null> {
  const { data } = await supabase
    .from('vessels')
    .select(VESSEL_PUBLIC_IDENTITY_SELECT)
    .eq('mmsi', mmsi)
    .limit(1)
    .maybeSingle();
  return (data as ExistingVesselRecord | null) ?? null;
}

async function lookupByImo(
  supabase: SupabaseClient,
  imo: string,
): Promise<ExistingVesselRecord | null> {
  const { data } = await supabase
    .from('vessels')
    .select(VESSEL_PUBLIC_IDENTITY_SELECT)
    .eq('imo', imo)
    .limit(1)
    .maybeSingle();
  return (data as ExistingVesselRecord | null) ?? null;
}

/**
 * Canonical physical-vessel lookup.
 * MMSI first, then IMO. Detects MMSI→A / IMO→B conflicts (no auto-merge).
 */
export async function findCanonicalVessel(
  supabase: SupabaseClient,
  params: {
    mmsi?: string | null;
    imo?: string | null;
    name?: string | null;
    allowNameMatch?: boolean;
  },
): Promise<FindCanonicalVesselResult> {
  const normalizedMmsi = normalizeMmsi(params.mmsi);
  const normalizedImo = normalizeImo(params.imo);
  const trimmedName = params.name?.trim() || null;
  const allowNameMatch =
    params.allowNameMatch ?? !(normalizedMmsi || normalizedImo);

  const byMmsi = normalizedMmsi
    ? await lookupByMmsi(supabase, normalizedMmsi)
    : null;
  const byImo = normalizedImo ? await lookupByImo(supabase, normalizedImo) : null;

  if (byMmsi && byImo && byMmsi.id !== byImo.id) {
    return {
      status: 'conflict',
      conflict: {
        kind: 'mmsi_imo_mismatch',
        mmsiVessel: byMmsi,
        imoVessel: byImo,
        message:
          `MMSI matches vessel ${byMmsi.id} (${byMmsi.name}) but IMO matches ` +
          `vessel ${byImo.id} (${byImo.name}). Do not merge automatically.`,
      },
    };
  }

  if (byMmsi) return { status: 'found', vessel: byMmsi };
  if (byImo) return { status: 'found', vessel: byImo };

  if (allowNameMatch && trimmedName) {
    const { data } = await supabase
      .from('vessels')
      .select(VESSEL_PUBLIC_IDENTITY_SELECT)
      .ilike('name', trimmedName)
      .limit(1)
      .maybeSingle();
    if (data) return { status: 'found', vessel: data as ExistingVesselRecord };
  }

  return { status: 'none' };
}

/** @deprecated Prefer findCanonicalVessel — kept for callers expecting a single row. */
export async function findExistingVessel(
  supabase: SupabaseClient,
  params: {
    mmsi?: string | null;
    imo?: string | null;
    name?: string | null;
    allowNameMatch?: boolean;
  },
): Promise<ExistingVesselRecord | null> {
  const result = await findCanonicalVessel(supabase, params);
  if (result.status === 'found') return result.vessel;
  if (result.status === 'conflict') {
    console.warn('[findExistingVessel] MMSI/IMO conflict', result.conflict.message);
    // Prefer MMSI match when conflicted (stronger AIS identity).
    return result.conflict.mmsiVessel;
  }
  return null;
}

/**
 * Insert a vessel; on unique MMSI/IMO race, re-query and return the winner.
 */
export async function insertVesselRaceSafe(
  supabase: SupabaseClient,
  insertData: Record<string, unknown>,
  select: string = VESSEL_PUBLIC_IDENTITY_SELECT,
): Promise<
  | { ok: true; vessel: ExistingVesselRecord; created: boolean }
  | { ok: false; error: string; conflict?: VesselIdentityConflict }
> {
  const { data, error } = await supabase
    .from('vessels')
    .insert(insertData)
    .select(select)
    .single();

  if (!error && data) {
    return {
      ok: true,
      vessel: data as unknown as ExistingVesselRecord,
      created: true,
    };
  }

  if (isUniqueViolation(error)) {
    const retry = await findCanonicalVessel(supabase, {
      mmsi: (insertData.mmsi as string | null) ?? null,
      imo: (insertData.imo as string | null) ?? null,
      allowNameMatch: false,
    });
    if (retry.status === 'found') {
      return { ok: true, vessel: retry.vessel, created: false };
    }
    if (retry.status === 'conflict') {
      return {
        ok: false,
        error: retry.conflict.message,
        conflict: retry.conflict,
      };
    }
  }

  return {
    ok: false,
    error: error?.message || 'Failed to create vessel',
  };
}

/**
 * Validate MMSI/IMO edits do not collide with a different vessel.
 */
export async function assertVesselIdentifierUpdateAllowed(
  supabase: SupabaseClient,
  vesselId: string,
  next: { mmsi?: string | null; imo?: string | null },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const normalizedMmsi =
    next.mmsi !== undefined ? normalizeMmsi(next.mmsi) : undefined;
  const normalizedImo =
    next.imo !== undefined ? normalizeImo(next.imo) : undefined;

  if (normalizedMmsi) {
    const other = await lookupByMmsi(supabase, normalizedMmsi);
    if (other && other.id !== vesselId) {
      return {
        ok: false,
        status: 409,
        error: `MMSI ${normalizedMmsi} is already used by another vessel (${other.name}).`,
      };
    }
  }

  if (normalizedImo) {
    const other = await lookupByImo(supabase, normalizedImo);
    if (other && other.id !== vesselId) {
      return {
        ok: false,
        status: 409,
        error: `IMO ${normalizedImo} is already used by another vessel (${other.name}).`,
      };
    }
  }

  // Cross-check: proposed pair must not point at two different existing rows.
  if (normalizedMmsi || normalizedImo) {
    const canonical = await findCanonicalVessel(supabase, {
      mmsi: normalizedMmsi ?? null,
      imo: normalizedImo ?? null,
      allowNameMatch: false,
    });
    if (canonical.status === 'conflict') {
      return {
        ok: false,
        status: 409,
        error: canonical.conflict.message,
      };
    }
    if (
      canonical.status === 'found' &&
      canonical.vessel.id !== vesselId
    ) {
      return {
        ok: false,
        status: 409,
        error: `Those identifiers already belong to vessel ${canonical.vessel.name}.`,
      };
    }
  }

  return { ok: true };
}

/** Fill in missing AIS fields on an existing vessel without overwriting set values. */
export async function enrichVesselFromAisAutofill(
  supabase: SupabaseClient,
  vesselId: string,
  autofill: VesselRegistrationAutofill,
): Promise<void> {
  const { data: existing } = await supabase
    .from('vessels')
    .select('imo, mmsi, call_sign, flag, length_m, beam, draft, gross_tonnage, build_year')
    .eq('id', vesselId)
    .maybeSingle();

  if (!existing) return;

  const updates: Record<string, unknown> = {};
  const imo = normalizeImo(autofill.officialNumber);
  const mmsi = normalizeMmsi(autofill.mmsi);

  if (!existing.mmsi && mmsi) {
    const check = await assertVesselIdentifierUpdateAllowed(supabase, vesselId, {
      mmsi,
    });
    if (check.ok) updates.mmsi = mmsi;
  }
  if (!existing.imo && imo) {
    const check = await assertVesselIdentifierUpdateAllowed(supabase, vesselId, {
      imo,
    });
    if (check.ok) updates.imo = imo;
  }
  if (!existing.call_sign && autofill.call_sign) updates.call_sign = autofill.call_sign;
  if (!existing.flag && autofill.flag) updates.flag = autofill.flag.toUpperCase();
  if (existing.length_m == null && autofill.length_m != null) updates.length_m = autofill.length_m;
  if (existing.beam == null && autofill.beam != null) updates.beam = autofill.beam;
  if (existing.draft == null && autofill.draft != null) updates.draft = autofill.draft;
  if (existing.gross_tonnage == null && autofill.gross_tonnage != null) {
    updates.gross_tonnage = autofill.gross_tonnage;
  }
  if (existing.build_year == null && autofill.build_year != null) {
    updates.build_year = autofill.build_year;
  }

  if (Object.keys(updates).length === 0) return;

  await supabase.from('vessels').update(updates).eq('id', vesselId);
}
