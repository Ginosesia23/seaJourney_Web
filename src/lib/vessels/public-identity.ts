/**
 * Public physical-vessel identity projections.
 *
 * Crew / catalog / Flutter must use `vessels_public_identity` (or this
 * projection via API). Never expose stamp, company contacts, manager id,
 * or AIS internal scheduling fields to ordinary crew.
 */

/** Columns on public.vessels_public_identity (keep in sync with SQL view). */
export const VESSEL_PUBLIC_IDENTITY_SELECT =
  'id, name, type, mmsi, imo, flag, call_sign, length_m, beam, gross_tonnage, build_year, is_official' as const;

export const VESSELS_PUBLIC_IDENTITY_TABLE = 'vessels_public_identity' as const;

/** Fields safe to return to any authenticated user who may attach/search. */
export type PublicVesselIdentity = {
  id: string;
  name: string;
  type: string;
  imo: string | null;
  mmsi: string | null;
  flag?: string | null;
  call_sign?: string | null;
  length_m?: number | null;
  beam?: number | null;
  gross_tonnage?: number | null;
  build_year?: number | null;
  is_official?: boolean | null;
};

/** Private / management / internal fields that must not leak via catalog. */
export const VESSEL_PRIVATE_FIELD_KEYS = [
  'stamp',
  'management_company',
  'company_address',
  'company_contact',
  'vessel_manager_id',
  'description',
  'ais_tracking_enabled',
  'ais_provider_poll_enabled',
  'ais_last_sync_at',
  'ais_last_sync_error',
  'ais_last_nav_status',
  'ais_last_speed',
  'ais_last_position_at',
] as const;

export function toPublicVesselIdentity(
  row: Record<string, unknown>,
): PublicVesselIdentity {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    type: String(row.type ?? ''),
    imo: (row.imo as string | null) ?? null,
    mmsi: (row.mmsi as string | null) ?? null,
    flag: (row.flag as string | null) ?? null,
    call_sign: (row.call_sign as string | null) ?? null,
    length_m: row.length_m != null ? Number(row.length_m) : null,
    beam: row.beam != null ? Number(row.beam) : null,
    gross_tonnage: row.gross_tonnage != null ? Number(row.gross_tonnage) : null,
    build_year: row.build_year != null ? Number(row.build_year) : null,
    is_official: (row.is_official as boolean | null) ?? null,
  };
}

export function assertNoPrivateVesselLeak(
  payload: Record<string, unknown>,
): string[] {
  return VESSEL_PRIVATE_FIELD_KEYS.filter(
    (k) => k in payload && payload[k] != null,
  );
}

/**
 * Which Supabase relation a client role should query for vessel catalogs.
 * Admins / vessel managers may use full `vessels`; everyone else uses the
 * public identity view.
 */
export function vesselsCatalogTableForRole(
  role: string | null | undefined,
): 'vessels' | 'vessels_public_identity' {
  const r = (role || '').toLowerCase();
  if (r === 'admin' || r === 'vessel') return 'vessels';
  return 'vessels_public_identity';
}
