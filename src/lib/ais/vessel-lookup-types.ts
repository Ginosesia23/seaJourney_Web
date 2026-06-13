import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';

export type AisExistingVesselMatch = {
  id: string;
  name: string;
  type: string;
  officialNumber: string | null;
  hasManager: boolean;
};

export type AisVesselLookupResultItem = {
  uuid: string | null;
  autofill: VesselRegistrationAutofill;
  existingInDatabase: AisExistingVesselMatch | null;
};

export type AisVesselLookupResponse = {
  found: boolean;
  mode?: 'single' | 'list';
  autofill?: VesselRegistrationAutofill;
  existingInDatabase?: AisExistingVesselMatch | null;
  results?: AisVesselLookupResultItem[];
  query?: string;
  totalCount?: number;
  truncated?: boolean;
  error?: string;
};

export type AisVesselLookupSelection = {
  autofill: VesselRegistrationAutofill;
  existingInDatabase: AisExistingVesselMatch | null;
};
