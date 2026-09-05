import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  FEATURE_FLAG_CATALOG,
  resolveFeatureEnabledMap,
  getFeatureDefinition,
  type FeatureFlagKey,
  isFeatureEnabledInMap,
} from '@/lib/feature-flags/catalog';
import {
  normalizeCrewTierSlug,
  normalizeVesselTierSlug,
  resolveFeatureTierAccess,
  meetsFeatureTierAccess,
  isVesselManagedCrewAccount,
  normalizeFeatureAccessVesselContext,
  encodeCrewTiersAccess,
  encodeVesselTiersAccess,
  parseCrewTiersAccess,
  parseVesselTiersAccess,
  type FeatureTierAccess,
  type FeatureAccessVesselContext,
  type CrewTierSlug,
  type VesselTierSlug,
} from '@/lib/feature-flags/tier-access';
import { resolveCrewVesselFeatureBoostForUser } from '@/lib/crew-vessel-feature-boost.server';

export type FeatureFlagNote = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
};

type FlagRow = {
  key: string;
  enabled: boolean;
  note: string | null;
  updated_at: string | null;
  updated_by: string | null;
  last_enabled_at: string | null;
  last_disabled_at: string | null;
  min_crew_tier: string | null;
  min_vessel_tier: string | null;
};

type CacheEntry = {
  at: number;
  map: Record<FeatureFlagKey, boolean>;
  tierAccess: Record<FeatureFlagKey, FeatureTierAccess>;
  rows: FlagRow[];
};

const CACHE_TTL_MS = 5_000;
let cache: CacheEntry | null = null;

const FLAG_SELECT_WITH_TIERS =
  'key, enabled, note, updated_at, updated_by, last_enabled_at, last_disabled_at, min_crew_tier, min_vessel_tier';

const FLAG_SELECT_BASE = 'key, enabled, note, updated_at, updated_by';

function resolveTierAccessMap(rows: FlagRow[]): Record<FeatureFlagKey, FeatureTierAccess> {
  const map = {} as Record<FeatureFlagKey, FeatureTierAccess>;
  for (const def of FEATURE_FLAG_CATALOG) {
    const row = rows.find((r) => r.key === def.key);
    map[def.key] = resolveFeatureTierAccess(def, row);
  }
  return map;
}

function normalizeRow(r: Record<string, unknown>, withTiers: boolean): FlagRow {
  return {
    key: String(r.key),
    enabled: !!r.enabled,
    note: (r.note as string | null) ?? null,
    updated_at: (r.updated_at as string | null) ?? null,
    updated_by: (r.updated_by as string | null) ?? null,
    last_enabled_at: (r.last_enabled_at as string | null) ?? null,
    last_disabled_at: (r.last_disabled_at as string | null) ?? null,
    min_crew_tier: withTiers ? ((r.min_crew_tier as string | null) ?? null) : null,
    min_vessel_tier: withTiers ? ((r.min_vessel_tier as string | null) ?? null) : null,
  };
}

