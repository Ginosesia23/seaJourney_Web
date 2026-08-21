/**
 * /dashboard/passages-map — Crew Professional + Vessel Premium+.
 *
 * Visual map of AIS passage history, powered by cached Datalastic data.
 * Crew accounts plot every assignment vessel; vessel managers plot the
 * vessel(s) they own. Each vessel gets its own colour (deterministic
 * from vessel_id).
 *
 * Data flow
 * ---------
 *   1. useUser + useDoc<UserProfile>  → profile + tier gate.
 *   2. GET /api/passages-map/tracks   → cache-first Datalastic backfill.
 *      Returns one FeatureCollection per vessel, ready to hand to MapLibre.
 *   3. MapLibre GL renders each vessel's FeatureCollection as its own
 *      source + line layer. Legend toggles visibility per vessel.
 *
 * All rendering is client-side; the API is the only server touchpoint. The
 * page is intentionally full-bleed (dashboard layout already grants that
 * treatment for map-style paths — see dashboard/layout.tsx).
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Map as MapLibreMap,
  LngLatBounds,
  NavigationControl,
  ScaleControl,
  Popup,
  Marker,
  type LngLatBoundsLike,
  type StyleSpecification,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Loader2,
  RefreshCw,
  Ship,
  AlertCircle,
  MapPin,
  Eye,
  EyeOff,
  Moon,
  Sun,
  Compass,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Download,
  BookMarked,
  BookPlus,
} from 'lucide-react';

import { useSupabase, useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { isVesselLinkedFeatureGranted } from '@/lib/vessel-linked-features';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { VesselPremiumFeatureGate } from '@/components/dashboard/vessel-premium-feature-gate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';
import {
  buildAisPassageFingerprint,
  isAisVoyageLinkedToLogbook,
  type LogbookLinkRow,
} from '@/lib/passages/ais-logbook-link';
import {
  buildOfflineWorldStyle,
  getOfflineBordersGeoJson,
  getOfflineCoastlineGeoJson,
  getOfflineLandGeoJson,
  getOfflineCountryLayers,
  loadHighDetailWorldGeo,
  OFFLINE_THEME_FOR_STYLE,
} from '@/lib/passages-map/build-offline-style';
import { ensureMaplibreWorkerConfigured } from '@/lib/passages-map/setup-maplibre-worker';
import { segmentCrossesLand } from '@/lib/passages-map/segment-crosses-land';
import {
  renderPassagePopupHtml,
  renderLiveTrackPopupHtml,
  PASSAGE_POPUP_STYLE,
} from '@/lib/passages-map/passage-popup-content';
import {
  installMapLabels,
  MAP_LABELS_STYLE,
  type MapLabelHandle,
} from '@/lib/passages-map/map-labels';
import {
  collectTrackPlaceSamples,
  dedupeDiscoveredPlaces,
  loadCachedDiscoveredPlaces,
  mergeDiscoveredPlaces,
  resolveSampleFromCurated,
  saveCachedDiscoveredPlaces,
  type DiscoveredPlace,
} from '@/lib/passages-map/discover-places';
import {
  ensurePassageArrowImage,
  PASSAGE_ARROW_IMAGE_ID,
} from '@/lib/passages-map/passage-icons';
import { passagePortLabel } from '@/lib/passages-map/nearest-port';
import { scrubAlongTrack, sampleAtProgress, type ScrubSample } from '@/lib/passages-map/scrub-along-track';
import { buildTripTitle } from '@/lib/passages-map/trip-title';
import {
  buildVoyageCardPng,
  downloadBlob,
} from '@/lib/passages-map/export-voyage-card';
import { selectionPaletteForVesselColor } from '@/lib/passages-map/vessel-colors';
import { smoothLineCoordinates } from '@/lib/passages-map/smooth-track';
import {
  PassageTimelineBar,
  type PassageTimelineMeta,
} from '@/components/passages-map/passage-timeline-bar';

// Point MapLibre at a stable, self-hosted worker URL BEFORE any Map
// instance can be created. Without this, MapLibre's auto-detected
// worker URL is unreachable under Next.js/Turbopack and every geojson
// source silently stays stuck at `isSourceLoaded: false` — see the
// setup module for the full post-mortem.
if (typeof window !== 'undefined') {
  ensureMaplibreWorkerConfigured();
}

/**
 * Curated basemap styles.
 *
 * Every style has TWO representations:
 *
 *   1. `offlineStyle` — a self-contained MapLibre style built from
 *      bundled `world-atlas/countries-110m` topojson. NO network
 *      requests. This is what we render by default, because vector-tile
 *      CDNs (CARTO, OpenFreeMap, MapTiler…) are routinely blocked by
 *      adblockers and corporate proxies — and when they're blocked
 *      MapLibre just silently draws nothing. That produced a blank
 *      map for real users, and the "premium Professional feature"
 *      absolutely cannot be at the mercy of a browser extension.
 *
 *   2. `remoteStyleUrl` (optional) — a richer vector-tile URL to
 *      upgrade to IF it loads within a short timeout. If it does,
 *      users get proper roads / labels / hillshading. If it doesn't,
 *      they keep the offline continents view and never notice.
 *
 * Themes: Deep Sea (dark, default), Atlas (muted mid-tone), Chart
 * (minimal light). The tone drives track paint on top of the basemap.
 */
type MapStyleId = 'deep-sea' | 'atlas' | 'chart';

type BasemapTone = 'dark' | 'muted' | 'light';

type MapStyleConfig = {
  id: MapStyleId;
  label: string;
  hint: string;
  /** How dark the underlying basemap is — used to tune track paint. */
  tone: BasemapTone;
  /** For the switcher icon. */
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Always-works local style built from bundled topojson. This is what
   * we render initially so the map is guaranteed to appear — even with
   * an adblocker or an offline browser.
   */
  offlineStyle: StyleSpecification;
  /**
   * OPTIONAL richer vector-tile URL. Loaded in the background AFTER
   * the offline style renders; if it loads within a short timeout we
   * transparently upgrade to it. If it doesn't (CDN blocked, offline,
   * timeout) we stay on the offline style and the user sees nothing
   * unusual.
   */
  remoteStyleUrl?: string;
};

const MAP_STYLES: Record<MapStyleId, MapStyleConfig> = {
  'deep-sea': {
    id: 'deep-sea',
    label: 'Deep Sea',
    hint: 'Dark, high-contrast tracks',
    tone: 'dark',
    icon: Moon,
    offlineStyle: buildOfflineWorldStyle({ theme: 'dark' }),
    remoteStyleUrl: 'https://tiles.openfreemap.org/styles/dark',
  },
  atlas: {
    id: 'atlas',
    label: 'Atlas',
    hint: 'Muted mid-tone',
    tone: 'muted',
    icon: Compass,
    offlineStyle: buildOfflineWorldStyle({ theme: 'muted' }),
    remoteStyleUrl: 'https://tiles.openfreemap.org/styles/fiord',
  },
  chart: {
    id: 'chart',
    label: 'Chart',
    hint: 'Minimal light',
    tone: 'light',
    icon: Sun,
    offlineStyle: buildOfflineWorldStyle({ theme: 'light' }),
    remoteStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
  },
};

const DEFAULT_STYLE_ID: MapStyleId = 'deep-sea';
const STYLE_STORAGE_KEY = 'passages-map:style';

/**
 * How long we give the remote vector-tile CDN to load before giving up
 * and staying on the offline style. Kept snappy — the user is already
 * looking at a real map (offline) so this is purely an "upgrade" wait.
 */
const REMOTE_STYLE_UPGRADE_TIMEOUT_MS = 4000;

/**
 * Paint tuning per basemap tone so tracks always read clearly.
 *
 * All widths are expressed twice — a `low` value applied at
 * `zoom === 0` and a `high` value at `zoom === 10` — with MapLibre
 * exponentially interpolating between them so the tracks stay visually
 * consistent whether you're looking at a whole ocean basin or a
 * single-harbour approach.
 *
 * `endpointColor` is the ring colour drawn on top of the vessel-tinted
 * dot at the start/end of every passage. On dark tiles a white ring
 * gives crisp "beacon" contrast; on the light chart tone a near-black
 * ring reads better against the parchment ocean.
 */
const TRACK_PAINT_BY_TONE: Record<
  MapStyleConfig['tone'],
  {
    lineOpacity: number;
    glowOpacity: number;
    glowBlur: number;
    lineWidthLow: number;
    lineWidthHigh: number;
    glowWidthLow: number;
    glowWidthHigh: number;
    /** Dark under-stroke so coloured cores read as chart tracks. */
    casingColor: string;
    casingOpacity: number;
    /** Extra width of the casing beyond the core line. */
    casingExtra: number;
    /** Thin ridge on top of the core — chart “inked track” depth. */
    sheenColor: string;
    sheenOpacity: number;
    /** How much more opaque the glow gets on hover. */
    hoverGlowOpacityBoost: number;
    hoverLineOpacityBoost: number;
    hoverSheenOpacityBoost: number;
    endpointColor: string;
    endpointHaloOpacity: number;
  }
> = {
  dark: {
    lineOpacity: 0.97,
    glowOpacity: 0.28,
    glowBlur: 2.4,
    lineWidthLow: 1.85,
    lineWidthHigh: 4.0,
    glowWidthLow: 5.5,
    glowWidthHigh: 12,
    casingColor: '#020617',
    casingOpacity: 0.88,
    casingExtra: 2.6,
    sheenColor: '#ffffff',
    sheenOpacity: 0.28,
    hoverGlowOpacityBoost: 0.32,
    hoverLineOpacityBoost: 0.03,
    hoverSheenOpacityBoost: 0.18,
    endpointColor: '#f8fafc',
    endpointHaloOpacity: 0.2,
  },
  muted: {
    lineOpacity: 0.95,
    glowOpacity: 0.24,
    glowBlur: 2.2,
    lineWidthLow: 1.75,
    lineWidthHigh: 3.8,
    glowWidthLow: 5,
    glowWidthHigh: 11,
    casingColor: '#0b1220',
    casingOpacity: 0.82,
    casingExtra: 2.45,
    sheenColor: '#ffffff',
    sheenOpacity: 0.24,
    hoverGlowOpacityBoost: 0.28,
    hoverLineOpacityBoost: 0.04,
    hoverSheenOpacityBoost: 0.16,
    endpointColor: '#f1f5f9',
    endpointHaloOpacity: 0.16,
  },
  light: {
    lineOpacity: 0.94,
    glowOpacity: 0.18,
    glowBlur: 1.8,
    lineWidthLow: 1.7,
    lineWidthHigh: 3.6,
    glowWidthLow: 4.5,
    glowWidthHigh: 10,
    casingColor: '#f8fafc',
    casingOpacity: 0.98,
    casingExtra: 2.7,
    sheenColor: '#ffffff',
    sheenOpacity: 0.35,
    hoverGlowOpacityBoost: 0.22,
    hoverLineOpacityBoost: 0.05,
    hoverSheenOpacityBoost: 0.12,
    endpointColor: '#0f172a',
    endpointHaloOpacity: 0.12,
  },
};

/**
 * Dedicated accent for LIVE position + active underway track.
 * Kept intentionally off the per-vessel palette so live never reads
 * as "just another historical passage".
 */
const LIVE_ACCENT = '#34d399';
const LIVE_ACCENT_DEEP = '#059669';

type VesselTotals = {
  passageCount: number;
  totalDistanceNm: number;
  pointCount: number;
  firstFixAt: string | null;
  lastFixAt: string | null;
};

type VesselResponse = {
  vesselId: string;
  vesselName: string;
  colorHex: string;
  /** GeoJSON for the currently selected view (single month or all-time union). */
  featureCollection: GeoJSON.FeatureCollection;
  bbox: number[] | null;
  totals: VesselTotals;
  /** Month keys (YYYY-MM-01) that this vessel has cached data for. */
  availableMonths: string[];
  source: 'cache' | 'fetched' | 'refreshed' | 'empty' | 'skipped';
  skipReason?: string;
  /**
   * Passages we removed from THIS vessel because the crew was on
   * leave. Rendered as a small badge on the vessel row so users
   * understand why some of their AIS history isn't on the map.
   */
  excludedByLeave?: { passageCount: number; distanceNm: number };
};

type TracksView = {
  mode: 'month' | 'all';
  /** Selected month key (YYYY-MM-01), or null when mode === 'all'. */
  month: string | null;
  isCurrentMonth: boolean;
  /** Union of candidate + cached months across all vessels (sorted). */
  availableMonths: string[];
  earliestMonth: string | null;
  latestMonth: string | null;
};

type TracksResponse = {
  view: TracksView;
  vessels: VesselResponse[];
  totals: VesselTotals;
  /**
   * Grand total of passages excluded across all vessels because the
   * user was on leave when they happened. Rendered in the sidebar
   * totals so the user knows the "5 passages, 320 NM" figure has
   * already accounted for their leave periods.
   */
  excludedByLeave?: { passageCount: number; distanceNm: number };
  datalasticRequestCount: number;
  quotaHit: boolean;
  message?: string;
};

type ViewSelection =
  | { mode: 'month'; month: string }
  | { mode: 'all' };

type LivePosition = {
  lat: number;
  lon: number;
  speedKn: number | null;
  heading: number | null;
  course: number | null;
  state: string;
  navStatus: string | null;
  destination?: string | null;
  aisPositionAt: string | null;
  sampledAt: string;
  isStale: boolean;
};

const LIVE_TRACK_LINE_LAYER = 'live-active-tracks:line';
const LIVE_TRACK_CASING_LAYER = 'live-active-tracks:casing';
const SCRUB_SOURCE_ID = 'passages-scrub-point';
const SCRUB_HALO_LAYER_ID = 'passages-scrub-point:halo';
const SCRUB_LAYER_ID = 'passages-scrub-point:circle';
const SCRUB_ARROW_LAYER_ID = 'passages-scrub-point:arrow';
const SCRUB_TRAIL_SOURCE_ID = 'passages-scrub-trail';
const SCRUB_TRAIL_LAYER_ID = 'passages-scrub-trail:line';
const SCRUB_TRAIL_GLOW_LAYER_ID = 'passages-scrub-trail:glow';

type LiveVessel = {
  vesselId: string;
  vesselName: string;
  colorHex: string;
  live: LivePosition | null;
  activeTrack: GeoJSON.FeatureCollection | null;
};

type LiveResponse = {
  vessels: LiveVessel[];
  fetchedAt: string;
  trackingEnabled: boolean;
  message?: string;
};

/** How often we re-poll `/api/passages-map/live` while the page is open. */
const LIVE_POLL_MS = 60_000;

