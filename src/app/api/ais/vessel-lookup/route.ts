import { NextRequest, NextResponse } from 'next/server';
import {
  mapDatalasticToRegistrationAutofill,
  type VesselRegistrationAutofill,
} from '@/lib/ais/map-datalastic-to-vessel';
import {
  DatalasticApiError,
  fetchVesselFind,
  fetchVesselInfo,
} from '@/lib/datalastic/client';
import {
  findExistingVessel,
  normalizeImo,
  normalizeMmsi,
} from '@/lib/vessels/find-existing-vessel';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type ExistingVesselMatch = {
  id: string;
  name: string;
  type: string;
  officialNumber: string | null;
  hasManager: boolean;
};

export type VesselLookupResultItem = {
  uuid: string | null;
  autofill: VesselRegistrationAutofill;
  existingInDatabase: ExistingVesselMatch | null;
};

function parseIdentifierQuery(raw: string): { mmsi?: string; imo?: string } | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 9) return { mmsi: digits };
  if (digits.length === 7) return { imo: digits };
  return null;
}

function isNumericIdentifierQuery(raw: string): boolean {
  return /^\s*[\d\s-]+\s*$/.test(raw);
}

function toExistingMatch(vessel: {
  id: string;
  name: string;
  type: string;
  imo: string | null;
  vessel_manager_id: string | null;
}): ExistingVesselMatch {
  return {
    id: vessel.id,
    name: vessel.name,
    type: vessel.type,
    officialNumber: vessel.imo ?? null,
    hasManager: Boolean(vessel.vessel_manager_id),
  };
}

async function findExistingVesselsForAutofills(
  autofills: VesselRegistrationAutofill[],
): Promise<Map<string, ExistingVesselMatch>> {
  const map = new Map<string, ExistingVesselMatch>();
  const mmsis = [...new Set(autofills.map((a) => a.mmsi).filter(Boolean))] as string[];
  const imos = [...new Set(autofills.map((a) => a.officialNumber).filter(Boolean))] as string[];

  if (mmsis.length > 0) {
    const { data } = await supabaseAdmin
      .from('vessels')
      .select('id, name, type, imo, mmsi, vessel_manager_id')
      .in('mmsi', mmsis);

    for (const vessel of data ?? []) {
      if (vessel.mmsi) map.set(`mmsi:${vessel.mmsi}`, toExistingMatch(vessel));
    }
  }

  if (imos.length > 0) {
    const { data } = await supabaseAdmin
      .from('vessels')
      .select('id, name, type, imo, mmsi, vessel_manager_id')
      .in('imo', imos);

    for (const vessel of data ?? []) {
      if (vessel.imo) map.set(`imo:${vessel.imo}`, toExistingMatch(vessel));
    }
  }

  return map;
}

function existingForAutofill(
  autofill: VesselRegistrationAutofill,
  existingMap: Map<string, ExistingVesselMatch>,
): ExistingVesselMatch | null {
  if (autofill.mmsi) {
    const byMmsi = existingMap.get(`mmsi:${autofill.mmsi}`);
    if (byMmsi) return byMmsi;
  }
  if (autofill.officialNumber) {
    return existingMap.get(`imo:${autofill.officialNumber}`) ?? null;
  }
  return null;
}

function buildLookupItem(
  info: Parameters<typeof mapDatalasticToRegistrationAutofill>[0],
  existingMap: Map<string, ExistingVesselMatch>,
): VesselLookupResultItem | null {
  const autofill = mapDatalasticToRegistrationAutofill(info);
  if (!autofill.name) return null;

  return {
    uuid: info.uuid ?? null,
    autofill,
    existingInDatabase: existingForAutofill(autofill, existingMap),
  };
}

async function lookupExistingInDatabase(
  autofill: VesselRegistrationAutofill,
  existingMap?: Map<string, ExistingVesselMatch>,
): Promise<ExistingVesselMatch | null> {
  if (existingMap) {
    const fromMap = existingForAutofill(autofill, existingMap);
    if (fromMap) return fromMap;
  }

  const existing = await findExistingVessel(supabaseAdmin, {
    mmsi: autofill.mmsi,
    imo: autofill.officialNumber,
    name: autofill.name,
  });

  if (!existing) return null;

  const { data: full } = await supabaseAdmin
    .from('vessels')
    .select('id, name, type, imo, vessel_manager_id')
    .eq('id', existing.id)
    .maybeSingle();

  return full ? toExistingMatch(full) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const mmsiParam = typeof body.mmsi === 'string' ? body.mmsi.trim() : '';
    const imoParam = typeof body.imo === 'string' ? body.imo.trim() : '';
    const nameParam = typeof body.name === 'string' ? body.name.trim() : '';

    const identifierSource = mmsiParam || imoParam || query;
    const identifier = identifierSource ? parseIdentifierQuery(identifierSource) : null;

    if (identifier) {
      const info = await fetchVesselInfo(identifier);
      const autofill = mapDatalasticToRegistrationAutofill(info);

      if (!autofill.name) {
        return NextResponse.json(
          {
            error: 'Vessel found in AIS but no name was returned. Please enter details manually.',
          },
          { status: 404 },
        );
      }

      const existingMap = await findExistingVesselsForAutofills([autofill]);

      return NextResponse.json({
        found: true,
        mode: 'single',
        autofill,
        existingInDatabase: await lookupExistingInDatabase(autofill, existingMap),
      });
    }

    const nameQuery = nameParam || query;
    if (!nameQuery) {
      return NextResponse.json(
        {
          error:
            'Enter a vessel name (3+ characters), 9-digit MMSI, or 7-digit IMO to look up vessel details.',
        },
        { status: 400 },
      );
    }

    if (isNumericIdentifierQuery(nameQuery)) {
      return NextResponse.json(
        {
          error:
            'That number is not a valid MMSI (9 digits) or IMO (7 digits). Try again or search by vessel name.',
        },
        { status: 400 },
      );
    }

    if (nameQuery.length < 3) {
      return NextResponse.json(
        {
          error:
            'Enter at least 3 characters to search by name, or use a 9-digit MMSI / 7-digit IMO.',
        },
        { status: 400 },
      );
    }

    const { vessels, totalCount, truncated } = await fetchVesselFind({ name: nameQuery });
    if (vessels.length === 0) {
      return NextResponse.json(
        { error: 'No vessels found with that name in AIS.', found: false },
        { status: 404 },
      );
    }

    const autofills = vessels
      .map((v) => mapDatalasticToRegistrationAutofill(v))
      .filter((a) => a.name);
    const existingMap = await findExistingVesselsForAutofills(autofills);

    const results: VesselLookupResultItem[] = [];
    for (const vessel of vessels) {
      const item = buildLookupItem(vessel, existingMap);
      if (!item) continue;
      item.existingInDatabase =
        item.existingInDatabase ||
        (await lookupExistingInDatabase(item.autofill, existingMap));
      results.push(item);
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Vessels were found but none had usable AIS details.', found: false },
        { status: 404 },
      );
    }

    return NextResponse.json({
      found: true,
      mode: 'list',
      query: nameQuery,
      results,
      totalCount,
      truncated,
    });
  } catch (error) {
    if (error instanceof DatalasticApiError) {
      const status = error.status === 404 ? 404 : error.status >= 400 ? error.status : 502;
      return NextResponse.json({ error: error.message, found: false }, { status });
    }

    console.error('[AIS VESSEL LOOKUP]', error);
    return NextResponse.json(
      { error: 'Failed to look up vessel. Please try again.', found: false },
      { status: 500 },
    );
  }
}
