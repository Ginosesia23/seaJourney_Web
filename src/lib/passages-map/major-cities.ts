/**
 * Curated list of major world cities for the Passages Map labels.
 *
 * Why not use a data package?
 *   The go-to sources (Natural Earth `populated_places`, GeoNames, etc.)
 *   are 20-80 MB — not something we want to ship in a client bundle for
 *   one page. Instead this file is a hand-picked list of ~140 world
 *   capitals + major maritime hubs + a handful of iconic yacht ports.
 *   Priority tiers control at what zoom each label starts appearing.
 *
 * Tier semantics (used by page.tsx to decide visibility per zoom level):
 *   1 = Alpha cities / mega-ports  → visible from zoom 3
 *   2 = National capitals + major regional ports → visible from zoom 4
 *   3 = Secondary yacht destinations & regional hubs → visible from zoom 5.5
 *
 * All coordinates are approximate city-centre lat/lon and are not the
 * hill you'd want to die on for centimetre accuracy — they're purely
 * for label positioning.
 */

export type MajorCity = {
  name: string;
  lat: number;
  lon: number;
  /** 1 = highest priority (always shown from far zoom); 3 = shown only when zoomed in close. */
  tier: 1 | 2 | 3;
  /** Optional short country code for optional secondary label. */
  country?: string;
};