export async function loadFeatureFlagState(opts?: {
  force?: boolean;
}): Promise<CacheEntry> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache;
  }

  let rows: FlagRow[] = [];
  let withTiers = true;

  const { data, error } = await supabaseAdmin
    .from('platform_feature_flags')
    .select(FLAG_SELECT_WITH_TIERS);

  if (error) {
    if (
      error.message.includes('min_crew_tier') ||
      error.message.includes('min_vessel_tier')
    ) {
      withTiers = false;
      const fallback = await supabaseAdmin
        .from('platform_feature_flags')
        .select(`${FLAG_SELECT_BASE}, last_enabled_at, last_disabled_at`);
      if (fallback.error) {
        const minimal = await supabaseAdmin
          .from('platform_feature_flags')
          .select(FLAG_SELECT_BASE);
        if (minimal.error) {
          console.warn('[feature-flags] load failed, using defaults:', minimal.error.message);
          cache = {
            at: Date.now(),
            map: resolveFeatureEnabledMap([]),
            tierAccess: resolveTierAccessMap([]),
            rows: [],
          };
          return cache;
        }
        rows = (minimal.data || []).map((r) => normalizeRow(r, false));
      } else {
        rows = (fallback.data || []).map((r) => normalizeRow(r, false));
      }
    } else {
      console.warn('[feature-flags] load failed, using defaults:', error.message);
      cache = {
        at: Date.now(),
        map: resolveFeatureEnabledMap([]),
        tierAccess: resolveTierAccessMap([]),
        rows: [],
      };
      return cache;
    }
  } else {
    rows = (data || []).map((r) => normalizeRow(r, withTiers));
  }

  cache = {
    at: Date.now(),
    map: resolveFeatureEnabledMap(rows),
    tierAccess: resolveTierAccessMap(rows),
    rows,
  };
  return cache;
}

export function invalidateFeatureFlagCache() {
  cache = null;
}

export async function isFeatureEnabledServer(
  key: FeatureFlagKey,
  opts?: { isAdmin?: boolean },
): Promise<boolean> {
  if (opts?.isAdmin) return true;
  const state = await loadFeatureFlagState();
  return isFeatureEnabledInMap(state.map, key, opts);
}

export async function isFeatureAccessibleServer(
  key: FeatureFlagKey,
  opts?: {
    isAdmin?: boolean;
    profile?: unknown;
    userId?: string;
    vesselContext?: FeatureAccessVesselContext | null;
    /** @deprecated Pass vesselContext instead */
    vesselBoost?: FeatureAccessVesselContext['boost'];
  },
): Promise<boolean> {
  if (opts?.isAdmin) return true;
  const def = getFeatureDefinition(key);
  if (!def) return true;

  const state = await loadFeatureFlagState();
  if (!isFeatureEnabledInMap(state.map, key, opts)) return false;

  if (!opts?.profile) return true;

  let vesselContext = normalizeFeatureAccessVesselContext(
    opts.vesselContext ??
      (opts.vesselBoost !== undefined ? { boost: opts.vesselBoost } : null),
  );

  const access = state.tierAccess[key];
  if (
    access?.minVesselTier &&
    isVesselManagedCrewAccount(opts.profile) &&
    !vesselContext.managerTier
  ) {
    const userId =
      opts.userId ||
      ((opts.profile as { id?: string } | null)?.id ?? null);
    if (userId) {
      const resolved = await resolveCrewVesselFeatureBoostForUser(userId);
      vesselContext = {
        boost: resolved.boost,
        managerTier: resolved.managerTier,
      };
    }
  }

  return meetsFeatureTierAccess(
    opts.profile,
    def,
    access,
    vesselContext,
  );
}

async function loadNotesByFeatureKey(): Promise<
  Record<string, FeatureFlagNote[]>
