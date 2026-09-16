import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import type { DailyStatus } from '@/lib/types';

/** Normalised AIS position returned by any AIS provider implementation. */
export type AISProviderPosition = {
  latitude: number | null;
  longitude: number | null;
  speedKn: number | null;
  course: number | null;
  heading: number | null;
  rawNavigationStatus: string | null;
  providerTimestamp: string | null;
  destination: string | null;
  mmsi: string | null;
  imo: string | null;
  raw: DatalasticVesselPosition;
};

export type AISProviderResult = {
  ok: boolean;
  position: AISProviderPosition | null;
  responseStatus?: number;
  errorMessage?: string;
};

export type AISProviderLookup = {
  mmsi?: string | null;
  imo?: string | null;
};

export interface AISProvider {
  readonly name: string;
  getVesselPosition(lookup: AISProviderLookup): Promise<AISProviderResult>;
}

export type ClassifiedAisFix = {
  seajourneyState: DailyStatus;
  rawNavigationStatus: string | null;
  position: AISProviderPosition;
  classificationReason: string;
  classificationConfidence: string;
};

export type VesselAisSnapshot = {
  vesselId: string;
  state: DailyStatus;
  latitude: number | null;
  longitude: number | null;
  speedKn: number | null;
  course: number | null;
  heading: number | null;
  rawNavigationStatus: string | null;
  provider: string;
  providerTimestamp: string | null;
  fetchedAt: string;
  stale: boolean;
  source: 'cache' | 'datalastic';
  refreshError?: string | null;
  rawPosition?: DatalasticVesselPosition | null;
};

export type VesselAisStatusRow = {
  id: string;
  vessel_id: string;
  latitude: number | null;
  longitude: number | null;
  speed_kn: number | null;
  course: number | null;
  heading: number | null;
  raw_navigation_status: string | null;
  seajourney_state: DailyStatus;
  provider: string;
  provider_timestamp: string | null;
  fetched_at: string;
  updated_at: string;
  raw_position: DatalasticVesselPosition | null;
  refresh_error: string | null;
};
