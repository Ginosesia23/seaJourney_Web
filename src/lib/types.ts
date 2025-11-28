
import { Timestamp } from "firebase/firestore";

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
}

export interface Vessel {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
  ownerId: string;
}

export type DailyStatus = 'underway' | 'at-anchor' | 'in-port' | 'on-leave' | 'in-yard';

export interface Trip {
    id: string;
    vesselId: string;
    position: string;
    startDate: Timestamp;
    endDate?: Timestamp;
    dailyStates: Record<string, DailyStatus>; // "yyyy-MM-dd" -> DailyStatus
    notes?: string;
}
