import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/applications/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  invalidateCertificateCatalogCache,
  loadCertificateCatalog,
} from '@/lib/certificates/catalog.server';
import {
  mapCatalogRow,
  slugifyCertificateCatalogId,
  type CertificatePresetCategory,
} from '@/lib/certificates/presets';

const CATEGORIES = new Set([
  'stcw',
  'medical',
  'mca',
  'radio',
  'other',
]);

function parseBody(body: Record<string, unknown>, opts?: { requireId?: boolean }) {
  const idRaw =
    typeof body.id === 'string'
      ? body.id.trim().toLowerCase()
      : typeof body.name === 'string'
        ? slugifyCertificateCatalogId(body.name)
        : '';
  const id = slugifyCertificateCatalogId(idRaw);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const certificate_type =
    typeof body.certificate_type === 'string'
      ? body.certificate_type.trim()
      : typeof body.type === 'string'
        ? body.type.trim()
        : '';
  const issuing_authority =
    typeof body.issuing_authority === 'string'
      ? body.issuing_authority.trim()
      : typeof body.issuingAuthority === 'string'
        ? body.issuingAuthority.trim()
        : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const categoryRaw =
    typeof body.category === 'string' ? body.category.trim().toLowerCase() : 'other';
  const category = (CATEGORIES.has(categoryRaw)
    ? categoryRaw
    : 'other') as CertificatePresetCategory;

  let typical_validity_years: number | null = null;
  if (
    typeof body.typical_validity_years === 'number' &&
    Number.isFinite(body.typical_validity_years)
  ) {
    typical_validity_years = Math.max(0, Math.round(body.typical_validity_years));
  } else if (
    typeof body.typicalValidityYears === 'number' &&
    Number.isFinite(body.typicalValidityYears)
  ) {
    typical_validity_years = Math.max(0, Math.round(body.typicalValidityYears));
  } else if (body.typical_validity_years === null || body.typicalValidityYears === null) {
    typical_validity_years = null;
  }

  const renewal_required = body.renewal_required !== false && body.renewalRequired !== false;
  const renewal_notice_days =
    typeof body.renewal_notice_days === 'number' && body.renewal_notice_days > 0
      ? Math.round(body.renewal_notice_days)
      : typeof body.renewalNoticeDays === 'number' && body.renewalNoticeDays > 0
        ? Math.round(body.renewalNoticeDays)
        : 90;
  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.round(body.sort_order)
      : typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
        ? Math.round(body.sortOrder)
        : 100;
  const active = body.active !== false;
  const aliasesRaw = body.aliases;
  const aliases = Array.isArray(aliasesRaw)
    ? aliasesRaw
        .map((a) => String(a).trim().toLowerCase())
        .filter(Boolean)
    : typeof aliasesRaw === 'string'
      ? aliasesRaw
          .split(/[,;\n]+/)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean)
      : [];

  if (opts?.requireId !== false && !id) {
    return { error: 'id is required (lowercase letters, numbers, hyphens)' };
  }
  if (!name) return { error: 'name is required' };
  if (!certificate_type) return { error: 'certificate_type is required' };

  return {
    id,
    name,
    certificate_type,
    issuing_authority,
    typical_validity_years,
    renewal_required,
    renewal_notice_days,
    description,
    category,
    aliases,
    sort_order,
    active,
  };
}

/**
 * GET  /api/admin/certificate-catalog — list all (incl. inactive)
 * POST /api/admin/certificate-catalog — create
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const presets = await loadCertificateCatalog({
      includeInactive: true,
      includeOther: false,
      force: true,
    });
    return NextResponse.json({ presets });
  } catch (e) {
    console.error('[admin/certificate-catalog GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const body = await req.json();
    const parsed = parseBody(body as Record<string, unknown>);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('certificate_catalog')
      .insert(parsed)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A certificate with id “${parsed.id}” already exists` },
          { status: 409 },
        );
      }
      console.error('[admin/certificate-catalog POST]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    invalidateCertificateCatalogCache();
    return NextResponse.json({
      preset: mapCatalogRow(data as Record<string, unknown>),
    });
  } catch (e) {
    console.error('[admin/certificate-catalog POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
