/**
 * POST /api/users/invite-vessel-role
 *
 * Creates a "vessel-linked secondary account": a real Supabase auth user
 * that is owned and operated by a vessel (Pro or Fleet plan only).
 *
 * The account is essentially a normal user with:
 *  - `users.managed_by_vessel_id` set to the vessel's id (the link)
 *  - `users.role` derived from the chosen role:
 *      - 'captain' for the Captain linked account (gets signature page,
 *        signing authority on this vessel)
 *      - 'crew' for Officer / Engineer / Manager (so they keep regular
 *        dashboard layout, but with restricted features)
 *  - `users.subscription_tier = 'vessel_linked'` (so they don't get a
 *    paid feature surface — the vessel is paying. This tier is parallel
 *    to `crew_limited` but is reserved for vessel-linked role accounts so
 *    we can grant them different access from crew added via Invite Crew.)
 *  - `users.active_vessel_id` set to the vessel
 *  - A `vessel_assignments` row with `assignment_role` mapped from the
 *    chosen role and `position` set to a sensible default label
 *  - For Captain: an approved `vessel_claim_requests` row + signing
 *    authority are created immediately (vessel manager invite = approval;
 *    no separate admin/vessel claim review)
 *
 * The captain/officer/etc. receives an email with a password setup link,
 * exactly like the existing "Invite Crew" flow (`/api/users/invite-crew`).
 *
 * Pro-tier gating is enforced server-side: the calling vessel manager must
 * be on Vessel Premium, Professional, or Fleet with an active subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createVesselAssignment, updateVesselAssignment } from '@/supabase/database/queries';
import { hasActiveSubscription, VESSEL_PREMIUM_PLUS_TIERS } from '@/supabase/database/subscription-helpers';
import { Resend } from 'resend';
import { sendWelcomeEmail } from '@/lib/welcome-email';
import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';
import type { VesselLinkedRole } from '@/lib/types';
import {
  DEFAULT_VESSEL_LINKED_FEATURES,
  filterFeaturesByPlatformFlags,
} from '@/lib/vessel-linked-features';
import { loadFeatureFlagState } from '@/lib/feature-flags/server';
import {
  canAddCaptainToVessel,
  grantVesselLinkedCaptaincy,
} from '@/lib/vessel-linked-captaincy';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';

const ROLE_CONFIG: Record<
  VesselLinkedRole,
  {
    label: string;
    /** Maps to the `users.role` enum-ish column. */
    userRole: 'captain' | 'crew';
    /** Maps to `vessel_assignments.assignment_role`. */
    assignmentRole: 'captain' | 'officer' | 'crew' | 'admin';
    /** Sensible default for `vessel_assignments.position`. */
    position: string;
  }
> = {
  captain: { label: 'Captain',  userRole: 'captain', assignmentRole: 'captain', position: 'Captain' },
  officer: { label: 'Officer',  userRole: 'crew',    assignmentRole: 'officer', position: 'Officer' },
  engineer:{ label: 'Engineer', userRole: 'crew',    assignmentRole: 'crew',    position: 'Engineer' },
  manager: { label: 'Manager',  userRole: 'crew',    assignmentRole: 'admin',   position: 'Vessel Manager' },
};

function isVesselLinkedRole(value: unknown): value is VesselLinkedRole {
  return value === 'captain' || value === 'officer' || value === 'engineer' || value === 'manager';
}

function generateSecurePassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
  password += '0123456789'[Math.floor(Math.random() * 10)];
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

