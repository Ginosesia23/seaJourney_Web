
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

export type TestimonialStatus = 'draft' | 'pending_captain' | 'pending_official' | 'approved' | 'rejected';

export interface Testimonial {
    id: string;                   // uuid
    user_id: string;              // uuid (references auth.users)
    vessel_id: string;            // uuid (references vessels)
    start_date: string;           // ISO date string (YYYY-MM-DD)
    end_date: string;             // ISO date string (YYYY-MM-DD)
    total_days: number;
    at_sea_days: number;
    standby_days: number;
    yard_days: number;
    leave_days: number;
    status: TestimonialStatus;
    pdf_url: string | null;
    captain_name: string | null;
    captain_email: string | null;
    official_body: string | null;
    official_reference: string | null;
    notes: string | null;
    testimonial_code: string | null;           // Unique code in format SJ-XXXX-XXXX
    signoff_token: string | null;              // UUID token for secure signoff links
    signoff_token_expires_at: string | null;   // ISO timestamp
    signoff_target_email: string | null;       // Email address the token was generated for
    signoff_used_at: string | null;            // ISO timestamp
    created_at: string;           // ISO timestamp
    updated_at: string;           // ISO timestamp
}


