/**
 * Vessel type options for dropdowns and validation
 */
export const vesselTypes: Array<{ value: string; label: string }> = [
  { value: 'motor-yacht', label: 'Motor Yacht' },
  { value: 'sailing-yacht', label: 'Sailing Yacht' },
  { value: 'catamaran', label: 'Catamaran' },
  { value: 'superyacht', label: 'Superyacht' },
  { value: 'megayacht', label: 'Megayacht' },
  { value: 'trawler', label: 'Trawler' },
  { value: 'fishing-vessel', label: 'Fishing Vessel' },
  { value: 'cargo-ship', label: 'Cargo Ship' },
  { value: 'container-ship', label: 'Container Ship' },
  { value: 'tanker', label: 'Tanker' },
  { value: 'cruise-ship', label: 'Cruise Ship' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'research-vessel', label: 'Research Vessel' },
  { value: 'offshore-vessel', label: 'Offshore Vessel' },
  { value: 'other', label: 'Other' },
];

export const vesselTypeValues = vesselTypes.map(v => v.value) as [string, ...string[]];

export type VesselType = typeof vesselTypeValues[number];

