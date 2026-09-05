import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/applications/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { invalidateCertificateCatalogCache } from '@/lib/certificates/catalog.server';
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

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH  /api/admin/certificate-catalog/[id]
 * DELETE /api/admin/certificate-catalog/[id] — soft-deactivate (active=false)
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id: rawId } = await params;
    const id = slugifyCertificateCatalogId(rawId);
    if (!id) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (typeof body.certificate_type === 'string' || typeof body.type === 'string') {
      patch.certificate_type = String(body.certificate_type ?? body.type).trim();
    }
    if (
      typeof body.issuing_authority === 'string' ||
      typeof body.issuingAuthority === 'string'
    ) {
      patch.issuing_authority = String(
        body.issuing_authority ?? body.issuingAuthority,
      ).trim();
    }
    if (typeof body.description === 'string') {
      patch.description = body.description.trim();
    }
    if (typeof body.category === 'string') {
      const c = body.category.trim().toLowerCase();
      patch.category = (CATEGORIES.has(c) ? c : 'other') as CertificatePresetCategory;
    }
    if (body.typical_validity_years === null || body.typicalValidityYears === null) {
      patch.typical_validity_years = null;
    } else if (typeof body.typical_validity_years === 'number') {
      patch.typical_validity_years = Math.max(0, Math.round(body.typical_validity_years));
    } else if (typeof body.typicalValidityYears === 'number') {
      patch.typical_validity_years = Math.max(0, Math.round(body.typicalValidityYears));
    }
    if (typeof body.renewal_required === 'boolean') {
      patch.renewal_required = body.renewal_required;
    } else if (typeof body.renewalRequired === 'boolean') {
      patch.renewal_required = body.renewalRequired;
    }
    if (typeof body.renewal_notice_days === 'number') {
      patch.renewal_notice_days = Math.max(1, Math.round(body.renewal_notice_days));
    } else if (typeof body.renewalNoticeDays === 'number') {
      patch.renewal_notice_days = Math.max(1, Math.round(body.renewalNoticeDays));
    }
    if (typeof body.sort_order === 'number') {
      patch.sort_order = Math.round(body.sort_order);
    } else if (typeof body.sortOrder === 'number') {
      patch.sort_order = Math.round(body.sortOrder);
    }
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (Array.isArray(body.aliases) || typeof body.aliases === 'string') {
      const aliases = Array.isArray(body.aliases)
        ? body.aliases.map((a) => String(a).trim().toLowerCase()).filter(Boolean)
        : String(body.aliases)
            .split(/[,;\n]+/)
            .map((a) => a.trim().toLowerCase())
            .filter(Boolean);
      patch.aliases = aliases;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('certificate_catalog')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[admin/certificate-catalog PATCH]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    invalidateCertificateCatalogCache();
    return NextResponse.json({
      preset: mapCatalogRow(data as Record<string, unknown>),
    });
  } catch (e) {
    console.error('[admin/certificate-catalog PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;
    const { id: rawId } = await params;
    const id = slugifyCertificateCatalogId(rawId);
    if (!id) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    // Soft-delete so historical certificates / milestone refs keep resolving.
    const { data, error } = await supabaseAdmin
      .from('certificate_catalog')
      .update({ active: false })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[admin/certificate-catalog DELETE]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    invalidateCertificateCatalogCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[admin/certificate-catalog DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