export const MAJOR_CITIES: MajorCity[] = [
  // ─── Tier 1 — Alpha cities / world capitals / mega-ports ─────────
  { name: 'London', lat: 51.5074, lon: -0.1278, tier: 1, country: 'GB' },
  { name: 'New York', lat: 40.7128, lon: -74.006, tier: 1, country: 'US' },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, tier: 1, country: 'US' },
  { name: 'Miami', lat: 25.7617, lon: -80.1918, tier: 1, country: 'US' },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, tier: 1, country: 'JP' },
  { name: 'Hong Kong', lat: 22.3193, lon: 114.1694, tier: 1, country: 'HK' },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, tier: 1, country: 'SG' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tier: 1, country: 'AU' },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708, tier: 1, country: 'AE' },
  { name: 'Paris', lat: 48.8566, lon: 2.3522, tier: 1, country: 'FR' },
  { name: 'Rome', lat: 41.9028, lon: 12.4964, tier: 1, country: 'IT' },
  { name: 'Barcelona', lat: 41.3851, lon: 2.1734, tier: 1, country: 'ES' },
  { name: 'Istanbul', lat: 41.0082, lon: 28.9784, tier: 1, country: 'TR' },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729, tier: 1, country: 'BR' },
  { name: 'Cape Town', lat: -33.9249, lon: 18.4241, tier: 1, country: 'ZA' },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777, tier: 1, country: 'IN' },
  { name: 'Shanghai', lat: 31.2304, lon: 121.4737, tier: 1, country: 'CN' },
  { name: 'Panama City', lat: 8.9824, lon: -79.5199, tier: 1, country: 'PA' },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, tier: 1, country: 'US' },
  { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, tier: 1, country: 'NL' },
  { name: 'Cairo', lat: 30.0444, lon: 31.2357, tier: 1, country: 'EG' },
  { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816, tier: 1, country: 'AR' },

  // ─── Tier 2 — Major capitals / regional ports / yacht hubs ───────
  { name: 'Madrid', lat: 40.4168, lon: -3.7038, tier: 2, country: 'ES' },
  { name: 'Berlin', lat: 52.52, lon: 13.405, tier: 2, country: 'DE' },
  { name: 'Athens', lat: 37.9838, lon: 23.7275, tier: 2, country: 'GR' },
  { name: 'Lisbon', lat: 38.7223, lon: -9.1393, tier: 2, country: 'PT' },
  { name: 'Dublin', lat: 53.3498, lon: -6.2603, tier: 2, country: 'IE' },
  { name: 'Oslo', lat: 59.9139, lon: 10.7522, tier: 2, country: 'NO' },
  { name: 'Stockholm', lat: 59.3293, lon: 18.0686, tier: 2, country: 'SE' },
  { name: 'Copenhagen', lat: 55.6761, lon: 12.5683, tier: 2, country: 'DK' },
  { name: 'Helsinki', lat: 60.1699, lon: 24.9384, tier: 2, country: 'FI' },
  { name: 'Reykjavík', lat: 64.1466, lon: -21.9426, tier: 2, country: 'IS' },
  { name: 'Warsaw', lat: 52.2297, lon: 21.0122, tier: 2, country: 'PL' },
  { name: 'Prague', lat: 50.0755, lon: 14.4378, tier: 2, country: 'CZ' },
  { name: 'Vienna', lat: 48.2082, lon: 16.3738, tier: 2, country: 'AT' },
  { name: 'Zurich', lat: 47.3769, lon: 8.5417, tier: 2, country: 'CH' },
  { name: 'Brussels', lat: 50.8503, lon: 4.3517, tier: 2, country: 'BE' },
  { name: 'Marseille', lat: 43.2965, lon: 5.3698, tier: 2, country: 'FR' },
  { name: 'Nice', lat: 43.7102, lon: 7.262, tier: 2, country: 'FR' },
  { name: 'Monaco', lat: 43.7384, lon: 7.4246, tier: 2, country: 'MC' },
  { name: 'Genoa', lat: 44.4056, lon: 8.9463, tier: 2, country: 'IT' },
  { name: 'Naples', lat: 40.8518, lon: 14.2681, tier: 2, country: 'IT' },
  { name: 'Palma', lat: 39.5696, lon: 2.6502, tier: 2, country: 'ES' },
  { name: 'Ibiza', lat: 38.9067, lon: 1.4206, tier: 2, country: 'ES' },
  { name: 'Valencia', lat: 39.4699, lon: -0.3763, tier: 2, country: 'ES' },
  { name: 'Málaga', lat: 36.7213, lon: -4.4213, tier: 2, country: 'ES' },
  { name: 'Gibraltar', lat: 36.1408, lon: -5.3536, tier: 2, country: 'GI' },
  { name: 'Casablanca', lat: 33.5731, lon: -7.5898, tier: 2, country: 'MA' },
  { name: 'Tangier', lat: 35.7595, lon: -5.834, tier: 2, country: 'MA' },
  { name: 'Antalya', lat: 36.8969, lon: 30.7133, tier: 2, country: 'TR' },
  { name: 'Split', lat: 43.5081, lon: 16.4402, tier: 2, country: 'HR' },
  { name: 'Dubrovnik', lat: 42.6507, lon: 18.0944, tier: 2, country: 'HR' },
  { name: 'Venice', lat: 45.4408, lon: 12.3155, tier: 2, country: 'IT' },
  { name: 'Palermo', lat: 38.1157, lon: 13.3615, tier: 2, country: 'IT' },
  { name: 'Mykonos', lat: 37.4467, lon: 25.3289, tier: 2, country: 'GR' },
  { name: 'Santorini', lat: 36.3932, lon: 25.4615, tier: 2, country: 'GR' },
  { name: 'Corfu', lat: 39.6243, lon: 19.9217, tier: 2, country: 'GR' },
  { name: 'Valletta', lat: 35.8989, lon: 14.5146, tier: 2, country: 'MT' },
  { name: 'Nicosia', lat: 35.1856, lon: 33.3823, tier: 2, country: 'CY' },
  { name: 'Beirut', lat: 33.8938, lon: 35.5018, tier: 2, country: 'LB' },
  { name: 'Tel Aviv', lat: 32.0853, lon: 34.7818, tier: 2, country: 'IL' },
  { name: 'Alexandria', lat: 31.2001, lon: 29.9187, tier: 2, country: 'EG' },
  { name: 'Riyadh', lat: 24.7136, lon: 46.6753, tier: 2, country: 'SA' },
  { name: 'Doha', lat: 25.2854, lon: 51.531, tier: 2, country: 'QA' },
  { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773, tier: 2, country: 'AE' },
  { name: 'Muscat', lat: 23.588, lon: 58.3829, tier: 2, country: 'OM' },
  { name: 'Bangkok', lat: 13.7563, lon: 100.5018, tier: 2, country: 'TH' },
  { name: 'Phuket', lat: 7.8804, lon: 98.3923, tier: 2, country: 'TH' },
  { name: 'Kuala Lumpur', lat: 3.139, lon: 101.6869, tier: 2, country: 'MY' },
  { name: 'Jakarta', lat: -6.2088, lon: 106.8456, tier: 2, country: 'ID' },
  { name: 'Bali', lat: -8.4095, lon: 115.1889, tier: 2, country: 'ID' },
  { name: 'Manila', lat: 14.5995, lon: 120.9842, tier: 2, country: 'PH' },
  { name: 'Seoul', lat: 37.5665, lon: 126.978, tier: 2, country: 'KR' },
  { name: 'Beijing', lat: 39.9042, lon: 116.4074, tier: 2, country: 'CN' },
  { name: 'Taipei', lat: 25.033, lon: 121.5654, tier: 2, country: 'TW' },
  { name: 'Auckland', lat: -36.8485, lon: 174.7633, tier: 2, country: 'NZ' },
  { name: 'Melbourne', lat: -37.8136, lon: 144.9631, tier: 2, country: 'AU' },
  { name: 'Perth', lat: -31.9505, lon: 115.8605, tier: 2, country: 'AU' },
  { name: 'Nairobi', lat: -1.2921, lon: 36.8219, tier: 2, country: 'KE' },
  { name: 'Lagos', lat: 6.5244, lon: 3.3792, tier: 2, country: 'NG' },
  { name: 'Dakar', lat: 14.7167, lon: -17.4677, tier: 2, country: 'SN' },
  { name: 'Boston', lat: 42.3601, lon: -71.0589, tier: 2, country: 'US' },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, tier: 2, country: 'US' },
  { name: 'Seattle', lat: 47.6062, lon: -122.3321, tier: 2, country: 'US' },
  { name: 'Vancouver', lat: 49.2827, lon: -123.1207, tier: 2, country: 'CA' },
  { name: 'Toronto', lat: 43.6532, lon: -79.3832, tier: 2, country: 'CA' },
  { name: 'Montréal', lat: 45.5017, lon: -73.5673, tier: 2, country: 'CA' },
  { name: 'Mexico City', lat: 19.4326, lon: -99.1332, tier: 2, country: 'MX' },
  { name: 'Havana', lat: 23.1136, lon: -82.3666, tier: 2, country: 'CU' },
  { name: 'Kingston', lat: 17.9714, lon: -76.7936, tier: 2, country: 'JM' },
  { name: 'Nassau', lat: 25.0343, lon: -77.3963, tier: 2, country: 'BS' },
  { name: 'St. Barts', lat: 17.9, lon: -62.8333, tier: 2, country: 'BL' },
  { name: 'Antigua', lat: 17.128, lon: -61.8467, tier: 2, country: 'AG' },
  { name: 'Bridgetown', lat: 13.1132, lon: -59.5988, tier: 2, country: 'BB' },
  { name: 'Cartagena', lat: 10.391, lon: -75.4794, tier: 2, country: 'CO' },
  { name: 'Caracas', lat: 10.4806, lon: -66.9036, tier: 2, country: 'VE' },
  { name: 'Lima', lat: -12.0464, lon: -77.0428, tier: 2, country: 'PE' },
  { name: 'Santiago', lat: -33.4489, lon: -70.6693, tier: 2, country: 'CL' },
  { name: 'Montevideo', lat: -34.9011, lon: -56.1645, tier: 2, country: 'UY' },
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333, tier: 2, country: 'BR' },
  { name: 'Salvador', lat: -12.9714, lon: -38.5014, tier: 2, country: 'BR' },

  // ─── Tier 3 — Secondary regional / yacht destinations ────────────
  { name: 'Cannes', lat: 43.5528, lon: 7.0174, tier: 3, country: 'FR' },
  { name: 'Saint-Tropez', lat: 43.2727, lon: 6.6407, tier: 3, country: 'FR' },
  { name: 'Antibes', lat: 43.5804, lon: 7.1251, tier: 3, country: 'FR' },
  { name: 'La Rochelle', lat: 46.1591, lon: -1.1517, tier: 3, country: 'FR' },
  { name: 'Porto Cervo', lat: 41.1348, lon: 9.5389, tier: 3, country: 'IT' },
  { name: 'Portofino', lat: 44.3037, lon: 9.2094, tier: 3, country: 'IT' },
  { name: 'Sorrento', lat: 40.6262, lon: 14.3757, tier: 3, country: 'IT' },
  { name: 'Capri', lat: 40.5532, lon: 14.2222, tier: 3, country: 'IT' },
  { name: 'Amalfi', lat: 40.634, lon: 14.6027, tier: 3, country: 'IT' },
  { name: 'Cagliari', lat: 39.2238, lon: 9.1217, tier: 3, country: 'IT' },
  { name: 'Bonifacio', lat: 41.3878, lon: 9.16, tier: 3, country: 'FR' },
  { name: 'Ajaccio', lat: 41.9192, lon: 8.7386, tier: 3, country: 'FR' },
  { name: 'Menorca', lat: 39.8885, lon: 4.2658, tier: 3, country: 'ES' },
  { name: 'Formentera', lat: 38.7106, lon: 1.4351, tier: 3, country: 'ES' },
  { name: 'Rhodes', lat: 36.4341, lon: 28.2176, tier: 3, country: 'GR' },
  { name: 'Crete', lat: 35.2401, lon: 24.8093, tier: 3, country: 'GR' },
  { name: 'Kos', lat: 36.8938, lon: 27.2877, tier: 3, country: 'GR' },
  { name: 'Bodrum', lat: 37.0344, lon: 27.4305, tier: 3, country: 'TR' },
  { name: 'Marmaris', lat: 36.8551, lon: 28.2762, tier: 3, country: 'TR' },
  { name: 'Hvar', lat: 43.1729, lon: 16.4413, tier: 3, country: 'HR' },
  { name: 'Kotor', lat: 42.4247, lon: 18.7712, tier: 3, country: 'ME' },
  { name: 'Sardinia', lat: 40.1209, lon: 9.0129, tier: 3, country: 'IT' },
  { name: 'Faial', lat: 38.5751, lon: -28.7098, tier: 3, country: 'PT' },
  { name: 'Madeira', lat: 32.7607, lon: -16.9595, tier: 3, country: 'PT' },
  { name: 'Las Palmas', lat: 28.1235, lon: -15.4363, tier: 3, country: 'ES' },
  { name: 'Tenerife', lat: 28.2916, lon: -16.6291, tier: 3, country: 'ES' },
  { name: 'Newport', lat: 41.4901, lon: -71.3128, tier: 3, country: 'US' },
  { name: 'Fort Lauderdale', lat: 26.1224, lon: -80.1373, tier: 3, country: 'US' },
  { name: 'Palm Beach', lat: 26.7056, lon: -80.0364, tier: 3, country: 'US' },
  { name: 'Key West', lat: 24.5551, lon: -81.7801, tier: 3, country: 'US' },
  { name: 'St. Thomas', lat: 18.3358, lon: -64.8963, tier: 3, country: 'VI' },
  { name: 'Tortola', lat: 18.428, lon: -64.6178, tier: 3, country: 'VG' },
  { name: 'Grenada', lat: 12.1165, lon: -61.679, tier: 3, country: 'GD' },
  { name: 'St. Lucia', lat: 13.9094, lon: -60.9789, tier: 3, country: 'LC' },
  { name: 'Martinique', lat: 14.6415, lon: -61.0242, tier: 3, country: 'MQ' },
  { name: 'Guadeloupe', lat: 16.265, lon: -61.551, tier: 3, country: 'GP' },
  { name: 'St. Maarten', lat: 18.0425, lon: -63.0548, tier: 3, country: 'SX' },
  { name: 'Bermuda', lat: 32.3078, lon: -64.7505, tier: 3, country: 'BM' },
  { name: 'Papeete', lat: -17.5516, lon: -149.5585, tier: 3, country: 'PF' },
  { name: 'Fiji', lat: -18.1248, lon: 178.4501, tier: 3, country: 'FJ' },
  { name: 'Seychelles', lat: -4.6796, lon: 55.492, tier: 3, country: 'SC' },
  { name: 'Mauritius', lat: -20.3484, lon: 57.5522, tier: 3, country: 'MU' },
  { name: 'Male', lat: 4.1755, lon: 73.5093, tier: 3, country: 'MV' },
];
