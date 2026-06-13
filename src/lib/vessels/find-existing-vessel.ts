import type { SupabaseClient } from '@supabase/supabase-js';
import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';

export type ExistingVesselRecord = {
  id: string;
  name: string;
  type: string;
  imo: string | null;
  mmsi: string | null;
};

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

export async function findExistingVessel(
  supabase: SupabaseClient,
  params: {
    mmsi?: string | null;
    imo?: string | null;
    name?: string | null;
  },
): Promise<ExistingVesselRecord | null> {
  const normalizedMmsi = normalizeMmsi(params.mmsi);
  const normalizedImo = normalizeImo(params.imo);
  const trimmedName = params.name?.trim() || null;

  const select = 'id, name, type, imo, mmsi';

  if (normalizedMmsi) {
    const { data } = await supabase
      .from('vessels')
      .select(select)
      .eq('mmsi', normalizedMmsi)
      .maybeSingle();
    if (data) return data as ExistingVesselRecord;
  }

  if (normalizedImo) {
    const { data } = await supabase
      .from('vessels')
      .select(select)
      .eq('imo', normalizedImo)
      .maybeSingle();
    if (data) return data as ExistingVesselRecord;
  }

  if (trimmedName) {
    const { data } = await supabase
      .from('vessels')
      .select(select)
      .ilike('name', trimmedName)
      .maybeSingle();
    if (data) return data as ExistingVesselRecord;
  }

  return null;
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

  if (!existing.mmsi && mmsi) updates.mmsi = mmsi;
  if (!existing.imo && imo) updates.imo = imo;
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
