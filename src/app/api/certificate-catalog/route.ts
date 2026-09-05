import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUserId } from '@/lib/applications/auth';
import { loadCertificateCatalog } from '@/lib/certificates/catalog.server';

/**
 * GET /api/certificate-catalog — active presets for crew / vessel dropdowns
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const includeOther = req.nextUrl.searchParams.get('includeOther') !== '0';
    const presets = await loadCertificateCatalog({ includeOther });
    return NextResponse.json({ presets });
  } catch (e) {
    console.error('[certificate-catalog GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