export default function PassagesMapPage() {
  const { user, isUserLoading } = useUser();
  const { session } = useSupabase();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(
    'users',
    user?.id,
  );
  const { isEnabled: isFeatureEnabled, isLoading: isFlagsLoading } =
    useFeatureFlags();

  const eligible = React.useMemo(
    () => hasPassagesMapAccess(userProfile),
    [userProfile],
  );
  const featureOn = isFeatureEnabled('passages_map');
  const isVesselAccount = React.useMemo(() => {
    const role = (
      (userProfile as { role?: string } | null)?.role ||
      ''
    )
      .toString()
      .toLowerCase();
    if (role === 'vessel') return true;
    return isVesselLinkedFeatureGranted(userProfile, 'passages_map');
  }, [userProfile]);

  const [tracks, setTracks] = React.useState<TracksResponse | null>(null);
  const [live, setLive] = React.useState<LiveResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [logbookFingerprints, setLogbookFingerprints] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [logbookLinks, setLogbookLinks] = React.useState<LogbookLinkRow[]>([]);
  const [promotingKey, setPromotingKey] = React.useState<string | null>(null);
  const [isSyncingLogbook, setIsSyncingLogbook] = React.useState(false);
  const [logbookMissingDismissed, setLogbookMissingDismissed] =
    React.useState(false);
  const [hiddenVessels, setHiddenVessels] = React.useState<Set<string>>(new Set());
  /** When set, that vessel's tracks stay full-strength; others dim. */
  const [focusedVesselId, setFocusedVesselId] = React.useState<string | null>(
    null,
  );
  /** Selected passage for timeline scrub + row highlight. */
  const [selectedPassage, setSelectedPassage] = React.useState<{
    vesselId: string;
    passageIndex: number;
  } | null>(null);
  const [scrubProgress, setScrubProgress] = React.useState(0);
  const [scrubSample, setScrubSample] = React.useState<ScrubSample | null>(null);
  const handleScrubProgress = React.useCallback((p: number) => {
    setScrubProgress(p);
    // Drive MapLibre imperatively first so the marker tracks the
    // pointer even if React state flush is slightly deferred.
    const sample = canvasRef.current?.scrubToProgress(p) ?? null;
    setScrubSample(sample);
  }, []);
  const [styleId, setStyleId] = React.useState<MapStyleId>(DEFAULT_STYLE_ID);
  // Collapse the sidebar body (month nav, vessels, stats) while keeping
  // the header strip visible. State lives here so expand/collapse doesn't
  // remount the overlay and lose scroll position.
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [tripToast, setTripToast] = React.useState<{
    title: string;
    vesselName: string;
    colorHex: string;
  } | null>(null);
  const tripToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isExporting, setIsExporting] = React.useState(false);
  /** Town/port labels unlocked by sailing — grows as tracks load. */
  const [discoveredPlaces, setDiscoveredPlaces] = React.useState<
    DiscoveredPlace[]
  >([]);

  const showTripToast = React.useCallback(
    (next: { title: string; vesselName: string; colorHex: string }) => {
      if (tripToastTimerRef.current) clearTimeout(tripToastTimerRef.current);
      setTripToast(next);
      tripToastTimerRef.current = setTimeout(() => {
        setTripToast(null);
        tripToastTimerRef.current = null;
      }, 3800);
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      if (tripToastTimerRef.current) clearTimeout(tripToastTimerRef.current);
    };
  }, []);

  // Imperative handle to the map canvas — used by the sidebar's
  // passage list to trigger fly-to-passage animations without lifting
  // MapLibre state into React (which would defeat the whole reason
  // MapLibre is a canvas-owning DOM library in the first place).
  const canvasRef = React.useRef<PassagesMapCanvasHandle | null>(null);
  // What the user is currently looking at. Defaults to the current UTC
  // month; the header pill / prev-next arrows / "All time" toggle mutate
  // this and `fetchTracks` reads it to build the API query.
  const [view, setView] = React.useState<ViewSelection>(() => ({
    mode: 'month',
    month: currentMonthKeyClient(),
  }));

  // Deep-link from Passage Logbook: ?month=YYYY-MM&vessel=<uuid>
  const deepLinkAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const month = searchParams?.get('month')?.trim();
    const vessel = searchParams?.get('vessel')?.trim();
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      deepLinkAppliedRef.current = true;
      setView({ mode: 'month', month });
    }
    if (vessel) {
      deepLinkAppliedRef.current = true;
      setFocusedVesselId(vessel);
    }
  }, [searchParams]);

  const logbookMissingCount = React.useMemo(() => {
    if (!tracks?.vessels?.length) return 0;
    let missing = 0;
    for (const vessel of tracks.vessels) {
      for (const feature of vessel.featureCollection?.features ?? []) {
        if (feature.geometry?.type !== 'LineString') continue;
        const start = String(feature.properties?.startTime ?? '');
        const end = String(feature.properties?.endTime ?? '');
        if (!start || !end) continue;
        const fingerprint = buildAisPassageFingerprint(
          vessel.vesselId,
          start,
          end,
        );
        const linked = isAisVoyageLinkedToLogbook(
          {
            vesselId: vessel.vesselId,
            startTime: start,
            endTime: end,
            fingerprint,
          },
          logbookFingerprints,
          logbookLinks,
        );
        if (!linked) missing += 1;
      }
    }
    return missing;
  }, [tracks, logbookFingerprints, logbookLinks]);

  const selectedPassageMeta = React.useMemo((): PassageTimelineMeta | null => {
    if (!selectedPassage || !tracks?.vessels?.length) return null;
    const vessel = tracks.vessels.find(
      (v) => v.vesselId === selectedPassage.vesselId,
    );
    const feature =
      vessel?.featureCollection?.features?.[selectedPassage.passageIndex];
    if (!vessel || !feature) return null;
    const routeLabel =
      deriveRouteLabelFromLineFeature(feature) ?? 'Selected passage';
    return {
      vesselId: vessel.vesselId,
      passageIndex: selectedPassage.passageIndex,
      vesselName: vessel.vesselName,
      colorHex: vessel.colorHex,
      routeLabel,
      startTime: strOrUndef(feature.properties?.startTime),
      endTime: strOrUndef(feature.properties?.endTime),
      distanceNm: numOrUndef(feature.properties?.distanceNm),
    };
  }, [selectedPassage, tracks]);

  React.useEffect(() => {
    // Re-show banner when missing count increases (new months loaded).
    setLogbookMissingDismissed(false);
  }, [tracks?.totals?.passageCount]);

  const handleExportVoyageCard = React.useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const visible = (tracks?.vessels ?? []).filter(
        (v) => !hiddenVessels.has(v.vesselId),
      );
      const periodLabel =
        view.mode === 'all' ? 'All time' : monthLabelTitleCase(view.month);
      await canvasRef.current?.exportVoyageCard({
        title: 'Passage Map',
        subtitle:
          view.mode === 'all'
            ? 'Cached passages across your service'
            : `AIS passages · ${periodLabel}`,
        periodLabel,
        vessels: visible.map((v) => v.vesselName),
        passageCount: visible.reduce((n, v) => n + v.totals.passageCount, 0),
        totalDistanceNm: visible.reduce(
          (n, v) => n + v.totals.totalDistanceNm,
          0,
        ),
      });
    } catch (err) {
      console.warn('[passages-map] export failed', err);
    } finally {
      setIsExporting(false);
    }
  }, [hiddenVessels, isExporting, tracks?.vessels, view]);

  // Load persisted basemap choice once on mount. localStorage may throw in
  // private-browsing / server-side contexts; swallow those safely.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STYLE_STORAGE_KEY);
      if (saved && saved in MAP_STYLES) setStyleId(saved as MapStyleId);
    } catch {
      /* ignore */
    }
  }, []);

  const handleStyleChange = React.useCallback((next: MapStyleId) => {
    setStyleId(next);
    try {
      window.localStorage.setItem(STYLE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (!eligible || !session?.access_token || !user?.id) return;
    if (!tracks?.vessels?.length) return;

    let cancelled = false;

    const samples = collectTrackPlaceSamples(
      tracks.vessels.map((v) => v.featureCollection),
    );
    if (samples.length === 0) return;

    // Instant curated ports from local data + any previously unlocked places.
    const cached = loadCachedDiscoveredPlaces(user.id);
    const curated = samples
      .map((s) => resolveSampleFromCurated(s))
      .filter((p): p is DiscoveredPlace => p != null);
    const seed = mergeDiscoveredPlaces(cached, curated);
    setDiscoveredPlaces(seed);

    const knownKeys = new Set(seed.map((p) => p.cellKey));
    const unknown = samples.filter((s) => !knownKeys.has(s.cellKey));
    if (unknown.length === 0) {
      saveCachedDiscoveredPlaces(user.id, seed);
      return;
    }

    void (async () => {
      try {
        const res = await fetch('/api/passages-map/places', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ samples: unknown }),
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          places?: DiscoveredPlace[];
        };
        if (cancelled) return;
        const incoming = Array.isArray(json.places) ? json.places : [];
        const merged = mergeDiscoveredPlaces(seed, incoming);
        const finalPlaces = dedupeDiscoveredPlaces(merged);
        saveCachedDiscoveredPlaces(user.id, finalPlaces);
        setDiscoveredPlaces(finalPlaces);
      } catch {
        /* discovery is progressive polish — never block the map */
        saveCachedDiscoveredPlaces(user.id, seed);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eligible, session?.access_token, user?.id, tracks?.vessels]);

  React.useEffect(() => {
    if (!eligible || !session?.access_token || !user?.id) return;
    // Hydrate from server once so places unlocked on another device show up.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/passages-map/places', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { places?: DiscoveredPlace[] };
        if (cancelled || !Array.isArray(json.places) || json.places.length === 0) {
          return;
        }
        setDiscoveredPlaces((prev) => {
          const merged = mergeDiscoveredPlaces(prev, json.places!);
          saveCachedDiscoveredPlaces(user.id, merged);
          return merged;
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, session?.access_token, user?.id]);

  const fetchTracks = React.useCallback(
    async (
      selection: ViewSelection,
      opts?: { refresh?: boolean; vesselId?: string },
    ) => {
      if (!session?.access_token) return;
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selection.mode === 'all') params.set('range', 'all');
        else params.set('month', selection.month);
        if (opts?.refresh) params.set('refresh', '1');
        if (opts?.vesselId) params.set('vesselId', opts.vesselId);
        const qs = params.toString();
        const res = await fetch(`/api/passages-map/tracks${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = (await res.json()) as TracksResponse | { error?: string };
        if (!res.ok) {
          throw new Error((json as { error?: string }).error || 'Failed to load passages');
        }
        setTracks(json as TracksResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load passages');
      } finally {
        setIsLoading(false);
      }
    },
    [session?.access_token],
  );

  const fetchLogbookLinks = React.useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/passages-map/promote', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        fingerprints?: string[];
        links?: LogbookLinkRow[];
      };
      setLogbookFingerprints(new Set(json.fingerprints ?? []));
      setLogbookLinks(json.links ?? []);
    } catch {
      /* ignore — logbook links are optional UI chrome */
    }
  }, [session?.access_token]);

  React.useEffect(() => {
    if (!eligible || !session?.access_token) return;
    void fetchLogbookLinks();
  }, [eligible, session?.access_token, fetchLogbookLinks]);

  const promotePassageToLogbook = React.useCallback(
    async (opts: {
      vesselId: string;
      startTime: string;
      endTime: string;
      distanceNm?: number;
      avgSpeedKn?: number | null;
      maxSpeedKn?: number | null;
      pointCount?: number;
      coordinates?: [number, number][];
    }) => {
      if (!session?.access_token) return;
      const fingerprint = buildAisPassageFingerprint(
        opts.vesselId,
        opts.startTime,
        opts.endTime,
      );
      setPromotingKey(fingerprint);
      try {
        const res = await fetch('/api/passages-map/promote', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(opts),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          alreadyLinked?: boolean;
          error?: string;
          fingerprint?: string;
        };
        if (!res.ok) throw new Error(json.error || 'Failed to save to logbook');
        setLogbookFingerprints((prev) => {
          const next = new Set(prev);
          next.add(json.fingerprint || fingerprint);
          return next;
        });
        await fetchLogbookLinks();
        toast({
          title: json.alreadyLinked ? 'Already in logbook' : 'Saved to Passage Log',
          description: json.alreadyLinked
            ? 'Linked — add weather and notes in the logbook.'
            : 'Add weather and notes in the logbook.',
          action: (
            <ToastAction
              altText="Open logbook"
              onClick={() => router.push('/dashboard/passage-logbook')}
            >
              Open logbook
            </ToastAction>
          ),
        });
      } catch (err) {
        toast({
          title: 'Could not save to logbook',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setPromotingKey(null);
      }
    },
    [session?.access_token, toast, fetchLogbookLinks, router],
  );

  const syncAllToLogbook = React.useCallback(async () => {
    if (!session?.access_token || isSyncingLogbook) return;
    setIsSyncingLogbook(true);
    try {
      const res = await fetch('/api/passages-map/sync-logbook', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        createdCount?: number;
        skippedCount?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Failed to sync logbook');
      await fetchLogbookLinks();
      toast({
        title:
          (json.createdCount ?? 0) > 0
            ? 'Added to Passage Log'
            : 'Logbook already up to date',
        description:
          json.message ||
          `Created ${json.createdCount ?? 0}, already linked ${json.skippedCount ?? 0}.`,
      });
    } catch (err) {
      toast({
        title: 'Could not sync to logbook',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingLogbook(false);
    }
  }, [session?.access_token, isSyncingLogbook, fetchLogbookLinks, toast]);

  // Re-fetch whenever the selected view changes (initial load OR the user
  // clicks prev/next/all). We intentionally DON'T watch `tracks` here —
  // the fetch is fully driven by `view` and `session.access_token`.
  React.useEffect(() => {
    if (!eligible || !session?.access_token) return;
    void fetchTracks(view);
  }, [eligible, session?.access_token, view, fetchTracks]);

  // Remember which vessels were underway on the previous live poll so
  // we can promote their active track into the past-passage layer the
  // moment they stop — without waiting for a Datalastic refresh.
  const prevUnderwayRef = React.useRef<
    Map<string, GeoJSON.FeatureCollection>
  >(new Map());

  // Live positions + active underway tracks. Independent of the month
  // view — a vessel underway should show up even when browsing July.
  // Polls every LIVE_POLL_MS while the tab is visible; pauses in the
  // background so we don't burn requests for nothing.
  const fetchLive = React.useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/passages-map/live', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as LiveResponse;

      // Detect underway → finished transitions and fold the live track
      // into the historical FeatureCollection immediately so the dashed
      // emerald line becomes a solid past passage of the vessel colour.
      const nextUnderway = new Map<string, GeoJSON.FeatureCollection>();
      for (const v of json.vessels) {
        if (v.live?.state === 'underway' && v.activeTrack) {
          nextUnderway.set(v.vesselId, v.activeTrack);
        }
      }
      const finished: Array<{
        vesselId: string;
        track: GeoJSON.FeatureCollection;
      }> = [];
      for (const [vesselId, track] of prevUnderwayRef.current) {
        if (!nextUnderway.has(vesselId)) {
          finished.push({ vesselId, track });
        }
      }
      prevUnderwayRef.current = nextUnderway;

      if (finished.length > 0) {
        setTracks((prev): TracksResponse | null => {
          if (!prev) return prev;
          let changed = false;
          const vessels: VesselResponse[] = prev.vessels.map((vessel) => {
            const done = finished.find((f) => f.vesselId === vessel.vesselId);
            if (!done?.track?.features?.length) return vessel;
            const existing = vessel.featureCollection?.features ?? [];
            const incoming: GeoJSON.Feature[] = done.track.features.map(
              (f, i) => ({
                ...f,
                properties: {
                  ...(f.properties ?? {}),
                  // Re-index so the past-passage list / hover ids stay unique.
                  passageIndex: existing.length + i,
                  kind: 'past',
                },
              }),
            );
            const features = [...existing, ...incoming];
            changed = true;
            const totalDistanceNm =
              vessel.totals.totalDistanceNm +
              incoming.reduce((sum, f) => {
                const d = f.properties?.distanceNm;
                return sum + (typeof d === 'number' ? d : 0);
              }, 0);
            return {
              ...vessel,
              featureCollection: {
                type: 'FeatureCollection',
                features,
              },
              totals: {
                ...vessel.totals,
                passageCount: features.length,
                totalDistanceNm: Number(totalDistanceNm.toFixed(2)),
              },
            };
          });
          if (!changed) return prev;
          return {
            ...prev,
            vessels,
            totals: {
              ...prev.totals,
              passageCount: vessels.reduce(
                (n, v) => n + v.totals.passageCount,
                0,
              ),
              totalDistanceNm: Number(
                vessels
                  .reduce((n, v) => n + v.totals.totalDistanceNm, 0)
                  .toFixed(2),
              ),
            },
          };
        });
        // Intentionally NO immediate server refresh here — a cache
        // miss/lag would overwrite the just-promoted past track and
        // make it vanish. The next manual refresh / current-month TTL
        // persists it into `crew_passage_month_cache`.
      }

      setLive(json);
    } catch {
      /* live overlay is best-effort — don't surface as a page error */
    }
  }, [session?.access_token]);

  React.useEffect(() => {
    if (!eligible || !session?.access_token) return;
    void fetchLive();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchLive();
    }, LIVE_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchLive();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [eligible, session?.access_token, fetchLive]);

  // ── Month navigation (lifted from the overlay so keyboard shortcuts
  //    below can drive it too) ──────────────────────────────────────
  const availableMonths = React.useMemo(
    () => tracks?.view.availableMonths ?? [currentMonthKeyClient()],
    [tracks?.view.availableMonths],
  );
  // Months that actually HAVE cached data (vs candidates the user can
  // navigate to but which haven't been fetched yet). Used for the
  // filled-vs-hollow dots in the navigator.
  const cachedMonths = React.useMemo(() => {
    const set = new Set<string>();
    for (const v of tracks?.vessels ?? []) {
      for (const m of v.availableMonths) set.add(m);
    }
    return set;
  }, [tracks?.vessels]);

  const monthIndex =
    view.mode === 'month' ? availableMonths.indexOf(view.month) : -1;
  const canGoPrev = view.mode === 'month' && monthIndex > 0;
  const canGoNext =
    view.mode === 'month' &&
    monthIndex >= 0 &&
    monthIndex < availableMonths.length - 1;

  const goToMonth = React.useCallback(
    (monthKey: string) => setView({ mode: 'month', month: monthKey }),
    [],
  );
  const goPrev = React.useCallback(() => {
    if (!canGoPrev) return;
    const target = availableMonths[monthIndex - 1];
    if (target) goToMonth(target);
  }, [canGoPrev, availableMonths, monthIndex, goToMonth]);
  const goNext = React.useCallback(() => {
    if (!canGoNext) return;
    const target = availableMonths[monthIndex + 1];
    if (target) goToMonth(target);
  }, [canGoNext, availableMonths, monthIndex, goToMonth]);
  const goAll = React.useCallback(() => setView({ mode: 'all' }), []);
  const goCurrent = React.useCallback(
    () => goToMonth(currentMonthKeyClient()),
    [goToMonth],
  );

  // ── Keyboard shortcuts ──
  // ← / → browse months, A = all time, C = current month. Ignored when
  // the user is typing in a form control so we never hijack real input.
  React.useEffect(() => {
    if (!eligible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          // When in all-time mode there's no "previous month" — do
          // nothing rather than surprising the user with a mode change.
          if (view.mode === 'month') {
            e.preventDefault();
            goPrev();
          }
          break;
        case 'ArrowRight':
          if (view.mode === 'month') {
            e.preventDefault();
            goNext();
          }
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          goAll();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          goCurrent();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          canvasRef.current?.fitToVisible();
          break;
        case 'Escape':
          e.preventDefault();
          canvasRef.current?.clearHover();
          setFocusedVesselId(null);
          setSelectedPassage(null);
          setScrubSample(null);
          setScrubProgress(0);
          break;
        case '[':
          e.preventDefault();
          setSidebarCollapsed(true);
          break;
        case ']':
          e.preventDefault();
          setSidebarCollapsed(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [eligible, view.mode, goPrev, goNext, goAll, goCurrent]);

  // Drop focus if the focused vessel disappears from the roster.
  React.useEffect(() => {
    if (!focusedVesselId) return;
    const stillThere = (tracks?.vessels ?? []).some(
      (v) => v.vesselId === focusedVesselId,
    );
    if (!stillThere) setFocusedVesselId(null);
  }, [tracks?.vessels, focusedVesselId]);

  if (isUserLoading || isProfileLoading || isFlagsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Disabled features are redirected by dashboard layout; keep a quiet guard.
  if (!featureOn) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <VesselPremiumFeatureGate
          title={
            isVesselAccount
              ? 'Available on Vessel Premium and above'
              : 'Available on Crew Professional'
          }
          featureLabel="The Passages Map"
          plansLabel={
            isVesselAccount
              ? 'Vessel Premium, Vessel Professional, and Fleet'
              : 'Crew Professional'
          }
          description={
            isVesselAccount
              ? 'Plot your vessel’s AIS passage history on an interactive world map.'
              : "Plot every passage you've done across all your vessels on an interactive world map, powered by AIS history."
          }
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full bg-slate-950">
      <PassagesMapCanvas
        ref={canvasRef}
        vessels={tracks?.vessels ?? []}
        liveVessels={live?.vessels ?? []}
        hiddenVessels={hiddenVessels}
        focusedVesselId={focusedVesselId}
        styleId={styleId}
        discoveredPlaces={discoveredPlaces}
        // Re-fit whenever the selected view finishes loading — not on
        // every vessel-hide toggle, which would feel jarring.
        fitToken={
          isLoading
            ? null
            : `${view.mode}:${view.mode === 'month' ? view.month : 'all'}:${tracks?.totals.passageCount ?? 0}`
        }
        sidebarCollapsed={sidebarCollapsed}
        timelineActive={Boolean(selectedPassage)}
        onPassageSelect={(sel) => {
          setSelectedPassage(sel);
          setScrubProgress(0);
          requestAnimationFrame(() => {
            const sample = canvasRef.current?.scrubToProgress(0) ?? null;
            setScrubSample(sample);
          });
        }}
        onPassageClear={() => {
          setSelectedPassage(null);
          setScrubSample(null);
          setScrubProgress(0);
        }}
      />

      {/*
        Loading pill — shown top-centre of the MAP (not the sidebar)
        during month switches, when there's already data on screen. The
        very first load uses the sidebar's own spinner instead, so this
        only handles the "browsing months" case where the map would
        otherwise silently show stale tracks.
      */}
      {isLoading && tracks && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-xs font-medium text-white/85 shadow-xl shadow-black/40 backdrop-blur-xl">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
            {view.mode === 'all'
              ? 'Loading all-time history…'
              : `Loading ${monthLabelTitleCase(view.month)}…`}
          </div>
        </div>
      )}

      {tripToast && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex max-w-[min(92vw,420px)] items-center gap-2.5 rounded-full border border-white/12 bg-slate-950/90 px-4 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
              style={{ backgroundColor: tripToast.colorHex, color: tripToast.colorHex }}
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-white">
                {tripToast.title}
              </p>
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/45">
                {tripToast.vesselName}
              </p>
            </div>
          </div>
        </div>
      )}

      {!isLoading &&
        !logbookMissingDismissed &&
        !selectedPassage &&
        logbookMissingCount > 0 &&
        (tracks?.totals.passageCount ?? 0) > 0 && (
          <div className="absolute bottom-6 left-1/2 z-20 w-[min(92vw,440px)] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-3 rounded-2xl border border-sky-400/25 bg-slate-950/92 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <BookPlus className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">
                  {logbookMissingCount} voyage
                  {logbookMissingCount === 1 ? '' : 's'} not in Passage Log
                </p>
                <p className="mt-0.5 text-xs text-white/55">
                  Keep map tracks and your logbook in sync.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg"
                    disabled={isSyncingLogbook}
                    onClick={() => void syncAllToLogbook()}
                  >
                    {isSyncingLogbook ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BookPlus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Add all to logbook
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    onClick={() => router.push('/dashboard/passage-logbook')}
                  >
                    Open logbook
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
                    onClick={() => setLogbookMissingDismissed(true)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

      <PassagesLegendOverlay
        tracks={tracks}
        live={live}
        view={view}
        isLoading={isLoading}
        error={error}
        isVesselAccount={isVesselAccount}
        hiddenVessels={hiddenVessels}
        focusedVesselId={focusedVesselId}
        styleId={styleId}
        availableMonths={availableMonths}
        cachedMonths={cachedMonths}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        collapsed={sidebarCollapsed}
        isExporting={isExporting}
        onPrev={goPrev}
        onNext={goNext}
        onAll={goAll}
        onCurrent={goCurrent}
        onGoToMonth={goToMonth}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        onStyleChange={handleStyleChange}
        onToggleVessel={(vesselId) => {
          setHiddenVessels((prev) => {
            const next = new Set(prev);
            if (next.has(vesselId)) next.delete(vesselId);
            else next.add(vesselId);
            return next;
          });
          // Hiding a focused vessel clears focus so the map doesn't
          // stay in a dimmed "focused on nothing" state.
          setFocusedVesselId((prev) => (prev === vesselId ? null : prev));
        }}
        onFocusVessel={(vesselId) => {
          setFocusedVesselId((prev) => (prev === vesselId ? null : vesselId));
          // Focusing always un-hides so the user can see what they picked.
          setHiddenVessels((prev) => {
            if (!prev.has(vesselId)) return prev;
            const next = new Set(prev);
            next.delete(vesselId);
            return next;
          });
        }}
        onRefreshAll={() => void fetchTracks(view, { refresh: true })}
        onRefreshVessel={(vesselId) =>
          void fetchTracks(view, { refresh: true, vesselId })
        }
        onFlyToPassage={(vesselId, passageIndex) => {
          // If the vessel is currently hidden, un-hide it first so
          // the flown-to line is actually visible. Feels wrong to
          // fly to something the user can't see.
          if (hiddenVessels.has(vesselId)) {
            setHiddenVessels((prev) => {
              const next = new Set(prev);
              next.delete(vesselId);
              return next;
            });
          }
          // Multi-vessel views get dense — auto-focus the vessel whose
          // passage we're flying to so scrubbing hits the right line.
          if ((tracks?.vessels.length ?? 0) > 1) {
            setFocusedVesselId(vesselId);
          }
          setSelectedPassage({ vesselId, passageIndex });
          setScrubProgress(0);
          const vessel = tracks?.vessels.find((v) => v.vesselId === vesselId);
          const feature = vessel?.featureCollection?.features?.[passageIndex];
          if (vessel && feature) {
            const routeLabel = deriveRouteLabelFromLineFeature(feature);
            showTripToast({
              title: buildTripTitle({
                routeLabel,
                geometry: feature.geometry,
                startTime: strOrUndef(feature.properties?.startTime),
                endTime: strOrUndef(feature.properties?.endTime),
                durationMs: numOrUndef(feature.properties?.durationMs),
                distanceNm: numOrUndef(feature.properties?.distanceNm),
              }),
              vesselName: vessel.vesselName,
              colorHex: vessel.colorHex,
            });
          }
          canvasRef.current?.flyToPassage(vesselId, passageIndex);
          // Seed timeline at start so the live marker appears immediately.
          requestAnimationFrame(() => {
            const sample = canvasRef.current?.scrubToProgress(0) ?? null;
            setScrubSample(sample);
          });
        }}
        selectedPassage={selectedPassage}
        logbookFingerprints={logbookFingerprints}
        logbookLinks={logbookLinks}
        promotingKey={promotingKey}
        isSyncingLogbook={isSyncingLogbook}
        onPromotePassage={promotePassageToLogbook}
        onSyncAllToLogbook={() => void syncAllToLogbook()}
        onFitToVisible={() => canvasRef.current?.fitToVisible()}
        onExportVoyageCard={() => void handleExportVoyageCard()}
      />

      {selectedPassageMeta && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 w-[min(92vw,720px)] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <PassageTimelineBar
            meta={selectedPassageMeta}
            progress={scrubProgress}
            sample={scrubSample}
            onProgressChange={handleScrubProgress}
            onClose={() => {
              canvasRef.current?.clearHover();
              setSelectedPassage(null);
              setScrubSample(null);
              setScrubProgress(0);
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MapLibre canvas                                                    */
/* ------------------------------------------------------------------ */

/**
 * Imperative surface exposed by `PassagesMapCanvas` for parent
 * components that need to move the map programmatically (currently:
 * the sidebar's passage list "fly to this passage" clicks). Kept
 * intentionally small — anything larger and we should reach for a
 * proper Context instead.
 */
export type PassagesMapCanvasHandle = {
  /**
   * Animate the camera to fit the passage's bbox, then open its popup
   * and highlight the line in the selection colour. No-op if the vessel
   * or passage isn't currently rendered on the map.
   */
  flyToPassage: (vesselId: string, passageIndex: number) => void;
  /** Fit the camera to every currently-visible vessel track. */
  fitToVisible: () => void;
  /** Clear hover + selection highlight and dismiss the popup. */
  clearHover: () => void;
  /**
   * Drive the scrub marker / trail to a distance progress along the
   * currently selected passage (0 = start, 1 = end). Returns the sample
   * used for the timeline readout, or null if nothing is selected.
   */
  scrubToProgress: (progress: number) => ScrubSample | null;
  /** Capture the current map view as a framed voyage-card PNG. */
  exportVoyageCard: (stats: {
    title: string;
    subtitle?: string;
    periodLabel?: string;
    vessels?: string[];
    passageCount?: number;
    totalDistanceNm?: number;
  }) => Promise<void>;
};

const PassagesMapCanvas = React.forwardRef<
  PassagesMapCanvasHandle,
  {
    vessels: VesselResponse[];
    liveVessels: LiveVessel[];
    hiddenVessels: Set<string>;
    focusedVesselId: string | null;
    styleId: MapStyleId;
    /** Town/port labels unlocked by sailing near them. */
    discoveredPlaces: DiscoveredPlace[];
    /** When this token changes (and is non-null), re-fit the camera. */
    fitToken: string | null;
    sidebarCollapsed: boolean;
    /** When true, mouseleave keeps the scrub marker (timeline owns it). */
    timelineActive?: boolean;
    onPassageSelect?: (sel: {
      vesselId: string;
      passageIndex: number;
    }) => void;
    onPassageClear?: () => void;
  }
>(function PassagesMapCanvas(
  {
    vessels,
    liveVessels,
    hiddenVessels,
    focusedVesselId,
    styleId,
    discoveredPlaces,
    fitToken,
    sidebarCollapsed,
    timelineActive = false,
    onPassageSelect,
    onPassageClear,
  },
  ref,
) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const styleLoadedRef = React.useRef(false);
  // Latest prop values, read inside MapLibre event handlers (which capture
  // stale closures otherwise). Refs keep the callbacks tiny without
  // recreating the map when props change.
  const vesselsRef = React.useRef(vessels);
  const liveVesselsRef = React.useRef(liveVessels);
  const hiddenRef = React.useRef(hiddenVessels);
  const focusedVesselIdRef = React.useRef(focusedVesselId);
  const styleIdRef = React.useRef(styleId);
  const sidebarCollapsedRef = React.useRef(sidebarCollapsed);
  const timelineActiveRef = React.useRef(timelineActive);
  const onPassageSelectRef = React.useRef(onPassageSelect);
  const onPassageClearRef = React.useRef(onPassageClear);
  const discoveredPlacesRef = React.useRef(discoveredPlaces);
  // HTML Markers for live vessel pins (pulsing). Kept out of MapLibre
  // style layers so the pulse animation is pure CSS.
  const liveMarkersRef = React.useRef<Map<string, Marker>>(new Map());
  React.useEffect(() => {
    vesselsRef.current = vessels;
  }, [vessels]);
  React.useEffect(() => {
    discoveredPlacesRef.current = discoveredPlaces;
  }, [discoveredPlaces]);
  React.useEffect(() => {
    liveVesselsRef.current = liveVessels;
  }, [liveVessels]);
  React.useEffect(() => {
    hiddenRef.current = hiddenVessels;
  }, [hiddenVessels]);
  React.useEffect(() => {
    focusedVesselIdRef.current = focusedVesselId;
  }, [focusedVesselId]);
  React.useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);
  React.useEffect(() => {
    sidebarCollapsedRef.current = sidebarCollapsed;
  }, [sidebarCollapsed]);
  React.useEffect(() => {
    timelineActiveRef.current = timelineActive;
  }, [timelineActive]);
  React.useEffect(() => {
    onPassageSelectRef.current = onPassageSelect;
  }, [onPassageSelect]);
  React.useEffect(() => {
    onPassageClearRef.current = onPassageClear;
  }, [onPassageClear]);
  // Track which sources/layers we own so we can teardown cleanly when
  // vessels change (e.g. after a refresh returns different segments).
  const ownedSourceIdsRef = React.useRef<Set<string>>(new Set());
  // The single reusable popup we anchor to the currently-hovered
  // passage. Created once when the map boots and repositioned +
  // repopulated on every mousemove hit.
  const popupRef = React.useRef<Popup | null>(null);
  // Records the passage currently in the hover state so we can clear
  // MapLibre's feature-state when the pointer leaves it.
  const hoveredPassageRef = React.useRef<{
    vesselId: string;
    featureId: number;
    kind?: 'past' | 'live';
  } | null>(null);
  // Sticky selection from sidebar click / map click — survives mouseleave
  // so the chosen track stays highlighted (blue or green) until another
  // passage is chosen or Esc.
  const selectedPassageRef = React.useRef<{
    vesselId: string;
    featureId: number;
  } | null>(null);
  // Coalesce scrub setData / popup HTML writes to one per animation
  // frame so mousemove doesn't thrash MapLibre + the DOM.
  const scrubRafRef = React.useRef<number>(0);
  const scrubPendingRef = React.useRef<(() => void) | null>(null);
  // Cache of the LINE layer ids that hover queries should hit — kept in
  // sync with the vessel roster inside `applyVesselLayers`. queryRenderedFeatures
  // takes a `layers` list so restricting to these makes the query cheap
  // and prevents endpoint-circle hits from firing the line-hover
  // handler.
  const vesselLineLayerIdsRef = React.useRef<Set<string>>(new Set());
  // Lookup for vessel metadata (name + colour) used to render the popup
  // header, keyed by vessel id. Filled by applyVesselLayers.
  const vesselMetaRef = React.useRef<Map<string, { name: string; colorHex: string }>>(
    new Map(),
  );
  // Handle for the installed city/country label markers. Installed on
  // the first successful map load; disposed on unmount. Retheme is
  // called from the style-swap effect so labels match the current tone.
  const labelHandleRef = React.useRef<MapLabelHandle | null>(null);

  React.useEffect(() => {
    labelHandleRef.current?.syncDiscoveredPlaces(discoveredPlaces);
  }, [discoveredPlaces]);

  // Which style tier the map is currently rendering. Starts on 'offline'
  // (bundled topojson, always works). We attempt to upgrade to 'remote'
  // (vector tiles) in the background; if that succeeds we stay there,
  // if it fails or times out we quietly stay on 'offline'.
  const styleTierRef = React.useRef<'offline' | 'remote'>('offline');
  const remoteUpgradeTimerRef = React.useRef<number | null>(null);
  // Whether the offline country overlay (fill + stroke, from bundled
  // topojson) is currently installed on the map. Reset whenever we
  // swap styles because MapLibre clears all sources on setStyle().
  const countryOverlayInstalledRef = React.useRef(false);
  // True once we've swapped the low-detail 50m geometry for the high
  // detail 10m dataset on the current sources. Reset in the same places
  // that reset `countryOverlayInstalledRef` so a fresh style load also
  // re-applies the upgrade (the cached FeatureCollections make the
  // subsequent swap effectively instant).
  const highDetailAppliedRef = React.useRef(false);
  // Which style is currently applied on the underlying MapLibre map.
  // The style-swap effect below reads this to avoid a no-op setStyle
  // on mount (which would interrupt the initial style load with a
  // "Style is not done loading, rebuilding from scratch" warning and
  // leave the map blank).
  const appliedStyleIdRef = React.useRef<MapStyleId | null>(null);

  /**
   * Add the offline country geojson + fill + stroke layers to the map,
   * exactly once per style. Called from EVERY event that could signal
   * "map is ready enough to accept new sources" — load, styledata,
   * idle — because on some environments only one of those fires. It's
   * idempotent so calling it multiple times is safe.
   */
  const installCountryOverlay = React.useCallback((map: MapLibreMap) => {
    if (countryOverlayInstalledRef.current) return;
    if (!map.isStyleLoaded()) return;
    try {
      // Idempotent teardown of any prior overlay (e.g. left behind by
      // a stale setStyle) so we can rebuild it cleanly against the
      // current theme.
      const layersToTearDown = [
        'land-coastline',
        'country-borders',
        'land-fill',
        // Legacy layer ids from earlier iterations — still remove them
        // defensively in case a hot reload left stale layers around.
        'countries-stroke',
        'countries-fill',
      ];
      for (const id of layersToTearDown) {
        try {
          if (map.getLayer(id)) map.removeLayer(id);
        } catch {
          /* ignore */
        }
      }
      for (const id of [
        'offline-land',
        'offline-coastline',
        'offline-borders',
        // Legacy source id from when borders were stroked polygons.
        'offline-countries',
      ]) {
        try {
          if (map.getSource(id)) map.removeSource(id);
        } catch {
          /* ignore */
        }
      }

      // Three separate sources:
      //   offline-land      — fill polygons (fill layer only)
      //   offline-coastline — topojson.mesh lines (line layer only)
      //   offline-borders   — interior country border mesh (line only)
      //
      // NEVER put a polygon source on a line layer — geojson-vt clips
      // polygons to tile bounds and the clipped edges get stroked as
      // fake "coastlines", which is what produced the grid lines /
      // rectangular colour blocks at world zoom.
      //
      // buffer: 64 covers tile seams for line continuity. Land fill
      // uses opacity 1 + antialias false so overlapping buffers don't
      // compound into darker bands.
      const landGeo = getOfflineLandGeoJson();
      map.addSource('offline-land', {
        type: 'geojson',
        data: landGeo,
        buffer: 128,
        // Keep tiles sharp — default 0.375 over-simplifies coastlines
        // once the 10m upgrade lands.
        tolerance: 0,
      });

      const coastlineGeo = getOfflineCoastlineGeoJson();
      map.addSource('offline-coastline', {
        type: 'geojson',
        data: coastlineGeo,
        buffer: 128,
        tolerance: 0,
      });

      const bordersGeo = getOfflineBordersGeoJson();
      map.addSource('offline-borders', {
        type: 'geojson',
        data: bordersGeo,
        buffer: 128,
        tolerance: 0,
      });

      const theme = OFFLINE_THEME_FOR_STYLE[styleIdRef.current] ?? 'dark';
      for (const layer of getOfflineCountryLayers({ theme })) {
        map.addLayer(layer);
      }
      countryOverlayInstalledRef.current = true;
      const canvas = map.getCanvas();
      // eslint-disable-next-line no-console
      console.info('[passages-map] country overlay installed', {
        landFeatureCount: landGeo.features.length,
        coastlineFeatureCount: coastlineGeo.features.length,
        bordersFeatureCount: bordersGeo.features.length,
        styleLayerCount: (map.getStyle() as any)?.layers?.length ?? 0,
        canvas: { width: canvas.width, height: canvas.height },
        theme,
      });

      // ── Progressive detail upgrade ──
      //
      // Kick off a lazy load of the 1:10 million dataset. The dynamic
      // import is code-split so the initial JS bundle doesn't grow;
      // when it resolves (typically a few hundred ms later on a warm
      // connection), we hot-swap the source data in place using
      // `setData`. MapLibre re-tiles the new geometry against the
      // existing paint expressions, so the coastline visibly sharpens
      // WITHOUT a camera reset or reload.
      //
      // Guarded via `highDetailAppliedRef` so we only ever swap once
      // per map instance — subsequent style changes reuse the cached
      // high-detail data via `getOfflineLandGeoJson` upgrade below.
      void applyHighDetailUpgrade(map);
    } catch (err) {
      console.warn('[passages-map] failed to install country overlay', err);
    }
  }, []);

  /**
   * Fire-and-forget upgrade of the offline continent geometry from the
   * 1:50m dataset to Natural Earth's 1:10m dataset. Idempotent per
   * map instance via `highDetailAppliedRef` — safe to call from every
   * `installCountryOverlay` invocation.
   *
   * Race conditions we care about:
   *   - The user swaps basemap while the load is in flight → the
   *     `map.getSource()` check inside the `.then` covers this (new
   *     sources are recreated with the same ids on every install, so
   *     `setData` still hits the right source).
   *   - The map unmounts while the load is in flight → `map.getSource`
   *     will throw (map is disposed); we swallow that in the try/catch.
   */
  const applyHighDetailUpgrade = React.useCallback(async (map: MapLibreMap) => {
    if (highDetailAppliedRef.current) return;
    highDetailAppliedRef.current = true; // guard eagerly to prevent duplicate loads
    try {
      const hi = await loadHighDetailWorldGeo();
      if (!hi) {
        // Load failed — reset the guard so a future basemap swap can
        // retry (network might just have been transiently unavailable).
        highDetailAppliedRef.current = false;
        return;
      }
      const landSrc = map.getSource('offline-land') as GeoJSONSource | undefined;
      const coastlineSrc = map.getSource('offline-coastline') as
        | GeoJSONSource
        | undefined;
      const bordersSrc = map.getSource('offline-borders') as
        | GeoJSONSource
        | undefined;
      if (landSrc) landSrc.setData(hi.land as any);
      if (coastlineSrc) coastlineSrc.setData(hi.coastline as any);
      if (bordersSrc) bordersSrc.setData(hi.borders as any);
      // eslint-disable-next-line no-console
      console.info('[passages-map] high-detail geometry applied', {
        landFeatureCount: hi.land.features.length,
        coastlineFeatureCount: hi.coastline.features.length,
        bordersFeatureCount: hi.borders.features.length,
      });
    } catch (err) {
      // Silent failure — the 50m fallback is already on the map.
      // eslint-disable-next-line no-console
      console.warn('[passages-map] high-detail upgrade failed', err);
      highDetailAppliedRef.current = false;
    }
  }, []);

  const remoteUpgradeAbortRef = React.useRef<AbortController | null>(null);

  /**
   * Try to upgrade the current basemap to the richer remote vector-tile
   * style. If the remote URL is unreachable within
   * `REMOTE_STYLE_UPGRADE_TIMEOUT_MS`, or fires a MapLibre error, we
   * bail silently and stay on the offline style. Called on mount and
   * every time the user picks a different basemap.
   *
   * IMPORTANT: We probe the remote style with a plain `fetch()` FIRST,
   * before handing it to MapLibre. That's because MapLibre's own error
   * events for CORS-blocked / adblocker-blocked style fetches are
   * unreliable across browsers (sometimes fire, sometimes swallowed,
   * sometimes fire so late the timeout has already downgraded us to a
   * broken style). Doing our own fetch means we know the URL is
   * actually reachable before touching MapLibre's style state.
   */
  const tryRemoteUpgrade = React.useCallback(
    (map: MapLibreMap, styleId: MapStyleId) => {
      const cfg = MAP_STYLES[styleId];
      if (!cfg.remoteStyleUrl) return;
      const remoteUrl = cfg.remoteStyleUrl;

      // Cancel any in-flight probe from a previous basemap choice so a
      // late response can't overwrite the style the user just picked.
      remoteUpgradeAbortRef.current?.abort();
      const controller = new AbortController();
      remoteUpgradeAbortRef.current = controller;
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        REMOTE_STYLE_UPGRADE_TIMEOUT_MS,
      );

      fetch(remoteUrl, { signal: controller.signal, mode: 'cors' })
        .then((res) => {
          window.clearTimeout(timeoutId);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // Only upgrade if the user hasn't switched styles in the
          // meantime AND the map is still alive.
          if (mapRef.current !== map) return;
          if (styleIdRef.current !== styleId) return;
          if (remoteUpgradeAbortRef.current !== controller) return;
          styleTierRef.current = 'remote';
          // eslint-disable-next-line no-console
          console.info('[passages-map] upgrading to remote tiles', {
            styleId,
            remoteUrl,
          });
          styleLoadedRef.current = false;
          countryOverlayInstalledRef.current = false;
          ownedSourceIdsRef.current.clear();
          vesselLineLayerIdsRef.current.clear();
          map.setStyle(remoteUrl);
        })
        .catch((err) => {
          window.clearTimeout(timeoutId);
          if (controller.signal.aborted) return;
          // eslint-disable-next-line no-console
          console.info(
            '[passages-map] remote tile upgrade unavailable — staying offline',
            { styleId, remoteUrl, reason: err?.message ?? String(err) },
          );
        });
    },
    [],
  );

  // Initialise the map once, using the fully-offline style so we're
  // guaranteed to draw *something* on first paint. The remote-tile
  // upgrade runs in the background afterwards.
  //
  // Uses useLayoutEffect (not useEffect) so we get first crack at the
  // DOM before the browser paints — this eliminates a race where the
  // container div was mounted but not yet laid out when MapLibre tried
  // to measure it, resulting in a canvas sized 0×0 that MapLibre never
  // recovered from (classic "blank map with no controls" symptom).
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initialConfig = MAP_STYLES[styleIdRef.current];

    /**
     * Deferred boot: sometimes the container div has been mounted but
     * its ancestor chain (SidebarInset → flex-col → flex-1 → h-full →
     * relative flex → this container) hasn't finished computing
     * heights yet. Booting MapLibre against a 0-height container
     * leaves its canvas permanently 0×0, and no amount of setStyle
     * calls will recover it. So we wait one animation frame (and in
     * degenerate cases, poll for a few frames) until the container has
     * real dimensions before we hand it to MapLibre.
     */
    let cancelled = false;
    let rafHandle = 0;
    let bootAttempts = 0;
    const MAX_BOOT_ATTEMPTS = 30; // ~500ms at 60fps — plenty for any layout

    const boot = () => {
      if (cancelled || mapRef.current) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 2 || h < 2) {
        bootAttempts++;
        if (bootAttempts > MAX_BOOT_ATTEMPTS) {
          console.warn(
            '[passages-map] gave up waiting for container to size — ' +
              'MapLibre will boot with 0-sized canvas',
            { width: w, height: h },
          );
        } else {
          rafHandle = requestAnimationFrame(boot);
          return;
        }
      }

      const map = new MapLibreMap({
        container,
        style: initialConfig.offlineStyle,
        center: [0, 20],
        zoom: 1.6,
        minZoom: 0.5,
        // Extra world copies amplify antimeridian / tile-edge artefacts
        // on our offline GeoJSON land layer for no real benefit here.
        renderWorldCopies: false,
        attributionControl: { compact: true },
        // Needed so voyage-card export can read pixels via toDataURL /
        // drawImage after the frame has been presented.
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      // Record which style the map was constructed with so the style
      // swap effect below knows this is the initial style and does NOT
      // call setStyle() again on mount (which would abort the in-flight
      // style load and leave the map blank).
      appliedStyleIdRef.current = styleIdRef.current;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new ScaleControl({ unit: 'nautical' }), 'bottom-right');

      // Register the direction-arrow SDF icon before any vessel layer
      // is added, so `applyVesselLayers` can freely reference it. SDF
      // icons are colour-tintable per layer via `icon-color`, so this
      // one white arrow serves EVERY vessel's per-line arrows.
      ensurePassageArrowImage(map);

      // One reusable popup we shuttle between passages on hover. Anchor
      // 'bottom' means the popup floats ABOVE the pointer/line and the
      // triangular tip points down at whichever passage is under the
      // cursor. `closeOnClick`/`closeButton` are both off because
      // hover-only popups shouldn't need a manual close affordance.
      popupRef.current = new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: 'passages-map-popup',
        anchor: 'bottom',
        maxWidth: '280px',
      });

      // Hover handlers — attached once at the map level and dispatched
      // to whichever vessel line layer the pointer is over. Using a
      // single map-level handler + `queryRenderedFeatures(..., { layers })`
      // is cheaper than attaching per-layer handlers when vessels
      // come/go (and simpler to reason about).
      map.on('mousemove', (e) => {
        // Only query layers that ACTUALLY exist on the map right now.
        // Between vessel-list changes and MapLibre's async layer teardown
        // the ref can briefly contain ids for layers that no longer
        // exist, and passing a stale id to queryRenderedFeatures throws
        // in v6 — which would blow up the rest of this handler and
        // silently break hover for the whole session.
        const layerIds: string[] = [];
        // Live track first so its emerald line wins when stacked on a
        // historical passage.
        if (map.getLayer(LIVE_TRACK_LINE_LAYER)) {
          layerIds.push(LIVE_TRACK_LINE_LAYER);
        }
        if (map.getLayer(LIVE_TRACK_CASING_LAYER)) {
          layerIds.push(LIVE_TRACK_CASING_LAYER);
        }
        for (const id of vesselLineLayerIdsRef.current) {
          if (map.getLayer(id)) layerIds.push(id);
        }
        if (layerIds.length === 0) {
          if (hoveredPassageRef.current) clearPassageHover(map);
          return;
        }
        let features: any[] = [];
        try {
          // Slightly padded hit box so scrubbing stays sticky when the
          // pointer drifts a few pixels off a thin line.
          const pad = 16;
          const box: [[number, number], [number, number]] = [
            [e.point.x - pad, e.point.y - pad],
            [e.point.x + pad, e.point.y + pad],
          ];
          features = map.queryRenderedFeatures(box, { layers: layerIds });
        } catch {
          return; // benign — MapLibre occasionally throws during layer swaps
        }
        if (features.length === 0) {
          if (hoveredPassageRef.current) {
            clearPassageHover(map);
            map.getCanvas().style.cursor = '';
          }
          return;
        }
        // Prefer the core line over casing/glow so geometry for scrub
        // comes from the densest track layer when several stack.
        features.sort((a, b) => {
          const rank = (f: any) => {
            const id = String(f?.layer?.id ?? '');
            if (id.endsWith(':line') || id === LIVE_TRACK_LINE_LAYER) return 0;
            if (id.endsWith(':sheen')) return 1;
            if (id.endsWith(':casing') || id === LIVE_TRACK_CASING_LAYER) return 2;
            return 3;
          };
          return rank(a) - rank(b);
        });
        // When a vessel is focused, prefer its geometry even if another
        // vessel's dimmed line sits under the pointer too.
        const focusId = focusedVesselIdRef.current;
        const feat =
          (focusId
            ? features.find((f) => {
                const src = (f as any).source as string | undefined;
                if (src === `passages:${focusId}`) return true;
                if (src === 'live-active-tracks') {
                  return String(f.properties?.vesselId ?? '') === focusId;
                }
                return false;
              })
            : null) ?? features[0]!;
        const sourceId = (feat as any).source as string | undefined;
        const props = feat.properties ?? {};
        const isLive =
          sourceId === 'live-active-tracks' || props.kind === 'live-active';

        map.getCanvas().style.cursor = 'pointer';
        const routeLabel = deriveRouteLabelFromLineFeature(feat) ?? undefined;

        if (isLive) {
          const vesselId = String(props.vesselId ?? '');
          clearPastFeatureHover(map);
          clearScrubMarker(map);
          hoveredPassageRef.current = {
            vesselId: vesselId || 'live',
            featureId: -1,
            kind: 'live',
          };
          const html = renderLiveTrackPopupHtml({
            vesselName: strOrUndef(props.vesselName) ?? 'Vessel',
            colorHex: LIVE_ACCENT,
            lat: numOrUndef(props.lat),
            lon: numOrUndef(props.lon),
            speedKn: numOrNull(props.speedKn),
            heading: numOrNull(props.heading),
            course: numOrNull(props.course),
            state: strOrUndef(props.state),
            navStatus: strOrUndef(props.navStatus) ?? null,
            destination: strOrUndef(props.destination) ?? null,
            aisPositionAt: strOrUndef(props.aisPositionAt) ?? null,
            isStale: props.isStale === true || props.isStale === 'true',
            startTime: strOrUndef(props.startTime),
            distanceNm: numOrUndef(props.distanceNm),
            pointCount: numOrUndef(props.pointCount),
            routeLabel,
          });
          popupRef.current!.setLngLat(e.lngLat).setHTML(html).addTo(map);
          return;
        }

        const featureId = typeof feat.id === 'number' ? feat.id : Number(feat.id);
        // The map source we own is `passages:{vesselId}` — recover the
        // vessel id from the source name so we know which meta record
        // to render in the popup.
        const vesselId = sourceId?.startsWith('passages:')
          ? sourceId.slice('passages:'.length)
          : null;
        if (!vesselId || !Number.isFinite(featureId)) return;

        const meta = vesselMetaRef.current.get(vesselId);

        // Move MapLibre feature-state hover to this passage so the line
        // paint expression can render it thicker/bolder.
        const prev = hoveredPassageRef.current;
        if (
          !prev ||
          prev.kind === 'live' ||
          prev.vesselId !== vesselId ||
          prev.featureId !== featureId
        ) {
          clearPastFeatureHover(map);
          map.setFeatureState(
            { source: `passages:${vesselId}`, id: featureId },
            { hover: true },
          );
          hoveredPassageRef.current = { vesselId, featureId, kind: 'past' };
        }

        // Hover scrub — project the pointer onto the LineString and
        // show interpolated time / local speed under the cursor.
        const coords = lineCoordinatesFromFeature(feat);
        const accent = meta?.colorHex ?? '#38bdf8';

        // Pixel→NM snap radius so scrub stays sticky at any zoom
        // without latching onto a distant parallel track.
        const maxSnapNm = pixelDistanceToNm(map, 44);

        const scrub = coords
          ? scrubAlongTrack(coords, e.lngLat, {
              startTime: strOrUndef(props.startTime),
              endTime: strOrUndef(props.endTime),
              durationMs: numOrUndef(props.durationMs),
              avgSpeedKn: numOrNull(props.avgSpeedKn),
              maxSnapNm,
            })
          : null;

        const applyScrubUi = () => {
          if (scrub && coords) {
            setScrubMarker(map, scrub.lon, scrub.lat, accent, scrub.bearingDeg);
            setScrubTrail(map, coords, scrub.distanceFromStartNm, accent);
          } else {
            clearScrubMarker(map);
          }

          const html = renderPassagePopupHtml({
            vesselName: meta?.name ?? 'Vessel',
            colorHex: accent,
            passageIndex: numOrUndef(feat.properties?.passageIndex),
            startTime: strOrUndef(feat.properties?.startTime),
            endTime: strOrUndef(feat.properties?.endTime),
            durationMs: numOrUndef(feat.properties?.durationMs),
            distanceNm: numOrUndef(feat.properties?.distanceNm),
            avgSpeedKn: numOrNull(feat.properties?.avgSpeedKn),
            maxSpeedKn: numOrNull(feat.properties?.maxSpeedKn),
            pointCount: numOrUndef(feat.properties?.pointCount),
            routeLabel,
            scrub: scrub
              ? {
                  lat: scrub.lat,
                  lon: scrub.lon,
                  atMs: scrub.atMs,
                  speedKn: scrub.speedKn,
                  bearingDeg: scrub.bearingDeg,
                  progress: scrub.progress,
                  distanceFromStartNm: scrub.distanceFromStartNm,
                  distanceRemainingNm: scrub.distanceRemainingNm,
                  remainingMs: scrub.remainingMs,
                  totalDistanceNm: scrub.totalDistanceNm,
                }
              : undefined,
          });
          popupRef.current!
            .setLngLat(scrub ? { lng: scrub.lon, lat: scrub.lat } : e.lngLat)
            .setOffset(scrub ? 22 : 12)
            .setHTML(html)
            .addTo(map);
        };

        scrubPendingRef.current = applyScrubUi;
        if (!scrubRafRef.current) {
          scrubRafRef.current = requestAnimationFrame(() => {
            scrubRafRef.current = 0;
            const fn = scrubPendingRef.current;
            scrubPendingRef.current = null;
            fn?.();
          });
        }
      });

      // If the pointer leaves the canvas entirely, clear hover state.
      map.on('mouseout', () => {
        if (scrubRafRef.current) {
          cancelAnimationFrame(scrubRafRef.current);
          scrubRafRef.current = 0;
        }
        scrubPendingRef.current = null;
        if (hoveredPassageRef.current) {
          // Timeline owns the scrub marker while a passage is selected —
          // only clear transient hover chrome, keep the live scrub point.
          if (timelineActiveRef.current && selectedPassageRef.current) {
            clearPastFeatureHover(map);
            hoveredPassageRef.current = null;
            map.getCanvas().style.cursor = '';
          } else {
            clearPassageHover(map);
            map.getCanvas().style.cursor = '';
          }
        } else {
          map.getCanvas().style.cursor = '';
        }
      });

      // Click a track to lock selection colour (same as sidebar fly-to).
      map.on('click', (e) => {
        const layerIds: string[] = [];
        for (const id of vesselLineLayerIdsRef.current) {
          if (map.getLayer(id)) layerIds.push(id);
        }
        if (layerIds.length === 0) return;
        let features: any[] = [];
        try {
          const pad = 12;
          const box: [[number, number], [number, number]] = [
            [e.point.x - pad, e.point.y - pad],
            [e.point.x + pad, e.point.y + pad],
          ];
          features = map.queryRenderedFeatures(box, { layers: layerIds });
        } catch {
          return;
        }
        if (features.length === 0) return;
        features.sort((a, b) => {
          const rank = (f: any) => {
            const id = String(f?.layer?.id ?? '');
            if (id.endsWith(':line')) return 0;
            if (id.endsWith(':sheen')) return 1;
            if (id.endsWith(':casing')) return 2;
            return 3;
          };
          return rank(a) - rank(b);
        });
        const focusId = focusedVesselIdRef.current;
        const feat =
          (focusId
            ? features.find((f) => (f as any).source === `passages:${focusId}`)
            : null) ?? features[0]!;
        const sourceId = (feat as any).source as string | undefined;
        const featureId = Number((feat as any).id);
        if (!sourceId?.startsWith('passages:') || !Number.isFinite(featureId)) {
          return;
        }
        const vesselId = sourceId.slice('passages:'.length);
        const nextSel = { vesselId, featureId };
        setPassageSelectedState(map, nextSel, selectedPassageRef.current);
        selectedPassageRef.current = nextSel;
        raiseVesselTrackLayers(map, vesselId);
        onPassageSelectRef.current?.({
          vesselId,
          passageIndex: featureId,
        });
      });

      function clearPastFeatureHover(m: MapLibreMap) {
        const prev = hoveredPassageRef.current;
        if (!prev || prev.kind === 'live') return;
        try {
          m.setFeatureState(
            { source: `passages:${prev.vesselId}`, id: prev.featureId },
            { hover: false },
          );
        } catch {
          /* source may have been torn down; ignore */
        }
      }

      /** Internal — reset feature-state + remove popup. */
      function clearPassageHover(m: MapLibreMap) {
        clearPastFeatureHover(m);
        clearScrubMarker(m);
        hoveredPassageRef.current = null;
        popupRef.current?.remove();
      }

      // `styledata` fires on both first load AND every subsequent
      // setStyle(). Reuse it to (re-)attach our overlay layers whenever
      // the basemap finishes rebuilding, otherwise a style swap would
      // strand the tracks.
      map.on('styledata', () => {
        if (!map.isStyleLoaded()) return;
        if (!styleLoadedRef.current) {
          // Safety: if MapLibre came up with a 0-sized canvas (usually a
          // race with the container's layout), force a resize so it
          // grabs the container's real dimensions before the first
          // frame.
          const canvas = map.getCanvas();
          if (canvas.width < 2 || canvas.height < 2) map.resize();
        }
        styleLoadedRef.current = true;
        installCountryOverlay(map);
        ownedSourceIdsRef.current.clear();
        applyVesselLayers(
          map,
          vesselsRef.current,
          hiddenRef.current,
          ownedSourceIdsRef.current,
          styleIdRef.current,
          vesselLineLayerIdsRef.current,
          vesselMetaRef.current,
          focusedVesselIdRef.current,
          selectedPassageRef.current,
        );
        applyLiveOverlay(
          map,
          liveVesselsRef.current,
          hiddenRef.current,
          liveMarkersRef.current,
          vesselsRef.current,
          popupRef.current,
        );
      });

      map.on('load', () => {
        // Always resize once on load — some browsers report the
        // container size slightly differently before/after WebGL init.
        map.resize();
        // Belt-and-braces: apply the overlay + vessel layers here too
        // in case `styledata`'s isStyleLoaded gate never opened.
        installCountryOverlay(map);
        if (!styleLoadedRef.current) {
          styleLoadedRef.current = true;
          ownedSourceIdsRef.current.clear();
          applyVesselLayers(
            map,
            vesselsRef.current,
            hiddenRef.current,
            ownedSourceIdsRef.current,
            styleIdRef.current,
            vesselLineLayerIdsRef.current,
            vesselMetaRef.current,
            focusedVesselIdRef.current,
            selectedPassageRef.current,
          );
          applyLiveOverlay(
            map,
            liveVesselsRef.current,
            hiddenRef.current,
            liveMarkersRef.current,
            vesselsRef.current,
            popupRef.current,
          );
        }
        // Install city + country labels once the map is up. Kept AFTER
        // the country overlay install so labels always paint on top of
        // the fills. Cheap to call idempotently (guarded below).
        if (!labelHandleRef.current) {
          const tone = MAP_STYLES[styleIdRef.current].tone;
          labelHandleRef.current = installMapLabels(map, tone);
          labelHandleRef.current.syncDiscoveredPlaces(
            discoveredPlacesRef.current,
          );
        }
        fitToVessels(
          map,
          vesselsRef.current,
          hiddenRef.current,
          sidebarCollapsedRef.current,
        );
      });

      // Log only genuine failures — style validation errors, tile
      // fetch errors, etc. Verbose per-tile info during normal use is
      // noise we don't want.
      map.on('error', (e: any) => {
        const message = e?.error?.message ?? e?.message ?? 'unknown error';
        console.warn('[passages-map] maplibre error', {
          message,
          sourceId: e?.sourceId,
        });
      });

      // `idle` is a more reliable "everything settled" signal than
      // `load` on some environments. Keep it as a third recovery hook
      // for the overlay layers in case both styledata and load stall.
      let loggedFirstIdle = false;
      map.on('idle', () => {
        installCountryOverlay(map);
        if (!styleLoadedRef.current && map.isStyleLoaded()) {
          styleLoadedRef.current = true;
          ownedSourceIdsRef.current.clear();
          applyVesselLayers(
            map,
            vesselsRef.current,
            hiddenRef.current,
            ownedSourceIdsRef.current,
            styleIdRef.current,
            vesselLineLayerIdsRef.current,
            vesselMetaRef.current,
            focusedVesselIdRef.current,
            selectedPassageRef.current,
          );
          applyLiveOverlay(
            map,
            liveVesselsRef.current,
            hiddenRef.current,
            liveMarkersRef.current,
            vesselsRef.current,
            popupRef.current,
          );
          fitToVessels(
            map,
            vesselsRef.current,
            hiddenRef.current,
            sidebarCollapsedRef.current,
          );
        }
        // One-shot render-state snapshot when the map first goes idle.
        // If continents / tracks aren't visible in the browser, this
        // log tells us whether they were actually added to the map or
        // whether the canvas is misconfigured.
        if (!loggedFirstIdle) {
          loggedFirstIdle = true;
          const style = map.getStyle() as any;
          const canvas = map.getCanvas();
          // eslint-disable-next-line no-console
          console.info('[passages-map] first idle snapshot', {
            canvasSize: { width: canvas.width, height: canvas.height },
            containerSize: {
              width: container.clientWidth,
              height: container.clientHeight,
            },
            layerIds: (style?.layers ?? []).map((l: any) => l.id),
            sourceIds: Object.keys(style?.sources ?? {}),
            isStyleLoaded: map.isStyleLoaded(),
            loaded: map.loaded(),
          });
        }
      });

      mapRef.current = map;

      // Kick a resize on next frame too, belt-and-braces for slow
      // layout systems.
      requestAnimationFrame(() => {
        if (mapRef.current === map) map.resize();
      });
    };

    rafHandle = requestAnimationFrame(boot);

    /**
     * ResizeObserver keeps MapLibre's internal size in sync with the
     * container. Without this, dashboard sidebar collapses, window
     * resizes, and browser devtools open/close all leave the map
     * rendering at its original size — clipped or letterboxed.
     */
    const resizeObserver = new ResizeObserver(() => {
      const m = mapRef.current;
      if (m) m.resize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
      resizeObserver.disconnect();
      if (remoteUpgradeTimerRef.current) {
        window.clearTimeout(remoteUpgradeTimerRef.current);
        remoteUpgradeTimerRef.current = null;
      }
      popupRef.current?.remove();
      popupRef.current = null;
      hoveredPassageRef.current = null;
      vesselLineLayerIdsRef.current.clear();
      vesselMetaRef.current.clear();
      for (const marker of liveMarkersRef.current.values()) marker.remove();
      liveMarkersRef.current.clear();
      labelHandleRef.current?.dispose();
      labelHandleRef.current = null;
      const m = mapRef.current;
      if (m) m.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
      styleTierRef.current = 'offline';
      countryOverlayInstalledRef.current = false;
      highDetailAppliedRef.current = false;
      ownedSourceIdsRef.current.clear();
    };
  }, [tryRemoteUpgrade, installCountryOverlay]);

  // Sync layers when tracks arrive / change / hide-toggle. Camera fit
  // is intentionally NOT here — that lives on `fitToken` so toggling a
  // vessel's visibility doesn't yank the camera around.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyVesselLayers(
      map,
      vessels,
      hiddenVessels,
      ownedSourceIdsRef.current,
      styleId,
      vesselLineLayerIdsRef.current,
      vesselMetaRef.current,
      focusedVesselId,
      selectedPassageRef.current,
    );
  }, [vessels, hiddenVessels, styleId, focusedVesselId]);

  // Live positions + active underway tracks. Cheap to re-run — sources
  // are upserted in place and HTML markers are moved rather than
  // recreated when the vessel is already on the map. Depends on
  // `vessels` too so we can bridge from the cached passage end to the
  // live pin when the two don't quite meet.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyLiveOverlay(
      map,
      liveVessels,
      hiddenVessels,
      liveMarkersRef.current,
      vessels,
      popupRef.current,
    );
  }, [liveVessels, hiddenVessels, vessels]);

  // Fit camera when the selected view finishes loading new data.
  const lastFitTokenRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (!fitToken || fitToken === lastFitTokenRef.current) return;
    lastFitTokenRef.current = fitToken;
    fitToVessels(map, vessels, hiddenVessels, sidebarCollapsed);
  }, [fitToken, vessels, hiddenVessels, sidebarCollapsed]);

  // When the sidebar collapses/expands, resize so MapLibre picks up the
  // new usable viewport — otherwise tiles stretch until the next drag.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Defer one frame so the CSS layout has settled.
    const id = requestAnimationFrame(() => {
      map.resize();
    });
    return () => cancelAnimationFrame(id);
  }, [sidebarCollapsed]);

  // Swap basemap when the user picks a different style.
  //
  // IMPORTANT: our offline styles are tiny (background layer only) and
  // differ only by colour. MapLibre's default style DIFF often treats
  // that as a paint tweak, leaves the user-added continent layers
  // sitting on the map with the OLD theme colours, and never fires a
  // clean "style fully reloaded" path. Refreshing the page works
  // because the map boots with the saved style from scratch.
  //
  // Fix: force `diff: false` so every theme click does a full rebuild,
  // then wait for the new style to finish loading and explicitly
  // re-install continents + vessel tracks. Don't rely on the boot-time
  // `styledata` handler alone — it can race with the mid-swap state.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedStyleIdRef.current === styleId) return; // no-op guard

    let cancelled = false;
    let detachReady: (() => void) | null = null;

    const reinstallAfterSwap = () => {
      if (cancelled) return;
      if (!map.isStyleLoaded()) return;
      styleLoadedRef.current = true;
      // Reset so installCountryOverlay actually rebuilds with the new
      // theme colours (its own guard short-circuits otherwise).
      countryOverlayInstalledRef.current = false;
      highDetailAppliedRef.current = false;
      ownedSourceIdsRef.current.clear();
      vesselLineLayerIdsRef.current.clear();
      installCountryOverlay(map);
      applyVesselLayers(
        map,
        vesselsRef.current,
        hiddenRef.current,
        ownedSourceIdsRef.current,
        styleId,
        vesselLineLayerIdsRef.current,
        vesselMetaRef.current,
        focusedVesselIdRef.current,
        selectedPassageRef.current,
      );
      applyLiveOverlay(
        map,
        liveVesselsRef.current,
        hiddenRef.current,
        liveMarkersRef.current,
        vesselsRef.current,
        popupRef.current,
      );
      labelHandleRef.current?.retheme(MAP_STYLES[styleId].tone);
      // eslint-disable-next-line no-console
      console.info('[passages-map] basemap theme applied', { styleId });
      // After the offline theme is on screen, probe the matching remote
      // tile style — success upgrades in place; failure is silent.
      tryRemoteUpgrade(map, styleId);
    };

    const doSwap = () => {
      if (cancelled) return;
      // Abort any remote upgrade still probing the previous theme.
      remoteUpgradeAbortRef.current?.abort();
      styleLoadedRef.current = false;
      styleTierRef.current = 'offline';
      countryOverlayInstalledRef.current = false;
      highDetailAppliedRef.current = false;
      ownedSourceIdsRef.current.clear();
      vesselLineLayerIdsRef.current.clear();

      // Build a FRESH style object each swap. Reusing the module-level
      // offlineStyle reference + MapLibre's default diff can no-op or
      // only patch the background, leaving continent paint stale.
      const theme = OFFLINE_THEME_FOR_STYLE[styleId] ?? 'dark';
      const nextStyle = buildOfflineWorldStyle({ theme });
      map.setStyle(nextStyle, { diff: false });
      appliedStyleIdRef.current = styleId;

      // Labels are DOM Markers — survive setStyle. Retheme immediately
      // so they match the new ocean/land palette even before layers
      // reinstall.
      labelHandleRef.current?.retheme(MAP_STYLES[styleId].tone);

      const onStyleData = () => {
        if (!map.isStyleLoaded()) return;
        map.off('styledata', onStyleData);
        map.off('idle', onIdle);
        reinstallAfterSwap();
      };
      const onIdle = () => {
        if (!map.isStyleLoaded()) return;
        map.off('styledata', onStyleData);
        map.off('idle', onIdle);
        reinstallAfterSwap();
      };
      map.on('styledata', onStyleData);
      map.on('idle', onIdle);
      detachReady = () => {
        map.off('styledata', onStyleData);
        map.off('idle', onIdle);
      };

      // If the style somehow loaded synchronously (tiny offline style),
      // reinstall immediately rather than waiting for another event.
      if (map.isStyleLoaded()) {
        detachReady();
        detachReady = null;
        reinstallAfterSwap();
      }
    };

    if (map.isStyleLoaded()) {
      doSwap();
    } else {
      // Current style still loading (initial boot) — wait, then swap.
      const onReady = () => {
        if (!map.isStyleLoaded()) return;
        map.off('styledata', onReady);
        doSwap();
      };
      map.on('styledata', onReady);
      detachReady = () => map.off('styledata', onReady);
    }

    return () => {
      cancelled = true;
      detachReady?.();
    };
  }, [styleId, installCountryOverlay, tryRemoteUpgrade]);

  // Imperative handle exposed to the parent so the sidebar's passage
  // list can trigger fly-to-passage animations. All map state (source
  // lookups, feature-state, popups) stays inside this component —
  // parents never touch MapLibre directly.
  React.useImperativeHandle(
    ref,
    () => ({
      flyToPassage(vesselId, passageIndex) {
        const map = mapRef.current;
        if (!map) return;

        const vessel = vesselsRef.current.find((v) => v.vesselId === vesselId);
        const feature = vessel?.featureCollection?.features?.[passageIndex];
        if (!vessel || !feature) return;

        const bbox = geometryBbox(feature.geometry);
        if (!bbox) return;

        // Force this vessel's layers on immediately — the parent
        // typically un-hides the vessel via setState before calling
        // us, but React hasn't committed that state → the map effect
        // hasn't re-run yet. Setting visibility here removes the
        // "click a hidden vessel's passage and see nothing" gap.
        const layerIds = [
          `passages:${vesselId}:glow`,
          `passages:${vesselId}:casing`,
          `passages:${vesselId}:line`,
          `passages:${vesselId}:sheen`,
          `passages:${vesselId}:arrows`,
          `passages:${vesselId}:endpoint-halo`,
          `passages:${vesselId}:endpoint-fill`,
        ];
        for (const id of layerIds) {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, 'visibility', 'visible');
          }
        }

        // Move the camera. Slightly slower animation than the default
        // so the transition feels considered rather than snappy —
        // helps orient the user when jumping between distant passages.
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          {
            padding: fitPadding(
              sidebarCollapsedRef.current,
              timelineActiveRef.current,
            ),
            duration: 900,
            maxZoom: 11,
          },
        );

        // Sticky contrasting selection + transient hover for the popup scrub.
        const nextSel = { vesselId, featureId: passageIndex };
        setPassageSelectedState(map, nextSel, selectedPassageRef.current);
        selectedPassageRef.current = nextSel;
        raiseVesselTrackLayers(map, vesselId);

        const prev = hoveredPassageRef.current;
        if (prev && (prev.vesselId !== vesselId || prev.featureId !== passageIndex)) {
          map.setFeatureState(
            { source: `passages:${prev.vesselId}`, id: prev.featureId },
            { hover: false },
          );
        }
        map.setFeatureState(
          { source: `passages:${vesselId}`, id: passageIndex },
          { hover: true },
        );
        hoveredPassageRef.current = {
          vesselId,
          featureId: passageIndex,
          kind: 'past',
        };

        const midpoint = coordinateMidpoint(feature.geometry);
        if (midpoint && popupRef.current) {
          const routeLabel =
            deriveRouteLabelFromLineFeature(feature) ?? undefined;
          const meta = vesselMetaRef.current.get(vesselId);
          popupRef.current
            .setLngLat(midpoint)
            .setHTML(
              renderPassagePopupHtml({
                vesselName: meta?.name ?? vessel.vesselName,
                colorHex: meta?.colorHex ?? vessel.colorHex,
                passageIndex,
                startTime: strOrUndef(feature.properties?.startTime),
                endTime: strOrUndef(feature.properties?.endTime),
                durationMs: numOrUndef(feature.properties?.durationMs),
                distanceNm: numOrUndef(feature.properties?.distanceNm),
                avgSpeedKn: numOrNull(feature.properties?.avgSpeedKn),
                maxSpeedKn: numOrNull(feature.properties?.maxSpeedKn),
                pointCount: numOrUndef(feature.properties?.pointCount),
                routeLabel,
              }),
            )
            .addTo(map);
        }
      },
      fitToVisible() {
        const map = mapRef.current;
        if (!map) return;
        fitToVessels(
          map,
          vesselsRef.current,
          hiddenRef.current,
          sidebarCollapsedRef.current,
        );
      },
      clearHover() {
        const map = mapRef.current;
        if (!map) return;
        const prev = hoveredPassageRef.current;
        if (prev && prev.kind !== 'live') {
          try {
            map.setFeatureState(
              { source: `passages:${prev.vesselId}`, id: prev.featureId },
              { hover: false },
            );
          } catch {
            /* source may have been torn down */
          }
        }
        setPassageSelectedState(map, null, selectedPassageRef.current);
        selectedPassageRef.current = null;
        clearScrubMarker(map);
        hoveredPassageRef.current = null;
        popupRef.current?.remove();
        map.getCanvas().style.cursor = '';
        onPassageClearRef.current?.();
      },
      scrubToProgress(progress) {
        const map = mapRef.current;
        const sel = selectedPassageRef.current;
        if (!map || !sel) return null;
        const vessel = vesselsRef.current.find((v) => v.vesselId === sel.vesselId);
        const feature = vessel?.featureCollection?.features?.[sel.featureId];
        if (!vessel || !feature) return null;
        const coords = lineCoordinatesFromFeature(feature);
        if (!coords || coords.length < 2) return null;
        const sample = sampleAtProgress(coords, progress, {
          startTime: strOrUndef(feature.properties?.startTime),
          endTime: strOrUndef(feature.properties?.endTime),
          durationMs: numOrUndef(feature.properties?.durationMs),
          avgSpeedKn: numOrNull(feature.properties?.avgSpeedKn),
        });
        if (!sample) return null;
        const accent = vessel.colorHex;
        setScrubMarker(map, sample.lon, sample.lat, accent, sample.bearingDeg);
        setScrubTrail(map, coords, sample.distanceFromStartNm, accent);
        const routeLabel =
          deriveRouteLabelFromLineFeature(feature) ?? undefined;
        const meta = vesselMetaRef.current.get(sel.vesselId);
        if (popupRef.current) {
          popupRef.current
            .setLngLat({ lng: sample.lon, lat: sample.lat })
            .setOffset(22)
            .setHTML(
              renderPassagePopupHtml({
                vesselName: meta?.name ?? vessel.vesselName,
                colorHex: accent,
                passageIndex: sel.featureId,
                startTime: strOrUndef(feature.properties?.startTime),
                endTime: strOrUndef(feature.properties?.endTime),
                durationMs: numOrUndef(feature.properties?.durationMs),
                distanceNm: numOrUndef(feature.properties?.distanceNm),
                avgSpeedKn: numOrNull(feature.properties?.avgSpeedKn),
                maxSpeedKn: numOrNull(feature.properties?.maxSpeedKn),
                pointCount: numOrUndef(feature.properties?.pointCount),
                routeLabel,
                scrub: {
                  lat: sample.lat,
                  lon: sample.lon,
                  atMs: sample.atMs,
                  speedKn: sample.speedKn,
                  bearingDeg: sample.bearingDeg,
                  progress: sample.progress,
                  distanceFromStartNm: sample.distanceFromStartNm,
                  distanceRemainingNm: sample.distanceRemainingNm,
                  remainingMs: sample.remainingMs,
                  totalDistanceNm: sample.totalDistanceNm,
                },
              }),
            )
            .addTo(map);
        }
        followScrubCamera(map, sample.lon, sample.lat, {
          sidebarCollapsed: sidebarCollapsedRef.current,
          timelineActive: timelineActiveRef.current,
        });
        map.triggerRepaint();
        return sample;
      },
      async exportVoyageCard(stats) {
        const map = mapRef.current;
        if (!map) throw new Error('Map is not ready.');
        // Force a clean frame into the preserved drawing buffer.
        map.triggerRepaint();
        await new Promise<void>((resolve) => {
          map.once('render', () => resolve());
          // Safety: don't hang if render never fires.
          setTimeout(() => resolve(), 250);
        });
        const canvas = map.getCanvas();
        const { blob, filename } = await buildVoyageCardPng(canvas, stats);
        downloadBlob(blob, filename);
      },
    }),
    [],
  );

  return (
    <>
      <div
        ref={containerRef}
        className="passages-map-canvas absolute inset-0 h-full w-full bg-[#070e1a]"
      />
      {/*
        Restyle MapLibre's default controls to match the premium overlay:
        dark-glass background, subtle border, brighter icons on hover. Scoped
        by `.passages-map-canvas` so nothing else on the app is affected.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .passages-map-canvas .maplibregl-ctrl-group {
              background: rgba(2, 6, 23, 0.75) !important;
              border: 1px solid rgba(255, 255, 255, 0.08) !important;
              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
              backdrop-filter: blur(12px);
              border-radius: 10px !important;
              overflow: hidden;
            }
            .passages-map-canvas .maplibregl-ctrl-group button {
              background-color: transparent !important;
            }
            .passages-map-canvas .maplibregl-ctrl-group button span {
              filter: invert(1) brightness(1.2);
              opacity: 0.75;
              transition: opacity 0.15s ease;
            }
            .passages-map-canvas .maplibregl-ctrl-group button:hover span {
              opacity: 1;
            }
            .passages-map-canvas .maplibregl-ctrl-group button + button {
              border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
            }
            .passages-map-canvas .maplibregl-ctrl-scale {
              background: rgba(2, 6, 23, 0.7) !important;
              border-color: rgba(255, 255, 255, 0.2) !important;
              color: rgba(255, 255, 255, 0.85) !important;
              backdrop-filter: blur(8px);
              font-weight: 500;
              font-size: 10px;
              letter-spacing: 0.04em;
              padding: 2px 6px;
              border-radius: 4px;
            }
            .passages-map-canvas .maplibregl-ctrl-attrib {
              background: rgba(2, 6, 23, 0.7) !important;
              color: rgba(255, 255, 255, 0.6) !important;
              backdrop-filter: blur(8px);
              border-radius: 6px !important;
              font-size: 10px;
            }
            .passages-map-canvas .maplibregl-ctrl-attrib a {
              color: rgba(125, 211, 252, 0.9) !important;
            }
            .passages-map-canvas .maplibregl-ctrl-attrib-button {
              background-color: rgba(255, 255, 255, 0.85) !important;
            }
            ${PASSAGE_POPUP_STYLE}
            ${MAP_LABELS_STYLE}
            ${LIVE_MARKER_STYLE}
          `,
        }}
      />
    </>
  );
});

/**
 * Reconcile MapLibre sources + layers with the current vessels prop. Adds
 * new sources for vessels we haven't drawn yet, updates data when a vessel
 * is already on the map (e.g. after a per-vessel refresh), and tears down
 * sources for vessels that vanished.
 *
 * Each vessel gets TWO GeoJSON sources on the map:
 *   1. `passages:{vesselId}`           — the passage LineStrings themselves
 *   2. `passages:{vesselId}:endpoints` — Point features derived from the
 *                                        first/last coord of every passage,
 *                                        tagged with `kind: 'start' | 'end'`
 *
 * And layers per vessel (bottom-to-top): glow → casing → core → sheen →
 * arrows → endpoint halo → endpoint fill. The casing + sheen sandwich
 * is what makes tracks read as chart ink instead of neon tubes. Endpoint
 * fills sit above every other vessel's line/glow so termini aren't eaten
 * by crossing tracks.
 *
 * Every passage feature is assigned a stable numeric `id` client-side so
 * MapLibre's feature-state API can drive the hover paint expressions.
 * The id is just the feature's index within the FeatureCollection —
 * unique per-source, which is all feature-state needs.
 */
function applyVesselLayers(
  map: MapLibreMap,
  vessels: VesselResponse[],
  hiddenVessels: Set<string>,
  ownedSources: Set<string>,
  styleId: MapStyleId,
  vesselLineLayerIds: Set<string>,
  vesselMeta: Map<string, { name: string; colorHex: string }>,
  focusedVesselId: string | null = null,
  selectedPassage: { vesselId: string; featureId: number } | null = null,
) {
  const desiredSourceIds = new Set<string>();
  const tone = MAP_STYLES[styleId].tone;
  const paint = TRACK_PAINT_BY_TONE[tone];
  // MapLibre wipes all `addImage`-registered icons on setStyle, so any
  // style swap between the map's boot and our next apply would leave
  // the arrow layer failing to render (icon-image points at a
  // non-existent id). Re-register defensively — the helper is
  // idempotent so this is cheap.
  ensurePassageArrowImage(map);

  for (const vessel of vessels) {
    const sourceId = `passages:${vessel.vesselId}`;
    const endpointsSourceId = `${sourceId}:endpoints`;
    const casingLayerId = `${sourceId}:casing`;
    const lineLayerId = `${sourceId}:line`;
    const sheenLayerId = `${sourceId}:sheen`;
    const glowLayerId = `${sourceId}:glow`;
    const endpointHaloLayerId = `${sourceId}:endpoint-halo`;
    const endpointFillLayerId = `${sourceId}:endpoint-fill`;
    const arrowLayerId = `${sourceId}:arrows`;
    // Multi-vessel "All time" gets spaghetti-dense — focus dims every
    // other vessel so the selected one stays readable for scrubbing.
    const dim =
      focusedVesselId && focusedVesselId !== vessel.vesselId ? 0.16 : 1;
    const sel = selectionPaletteForVesselColor(vessel.colorHex);
    desiredSourceIds.add(sourceId);
    vesselLineLayerIds.add(lineLayerId);
    vesselLineLayerIds.add(casingLayerId);
    vesselMeta.set(vessel.vesselId, {
      name: vessel.vesselName,
      colorHex: vessel.colorHex,
    });

    const fcWithIds = assignFeatureIds(
      vessel.featureCollection ?? { type: 'FeatureCollection', features: [] },
    );
    const endpointsFc = deriveEndpointsFC(fcWithIds);

    const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(fcWithIds as any);
      const existingEndpoints = map.getSource(endpointsSourceId) as
        | GeoJSONSource
        | undefined;
      if (existingEndpoints) existingEndpoints.setData(endpointsFc as any);
      // Hot-reload / older sessions may be missing casing or sheen —
      // insert them in stack order if the core line already exists.
      if (!map.getLayer(casingLayerId) && map.getLayer(lineLayerId)) {
        map.addLayer(
          {
            id: casingLayerId,
            type: 'line',
            source: sourceId,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
              'line-sort-key': ['coalesce', ['get', 'passageIndex'], 0],
            },
            paint: {
              'line-color': selectedAwareColor(
                paint.casingColor,
                sel.casing,
              ),
              'line-opacity': paint.casingOpacity,
              'line-width': widthAtZoom(
                paint.lineWidthLow + paint.casingExtra,
                paint.lineWidthHigh + paint.casingExtra,
              ),
            },
          },
          lineLayerId,
        );
      }
      if (!map.getLayer(sheenLayerId) && map.getLayer(lineLayerId)) {
        const beforeId = map.getLayer(arrowLayerId)
          ? arrowLayerId
          : map.getLayer(endpointHaloLayerId)
            ? endpointHaloLayerId
            : undefined;
        map.addLayer(
          {
            id: sheenLayerId,
            type: 'line',
            source: sourceId,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
              'line-sort-key': ['coalesce', ['get', 'passageIndex'], 0],
            },
            paint: {
              'line-color': selectedAwareColor(
                paint.sheenColor,
                sel.sheen,
              ),
              'line-opacity': hoverOrSelectedBoostedOpacity(
                paint.sheenOpacity,
                paint.hoverSheenOpacityBoost,
              ),
              'line-width': widthAtZoom(
                Math.max(0.55, paint.lineWidthLow * 0.38),
                Math.max(1.1, paint.lineWidthHigh * 0.38),
              ),
            },
          },
          beforeId,
        );
      }
    } else {
      // ── Line stack ──
      map.addSource(sourceId, { type: 'geojson', data: fcWithIds as any });
      // Past-passage stack (bottom → top): soft glow → understroke casing
      // → coloured core → thin sheen ridge. Casing + sheen are what make
      // tracks read as chart ink instead of neon tubes on the ocean.
      // Opacity feature-state is reliable; wrapping `line-width`
      // interpolate in a feature-state `case` is NOT across MapLibre
      // validators and can silently zero the layer — so hover/selection
      // only boosts opacity (and colour via selectedAwareColor).
      map.addLayer({
        id: glowLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'line-sort-key': ['coalesce', ['get', 'passageIndex'], 0],
        },
        paint: {
          'line-color': selectedAwareColor(
            vessel.colorHex,
            sel.glow,
          ),
          'line-opacity': hoverOrSelectedBoostedOpacity(
            paint.glowOpacity,
            paint.hoverGlowOpacityBoost,
          ),
          'line-blur': paint.glowBlur,
          'line-width': widthAtZoom(paint.glowWidthLow, paint.glowWidthHigh),
        },
      });
      map.addLayer({
        id: casingLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'line-sort-key': ['coalesce', ['get', 'passageIndex'], 0],
        },
        paint: {
          'line-color': selectedAwareColor(
            paint.casingColor,
            sel.casing,
          ),
          'line-opacity': paint.casingOpacity,
          'line-width': widthAtZoom(
            paint.lineWidthLow + paint.casingExtra,
            paint.lineWidthHigh + paint.casingExtra,
          ),
        },
      });
      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'line-sort-key': ['coalesce', ['get', 'passageIndex'], 0],
        },
        paint: {
          'line-color': selectedAwareColor(
            vessel.colorHex,
            sel.line,
          ),
          'line-opacity': hoverOrSelectedBoostedOpacity(
            paint.lineOpacity,
            paint.hoverLineOpacityBoost,
          ),
          'line-width': widthAtZoom(paint.lineWidthLow, paint.lineWidthHigh),
        },
      });
      map.addLayer({
        id: sheenLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'line-sort-key': ['coalesce', ['get', 'passageIndex'], 0],
        },
        paint: {
          'line-color': selectedAwareColor(
            paint.sheenColor,
            sel.sheen,
          ),
          'line-opacity': hoverOrSelectedBoostedOpacity(
            paint.sheenOpacity,
            paint.hoverSheenOpacityBoost,
          ),
          'line-width': widthAtZoom(
            Math.max(0.55, paint.lineWidthLow * 0.38),
            Math.max(1.1, paint.lineWidthHigh * 0.38),
          ),
        },
      });

      // Direction arrows — sparse at ocean zoom, denser in approaches.
      map.addLayer({
        id: arrowLayerId,
        type: 'symbol',
        source: sourceId,
        minzoom: 4,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 120,
            7, 86,
            11, 58,
          ],
          'icon-image': PASSAGE_ARROW_IMAGE_ID,
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 0.5,
            8, 0.72,
            12, 0.92,
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-keep-upright': false,
        },
        paint: {
          'icon-color': vessel.colorHex,
          'icon-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4, 0.55,
            7, 0.82,
            11, 0.92,
          ],
          'icon-halo-color': paint.casingColor,
          'icon-halo-width': 1.15,
          'icon-halo-blur': 0.35,
        },
      });

      // ── Endpoint markers ──
      // Start = hollow ring (departure). End = solid filled (arrival).
      map.addSource(endpointsSourceId, {
        type: 'geojson',
        data: endpointsFc as any,
      });
      map.addLayer({
        id: endpointHaloLayerId,
        type: 'circle',
        source: endpointsSourceId,
        paint: {
          'circle-color': vessel.colorHex,
          'circle-opacity': paint.endpointHaloOpacity,
          'circle-blur': 0.85,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 5,
            6, 8,
            10, 11,
          ],
        },
      });
      map.addLayer({
        id: endpointFillLayerId,
        type: 'circle',
        source: endpointsSourceId,
        paint: {
          'circle-color': [
            'case',
            ['==', ['get', 'kind'], 'start'],
            paint.casingColor,
            vessel.colorHex,
          ],
          'circle-opacity': [
            'case',
            ['==', ['get', 'kind'], 'start'],
            0.25,
            1,
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            ['case', ['==', ['get', 'kind'], 'end'], 2.8, 2.3],
            6,
            ['case', ['==', ['get', 'kind'], 'end'], 4.2, 3.5],
            10,
            ['case', ['==', ['get', 'kind'], 'end'], 5.6, 4.6],
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'kind'], 'start'],
            vessel.colorHex,
            paint.endpointColor,
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'kind'], 'end'],
            1.7,
            2.1,
          ],
          'circle-stroke-opacity': 0.98,
        },
      });
      ownedSources.add(sourceId);
    }

    // Repaint existing layers when the style tone / focus changes —
    // MapLibre's addLayer path only runs on first attach, so paint
    // updates (including multi-vessel dimming) need to happen here too.
    if (map.getLayer(glowLayerId)) {
      map.setPaintProperty(
        glowLayerId,
        'line-color',
        selectedAwareColor(vessel.colorHex, sel.glow),
      );
      map.setPaintProperty(
        glowLayerId,
        'line-opacity',
        hoverOrSelectedBoostedOpacity(
          paint.glowOpacity * dim,
          paint.hoverGlowOpacityBoost * dim,
        ),
      );
      map.setPaintProperty(glowLayerId, 'line-blur', paint.glowBlur);
      map.setPaintProperty(
        glowLayerId,
        'line-width',
        widthAtZoom(paint.glowWidthLow, paint.glowWidthHigh) as any,
      );
    }
    if (map.getLayer(casingLayerId)) {
      map.setPaintProperty(
        casingLayerId,
        'line-color',
        selectedAwareColor(paint.casingColor, sel.casing),
      );
      map.setPaintProperty(
        casingLayerId,
        'line-opacity',
        paint.casingOpacity * dim,
      );
      map.setPaintProperty(
        casingLayerId,
        'line-width',
        widthAtZoom(
          paint.lineWidthLow + paint.casingExtra,
          paint.lineWidthHigh + paint.casingExtra,
        ) as any,
      );
    }
    if (map.getLayer(lineLayerId)) {
      map.setPaintProperty(
        lineLayerId,
        'line-color',
        selectedAwareColor(vessel.colorHex, sel.line),
      );
      map.setPaintProperty(
        lineLayerId,
        'line-opacity',
        hoverOrSelectedBoostedOpacity(
          paint.lineOpacity * dim,
          paint.hoverLineOpacityBoost * dim,
        ),
      );
      map.setPaintProperty(
        lineLayerId,
        'line-width',
        widthAtZoom(paint.lineWidthLow, paint.lineWidthHigh) as any,
      );
    }
    if (map.getLayer(sheenLayerId)) {
      map.setPaintProperty(
        sheenLayerId,
        'line-color',
        selectedAwareColor(paint.sheenColor, sel.sheen),
      );
      map.setPaintProperty(
        sheenLayerId,
        'line-opacity',
        hoverOrSelectedBoostedOpacity(
          paint.sheenOpacity * dim,
          paint.hoverSheenOpacityBoost * dim,
        ),
      );
      map.setPaintProperty(
        sheenLayerId,
        'line-width',
        widthAtZoom(
          Math.max(0.55, paint.lineWidthLow * 0.38),
          Math.max(1.1, paint.lineWidthHigh * 0.38),
        ) as any,
      );
    }
    if (map.getLayer(endpointHaloLayerId)) {
      map.setPaintProperty(
        endpointHaloLayerId,
        'circle-opacity',
        paint.endpointHaloOpacity * dim,
      );
    }
    if (map.getLayer(endpointFillLayerId)) {
      map.setPaintProperty(endpointFillLayerId, 'circle-color', [
        'case',
        ['==', ['get', 'kind'], 'start'],
        paint.casingColor,
        vessel.colorHex,
      ]);
      map.setPaintProperty(endpointFillLayerId, 'circle-stroke-color', [
        'case',
        ['==', ['get', 'kind'], 'start'],
        vessel.colorHex,
        paint.endpointColor,
      ]);
      map.setPaintProperty(
        endpointFillLayerId,
        'circle-opacity',
        [
          'case',
          ['==', ['get', 'kind'], 'start'],
          0.25 * dim,
          1 * dim,
        ] as any,
      );
      map.setPaintProperty(
        endpointFillLayerId,
        'circle-stroke-opacity',
        0.98 * dim,
      );
    }
    if (map.getLayer(arrowLayerId)) {
      map.setPaintProperty(arrowLayerId, 'icon-halo-color', paint.casingColor);
      map.setPaintProperty(arrowLayerId, 'icon-opacity', [
        'interpolate',
        ['linear'],
        ['zoom'],
        4,
        0.55 * dim,
        7,
        0.82 * dim,
        11,
        0.92 * dim,
      ] as any);
    }

    // Visibility toggle — apply to every layer we own for this vessel.
    const visibility = hiddenVessels.has(vessel.vesselId) ? 'none' : 'visible';
    for (const id of [
      glowLayerId,
      casingLayerId,
      lineLayerId,
      sheenLayerId,
      arrowLayerId,
      endpointHaloLayerId,
      endpointFillLayerId,
    ]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
    }
  }

  // Focused vessel draws above the dimmed stack so scrub + fly-to hit
  // its geometry first. Live overlay (called after this) still sits on top.
  if (focusedVesselId) {
    raiseVesselTrackLayers(map, focusedVesselId);
  }

  // Remove sources/layers for vessels that are no longer in the list.
  for (const sourceId of Array.from(ownedSources)) {
    if (desiredSourceIds.has(sourceId)) continue;
    const endpointsSourceId = `${sourceId}:endpoints`;
    const layerIds = [
      `${sourceId}:endpoint-fill`,
      `${sourceId}:endpoint-halo`,
      `${sourceId}:arrows`,
      `${sourceId}:sheen`,
      `${sourceId}:line`,
      `${sourceId}:casing`,
      `${sourceId}:glow`,
    ];
    for (const id of layerIds) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(endpointsSourceId)) map.removeSource(endpointsSourceId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    ownedSources.delete(sourceId);
    vesselLineLayerIds.delete(`${sourceId}:line`);
    vesselLineLayerIds.delete(`${sourceId}:casing`);
    // Note: we deliberately DON'T drop the entry from vesselMeta — the
    // hover popup for a passage that was just torn down would render
    // "Vessel" instead of the real name for a beat otherwise. Cheap to
    // keep the small metadata around across refreshes.
  }

  // setData clears feature-state — re-apply sticky selection so the
  // highlight colour survives month refreshes / vessel list updates.
  if (selectedPassage) {
    setPassageSelectedState(map, selectedPassage, null);
  }
}

