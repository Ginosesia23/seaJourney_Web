import type { AisTriggerSource, AisProviderEndpoint } from '@/lib/ais/fetch-audit-shared';
import type { DailyStatus } from '@/lib/types';

export type VesselAuditPeriod = '30' | '90' | 'year' | 'all';

export type VesselAuditSection =
  | 'overview'
  | 'ais-fetches'
  | 'ais-observations'
  | 'ais-days'
  | 'sea-time'
  | 'passages'
  | 'watches'
  | 'documents'
  | 'crew';

export type VesselAuditVessel = {
  id: string;
  name: string;
  type: string;
  officialNumber: string | null;
  imo: string | null;
  flag: string | null;
  mmsi: string | null;
  callSign: string | null;
  grossTonnage: number | null;
  managementCompany: string | null;
  hasStamp: boolean;
  aisTrackingEnabled: boolean;
  aisLastSyncAt: string | null;
  aisLastNavStatus: string | null;
  aisLastSpeed: number | null;
  aisLastPositionAt: string | null;
  aisLastSyncError: string | null;
};

export type VesselAuditAisStatus = {
  state: string | null;
  speedKn: number | null;
  course: number | null;
  heading: number | null;
  latitude: number | null;
  longitude: number | null;
  navStatus: string | null;
  fetchedAt: string | null;
  providerTimestamp: string | null;
  trackingMode: string | null;
  nextCheckAt: string | null;
  lastSuccessfulFetchAt: string | null;
  consecutiveFailures: number;
  refreshError: string | null;
};

export type VesselAuditCrewMember = {
  userId: string;
  name: string;
  email: string | null;
  position: string | null;
  onboard: boolean;
  startDate: string;
};

export type VesselAuditFetchRow = {
  id: string;
  requestedAt: string;
  completedAt: string | null;
  success: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  endpoint: AisProviderEndpoint | null;
  triggerSource: AisTriggerSource;
  triggerDetail: string | null;
  trackingMode: string | null;
  scheduledReason: string | null;
  errorMessage: string | null;
  providerCalled: boolean;
  providerCreditsUsed: number | null;
  observation: {
    id: string;
    fetchedAt: string;
    state: string | null;
    speedKn: number | null;
    course: number | null;
    heading: number | null;
    latitude: number | null;
    longitude: number | null;
    navStatus: string | null;
    providerTimestamp: string | null;
  } | null;
};

export type VesselAuditObservationRow = {
  id: string;
  fetchedAt: string;
  providerTimestamp: string | null;
  state: string;
  speedKn: number | null;
  course: number | null;
  heading: number | null;
  latitude: number | null;
  longitude: number | null;
  navStatus: string | null;
};

export type VesselAuditDayRow = {
  date: string;
  qualifyingState: string | null;
  currentState: string | null;
  observationCount: number;
  distanceNm: number | null;
  underwaySeconds: number;
  anchorSeconds: number;
  mooredSeconds: number;
  isFinal: boolean;
  loggedState: DailyStatus | null;
};

export type VesselAuditStateLogRow = {
  id: string;
  date: string;
  state: DailyStatus;
  notes: string | null;
  isPartOfActivePassage: boolean;
};

export type VesselAuditPassageRow = {
  id: string;
  startTime: string;
  endTime: string | null;
  departurePort: string | null;
  arrivalPort: string | null;
  distanceNm: number | null;
  source: string | null;
};

export type VesselAuditWatchRow = {
  id: string;
  startTime: string;
  endTime: string | null;
  watchType: string | null;
  crewName: string | null;
};

export type VesselAuditDocumentRow = {
  id: string;
  kind: 'vessel_generated' | 'proof' | 'testimonial';
  title: string;
  status: string | null;
  crewName: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  verificationCode: string | null;
};

export type VesselAuditOverview = {
  vessel: VesselAuditVessel;
  aisStatus: VesselAuditAisStatus | null;
  period: { from: string | null; to: string };
  crew: VesselAuditCrewMember[];
  stateCounts: Record<DailyStatus, number>;
  loggedDays: number;
  expectedDays: number;
  missingDays: number;
  lastLoggedDate: string | null;
  counts: {
    fetches: number;
    observations: number;
    aisDays: number;
    passages: number;
    watches: number;
    vesselGeneratedDocs: number;
    proofOfService: number;
    pendingTestimonials: number;
    approvedTestimonials: number;
  };
  readiness: Array<{ id: string; ok: boolean; label: string; hint?: string }>;
};

export type VesselAuditPage<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};