> {
  const { data, error } = await supabaseAdmin
    .from('platform_feature_flag_notes')
    .select('id, feature_key, body, created_at, created_by')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[feature-flags] notes load failed:', error.message);
    return {};
  }

  const authorIds = [
    ...new Set(
      (data || [])
        .map((r) => r.created_by as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const nameById = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', authorIds);
    for (const u of users || []) {
      nameById.set(
        u.id,
        (u.name as string) || (u.email as string) || 'Admin',
      );
    }
  }

  const byKey: Record<string, FeatureFlagNote[]> = {};
  for (const row of data || []) {
    const key = String(row.feature_key);
    const note: FeatureFlagNote = {
      id: String(row.id),
      body: String(row.body),
      createdAt: String(row.created_at),
      createdBy: (row.created_by as string | null) ?? null,
      createdByName: row.created_by
        ? nameById.get(row.created_by as string) || null
        : null,
    };
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(note);
  }
  return byKey;
}

export async function getFeatureFlagsAdminView() {
  const [state, notesByKey] = await Promise.all([
    loadFeatureFlagState({ force: true }),
    loadNotesByFeatureKey(),
  ]);

  return FEATURE_FLAG_CATALOG.map((def) => {
    const row = state.rows.find((r) => r.key === def.key);
    let notes = notesByKey[def.key] || [];
    const tierAccess = state.tierAccess[def.key];

    if (notes.length === 0 && row?.note?.trim()) {
      notes = [
        {
          id: `legacy-${def.key}`,
          body: row.note.trim(),
          createdAt: row.updated_at || new Date(0).toISOString(),
          createdBy: row.updated_by,
          createdByName: null,
        },
      ];
    }

    return {
      ...def,
      enabled: state.map[def.key],
      tierAccess,
      minCrewTier: tierAccess.minCrewTier,
      crewTiers: tierAccess.crewTiers,
      minVesselTier: tierAccess.minVesselTier,
      vesselTiers: tierAccess.vesselTiers,
      dbMinCrewTier: row?.min_crew_tier ?? null,
      dbMinVesselTier: row?.min_vessel_tier ?? null,
      note: notes[0]?.body ?? row?.note ?? null,
      notes,
      noteCount: notes.length,
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
      lastEnabledAt: row?.last_enabled_at ?? null,
      lastDisabledAt: row?.last_disabled_at ?? null,
      hasDbRow: !!row,
    };
  });
}

export async function setFeatureFlagEnabled(opts: {
  key: FeatureFlagKey;
  enabled: boolean;
  actorId: string;
}) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    key: opts.key,
    enabled: opts.enabled,
    updated_at: now,
    updated_by: opts.actorId,
  };
  if (opts.enabled) payload.last_enabled_at = now;
  else payload.last_disabled_at = now;

  const { error } = await supabaseAdmin
    .from('platform_feature_flags')
    .upsert(payload, { onConflict: 'key' });

  if (error) {
    if (
      error.message.includes('last_enabled_at') ||
      error.message.includes('last_disabled_at')
    ) {
      const { error: err2 } = await supabaseAdmin
        .from('platform_feature_flags')
        .upsert(
          {
            key: opts.key,
            enabled: opts.enabled,
            updated_at: now,
            updated_by: opts.actorId,
          },
          { onConflict: 'key' },
        );
      if (err2) throw err2;
    } else {
      throw error;
    }
  }

  invalidateFeatureFlagCache();
}

