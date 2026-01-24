
export interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  profilePicture?: string;
  bio?: string;
  registrationDate: string; // ISO String
  role: 'crew' | 'captain' | 'vessel' | 'admin';
  subscriptionTier: string;
  subscriptionStatus: 'active' | 'inactive' | 'past-due';
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  activeVesselId?: string;
  startDate?: string | null; // ISO date string (YYYY-MM-DD) - Official start date for vessel accounts
  signature?: string | null; // Base64 encoded signature image for captains
  dischargeBookNumber?: string | null; // Discharge book number for use in testimonials
  // MCA Application fields
  title?: string | null; // Mr/Mrs/Miss/etc
  placeOfBirth?: string | null;
  countryOfBirth?: string | null;
  nationality?: string | null;
  telephone?: string | null;
  mobile?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressDistrict?: string | null;
  addressTownCity?: string | null;
  addressCountyState?: string | null;
  addressPostCode?: string | null;
  addressCountry?: string | null;
}

export interface Vessel {
  id: string;
  name: string;
  type: string;
  officialNumber?: string;
  imo?: string;
  vesselManagerId?: string | null;
  length_m?: number | null;
  beam?: number | null;
  draft?: number | null;
  gross_tonnage?: number | null;
  number_of_crew?: number | null;
  build_year?: number | null;
  flag_state?: string | null;
  call_sign?: string | null;
  mmsi?: string | null;
  description?: string | null;
  management_company?: string | null;
  company_address?: string | null;
  company_contact?: string | null;
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
    captain_user_id: string | null;  // uuid (references auth.users) - captain's user account
    captain_name: string | null;
    captain_email: string | null;
    captain_position: string | null;  // Captain's position (e.g., "Master", "Chief Officer") saved at approval time
    captain_signature: string | null; // Base64 encoded signature image saved at approval time
    captain_comment_conduct?: string | null; // Captain comment on conduct
    captain_comment_ability?: string | null; // Captain comment on ability
    captain_comment_general?: string | null; // Captain general comments
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

export interface VesselAssignment {
    id: string;                        // uuid PK
    userId: string;                    // uuid FK → auth.users.id
    vesselId: string;                  // uuid FK → vessels.id
    startDate: string;                 // Date in YYYY-MM-DD format
    endDate?: string | null;           // Date in YYYY-MM-DD format, NULL if still active
    position?: string | null;          // User's position/role on this vessel
    onboard?: boolean;                 // Whether the crew member is currently onboard
    createdAt?: string;                // ISO timestamp
    updatedAt?: string;                // ISO timestamp
}

export interface PositionHistory {
    id: string;                        // uuid PK
    userId: string;                    // uuid FK → auth.users.id
    position: string;                  // Position/role name
    startDate: string;                 // Date in YYYY-MM-DD format
    endDate?: string | null;           // Date in YYYY-MM-DD format, NULL if current position
    vesselId?: string | null;          // Optional: link to vessel if position is vessel-specific
    notes?: string | null;             // Optional notes about the position change
    createdAt?: string;                // ISO timestamp
    updatedAt?: string;                // ISO timestamp
}

export interface VesselClaimRequest {
    id: string;                        // uuid PK
    vessel_id: string;                 // uuid FK → vessels.id
    requested_by: string;              // uuid FK → auth.users.id
    requested_role: string;            // text - role being requested (e.g., 'captain')
    status: 'pending' | 'vessel_approved' | 'admin_approved' | 'approved' | 'rejected'; // text - status with dual approval
    supporting_documents?: string[] | null; // text[] - array of document URLs proving captaincy
    verification_method?: string | null; // text - method used for verification
    verification_payload?: any;        // jsonb - verification data
    reviewed_by?: string | null;       // uuid FK → auth.users.id (deprecated, use vessel_approved_by/admin_approved_by)
    reviewed_at?: string | null;       // timestamp with time zone (deprecated)
    vessel_approved_by?: string | null; // uuid FK → auth.users.id (vessel account that approved)
    vessel_approved_at?: string | null; // timestamp with time zone
    admin_approved_by?: string | null;  // uuid FK → auth.users.id (admin that approved)
    admin_approved_at?: string | null;  // timestamp with time zone
    review_notes?: string | null;      // text
    created_at?: string;               // timestamp with time zone
    updated_at?: string;               // timestamp with time zone
}

export interface SeaTimeRequest {
    id: string;                        // uuid PK
    crewUserId: string;                // uuid FK → auth.users.id (crew member requesting)
    vesselId: string;                  // uuid FK → vessels.id
    startDate: string;                 // Date in YYYY-MM-DD format
    endDate: string;                   // Date in YYYY-MM-DD format
    status: 'pending' | 'approved' | 'rejected'; // Request status
    notes?: string | null;             // Optional notes from crew member
    rejectionReason?: string | null;   // Optional rejection reason from vessel manager
    createdAt?: string;                // ISO timestamp
    updatedAt?: string;                // ISO timestamp
}

export interface VisaTracker {
    id: string;                        // uuid PK
    userId: string;                    // uuid FK → auth.users.id
    areaName: string;                  // text - e.g., "Schengen Area", "USA", "Australia"
    issueDate: string;                 // Date in YYYY-MM-DD format - when visa was issued
    expireDate: string;                // Date in YYYY-MM-DD format - when visa expires
    totalDays: number;                 // Total days allowed (for fixed rules)
    ruleType?: 'fixed' | 'rolling';   // Type of visa rule
    daysAllowed?: number;              // Days allowed (e.g., 90 for Schengen)
    periodDays?: number;               // Period in days for rolling rules (e.g., 180 for Schengen)
    notes?: string | null;             // Optional notes
    createdAt?: string;                 // ISO timestamp
    updatedAt?: string;                 // ISO timestamp
}

export interface VisaEntry {
    id: string;                        // uuid PK
    visaId: string;                    // uuid FK → visa_tracker.id
    userId: string;                     // uuid FK → auth.users.id
    entryDate: string;                  // Date in YYYY-MM-DD format - the date user was in the area
    createdAt?: string;                 // ISO timestamp
    updatedAt?: string;                 // ISO timestamp
}

export interface Certificate {
    id: string;                        // uuid PK
    userId: string;                     // uuid FK → auth.users.id
    certificateName: string;            // e.g., "STCW Basic Safety", "Medical Certificate"
    certificateType: string;            // e.g., "STCW", "Medical", "MCA", "Other"
    certificateNumber?: string | null;  // Certificate number/reference if available
    issuingAuthority?: string | null;   // e.g., "MCA", "USCG", "Transport Canada"
    issueDate: string;                  // Date in YYYY-MM-DD format
    expiryDate?: string | null;         // Date in YYYY-MM-DD format (null if no expiry)
    renewalRequired: boolean;           // Whether this certificate requires renewal
    renewalNoticeDays: number;          // Days before expiry to send notice (default 90)
    notes?: string | null;              // Optional notes
    documentUrl?: string | null;        // URL to uploaded certificate document
    createdAt?: string;                 // ISO timestamp
    updatedAt?: string;                 // ISO timestamp
}

export interface NavWatchApplication {
    id: string;                        // uuid PK
    user_id: string;                   // uuid FK → auth.users.id
    certificate_type: 'navigational' | 'engine_room' | 'electro_technical';
    personal_details: {
        surname: string;
        forenames: string;
        dateOfBirth?: string;
        placeOfBirth?: string;
        countryOfBirth?: string;
        nationality?: string;
        address: {
            line1: string;
            line2?: string;
            district?: string;
            townCity: string;
            countyState?: string;
            postCode: string;
            country: string;
        };
        telephone?: string;
        mobile?: string;
        email: string;
    };
    sea_service_records: Array<{
        vesselName: string;
        flag: string;
        imoNumber?: string;
        grossTonnage?: number;
        kilowatts?: number;
        length?: number;
        capacity?: string;
        fromDate: string;
        toDate: string;
        totalDays: number;
        daysAtSea: number;
    }>;
    created_at: string;                // ISO timestamp
    updated_at: string;                 // ISO timestamp
}