/** Move a vessel's track stack above sibling vessels (glow → endpoints). */
function raiseVesselTrackLayers(map: MapLibreMap, vesselId: string) {
  const sourceId = `passages:${vesselId}`;
  for (const suffix of [
    'glow',
    'casing',
    'line',
    'sheen',
    'arrows',
    'endpoint-halo',
    'endpoint-fill',
  ]) {
    const id = `${sourceId}:${suffix}`;
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* ignore — layer order is best-effort */
      }
    }
  }
}

/**
 * Plain zoom-interpolated line width. Passed across the glow / casing /
 * core / sheen stack with different (low, high) tunings — keeping the
 * shape identical so the stroke sizes scale together as you zoom.
 * Anchors at z0 (ocean) and z12 (harbour) so mid-zoom approaches stay
 * substantial without turning into fat ribbons up close.
 */
function widthAtZoom(low: number, high: number): any {
  return [
    'interpolate',
    ['exponential', 1.35],
    ['zoom'],
    0,
    low,
    12,
    high,
  ];
}

/**
 * Line-opacity expression: `base` at rest, `base + boost` when the
 * feature is hovered OR selected (clamped to 1). `feature-state` is
 * well-supported inside `line-opacity` in MapLibre v6.
 *
 * Pass `boost === 0` to just wrap a plain opacity value — the case
 * expression is still valid and the paint stays flat.
 */