function buildInviteEmailHtml(args: {
  firstName: string;
  vesselName: string;
  roleLabel: string;
  email: string;
}): string {
  const { firstName, vesselName, roleLabel, email } = args;
  const setupUrl = `${SITE_URL}/forgot-password?email=${encodeURIComponent(email)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>You have been added to ${vesselName} on SeaJourney</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:${EMAIL_PRIMARY_BLUE};padding:32px 24px;text-align:center;">
              <img src="${SITE_URL}/logo-seajourney.png" alt="SeaJourney" width="200" style="display:block;margin:0 auto;max-width:200px;height:auto;border:0;" />
              <p style="margin:12px 0 0;color:rgba(255,255,255,0.92);font-size:14px;">Vessel-linked account invitation</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#1e1e1e;font-size:16px;line-height:1.6;">Hi ${firstName},</p>
              <p style="margin:0 0 16px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                <strong>${vesselName}</strong> has added you as their <strong>${roleLabel}</strong> on SeaJourney. This account is linked to the vessel and lets you sign documents on the vessel's behalf without using your personal SeaJourney account.
              </p>
              <p style="margin:0 0 24px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                To get started, set up your password below. Once you're in, you'll be able to review and sign sea-service testimonials and other documents prepared by the vessel.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 16px;">
                    <a href="${setupUrl}" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Set up your password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
                If the button doesn't work, copy and paste this link:<br/>
                <a href="${setupUrl}" style="color:${EMAIL_PRIMARY_BLUE};text-decoration:underline;word-break:break-all;">${setupUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                You're receiving this email because ${vesselName} added your email to their crew on SeaJourney. If you didn't expect this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin-top:10px;">
          <tr>
            <td style="text-align:center;font-size:10px;color:#9ca3af;">SeaJourney • Digital sea-service logbook for yacht crew</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, vesselId, vesselName, vesselUserId, role } = body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      vesselId?: string;
      vesselName?: string;
      vesselUserId?: string;
      role?: string;
    };

    if (!firstName || !lastName || !email || !vesselId || !vesselUserId) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName, email, vesselId, vesselUserId' },
        { status: 400 },
      );
    }

    if (!isVesselLinkedRole(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: captain, officer, engineer, manager.` },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Pro/Fleet tier gate: the requesting vessel manager must be on a paid
    // Pro tier with an active subscription. Mirrors the in-app gating in
    // /dashboard/crew and the sidebar hasPremiumAccess helper.
    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select('id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id')
      .eq('id', vesselUserId)
      .single();

    if (vesselUserError || !vesselUser) {
      console.error('[INVITE VESSEL ROLE] Failed to fetch requesting user:', vesselUserError);
      return NextResponse.json({ error: 'Requesting user not found' }, { status: 404 });
    }

    if (vesselUser.role !== 'vessel') {
      return NextResponse.json(
        { error: 'Only vessel managers can create vessel-linked accounts' },
        { status: 403 },
      );
    }

    const tier = (vesselUser.subscription_tier || '').toString().toLowerCase();
    if (!VESSEL_PREMIUM_PLUS_TIERS.has(tier) || !hasActiveSubscription(vesselUser)) {
      return NextResponse.json(
        {
          error: 'Premium tier required',
          message:
            'Vessel-linked accounts are available on Vessel Premium, Professional, and Fleet plans. Upgrade your plan to add captain, officer, engineer, or manager accounts linked to this vessel.',
        },
        { status: 402 },
      );
    }

    // Ensure the requested vessel actually belongs to (or is managed by) the
    // caller. We accept either the caller's `active_vessel_id` or any vessel
    // where they are the registered manager.
    {
      const isActiveVessel = vesselUser.active_vessel_id === vesselId;
      let isManaged = false;
      if (!isActiveVessel) {
        const { data: managedVessel } = await supabaseAdmin
          .from('vessels')
          .select('id')
          .eq('id', vesselId)
          .eq('vessel_manager_id', vesselUserId)
          .maybeSingle();
        isManaged = !!managedVessel;
      }
      if (!isActiveVessel && !isManaged) {
        return NextResponse.json(
          { error: 'You can only add roles to a vessel you manage' },
          { status: 403 },
        );
      }
    }

    // Captain linked accounts are auto-assigned as the vessel's captain
    // (approved claim + signing authority). Enforce the 2-captain limit
    // before creating the auth user so we never leave an orphaned account.
    if (role === 'captain') {
      try {
        const canAdd = await canAddCaptainToVessel(vesselId);
        if (!canAdd) {
          return NextResponse.json(
            {
              error: 'Maximum captain limit reached',
              message:
                'This vessel already has 2 approved captains. Maximum of 2 captains allowed per vessel for rotational partners.',
            },
            { status: 400 },
          );
        }
      } catch (limitErr) {
        console.error('[INVITE VESSEL ROLE] Failed to check captain limit:', limitErr);
        return NextResponse.json(
          { error: 'Failed to check captain limit' },
          { status: 500 },
        );
      }
    }

    // Check the email isn't already in use anywhere on the platform.
    try {
      const { data: existingUser, error: existingUserError } =
        await supabaseAdmin.auth.admin.getUserByEmail(email);
      if (existingUserError && existingUserError.message && !existingUserError.message.includes('not found')) {
        console.error('[INVITE VESSEL ROLE] Error checking existing user:', existingUserError);
        return NextResponse.json(
          { error: 'Failed to check if user exists', details: existingUserError.message },
          { status: 500 },
        );
      }
      if (existingUser?.user) {
        return NextResponse.json(
          { error: 'A user with this email already exists. Linked accounts must use a fresh email address — try a vessel-specific alias like captain@your-vessel.com.' },
          { status: 400 },
        );
      }
    } catch (checkError) {
      console.error('[INVITE VESSEL ROLE] Error checking existing user:', checkError);
    }

    const config = ROLE_CONFIG[role];

    // Resolve vessel name (used in metadata + email copy) if not supplied.
    let resolvedVesselName = vesselName || '';
    if (!resolvedVesselName) {
      const { data: vesselRow } = await supabaseAdmin
        .from('vessels')
        .select('name')
        .eq('id', vesselId)
        .maybeSingle();
      resolvedVesselName = vesselRow?.name || 'Your vessel';
    }

    // Create the auth user.
    const password = generateSecurePassword();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        firstName,
        lastName,
        role: config.userRole,
        vessel_managed: true,
        managed_by_vessel_id: vesselId,
        linked_role: role,
      },
    });

    if (authError || !authData?.user) {
      console.error('[INVITE VESSEL ROLE] Failed to create auth user:', authError);
      return NextResponse.json(
        {
          error: 'Failed to create account',
          details: authError?.message || 'Unknown error from auth service',
        },
        { status: 500 },
      );
    }

    const userId = authData.user.id;

    // Wait briefly in case a DB trigger pre-creates the public.users row.
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Upsert the profile with the vessel-managed flags.
    const flagState = await loadFeatureFlagState();
    const initialFeatures = filterFeaturesByPlatformFlags(
      DEFAULT_VESSEL_LINKED_FEATURES,
      (key) => !!flagState.map[key],
    );
    const baseUsername = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${userId.substring(0, 6)}`.replace(/[^a-z0-9_]/g, '_');
    let username = baseUsername;
    let attempt = 0;
    let profileError: { message?: string; code?: string } | null = null;
    while (attempt < 10) {
      const { error } = await supabaseAdmin
        .from('users')
        .upsert(
          {
            id: userId,
            email,
            username,
            first_name: firstName,
            last_name: lastName,
            role: config.userRole,
            position: config.position,
            subscription_tier: 'vessel_linked',
            subscription_status: 'active',
            active_vessel_id: vesselId,
            managed_by_vessel_id: vesselId,
            linked_account_features: initialFeatures,
          },
          { onConflict: 'id' },
        );
      if (!error) {
        profileError = null;
        break;
      }
      // Username conflict — try a different suffix.
      if (error.code === '23505' && error.message?.includes('username')) {
        attempt += 1;
        username = `${baseUsername}_${attempt}`;
        profileError = error;
        continue;
      }
      profileError = error;
      break;
    }

    if (profileError) {
      console.error('[INVITE VESSEL ROLE] Failed to create profile, rolling back auth user:', profileError);
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.error('[INVITE VESSEL ROLE] Cleanup deleteUser failed:', delErr);
      }
      return NextResponse.json(
        { error: 'Failed to create user profile', details: profileError.message },
        { status: 500 },
      );
    }

    // Create the vessel assignment + set its `assignment_role`. We can't pass
    // `assignmentRole` to the helper today (it only accepts position), so we
    // create then update.
    try {
      const today = new Date().toISOString().split('T')[0];
      const assignment = await createVesselAssignment(supabaseAdmin as never, {
        userId,
        vesselId,
        startDate: today,
        endDate: null,
        position: config.position,
      });
      await updateVesselAssignment(supabaseAdmin as never, assignment.id, {
        assignmentRole: config.assignmentRole,
      });
    } catch (assignErr) {
      console.error('[INVITE VESSEL ROLE] Failed to create vessel assignment:', assignErr);
      // Non-fatal — the account exists; the vessel manager can re-create the
      // assignment on the Crew page. Surface a warning.
    }

    // Captain role: auto-grant captaincy so vessel/admin claim approval is
    // not required. The vessel manager inviting this account is the
    // authorization.
    if (role === 'captain') {
      try {
        await grantVesselLinkedCaptaincy({
          captainUserId: userId,
          vesselId,
          vesselUserId,
          position: config.position,
        });
      } catch (captaincyErr) {
        console.error('[INVITE VESSEL ROLE] Failed to auto-grant captaincy:', captaincyErr);
        // Account + assignment already exist; roll back the auth user so the
        // manager can retry cleanly rather than leaving a half-assigned captain.
        try {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        } catch (delErr) {
          console.error('[INVITE VESSEL ROLE] Cleanup deleteUser after captaincy failure:', delErr);
        }
        try {
          await supabaseAdmin.from('users').delete().eq('id', userId);
        } catch {
          /* best-effort */
        }
        const message =
          captaincyErr instanceof Error ? captaincyErr.message : 'Failed to assign captaincy';
        return NextResponse.json(
          {
            error: 'Failed to assign captain to vessel',
            details: message,
          },
          { status: 500 },
        );
      }
    }

    // Email — invitation + standard welcome.
    if (resend) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: [email],
          subject: `${resolvedVesselName} added you as their ${config.label} on SeaJourney`,
          html: buildInviteEmailHtml({
            firstName,
            vesselName: resolvedVesselName,
            roleLabel: config.label,
            email,
          }),
        });
      } catch (emailError) {
        console.error('[INVITE VESSEL ROLE] Invitation email failed:', emailError);
      }
    } else {
      console.warn('[INVITE VESSEL ROLE] Resend not configured — skipping invitation email');
    }

    const welcomeResult = await sendWelcomeEmail({ to: email, firstName });
    if (!welcomeResult.success) {
      console.warn('[INVITE VESSEL ROLE] Welcome email not sent:', welcomeResult.error);
    }

    return NextResponse.json({
      success: true,
      userId,
      role,
      message: `${config.label} account created and invitation sent`,
    });
  } catch (err) {
    const error = err as Error;
    console.error('[INVITE VESSEL ROLE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