export async function setFeatureFlagTiers(opts: {
  key: FeatureFlagKey;
  crewTiers?: CrewTierSlug[] | null;
  /** @deprecated Prefer crewTiers. Legacy min slug still accepted. */
  minCrewTier?: string | null;
  vesselTiers?: VesselTierSlug[] | null;
  /** @deprecated Prefer vesselTiers. Legacy min slug still accepted. */
  minVesselTier?: string | null;
  actorId: string;
}) {
  const def = getFeatureDefinition(opts.key);
  if (!def) throw new Error('Unknown feature key');

  const hasCrewUpdate =
    opts.crewTiers !== undefined || opts.minCrewTier !== undefined;
  const hasVesselUpdate =
    opts.vesselTiers !== undefined || opts.minVesselTier !== undefined;

  let crewStored: string | null | undefined = undefined;
  if (opts.crewTiers !== undefined) {
    crewStored = encodeCrewTiersAccess(opts.crewTiers);
  } else if (opts.minCrewTier !== undefined) {
    const raw = opts.minCrewTier;
    if (raw == null || raw === '') {
      crewStored = null;
    } else if (String(raw).startsWith('set:')) {
      crewStored = encodeCrewTiersAccess(parseCrewTiersAccess(String(raw)));
    } else {
      const slug = normalizeCrewTierSlug(raw);
      if (!slug && def.audience !== 'vessel') {
        throw new Error('Invalid minCrewTier');
      }
      crewStored = slug ? encodeCrewTiersAccess(parseCrewTiersAccess(slug)) : null;
    }
  }

  let vesselStored: string | null | undefined = undefined;
  if (opts.vesselTiers !== undefined) {
    vesselStored = encodeVesselTiersAccess(opts.vesselTiers);
  } else if (opts.minVesselTier !== undefined) {
    const raw = opts.minVesselTier;
    if (raw == null || raw === '') {
      vesselStored = null;
    } else if (String(raw).startsWith('set:')) {
      vesselStored = encodeVesselTiersAccess(parseVesselTiersAccess(String(raw)));
    } else {
      const slug = normalizeVesselTierSlug(raw);
      if (!slug) throw new Error('Invalid minVesselTier');
      vesselStored = encodeVesselTiersAccess(parseVesselTiersAccess(slug));
    }
  }

  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('platform_feature_flags')
    .select('enabled, min_crew_tier, min_vessel_tier')
    .eq('key', opts.key)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    key: opts.key,
    enabled: existing?.enabled ?? true,
    updated_at: now,
    updated_by: opts.actorId,
  };

  if (def.audience === 'vessel') {
    payload.min_crew_tier = null;
  } else if (hasCrewUpdate) {
    payload.min_crew_tier = crewStored ?? null;
  } else {
    payload.min_crew_tier = existing?.min_crew_tier ?? null;
  }

  if (hasVesselUpdate) {
    payload.min_vessel_tier = vesselStored ?? null;
  } else {
    payload.min_vessel_tier = existing?.min_vessel_tier ?? null;
  }

  const { error } = await supabaseAdmin
    .from('platform_feature_flags')
    .upsert(payload, { onConflict: 'key' });

  if (error) {
    if (
      error.message.includes('min_crew_tier') ||
      error.message.includes('min_vessel_tier')
    ) {
      throw new Error(
        'Tier columns missing. Run sql/add-feature-flag-tier-access.sql in Supabase.',
      );
    }
    throw error;
  }

  invalidateFeatureFlagCache();
}

/** Ensure flag row exists, then append a note. */
export async function addFeatureFlagNote(opts: {
  key: FeatureFlagKey;
  body: string;
  actorId: string;
}): Promise<FeatureFlagNote> {
  const body = opts.body.trim().slice(0, 1000);
  if (!body) throw new Error('Note cannot be empty');

  const { data: existing } = await supabaseAdmin
    .from('platform_feature_flags')
    .select('key, enabled')
    .eq('key', opts.key)
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await supabaseAdmin
      .from('platform_feature_flags')
      .insert({
        key: opts.key,
        enabled: true,
        note: body,
        last_enabled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: opts.actorId,
      });
    if (insertErr) {
      const { error: insertErr2 } = await supabaseAdmin
        .from('platform_feature_flags')
        .insert({
          key: opts.key,
          enabled: true,
          note: body,
          updated_at: new Date().toISOString(),
          updated_by: opts.actorId,
        });
      if (insertErr2) throw insertErr2;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('platform_feature_flag_notes')
    .insert({
      feature_key: opts.key,
      body,
      created_by: opts.actorId,
    })
    .select('id, body, created_at, created_by')
    .single();

  if (error) {
    if (
      error.code === '42P01' ||
      error.message.includes('platform_feature_flag_notes')
    ) {
      throw new Error(
        'Notes table missing. Run sql/create-platform-feature-flag-notes.sql in Supabase.',
      );
    }
    throw error;
  }

  await supabaseAdmin
    .from('platform_feature_flags')
    .update({
      note: body,
      updated_at: new Date().toISOString(),
      updated_by: opts.actorId,
    })
    .eq('key', opts.key);

  invalidateFeatureFlagCache();

  return {
    id: String(data.id),
    body: String(data.body),
    createdAt: String(data.created_at),
    createdBy: (data.created_by as string | null) ?? null,
    createdByName: null,
  };
}