function hoverOrSelectedBoostedOpacity(base: number, boost: number): any {
  if (boost === 0) return base;
  const active = Math.min(1, base + boost);
  const selected = Math.min(1, base + boost + 0.12);
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    selected,
    ['boolean', ['feature-state', 'hover'], false],
    active,
    base,
  ];
}

/** Swap to the selection colour when `selected` feature-state is set. */
function selectedAwareColor(restColor: string, selectedColor: string): any {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    selectedColor,
    restColor,
  ];
}

function setPassageSelectedState(
  map: MapLibreMap,
  next: { vesselId: string; featureId: number } | null,
  prev: { vesselId: string; featureId: number } | null,
) {
  if (
    prev &&
    (!next ||
      prev.vesselId !== next.vesselId ||
      prev.featureId !== next.featureId)
  ) {
    try {
      map.setFeatureState(
        { source: `passages:${prev.vesselId}`, id: prev.featureId },
        { selected: false },
      );
    } catch {
      /* source may have been torn down */
    }
  }
  if (next) {
    try {
      map.setFeatureState(
        { source: `passages:${next.vesselId}`, id: next.featureId },
        { selected: true },
      );
    } catch {
      /* source may have been torn down */
    }
  }
}

/**
 * CSS for the live-vessel markers. Underway uses a distinct emerald
 * chevron (not the vessel's historical colour) so live never blends
 * into past passage endpoints.
 */
