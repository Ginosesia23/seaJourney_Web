
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
  activeSeaServiceId?: string;
}

export interface Vessel {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
  ownerId: string;
}

export type DailyStatus = 'underway' | 'at-anchor' | 'in-port' | 'on-leave' | 'in-yard';

export interface SeaServiceRecord {
    id: string;
    vesselId: string;
    position: string;
    startDate: string; // ISO string or timestamp
    endDate?: string; // ISO string or timestamp
    isCurrent: boolean;
    notes?: string;
}

export interface StateLog {
    id: string; // "YYYY-MM-DD"
    date: string; // "YYYY-MM-DD"
    state: DailyStatus;
    migrated_at?: string;
}
