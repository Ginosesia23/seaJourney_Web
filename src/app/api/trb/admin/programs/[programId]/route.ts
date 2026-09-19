import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBearerUser } from '@/lib/trb/auth';
import {
  getVersionTree,
  listVersionsForProgram,
  publishVersion,
  requireTrbAdmin,
  retireVersion,
  upsertDraftTask,
} from '@/lib/trb/admin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const publishSchema = z.object({
  action: z.enum(['publish_pilot', 'publish_active', 'retire']),
  versionId: z.string().uuid(),
});

const taskSchema = z.object({
  action: z.literal('upsert_task'),
  versionId: z.string().uuid(),
  sectionId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  taskCode: z.string().min(1).max(80),
  officialTitle: z.string().min(1).max(500),
  officialDescription: z.string().max(8000).optional(),
  seajourneySummary: z.string().max(4000).optional(),
  seajourneyCompletionGuidance: z.string().max(4000).optional(),
  evidenceGuidance: z.string().max(4000).optional(),
  requiredSignerRole: z
    .enum(['captain', 'captain_or_chief_officer', 'deck_officer', 'training_officer'])
    .optional(),
  sourceTaskReference: z.string().max(120).optional(),
  sourcePageReference: z.string().max(80).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isRequired: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ programId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const adminCheck = await requireTrbAdmin(supabaseAdmin, auth.userId);
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
    );
  }
  const { programId } = await params;
  const versionId = req.nextUrl.searchParams.get('versionId');
  try {
    if (versionId) {
      const tree = await getVersionTree(supabaseAdmin, versionId);
      if (!tree) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
      return NextResponse.json({ ...tree, serverTime: new Date().toISOString() });
    }
    const versions = await listVersionsForProgram(supabaseAdmin, programId);
    return NextResponse.json({
      versions,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[TRB admin program]', e);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ programId: string }> },
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const adminCheck = await requireTrbAdmin(supabaseAdmin, auth.userId);
  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
    );
  }
  await params; // programId reserved for future scoping
  const body = await req.json().catch(() => null);
  const publishParsed = publishSchema.safeParse(body);
  if (publishParsed.success) {
    try {
      if (publishParsed.data.action === 'retire') {
        const result = await retireVersion(
          supabaseAdmin,
          publishParsed.data.versionId,
        );
        return NextResponse.json({ ...result, serverTime: new Date().toISOString() });
      }
      const next =
        publishParsed.data.action === 'publish_active' ? 'active' : 'pilot';
      const result = await publishVersion(
        supabaseAdmin,
        publishParsed.data.versionId,
        next,
      );
      return NextResponse.json({ ...result, serverTime: new Date().toISOString() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const taskParsed = taskSchema.safeParse(body);
  if (taskParsed.success) {
    try {
      const result = await upsertDraftTask(supabaseAdmin, taskParsed.data);
      return NextResponse.json({
        task: result,
        serverTime: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Task save failed';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
}