const LIVE_MARKER_STYLE = `
  .passages-live-marker {
    position: relative;
    width: 28px;
    height: 28px;
    pointer-events: none;
  }
  .passages-live-marker__pulse {
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    background: ${LIVE_ACCENT};
    opacity: 0.4;
    animation: passages-live-pulse 2s ease-out infinite;
  }
  .passages-live-marker__pulse--stale,
  .passages-live-marker:not(.passages-live-marker--underway) .passages-live-marker__pulse {
    animation: none;
    opacity: 0.15;
  }
  .passages-live-marker__boat {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    margin-left: -7px;
    margin-top: -9px;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 16px solid ${LIVE_ACCENT};
    filter: drop-shadow(0 0 6px rgba(52, 211, 153, 0.75));
    transform-origin: 50% 70%;
  }
  .passages-live-marker__boat::after {
    content: '';
    position: absolute;
    left: -3.5px;
    top: 5px;
    width: 0;
    height: 0;
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-bottom: 8px solid #ecfdf5;
  }
  .passages-live-marker:not(.passages-live-marker--underway) .passages-live-marker__boat {
    border-bottom-color: #94a3b8;
    filter: drop-shadow(0 0 4px rgba(148, 163, 184, 0.45));
  }
  .passages-live-marker:not(.passages-live-marker--underway) .passages-live-marker__boat::after {
    border-bottom-color: #f8fafc;
  }
  .passages-live-marker--stale {
    opacity: 0.55;
  }
  .passages-live-marker__badge {
    position: absolute;
    left: 50%;
    top: -11px;
    transform: translateX(-50%);
    padding: 1px 4px;
    border-radius: 3px;
    background: ${LIVE_ACCENT_DEEP};
    color: #ecfdf5;
    font: 700 8px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing: 0.08em;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .passages-live-marker:not(.passages-live-marker--underway) .passages-live-marker__badge {
    display: none;
  }
  @keyframes passages-live-pulse {
    0% { transform: scale(0.5); opacity: 0.5; }
    70% { transform: scale(1.9); opacity: 0; }
    100% { transform: scale(1.9); opacity: 0; }
  }
`;

