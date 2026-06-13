import { vesselTypeValues, type VesselType } from '@/lib/vessel-types';
import type { DatalasticVesselInfo } from '@/lib/datalastic/client';

export type VesselRegistrationAutofill = {
  name: string;
  type: VesselType;
  officialNumber: string | null;
  mmsi: string | null;
  call_sign: string | null;
  flag: string | null;
  length_m: number | null;
  beam: number | null;
  draft: number | null;
  gross_tonnage: number | null;
  build_year: number | null;
  aisType: string | null;
  aisTypeSpecific: string | null;
  countryName: string | null;
};

function parseBuildYear(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const year = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(year) || year < 1800 || year > new Date().getFullYear() + 2) {
    return null;
  }
  return year;
}

export function mapDatalasticTypeToVesselType(
  type?: string | null,
  typeSpecific?: string | null,
): VesselType {
  const combined = `${type || ''} ${typeSpecific || ''}`.toLowerCase();

  if (combined.includes('yacht') || combined.includes('pleasure')) {
    if (combined.includes('sail')) return 'sailing-yacht';
    if (combined.includes('mega')) return 'megayacht';
    if (combined.includes('super')) return 'superyacht';
    if (combined.includes('passenger')) return 'passenger-yacht';
    return 'motor-yacht';
  }
  if (combined.includes('sailing')) return 'sailing-yacht';
  if (combined.includes('catamaran')) return 'catamaran';
  if (combined.includes('container')) return 'container-ship';
  if (combined.includes('cargo')) return 'cargo-ship';
  if (
    combined.includes('tanker') ||
    combined.includes('oil') ||
    combined.includes('chemical') ||
    combined.includes('liquid')
  ) {
    return 'tanker';
  }
  if (combined.includes('cruise')) return 'cruise-ship';
  if (combined.includes('ferry')) return 'ferry';
  if (combined.includes('fishing')) return 'fishing-vessel';
  if (combined.includes('research')) return 'research-vessel';
  if (combined.includes('offshore') || combined.includes('supply')) return 'offshore-vessel';
  if (combined.includes('trawler')) return 'trawler';
  if (combined.includes('passenger')) return 'passenger-yacht';

  return 'other';
}

export function mapDatalasticToRegistrationAutofill(
  info: DatalasticVesselInfo,
): VesselRegistrationAutofill {
  const mappedType = mapDatalasticTypeToVesselType(info.type, info.type_specific);
  const type = vesselTypeValues.includes(mappedType) ? mappedType : 'other';

  return {
    name: (info.name || info.name_ais || '').trim(),
    type,
    officialNumber: info.imo ? String(info.imo).replace(/\D/g, '') || null : null,
    mmsi: info.mmsi ? String(info.mmsi).replace(/\D/g, '') || null : null,
    call_sign: info.callsign?.trim() || null,
    flag: info.country_iso?.trim().toUpperCase() || null,
    length_m: typeof info.length === 'number' ? info.length : null,
    beam: typeof info.breadth === 'number' ? info.breadth : null,
    draft:
      typeof info.draught_max === 'number'
        ? info.draught_max
        : typeof info.draught_avg === 'number'
          ? info.draught_avg
          : null,
    gross_tonnage: typeof info.gross_tonnage === 'number' ? info.gross_tonnage : null,
    build_year: parseBuildYear(info.year_built),
    aisType: info.type ?? null,
    aisTypeSpecific: info.type_specific ?? null,
    countryName: info.country_name ?? null,
  };
}
