export interface WatchShift {
  name: string;
  startHour: number; // 0-23
  endHour: number;   // 1-24 (24 = midnight next day)
  color: string;     // hex e.g. "#3b82f6"
}

export interface WatchAssignment {
  id: string;        // unique per block (crypto.randomUUID or nanoid-style)
  date: string;      // YYYY-MM-DD
  userId: string;
  userName: string;
  userPosition?: string | null;
  startHour: number; // 0-23
  endHour: number;   // 1-24
  shiftName?: string; // optional label / shift colour reference
}

export interface WatchSchedule {
  id?: string;
  vesselId: string;
  createdBy: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  watchSystem: '4on8off' | '6on6off' | 'custom';
  shifts: WatchShift[];
  assignments: WatchAssignment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SchedulableCrew {
  id: string;
  displayName: string;
  position?: string | null;
  source: 'linked_account' | 'vessel_assignment';
}

export interface WatchSchedulePDFData {
  schedule: WatchSchedule;
  vesselName: string;
  generatedByName: string;
}

export interface CrewWatchSchedulePDFData {
  schedule: WatchSchedule;
  crewUserId: string;
  crewName: string;
  vesselName: string;
}