/** Pull coordinates from the live activeTrack, always ending at the pin. */
function collectLiveTrackCoordinates(
  vessel: LiveVessel,
  live: LivePosition,
): [number, number][] {
  const coords: [number, number][] = [];
  const features = vessel.activeTrack?.features ?? [];
  for (const f of features) {
    const geom = f.geometry;
    if (!geom || geom.type !== 'LineString') continue;
    for (const c of geom.coordinates as [number, number][]) {
      if (
        Array.isArray(c) &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number'
      ) {
        coords.push([c[0], c[1]]);
      }
    }
  }
  const last = coords[coords.length - 1];
  if (
    !last ||
    Math.abs(last[0] - live.lon) > 1e-5 ||
    Math.abs(last[1] - live.lat) > 1e-5
  ) {
    coords.push([live.lon, live.lat]);
  }
  return coords;
}

function haversineNmQuick(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * If the newest historical passage ends short of the live track, prepend
 * its endpoint so the emerald line fills the gap from "yesterday's half"
 * through to the vessel pin.
 */
function bridgeLiveToHistorical(
  liveCoords: [number, number][],
  historical: VesselResponse | null,
  live: LivePosition,
): [number, number][] {
  if (liveCoords.length === 0) return liveCoords;
  if (!historical?.featureCollection?.features?.length) return liveCoords;

  let newest: GeoJSON.Feature | null = null;
  let newestEndMs = -Infinity;
  for (const f of historical.featureCollection.features) {
    const endMs = Date.parse(String(f.properties?.endTime ?? ''));
    if (Number.isFinite(endMs) && endMs >= newestEndMs) {
      newestEndMs = endMs;
      newest = f;
    }
  }
  if (!newest?.geometry || newest.geometry.type !== 'LineString') {
    return liveCoords;
  }
  const histCoords = newest.geometry.coordinates as [number, number][];
  if (histCoords.length < 1) return liveCoords;
  const histEnd = histCoords[histCoords.length - 1]!;
  const liveStart = liveCoords[0]!;

  const liveFixMs = Date.parse(live.aisPositionAt ?? live.sampledAt);
  const gapMs = Number.isFinite(liveFixMs)
    ? liveFixMs - newestEndMs
    : 0;
  // Only bridge recent / ongoing voyages — not an old finished passage.
  if (gapMs > 72 * 60 * 60 * 1000 || gapMs < -2 * 60 * 60 * 1000) {
    return liveCoords;
  }

  const gapNm = haversineNmQuick(
    histEnd[1],
    histEnd[0],
    liveStart[1],
    liveStart[0],
  );
  if (gapNm < 0.15) return liveCoords; // already touching
  if (gapNm > 800) return liveCoords; // don't invent a giant hop

  const hours = Math.max(gapMs / 3_600_000, 0.25);
  const impliedKn = gapNm / hours;
  if (impliedKn > 35) return liveCoords;

  // Never draw the emerald connector through an island.
  if (segmentCrossesLand(histEnd[0], histEnd[1], liveStart[0], liveStart[1])) {
    return liveCoords;
  }

  return [histEnd, ...liveCoords];
}

/**
 * Draw live vessel pins (HTML Markers) + the active underway track
 * (GeoJSON line source). Idempotent — safe to call on every poll.
 *
 * Live tracks always use LIVE_ACCENT (emerald), never the vessel's
 * historical colour, so they stay visually distinct from past passages.
 * When the cached past track ends short of the live pin (stale month
 * cache / overnight sample gap), we bridge from the newest passage
 * endpoint to the live track so the voyage reads as one continuous line.
 */
function applyLiveOverlay(
  map: MapLibreMap,
  liveVessels: LiveVessel[],
  hiddenVessels: Set<string>,
  markers: Map<string, Marker>,
  historicalVessels: VesselResponse[] = [],
  popup: Popup | null = null,
) {
  const desiredMarkerIds = new Set<string>();
  const trackFeatures: GeoJSON.Feature[] = [];
  const historicalById = new Map(
    historicalVessels.map((v) => [v.vesselId, v] as const),
  );

  for (const vessel of liveVessels) {
    if (!vessel.live) continue;
    if (hiddenVessels.has(vessel.vesselId)) continue;

    const { live } = vessel;
    const isUnderway = live.state === 'underway';
    desiredMarkerIds.add(vessel.vesselId);

    const trackProps = liveTrackPopupProps(vessel, live);

    let marker = markers.get(vessel.vesselId);
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'passages-live-marker';
      el.innerHTML =
        '<span class="passages-live-marker__pulse"></span><span class="passages-live-marker__boat"></span><span class="passages-live-marker__badge">LIVE</span>';
      marker = new Marker({ element: el, anchor: 'center' });
      markers.set(vessel.vesselId, marker);
    }

    const el = marker.getElement();
    el.classList.toggle('passages-live-marker--underway', isUnderway);
    el.classList.toggle('passages-live-marker--stale', live.isStale);
    const pulse = el.querySelector('.passages-live-marker__pulse');
    pulse?.classList.toggle('passages-live-marker__pulse--stale', live.isStale);

    // Rotate the chevron by AIS heading/course when we have it so the
    // live icon points the way the vessel is facing.
    const boat = el.querySelector('.passages-live-marker__boat') as HTMLElement | null;
    const bearing = live.heading ?? live.course;
    if (boat) {
      boat.style.transform =
        typeof bearing === 'number' && Number.isFinite(bearing)
          ? `rotate(${bearing}deg)`
          : 'rotate(0deg)';
    }

    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.onmouseenter = () => {
      if (!popup) return;
      const html = renderLiveTrackPopupHtml({
        ...trackProps,
        routeLabel:
          deriveRouteLabelFromLineFeature({
            geometry: {
              type: 'LineString',
              coordinates: collectLiveTrackCoordinates(vessel, live),
            },
          }) ?? undefined,
      });
      popup.setLngLat([live.lon, live.lat]).setHTML(html).addTo(map);
    };
    el.onmouseleave = () => {
      popup?.remove();
    };

    marker.setLngLat([live.lon, live.lat]).addTo(map);

    if (!isUnderway) continue;

    const liveCoords = collectLiveTrackCoordinates(vessel, live);
    const bridged = bridgeLiveToHistorical(
      liveCoords,
      historicalById.get(vessel.vesselId) ?? null,
      live,
    );
    if (bridged.length >= 2) {
      trackFeatures.push({
        type: 'Feature',
        id: 0,
        geometry: {
          type: 'LineString',
          coordinates: smoothLineCoordinates(bridged),
        },
        properties: {
          kind: 'live-active',
          ...trackProps,
          colorHex: LIVE_ACCENT,
        },
      });
    }
  }

  // Remove markers for vessels that vanished / were hidden.
  for (const [vesselId, marker] of Array.from(markers.entries())) {
    if (desiredMarkerIds.has(vesselId)) continue;
    marker.remove();
    markers.delete(vesselId);
  }

  const trackFc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: trackFeatures,
  };

  const TRACK_SOURCE = 'live-active-tracks';
  const TRACK_GLOW = 'live-active-tracks:glow';
  const TRACK_CASING = LIVE_TRACK_CASING_LAYER;
  const TRACK_LINE = LIVE_TRACK_LINE_LAYER;

  const existing = map.getSource(TRACK_SOURCE) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(trackFc as any);
  } else {
    map.addSource(TRACK_SOURCE, { type: 'geojson', data: trackFc as any });
    // Bright emerald live stack — deliberately louder than past tracks,
    // with a soft dark understroke so the dash reads on any ocean tone.
    map.addLayer({
      id: TRACK_GLOW,
      type: 'line',
      source: TRACK_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': LIVE_ACCENT,
        'line-opacity': 0.38,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 7,
          8, 16,
          12, 20,
        ],
        'line-blur': 2.2,
      },
    });
    map.addLayer({
      id: TRACK_CASING,
      type: 'line',
      source: TRACK_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#022c22',
        'line-opacity': 0.78,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 3.6,
          8, 7.2,
          12, 9,
        ],
      },
    });
    map.addLayer({
      id: TRACK_LINE,
      type: 'line',
      source: TRACK_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': LIVE_ACCENT,
        'line-opacity': 1,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 2.1,
          8, 4.2,
          12, 5.2,
        ],
        // Longer dashes + tighter gaps = underway “in progress” without
        // looking like a dotted polyline.
        'line-dasharray': [2.6, 1.35],
      },
    });
  }

  // Keep live tracks above historical passage lines when both exist.
  try {
    if (map.getLayer(TRACK_GLOW)) map.moveLayer(TRACK_GLOW);
    if (map.getLayer(TRACK_CASING)) map.moveLayer(TRACK_CASING);
    if (map.getLayer(TRACK_LINE)) map.moveLayer(TRACK_LINE);
  } catch {
    /* ignore — layer order best-effort */
  }
}

