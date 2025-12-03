
export interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  bio?: string;
  registrationDate: string; // ISO String
  role: 'crew' | 'vessel' | 'admin';
  subscriptionTier: string;
  subscriptionStatus: 'active' | 'inactive' | 'past-due';
  activeVesselId?: string;
}

export interface Vessel {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
}

export type DailyStatus = 'underway' | 'at-anchor' | 'in-port' | 'on-leave' | 'in-yard';

export interface SeaServiceRecord {
    id: string;
    userId: string;
    vesselId: string;
    date: string; // Date in YYYY-MM-DD format - the specific date this state applies to
    state: DailyStatus; // The only field that can be updated
}

export interface StateLog {
    id: string; // UUID
    userId: string; // UUID
    vesselId: string; // UUID
    state: DailyStatus;
    date: string; // Date in YYYY-MM-DD format
    createdAt?: string; // ISO timestamp
    updatedAt?: string; // ISO timestamp
}

/**
 * Check if a sea service record is the currently active service
 * @param service - The sea service record to check
 * @param activeVesselId - The ID of the currently active vessel (from user profile)
 * @returns true if the service's vessel matches the active vessel
 */
export function isCurrentService(service: SeaServiceRecord, activeVesselId?: string | null): boolean {
    if (!activeVesselId || !service) return false;
    return service.vesselId === activeVesselId;
}
