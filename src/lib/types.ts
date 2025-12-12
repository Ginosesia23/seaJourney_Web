
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
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
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

export interface PassageLog {
    id: string;                        // uuid PK
    crew_id: string;                   // uuid FK → profiles.id
    vessel_id: string;                 // uuid FK → vessels.id
    start_time: string;                // timestamptz - departure date/time
    end_time: string;                  // timestamptz - arrival date/time
    departure_port: string;            // text - e.g. "Monaco"
    departure_country?: string | null; // text - optional
    arrival_port: string;              // text - e.g. "Porto Cervo"
    arrival_country?: string | null;   // text - optional
    departure_lat?: number | null;     // numeric - nullable
    departure_lon?: number | null;     // numeric - nullable
    arrival_lat?: number | null;       // numeric - nullable
    arrival_lon?: number | null;       // numeric - nullable
    distance_nm?: number | null;       // numeric - nautical miles
    engine_hours?: number | null;      // numeric - optional
    avg_speed_knots?: number | null;   // numeric - optional, can be derived
    passage_type?: string | null;      // text - e.g. "delivery", "guest_trip", "shipyard_move"
    weather_summary?: string | null;   // text - brief description
    sea_state?: string | null;         // text - Beaufort/sea state notes
    notes?: string | null;             // text - freeform
    source?: string | null;            // text - "manual" / "ais_assisted" etc.
    track_data?: any;                  // jsonb - optional polyline or AIS snapshot
    created_at: string;                // timestamptz
    updated_at: string;                // timestamptz
}

export interface BridgeWatchLog {
    id: string;                        // uuid PK
    crew_id: string;                   // uuid FK → profiles.id
    vessel_id: string;                 // uuid FK → vessels.id
    passage_id?: string | null;        // uuid FK → passage_logs.id - nullable
    start_time: string;                // timestamptz - watch start
    end_time: string;                  // timestamptz - watch end
    state: string;                     // text - underway, anchor, port, yard…
    role: string;                      // text - OOW, co-watch, lookout, helmsman
    is_night_watch: boolean;           // boolean - easy filtering for night hours
    solo_watch: boolean;               // boolean - true if alone on watch
    supervised_by_name?: string | null; // text - captain/chief officer name if supervised
    area?: string | null;              // text - e.g. "West Med", "Caribbean"
    traffic_density?: string | null;   // text - low, medium, high
    visibility?: string | null;        // text - free text or enum
    weather_summary?: string | null;   // text - optional
    incidents?: string | null;         // text - near misses, drills, etc.
    equipment_used?: string | null;    // text - radar, ECDIS, ARPA, paper charts…
    notes?: string | null;             // text - extra comments
    created_at: string;                // timestamptz
    updated_at: string;                // timestamptz
}