/** Flatten live position + active-track stats into popup/feature props. */
function liveTrackPopupProps(vessel: LiveVessel, live: LivePosition) {
  const trackFeat = vessel.activeTrack?.features?.[0];
  const tp = (trackFeat?.properties ?? {}) as Record<string, unknown>;
  return {
    vesselId: vessel.vesselId,
    vesselName: vessel.vesselName,
    colorHex: LIVE_ACCENT,
    lat: live.lat,
    lon: live.lon,
    speedKn: live.speedKn,
    heading: live.heading,
    course: live.course,
    state: live.state,
    navStatus: live.navStatus,
    destination: live.destination,
    aisPositionAt: live.aisPositionAt,
    isStale: live.isStale,
    startTime: typeof tp.startTime === 'string' ? tp.startTime : undefined,
    distanceNm: typeof tp.distanceNm === 'number' ? tp.distanceNm : undefined,
    pointCount: typeof tp.pointCount === 'number' ? tp.pointCount : undefined,
  };
}

/**
 * Assign a stable numeric top-level `id` to every feature. MapLibre's
 * feature-state API keys off feature `id` (NOT any `properties.id`),
 * and won't tolerate missing/duplicate ids for the hover state to
 * work. We use array index — unique within a single source, which is
 * all `feature-state` needs.
 */
function assignFeatureIds(
  fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f, i) => ({ ...f, id: i })),
  };
}

/**
 * Derive a companion FeatureCollection of Point features — one for the
 * FIRST coord of each LineString (kind='start') and one for the LAST
 * coord (kind='end'). When start and end sit within a small tolerance
 * of each other (round-trip passages that end where they started) we
 * emit only the `end` point so the two markers don't visually collide.
 *
 * Properties on the derived point are lifted straight from the source
 * feature so the popup can render passage stats without a lookup.
 */
function deriveEndpointsFC(
  fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const CLOSE_ENOUGH_DEG = 0.001; // ~110 m — well below map hit radius

  for (const f of fc.features) {
    const geom = f.geometry;
    if (!geom || geom.type !== 'LineString') continue;
    const coords = geom.coordinates as [number, number][];
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const start = coords[0]!;
    const end = coords[coords.length - 1]!;
    const roundTrip =
      Math.abs(start[0] - end[0]) < CLOSE_ENOUGH_DEG &&
      Math.abs(start[1] - end[1]) < CLOSE_ENOUGH_DEG;

    if (!roundTrip) {
      features.push({
        type: 'Feature',
        id: `${f.id}:start`,
        properties: { ...f.properties, kind: 'start', passageId: f.id },
        geometry: { type: 'Point', coordinates: start },
      });
    }
    features.push({
      type: 'Feature',
      id: `${f.id}:end`,
      properties: { ...f.properties, kind: 'end', passageId: f.id },
      geometry: { type: 'Point', coordinates: end },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Popup-content helpers: MapLibre passes properties as `unknown`. */
function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function numOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
function numOrNull(v: unknown): number | null {
  const n = numOrUndef(v);
  return typeof n === 'number' ? n : null;
}

/**
 * Compute an axis-aligned lon/lat bbox for a LineString or
 * MultiLineString geometry. Returns `[minLon, minLat, maxLon, maxLat]`,
 * or `null` if the geometry has no usable coordinates. Used by the
 * fly-to-passage flow to `fitBounds` the map to a single passage.
 */
function geometryBbox(
  geom: GeoJSON.Geometry | undefined | null,
): [number, number, number, number] | null {
  if (!geom) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const consume = (coords: [number, number][]) => {
    for (const [lon, lat] of coords) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  };
  if (geom.type === 'LineString') {
    consume(geom.coordinates as [number, number][]);
  } else if (geom.type === 'MultiLineString') {
    for (const line of geom.coordinates as [number, number][][]) consume(line);
  } else {
    return null;
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Roughly-central point of a passage geometry — the coordinate at the
 * midpoint of the (first) LineString's array of positions. Not a true
 * geodesic midpoint but good enough for anchoring the popup, and much
 * cheaper than computing along-track distance.
 */
function coordinateMidpoint(
  geom: GeoJSON.Geometry | undefined | null,
): [number, number] | null {
  if (!geom) return null;
  let coords: [number, number][] | null = null;
  if (geom.type === 'LineString') coords = geom.coordinates as [number, number][];
  else if (geom.type === 'MultiLineString') {
    const lines = geom.coordinates as [number, number][][];
    coords = lines[Math.floor(lines.length / 2)] ?? null;
  }
  if (!coords || coords.length === 0) return null;
  return coords[Math.floor(coords.length / 2)] ?? null;
}

/**
 * Pull the first and last coordinate off a MapLibre LineString feature
 * and produce a "Palma → Antibes" style label (or `null` when neither
 * endpoint is close enough to a curated port). Handles both LineString
 * and MultiLineString geometries; for MultiLineString we take the very
 * first point of the first line and the very last point of the last
 * line, since that matches what a viewer would consider the passage's
 * start and end.
 */
function deriveRouteLabelFromLineFeature(feat: any): string | null {
  const geom = feat?.geometry;
  if (!geom) return null;

  let startCoord: [number, number] | null = null;
  let endCoord: [number, number] | null = null;

  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    const c = geom.coordinates as [number, number][];
    if (c.length >= 1) startCoord = c[0]!;
    if (c.length >= 1) endCoord = c[c.length - 1]!;
  } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
    const lines = geom.coordinates as [number, number][][];
    if (lines.length > 0) {
      const first = lines[0];
      const last = lines[lines.length - 1];
      if (first && first.length > 0) startCoord = first[0]!;
      if (last && last.length > 0) endCoord = last[last.length - 1]!;
    }
  }

  if (!startCoord || !endCoord) return null;
  const [startLon, startLat] = startCoord;
  const [endLon, endLat] = endCoord;
  return passagePortLabel(startLat, startLon, endLat, endLon);
}

function lineCoordinatesFromFeature(feat: any): [number, number][] | null {
  const geom = feat?.geometry;
  if (!geom) return null;
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
    return geom.coordinates as [number, number][];
  }
  if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
    const lines = geom.coordinates as [number, number][][];
    const flat: [number, number][] = [];
    for (const line of lines) {
      for (const c of line) flat.push(c);
    }
    return flat.length >= 2 ? flat : null;
  }
  return null;
}

function ensureScrubMarker(map: MapLibreMap) {
  ensurePassageArrowImage(map);

  if (!map.getSource(SCRUB_TRAIL_SOURCE_ID)) {
    map.addSource(SCRUB_TRAIL_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(SCRUB_TRAIL_GLOW_LAYER_ID)) {
    map.addLayer({
      id: SCRUB_TRAIL_GLOW_LAYER_ID,
      type: 'line',
      source: SCRUB_TRAIL_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': 0.34,
        'line-blur': 1.8,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2, 5,
          8, 11,
          12, 16,
        ],
      },
    });
  }
  if (!map.getLayer(SCRUB_TRAIL_LAYER_ID)) {
    map.addLayer({
      id: SCRUB_TRAIL_LAYER_ID,
      type: 'line',
      source: SCRUB_TRAIL_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-opacity': 0.98,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2, 2.2,
          8, 4.0,
          12, 5.2,
        ],
      },
    });
  }

  if (!map.getSource(SCRUB_SOURCE_ID)) {
    map.addSource(SCRUB_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer(SCRUB_HALO_LAYER_ID)) {
    map.addLayer({
      id: SCRUB_HALO_LAYER_ID,
      type: 'circle',
      source: SCRUB_SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2, 8,
          8, 12,
          12, 16,
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.22,
        'circle-blur': 0.6,
      },
    });
  }
  if (!map.getLayer(SCRUB_LAYER_ID)) {
    map.addLayer({
      id: SCRUB_LAYER_ID,
      type: 'circle',
      source: SCRUB_SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2, 3.5,
          8, 5.5,
          12, 7,
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 1,
        'circle-stroke-color': '#f8fafc',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.95,
      },
    });
  }
  if (!map.getLayer(SCRUB_ARROW_LAYER_ID)) {
    map.addLayer({
      id: SCRUB_ARROW_LAYER_ID,
      type: 'symbol',
      source: SCRUB_SOURCE_ID,
      layout: {
        'icon-image': PASSAGE_ARROW_IMAGE_ID,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2, 0.7,
          8, 0.95,
          12, 1.15,
        ],
        // PASSAGE_ARROW points +X (east). MapLibre icon-rotate is
        // degrees clockwise from north, so subtract 90° to aim along-course.
        'icon-rotate': ['-', ['get', 'bearing'], 90],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-color': ['get', 'color'],
        'icon-opacity': 0.98,
        'icon-halo-color': '#0f172a',
        'icon-halo-width': 1.4,
      },
    });
  }
}

function setScrubMarker(
  map: MapLibreMap,
  lon: number,
  lat: number,
  colorHex: string,
  bearingDeg?: number | null,
) {
  ensureScrubMarker(map);
  const src = map.getSource(SCRUB_SOURCE_ID) as GeoJSONSource | undefined;
  src?.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          color: colorHex,
          bearing: typeof bearingDeg === 'number' ? bearingDeg : 0,
        },
      },
    ],
  } as any);
  try {
    if (map.getLayer(SCRUB_TRAIL_GLOW_LAYER_ID)) map.moveLayer(SCRUB_TRAIL_GLOW_LAYER_ID);
    if (map.getLayer(SCRUB_TRAIL_LAYER_ID)) map.moveLayer(SCRUB_TRAIL_LAYER_ID);
    if (map.getLayer(SCRUB_HALO_LAYER_ID)) map.moveLayer(SCRUB_HALO_LAYER_ID);
    if (map.getLayer(SCRUB_LAYER_ID)) map.moveLayer(SCRUB_LAYER_ID);
    if (map.getLayer(SCRUB_ARROW_LAYER_ID)) map.moveLayer(SCRUB_ARROW_LAYER_ID);
  } catch {
    /* ignore */
  }
}

function setScrubTrail(
  map: MapLibreMap,
  coordinates: [number, number][],
  distanceFromStartNm: number,
  colorHex: string,
) {
  ensureScrubMarker(map);
  const trail = sliceLineToDistance(coordinates, distanceFromStartNm);
  const src = map.getSource(SCRUB_TRAIL_SOURCE_ID) as GeoJSONSource | undefined;
  if (!src) return;
  if (trail.length < 2) {
    src.setData({ type: 'FeatureCollection', features: [] } as any);
    return;
  }
  src.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: trail },
        properties: { color: colorHex },
      },
    ],
  } as any);
}

function clearScrubMarker(map: MapLibreMap) {
  const point = map.getSource(SCRUB_SOURCE_ID) as GeoJSONSource | undefined;
  point?.setData({ type: 'FeatureCollection', features: [] } as any);
  const trail = map.getSource(SCRUB_TRAIL_SOURCE_ID) as GeoJSONSource | undefined;
  trail?.setData({ type: 'FeatureCollection', features: [] } as any);
}

/** Slice a LineString from the start up to `targetNm` along its length. */
function sliceLineToDistance(
  coordinates: [number, number][],
  targetNm: number,
): [number, number][] {
  if (coordinates.length === 0 || targetNm <= 0) {
    return coordinates[0] ? [coordinates[0]] : [];
  }
  const out: [number, number][] = [coordinates[0]!];
  let cum = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    const seg = haversineNmQuick(a[1], a[0], b[1], b[0]);
    if (cum + seg >= targetNm) {
      const t = seg > 0 ? (targetNm - cum) / seg : 0;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return out;
    }
    out.push(b);
    cum += seg;
  }
  return out;
}

/** Approximate NM spanned by `px` horizontal pixels at the current zoom. */
function pixelDistanceToNm(map: MapLibreMap, px: number): number {
  try {
    const c = map.getCenter();
    const p0 = map.project(c);
    const p1 = { x: p0.x + px, y: p0.y };
    const ll1 = map.unproject(p1 as any);
    return Math.max(0.5, haversineNmQuick(c.lat, c.lng, ll1.lat, ll1.lng));
  } catch {
    return 12;
  }
}

function fitPadding(
  sidebarCollapsed = false,
  timelineActive = false,
): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  return {
    top: 48,
    right: 48,
    bottom: timelineActive ? 150 : 48,
    // Leave room for the legend panel when expanded.
    left: sidebarCollapsed ? 56 : 360,
  };
}

/**
 * Keep the scrub marker in frame during timeline play / drag.
 * Only pans when the point drifts outside a soft "safe" inset so the
 * camera doesn't fight the user while the boat is already on screen.
 *
 * Uses jumpTo (not easeTo) so continuous scrubbing stays responsive —
 * animated easeTo was delaying map paints until the gesture ended.
 */
function followScrubCamera(
  map: MapLibreMap,
  lon: number,
  lat: number,
  opts: { sidebarCollapsed: boolean; timelineActive: boolean },
) {
  const padding = fitPadding(opts.sidebarCollapsed, opts.timelineActive);
  const canvas = map.getCanvas();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 80 || h < 80) return;

  let point: { x: number; y: number };
  try {
    point = map.project([lon, lat]);
  } catch {
    return;
  }

  const usableW = Math.max(1, w - padding.left - padding.right);
  const usableH = Math.max(1, h - padding.top - padding.bottom);
  const insetX = Math.max(56, usableW * 0.22);
  const insetY = Math.max(56, usableH * 0.22);
  const minX = padding.left + insetX;
  const maxX = w - padding.right - insetX;
  const minY = padding.top + insetY;
  const maxY = h - padding.bottom - insetY;

  if (
    point.x >= minX &&
    point.x <= maxX &&
    point.y >= minY &&
    point.y <= maxY
  ) {
    return;
  }

  const targetScreenX = padding.left + usableW * 0.5;
  const targetScreenY = padding.top + usableH * 0.48;
  const cur = map.getCenter();
  let curPx: { x: number; y: number };
  try {
    curPx = map.project(cur);
  } catch {
    return;
  }
  const nextCenter = map.unproject([
    curPx.x + (point.x - targetScreenX),
    curPx.y + (point.y - targetScreenY),
  ]);

  try {
    map.jumpTo({ center: nextCenter });
  } catch {
    /* map may be disposing */
  }
}

function fitToVessels(
  map: MapLibreMap,
  vessels: VesselResponse[],
  hiddenVessels: Set<string> = new Set(),
  sidebarCollapsed = false,
) {
  const bounds = new LngLatBounds();
  let hasAny = false;
  for (const v of vessels) {
    if (hiddenVessels.has(v.vesselId)) continue;
    if (!v.bbox || v.bbox.length !== 4) continue;
    const [minLon, minLat, maxLon, maxLat] = v.bbox;
    bounds.extend([minLon, minLat]);
    bounds.extend([maxLon, maxLat]);
    hasAny = true;
  }
  if (!hasAny || bounds.isEmpty()) return;
  map.fitBounds(bounds.toArray() as LngLatBoundsLike, {
    padding: fitPadding(sidebarCollapsed),
    duration: 900,
    maxZoom: 8,
  });
}

/* ------------------------------------------------------------------ */
/*  Legend / stats overlay                                             */
/* ------------------------------------------------------------------ */

