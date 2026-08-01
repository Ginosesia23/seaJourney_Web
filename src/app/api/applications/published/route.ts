import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mapRequirement, requireUser } from '@/lib/applications/auth';
import { evaluateRequirements } from '@/lib/applications/evaluate-requirements';
import {
  isRecommendedNextTemplate,
  isRelevantTemplate,
  resolveCareerStep,
  sortTemplatesForCareer,
} from '@/lib/applications/career-path';
import type { ApplicationRequirement } from '@/lib/applications/types';

/**
 * GET /api/applications/published
 * List published templates + the caller's crew_application row if any,
 * ranked for their current position → next ticket.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ('error' in auth) return auth.error;

    const [
      { data: templates, error },
      { data: profile },
      { data: certificates },
    ] = await Promise.all([
      supabaseAdmin
        .from('application_templates')
        .select('*')
        .eq('status', 'published')
        .order('published_at', { ascending: false }),
      supabaseAdmin
        .from('users')
        .select('id, position, first_name, last_name')
        .eq('id', auth.userId)
        .maybeSingle(),
      supabaseAdmin
        .from('certificates')
        .select('*')
        .eq('user_id', auth.userId),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const career = resolveCareerStep(profile?.position);

    const ids = (templates || []).map((t) => t.id);
    const [{ data: requirements }, { data: files }, { data: mine }] =
      await Promise.all([
        ids.length
          ? supabaseAdmin
              .from('application_requirements')
              .select('*')
              .in('template_id', ids)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        ids.length
          ? supabaseAdmin
              .from('application_template_files')
              .select('id, template_id, file_name, content_type, file_size, created_at')
              .in('template_id', ids)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        supabaseAdmin
          .from('crew_applications')
          .select('*')
          .eq('user_id', auth.userId)
          .in(
            'template_id',
            ids.length ? ids : ['00000000-0000-0000-0000-000000000000'],
          ),
      ]);

    const reqBy = new Map<string, ApplicationRequirement[]>();
    for (const r of requirements || []) {
      const list = reqBy.get(r.template_id as string) || [];
      list.push(mapRequirement(r as Record<string, unknown>) as ApplicationRequirement);
      reqBy.set(r.template_id as string, list);
    }
    const filesBy = new Map<string, unknown[]>();
    for (const f of files || []) {
      const list = filesBy.get((f as { template_id: string }).template_id) || [];
      list.push(f);
      filesBy.set((f as { template_id: string }).template_id, list);
    }
    const appBy = new Map(
      (mine || []).map((a) => [a.template_id as string, a]),
    );

    const emptySea = { atSeaDays: 0, totalDays: 0, standbyDays: 0 };

    const enriched = (templates || []).map((t) => {
      const reqs = reqBy.get(t.id) || [];
      const certReqs = reqs.filter((r) => r.requirement_type === 'certificate');
      const certEvals =
        certReqs.length > 0
          ? evaluateRequirements(certReqs, {
              profile: profile || null,
              certificates: certificates || [],
              testimonials: [],
              proofOfService: [],
              documentedSea: emptySea,
              completedManualIds: new Set(),
            })
          : [];

      return {
        ...t,
        career_track: t.career_track || 'any',
        target_level: t.target_level || 'other',
        requirements: reqs,
        files: filesBy.get(t.id) || [],
        myApplication: appBy.get(t.id) || null,
        isNextStep: isRecommendedNextTemplate(t, career),
        isRelevant: isRelevantTemplate(t, career),
        certificateChecks: certEvals.map((e) => ({
          requirementId: e.requirementId,
          title: e.title,
          met: e.met,
          status: e.certificateStatus || 'missing',
          detail: e.detail,
        })),
      };
    });

    const sorted = sortTemplatesForCareer(enriched, career);

    return NextResponse.json({
      career: {
        position: profile?.position || null,
        track: career.track,
        level: career.level,
        label: career.label,
        nextLevel: career.nextLevel,
        nextLabel: career.nextLabel,
        summary: career.summary,
      },
      templates: sorted,
    });
  } catch (e) {
    console.error('[applications/published]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