function PassagesLegendOverlay({
  tracks,
  live,
  view,
  isLoading,
  error,
  isVesselAccount,
  hiddenVessels,
  focusedVesselId,
  styleId,
  availableMonths,
  cachedMonths,
  canGoPrev,
  canGoNext,
  collapsed,
  isExporting,
  onPrev,
  onNext,
  onAll,
  onCurrent,
  onGoToMonth,
  onToggleCollapsed,
  onStyleChange,
  onToggleVessel,
  onFocusVessel,
  onRefreshAll,
  onRefreshVessel,
  onFlyToPassage,
  onFitToVisible,
  onExportVoyageCard,
  selectedPassage,
  logbookFingerprints,
  logbookLinks,
  promotingKey,
  isSyncingLogbook,
  onPromotePassage,
  onSyncAllToLogbook,
}: {
  tracks: TracksResponse | null;
  live: LiveResponse | null;
  view: ViewSelection;
  isLoading: boolean;
  error: string | null;
  isVesselAccount: boolean;
  hiddenVessels: Set<string>;
  focusedVesselId: string | null;
  styleId: MapStyleId;
  availableMonths: string[];
  cachedMonths: Set<string>;
  canGoPrev: boolean;
  canGoNext: boolean;
  collapsed: boolean;
  isExporting: boolean;
  onPrev: () => void;
  onNext: () => void;
  onAll: () => void;
  onCurrent: () => void;
  onGoToMonth: (monthKey: string) => void;
  onToggleCollapsed: () => void;
  onStyleChange: (next: MapStyleId) => void;
  onToggleVessel: (vesselId: string) => void;
  onFocusVessel: (vesselId: string) => void;
  onRefreshAll: () => void;
  onRefreshVessel: (vesselId: string) => void;
  onFlyToPassage: (vesselId: string, passageIndex: number) => void;
  onFitToVisible: () => void;
  onExportVoyageCard: () => void;
  selectedPassage: { vesselId: string; passageIndex: number } | null;
  logbookFingerprints: Set<string>;
  logbookLinks: LogbookLinkRow[];
  promotingKey: string | null;
  isSyncingLogbook: boolean;
  onPromotePassage: (opts: {
    vesselId: string;
    startTime: string;
    endTime: string;
    distanceNm?: number;
    avgSpeedKn?: number | null;
    maxSpeedKn?: number | null;
    pointCount?: number;
    coordinates?: [number, number][];
  }) => void;
  onSyncAllToLogbook: () => void;
}) {
  const vessels = tracks?.vessels ?? [];
  const liveByVessel = React.useMemo(() => {
    const map = new Map<string, LiveVessel>();
    for (const v of live?.vessels ?? []) map.set(v.vesselId, v);
    return map;
  }, [live?.vessels]);
  const underwayCount = React.useMemo(
    () =>
      (live?.vessels ?? []).filter((v) => v.live?.state === 'underway').length,
    [live?.vessels],
  );
  const totals = tracks?.totals;
  const tripStats = React.useMemo(
    () => computeTripStats(vessels, hiddenVessels),
    [vessels, hiddenVessels],
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-0 top-0 z-10 flex w-full max-w-[352px] flex-col p-3 sm:p-4',
        collapsed ? 'h-auto' : 'h-full',
      )}
    >
      <div
        className={cn(
          'pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/88 shadow-2xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-xl',
          collapsed ? 'max-h-none' : 'max-h-full',
        )}
      >
        {/* Header — title + collapse only */}
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-3 py-2.5',
            !collapsed && 'border-b border-white/10',
          )}
        >
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-white">
              Passage Tracks
            </h1>
            <p className="truncate text-[10px] text-white/45">
              {view.mode === 'all'
                ? 'All cached passages'
                : monthLabelTitleCase(view.month)}
              {selectedPassage ? ' · scrubbing' : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expand panel (])' : 'Collapse panel ([)'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>

        {!collapsed && (
          <>
        {/* Compact tools: navigate map + basemap */}
        <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
            disabled={isLoading || !totals || totals.passageCount === 0}
            onClick={onFitToVisible}
            title="Fit map (F)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
            disabled={isLoading}
            onClick={onRefreshAll}
            title={
              view.mode === 'all'
                ? 'Refresh cache'
                : 'Refresh this month'
            }
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
            disabled={
              isExporting || isLoading || !totals || totals.passageCount === 0
            }
            onClick={onExportVoyageCard}
            title="Export voyage card"
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/60 hover:bg-white/10 hover:text-white"
            disabled={
              isSyncingLogbook ||
              isLoading ||
              !totals ||
              totals.passageCount === 0
            }
            onClick={onSyncAllToLogbook}
            title="Add all to Passage Log"
          >
            {isSyncingLogbook ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BookPlus className="h-3.5 w-3.5" />
            )}
          </Button>
          <div className="ml-auto">
            <StyleSwitcher current={styleId} onChange={onStyleChange} />
          </div>
        </div>

        <MonthNavigator
          view={view}
          availableMonths={availableMonths}
          cachedMonths={cachedMonths}
          isLoading={isLoading}
          onPrev={onPrev}
          onNext={onNext}
          onAll={onAll}
          onCurrent={onCurrent}
          onGoToMonth={onGoToMonth}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
        />

        {totals && (
          <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2 text-[11px] text-white/55">
            <span>
              <span className="font-semibold tabular-nums text-white">
                {totals.passageCount.toLocaleString()}
              </span>{' '}
              passages
            </span>
            <span className="text-white/20">·</span>
            <span>
              <span className="font-semibold tabular-nums text-white">
                {Math.round(totals.totalDistanceNm).toLocaleString()}
              </span>{' '}
              NM
            </span>
            {tripStats.portsVisited > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span>
                  <span className="font-semibold tabular-nums text-white">
                    {tripStats.portsVisited}
                  </span>{' '}
                  ports
                </span>
              </>
            )}
          </div>
        )}

        {underwayCount > 0 ? (
          <div className="flex items-center gap-2 border-b border-emerald-400/15 bg-emerald-400/[0.07] px-4 py-2 text-[11px] text-emerald-100/85">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>
              <span className="font-semibold text-emerald-100">
                {underwayCount} vessel{underwayCount === 1 ? '' : 's'} underway
              </span>
              {' — '}live track on the map
            </span>
          </div>
        ) : live && !live.trackingEnabled ? (
          <div className="border-b border-white/10 bg-white/[0.02] px-4 py-2 text-[11px] text-white/45">
            {isVesselAccount
              ? 'Live AIS tracking is off — enable it on your vessel to prepare for live position updates.'
              : 'Live tracking is off — enable it on Current Service to plot your position.'}
          </div>
        ) : live?.message && isVesselAccount ? (
          <div className="border-b border-white/10 bg-white/[0.02] px-4 py-2 text-[11px] text-white/45">
            {live.message}
          </div>
        ) : null}

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {isLoading && !tracks && (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-white/60">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching AIS history…
            </div>
          )}

          {error && (
            <div className="p-4">
              <Alert variant="destructive" className="border-red-500/30 bg-red-500/10 text-red-100">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not load passages</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {tracks && vessels.length === 0 && !isLoading && (
            <EmptyState message={tracks.message} />
          )}

          {tracks?.quotaHit && (
            <div className="border-b border-white/10 bg-amber-500/10 p-3 text-xs text-amber-200">
              This request hit the AIS-history quota — some segments were skipped.
              Refresh a specific vessel below to load its history.
            </div>
          )}

          {vessels.length > 0 && (
            <ul className="divide-y divide-white/5">
              {vessels.map((v) => {
                const isHidden = hiddenVessels.has(v.vesselId);
                const isFocused = focusedVesselId === v.vesselId;
                const isDimmedByFocus =
                  Boolean(focusedVesselId) && !isFocused && !isHidden;
                const skipReasons = v.skipReason ? [v.skipReason] : [];
                const monthsCached = v.availableMonths.length;
                const liveVessel = liveByVessel.get(v.vesselId);
                const livePos = liveVessel?.live ?? null;
                const isUnderway = livePos?.state === 'underway';
                return (
                  <li
                    key={v.vesselId}
                    className={cn(
                      'group px-4 py-3 transition-colors hover:bg-white/[0.03]',
                      isHidden && 'opacity-55',
                      isDimmedByFocus && 'opacity-45',
                      isFocused && 'bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleVessel(v.vesselId)}
                        className="mt-1 shrink-0"
                        title={isHidden ? 'Show on map' : 'Hide on map'}
                      >
                        <span
                          className="flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-slate-950 transition-all"
                          style={{
                            backgroundColor: isHidden ? 'transparent' : v.colorHex,
                            boxShadow: isHidden ? 'none' : `0 0 12px ${v.colorHex}66`,
                            ['--tw-ring-color' as any]: v.colorHex,
                          }}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Ship className="h-3.5 w-3.5 shrink-0 text-white/40" />
                            <button
                              type="button"
                              onClick={() => onFocusVessel(v.vesselId)}
                              className="truncate text-left text-sm font-medium text-white hover:text-sky-200"
                              title={
                                isFocused
                                  ? 'Clear focus — show all vessels equally'
                                  : 'Focus this vessel — dim the others'
                              }
                            >
                              {v.vesselName}
                            </button>
                            {isFocused && (
                              <span className="shrink-0 rounded-md bg-sky-400/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-sky-200 ring-1 ring-sky-400/30">
                                Focus
                              </span>
                            )}
                            {livePos && (
                              <span
                                className={cn(
                                  'shrink-0 rounded-md px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider',
                                  isUnderway
                                    ? 'bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/30'
                                    : livePos.isStale
                                      ? 'bg-white/5 text-white/40'
                                      : 'bg-slate-400/15 text-slate-200',
                                )}
                                title={
                                  isUnderway
                                    ? `Live passage${typeof livePos.speedKn === 'number' ? ` · ${livePos.speedKn.toFixed(1)} kn` : ''}`
                                    : `${livePos.state}${livePos.isStale ? ' · stale' : ''}`
                                }
                              >
                                {isUnderway ? 'Live' : livePos.isStale ? 'Stale' : livePos.state}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleVessel(v.vesselId)}
                            className="text-white/40 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                            title={isHidden ? 'Show on map' : 'Hide on map'}
                          >
                            {isHidden ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/50">
                          <span className="tabular-nums text-white/70">
                            {v.totals.passageCount}
                          </span>
                          <span>passage{v.totals.passageCount === 1 ? '' : 's'}</span>
                          <span aria-hidden className="text-white/25">·</span>
                          <span className="tabular-nums text-white/70">
                            {Math.round(v.totals.totalDistanceNm).toLocaleString()}
                          </span>
                          <span>NM</span>
                          {monthsCached > 0 && (
                            <>
                              <span aria-hidden className="text-white/25">·</span>
                              <span className="tabular-nums text-white/70">
                                {monthsCached}
                              </span>
                              <span>mo cached</span>
                            </>
                          )}
                        </div>
                        {skipReasons.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {skipReasons.slice(0, 2).map((r, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="border-white/15 bg-white/5 text-[10px] font-normal text-white/70"
                              >
                                {r}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => onRefreshVessel(v.vesselId)}
                          className="mt-1.5 text-[11px] text-sky-400 opacity-0 transition-opacity hover:text-sky-300 group-hover:opacity-100"
                          disabled={isLoading}
                        >
                          Refresh this vessel →
                        </button>
                        <VesselPassageList
                          vessel={v}
                          isHidden={isHidden}
                          selectedPassageIndex={
                            selectedPassage?.vesselId === v.vesselId
                              ? selectedPassage.passageIndex
                              : null
                          }
                          forceOpen={
                            selectedPassage?.vesselId === v.vesselId ||
                            focusedVesselId === v.vesselId
                          }
                          logbookFingerprints={logbookFingerprints}
                          logbookLinks={logbookLinks}
                          promotingKey={promotingKey}
                          onFlyToPassage={(passageIndex) =>
                            onFlyToPassage(v.vesselId, passageIndex)
                          }
                          onPromotePassage={onPromotePassage}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="hidden border-t border-white/5 px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/30 sm:block">
          Click a passage to scrub · ← → months · Esc clear
        </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Collapsible per-vessel list of passages, rendered inside the sidebar
 * vessel row. Uses <details>/<summary> for the disclosure so we get
 * keyboard support and correct semantics for free; no extra state to
 * track "which sections are open" across renders.
 *
 * Each row is a mini-summary of the passage (date, distance, and
 * "Palma → Antibes" style route label when both endpoints match a
 * curated port). Clicking a row asks the map to fly to that passage
 * and open its popup — implemented via the imperative canvas handle
 * so we don't have to lift MapLibre state into React.
 *
 * List sort: most-recent-first, which matches the mental model of "I
 * want to see my last trip".
 */
function VesselPassageList({
  vessel,
  isHidden,
  selectedPassageIndex,
  forceOpen = false,
  logbookFingerprints,
  logbookLinks,
  promotingKey,
  onFlyToPassage,
  onPromotePassage,
}: {
  vessel: VesselResponse;
  isHidden: boolean;
  selectedPassageIndex?: number | null;
  forceOpen?: boolean;
  logbookFingerprints: Set<string>;
  logbookLinks: LogbookLinkRow[];
  promotingKey: string | null;
  onFlyToPassage: (passageIndex: number) => void;
  onPromotePassage: (opts: {
    vesselId: string;
    startTime: string;
    endTime: string;
    distanceNm?: number;
    avgSpeedKn?: number | null;
    maxSpeedKn?: number | null;
    pointCount?: number;
    coordinates?: [number, number][];
  }) => void;
}) {
  const features = vessel.featureCollection?.features ?? [];
  if (features.length === 0) return null;

  // Pair each feature with its ORIGINAL array index so `flyToPassage`
  // can look it up by that same index inside the map component (feature
  // IDs are assigned as `[0..N)` during `applyVesselLayers`). Sort a
  // COPY by start time descending so the recent trip is first.
  const rows = features
    .map((f, index) => ({ index, feature: f }))
    .filter(({ feature }) => feature.geometry?.type === 'LineString')
    .sort((a, b) => {
      const aTime = new Date(
        String(a.feature.properties?.startTime ?? 0),
      ).getTime();
      const bTime = new Date(
        String(b.feature.properties?.startTime ?? 0),
      ).getTime();
      return bTime - aTime;
    });

  if (rows.length === 0) return null;

  return (
    <details
      className="passages-list mt-2 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.03]"
      open={forceOpen || undefined}
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-medium text-white/55 marker:content-none [&::-webkit-details-marker]:hidden hover:text-white/85">
        <span>
          {rows.length} passage{rows.length === 1 ? '' : 's'}
          {typeof selectedPassageIndex === 'number' ? ' · scrubbing' : ''}
        </span>
        <span className="text-white/25">▾</span>
      </summary>
      <ul className="max-h-56 overflow-y-auto border-t border-white/5">
        {rows.map(({ index, feature }) => {
          const start = String(feature.properties?.startTime ?? '');
          const end = String(feature.properties?.endTime ?? '');
          const distance = numOrUndef(feature.properties?.distanceNm);
          const routeLabel = deriveRouteLabelFromLineFeature(feature);
          const dateLabel = formatShortDate(start);
          const fingerprint =
            start && end
              ? buildAisPassageFingerprint(vessel.vesselId, start, end)
              : '';
          const inLogbook =
            !!start &&
            !!end &&
            isAisVoyageLinkedToLogbook(
              {
                vesselId: vessel.vesselId,
                startTime: start,
                endTime: end,
                fingerprint,
              },
              logbookFingerprints,
              logbookLinks,
            );
          const isPromoting = promotingKey === fingerprint;
          const isSelected = selectedPassageIndex === index;
          const coords =
            feature.geometry?.type === 'LineString'
              ? (feature.geometry.coordinates as [number, number][])
              : undefined;
          return (
            <li key={index} className="border-b border-white/[0.04] last:border-0">
              <div
                className={cn(
                  'flex items-stretch gap-1 pr-1',
                  isSelected && 'bg-sky-400/10',
                )}
              >
                <button
                  type="button"
                  disabled={isHidden}
                  onClick={() => onFlyToPassage(index)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left text-[11px] transition-colors',
                    'hover:bg-sky-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40',
                    isSelected && 'text-sky-100',
                  )}
                  title={
                    isHidden
                      ? 'Un-hide this vessel to fly to its passages'
                      : isSelected
                        ? 'Selected — use the bottom timeline to scrub'
                        : 'Select & scrub this passage'
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate font-medium text-white/88">
                      <span className="truncate">{routeLabel ?? 'Passage'}</span>
                      {inLogbook && (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-300/90"
                          title="Already in Passage Log"
                        >
                          <BookMarked className="h-2.5 w-2.5" />
                          Log
                        </span>
                      )}
                    </div>
                    {dateLabel && (
                      <div className="mt-0.5 text-[10px] text-white/40">{dateLabel}</div>
                    )}
                  </div>
                  {typeof distance === 'number' && (
                    <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 tabular-nums text-white/60">
                      {Math.round(distance).toLocaleString()} NM
                    </span>
                  )}
                </button>
                {!inLogbook && start && end && (
                  <button
                    type="button"
                    disabled={isHidden || isPromoting || !fingerprint}
                    onClick={() =>
                      onPromotePassage({
                        vesselId: vessel.vesselId,
                        startTime: start,
                        endTime: end,
                        distanceNm: distance,
                        avgSpeedKn: numOrNull(feature.properties?.avgSpeedKn),
                        maxSpeedKn: numOrNull(feature.properties?.maxSpeedKn),
                        pointCount: numOrUndef(feature.properties?.pointCount),
                        coordinates: coords,
                      })
                    }
                    className="my-1 mr-1 inline-flex shrink-0 items-center justify-center rounded-md px-1.5 text-sky-300/80 hover:bg-sky-400/10 hover:text-sky-200 disabled:opacity-40"
                    title="Save to Passage Log (avoid duplicate manual entry)"
                  >
                    {isPromoting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BookPlus className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * Compact date label for the passage list rows — "12 Aug" for
 * anything in the current year, "12 Aug 2025" otherwise. Falls back to
 * an empty string when the date is unparseable so the caller can just
 * skip rendering.
 */
function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

function StyleSwitcher({
  current,
  onChange,
}: {
  current: MapStyleId;
  onChange: (next: MapStyleId) => void;
}) {
  const currentStyle = MAP_STYLES[current];
  const CurrentIcon = currentStyle.icon;
  return (
    <div className="relative">
      <label className="sr-only" htmlFor="passages-map-style">
        Map basemap
      </label>
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] pl-1.5 pr-1">
        <CurrentIcon className="h-3.5 w-3.5 text-white/55" />
        <select
          id="passages-map-style"
          value={current}
          onChange={(e) => onChange(e.target.value as MapStyleId)}
          className="h-8 max-w-[7.5rem] cursor-pointer appearance-none bg-transparent py-1 pr-5 text-[11px] font-medium text-white/85 outline-none"
          title="Map basemap style"
        >
          {(Object.keys(MAP_STYLES) as MapStyleId[]).map((id) => (
            <option key={id} value={id} className="bg-slate-950 text-white">
              {MAP_STYLES[id].label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * First day of the CURRENT UTC month as `YYYY-MM-01`. Used by the client
 * initial state and by the "Jump to current month" button. Deliberately
 * mirrors the server helper of the same name — they MUST agree on what
 * "current month" means or a fresh page render would fetch the wrong
 * month.
 */
function currentMonthKeyClient(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** "2026-07-01" → "July 2026" (title case, for loading pills / badges). */
function monthLabelTitleCase(monthKey: string | null): string {
  if (!monthKey) return '—';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Derive richer trip stats from the currently-visible vessels for the
 * sidebar. Ports are counted via the same nearest-port lookup used by
 * the hover popup, so the numbers stay consistent with what users see
 * when they inspect a passage.
 */
function computeTripStats(
  vessels: VesselResponse[],
  hiddenVessels: Set<string>,
): {
  avgDistanceNm: number | null;
  longestNm: number | null;
  longestRoute: string | null;
  portsVisited: number;
} {
  let totalDist = 0;
  let count = 0;
  let longestNm: number | null = null;
  let longestRoute: string | null = null;
  const ports = new Set<string>();

  for (const v of vessels) {
    if (hiddenVessels.has(v.vesselId)) continue;
    for (const f of v.featureCollection?.features ?? []) {
      const dist = numOrUndef(f.properties?.distanceNm);
      if (typeof dist === 'number') {
        totalDist += dist;
        count += 1;
        if (longestNm == null || dist > longestNm) {
          longestNm = dist;
          longestRoute = deriveRouteLabelFromLineFeature(f);
        }
      }
      const route = deriveRouteLabelFromLineFeature(f);
      if (route) {
        for (const part of route.split('→')) {
          const name = part.replace('(round trip)', '').trim();
          if (name && name !== 'Open sea' && name !== 'Unknown') ports.add(name);
        }
      }
    }
  }

  return {
    avgDistanceNm: count > 0 ? totalDist / count : null,
    longestNm,
    longestRoute,
    portsVisited: ports.size,
  };
}

/**
 * Month picker — prev/next + labeled month select (no tiny dots) +
 * Current / All Time modes.
 */
function MonthNavigator({
  view,
  availableMonths,
  cachedMonths,
  isLoading,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onAll,
  onCurrent,
  onGoToMonth,
}: {
  view: ViewSelection;
  availableMonths: string[];
  cachedMonths: Set<string>;
  isLoading: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onAll: () => void;
  onCurrent: () => void;
  onGoToMonth: (monthKey: string) => void;
}) {
  const isAll = view.mode === 'all';
  const currentKey = currentMonthKeyClient();
  const isOnCurrent = !isAll && view.month === currentKey;
  const selectValue = isAll ? '__all__' : view.month;

  // Ensure the active month is always in the option list even if the
  // server hasn't returned availableMonths yet.
  const monthOptions = React.useMemo(() => {
    const set = new Set(availableMonths);
    if (view.mode === 'month') set.add(view.month);
    set.add(currentKey);
    return Array.from(set).sort();
  }, [availableMonths, view.mode, view.mode === 'month' ? view.month : null, currentKey]);

  return (
    <div className="space-y-2 border-b border-white/10 px-3 py-2.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canGoPrev || isLoading || isAll}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors',
            canGoPrev && !isLoading && !isAll
              ? 'hover:bg-white/10 hover:text-white'
              : 'cursor-not-allowed opacity-30',
          )}
          title="Previous month (←)"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <label className="sr-only" htmlFor="passages-map-month">
          Month
        </label>
        <select
          id="passages-map-month"
          value={selectValue}
          disabled={isLoading}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__all__') onAll();
            else onGoToMonth(v);
          }}
          className={cn(
            'h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-white/10',
            'bg-white/[0.04] px-2.5 text-[12px] font-medium text-white outline-none',
            'hover:bg-white/[0.06] focus:border-sky-400/40 focus:ring-1 focus:ring-sky-400/30',
            'disabled:cursor-wait disabled:opacity-60',
          )}
        >
          <option value="__all__" className="bg-slate-950 text-white">
            All time ({cachedMonths.size} mo)
          </option>
          {monthOptions.map((m) => {
            const cached = cachedMonths.has(m);
            const label = monthLabelTitleCase(m);
            const suffix =
              m === currentKey
                ? ' · now'
                : cached
                  ? ' · cached'
                  : '';
            return (
              <option key={m} value={m} className="bg-slate-950 text-white">
                {label}
                {suffix}
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext || isLoading || isAll}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors',
            canGoNext && !isLoading && !isAll
              ? 'hover:bg-white/10 hover:text-white'
              : 'cursor-not-allowed opacity-30',
          )}
          title="Next month (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onCurrent}
          disabled={isOnCurrent || isLoading}
          className={cn(
            'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
            isOnCurrent
              ? 'bg-sky-400/15 text-sky-200'
              : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white',
          )}
          title="Jump to the current month (C)"
        >
          This month
        </button>
        <button
          type="button"
          onClick={onAll}
          disabled={isAll || isLoading}
          className={cn(
            'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
            isAll
              ? 'bg-sky-400/15 text-sky-200'
              : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white',
          )}
          title="Show every cached passage (A)"
        >
          All time
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <MapPin className="h-6 w-6 text-white/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">
          No passages this month
        </p>
        <p className="mt-1 text-xs text-white/50">
          {message ??
            "You haven't been underway this month yet. Passages appear here as soon as your vessel starts moving."}
        </p>
      </div>
      <Link
        href="/dashboard/current"
        className="text-xs font-medium text-sky-400 hover:text-sky-300"
      >
        Go to Current Service →
      </Link>
    </div>
  );
}
