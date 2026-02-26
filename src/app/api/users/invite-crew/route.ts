import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createVesselAssignment } from '@/supabase/database/queries';
import { Resend } from 'resend';
import { sendWelcomeEmail } from '@/lib/welcome-email';
import { EMAIL_PRIMARY_BLUE } from '@/lib/email-colors';

// Initialize Resend only if API key is available
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seajourney.co.uk';
const FROM_EMAIL = process.env.BILLING_FROM_EMAIL || 'SeaJourney <team@seajourney.co.uk>';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, vesselId, vesselName, vesselUserId } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !vesselId) {
      return NextResponse.json(
        { error: 'Missing required fields: firstName, lastName, email, vesselId' },
        { status: 400 }
      );
    }

    // Check crew limit if vesselUserId is provided (vessel manager inviting)
    if (vesselUserId) {
      // Get vessel manager's subscription tier and status
      const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
        .from('users')
        .select('subscription_tier, subscription_status')
        .eq('id', vesselUserId)
        .single();

      if (vesselUserError) {
        console.error('[INVITE CREW] Error fetching vessel user:', vesselUserError);
        // Continue anyway - worst case they'll hit the limit on the frontend
      } else if (vesselUser) {
        // Get crew limit based on subscription tier
        const getCrewLimit = (tier: string | undefined, status: string | undefined): number => {
          if (!tier || (status || '').toLowerCase() !== 'active') {
            return 0; // No active subscription = no access
          }
          
          const tierLower = tier.toLowerCase();
          switch (tierLower) {
            case 'vessel_lite':
              return 15;
            case 'vessel_basic':
              return 30;
            case 'vessel_pro':
            case 'vessel_fleet':
              return Infinity; // Unlimited
            default:
              return 0; // Unknown tier = no access
          }
        };

        const crewLimit = getCrewLimit(vesselUser.subscription_tier, vesselUser.subscription_status);

        // Only check limit if it's not unlimited
        if (crewLimit !== Infinity) {
          // Count current active crew assignments for this vessel
          const { data: assignments, error: countError } = await supabaseAdmin
            .from('vessel_assignments')
            .select('id', { count: 'exact', head: false })
            .eq('vessel_id', vesselId)
            .is('end_date', null); // Active assignments only

          if (countError) {
            console.error('[INVITE CREW] Error counting crew assignments:', countError);
            return NextResponse.json(
              { error: 'Failed to check crew limit', details: countError.message },
              { status: 500 }
            );
          }

          const currentCrewCount = assignments?.length || 0;
          
          if (currentCrewCount >= crewLimit) {
            return NextResponse.json(
              { 
                error: 'Crew limit reached', 
                message: `Your ${vesselUser.subscription_tier?.replace('vessel_', '').replace('_', ' ').toUpperCase() || 'current'} plan allows a maximum of ${crewLimit} crew members. You currently have ${currentCrewCount} crew members. Please upgrade your plan to invite more crew members.`,
                currentCount: currentCrewCount,
                limit: crewLimit
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user already exists
    try {
      const { data: existingUser, error: existingUserError } = await supabaseAdmin.auth.admin.getUserByEmail(email);
      if (existingUserError) {
        // If error is not "user not found", it's a real error
        if (existingUserError.message && !existingUserError.message.includes('not found')) {
          console.error('[INVITE CREW] Error checking existing user:', existingUserError);
          return NextResponse.json(
            { error: 'Failed to check if user exists', details: existingUserError.message },
            { status: 500 }
          );
        }
        // User doesn't exist, continue
      } else if (existingUser?.user) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 400 }
        );
      }
    } catch (checkError: any) {
      console.error('[INVITE CREW] Error checking existing user:', checkError);
      // Continue anyway - worst case we'll get an error when creating
    }

    // Generate a secure random password that meets requirements (min 8 chars, uppercase, lowercase, number, special char)
    // User will reset this password anyway, so it just needs to be valid
    const generateSecurePassword = () => {
      const length = 16;
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
      let password = '';
      // Ensure at least one of each required type
      password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
      password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
      password += '0123456789'[Math.floor(Math.random() * 10)]; // number
      password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special char
      // Fill the rest randomly
      for (let i = password.length; i < length; i++) {
        password += charset[Math.floor(Math.random() * charset.length)];
      }
      // Shuffle the password
      return password.split('').sort(() => Math.random() - 0.5).join('');
    };

    const randomPassword = generateSecurePassword();

    console.log('[INVITE CREW] Creating auth user with email:', email);

    // Create auth user with invite
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: randomPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        firstName: firstName,
        lastName: lastName,
        role: 'crew',
        invited_by_vessel: true,
        vessel_id: vesselId,
      },
    });

    if (authError) {
      console.error('[INVITE CREW] Error creating auth user:', authError);
      console.error('[INVITE CREW] Auth error details:', {
        message: authError.message,
        name: authError.name,
        status: (authError as any).status,
      });
      return NextResponse.json(
        { 
          error: 'Failed to create user account', 
          details: authError.message || 'Unknown error occurred',
          code: (authError as any).status || 'unknown'
        },
        { status: 500 }
      );
    }

    if (!authData?.user) {
      console.error('[INVITE CREW] Auth user creation returned no user data');
      return NextResponse.json(
        { error: 'Failed to create user account', details: 'No user data returned from auth service' },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // Generate a unique username
    const baseUsername = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${userId.substring(0, 6)}`;
    let username = baseUsername;
    let usernameAttempts = 0;
    const maxAttempts = 10;

    // Wait a moment for the database trigger to potentially create the profile
    // Then update it with our specific values
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create or update user profile with crew_limited tier
    // Try to insert/update, and if username conflict, try with a different username
    let profileError: any = null;
    while (usernameAttempts < maxAttempts) {
      const { error: error } = await supabaseAdmin
        .from('users')
        .upsert({
          id: userId,
          email: email,
          username: username,
          first_name: firstName,
          last_name: lastName,
          role: 'crew',
          subscription_tier: 'crew_limited',
          subscription_status: 'active',
          active_vessel_id: vesselId,
        }, {
          onConflict: 'id',
        });

      if (!error) {
        // Success!
        profileError = null;
        break;
      }

      // Check if it's a username conflict
      if (error.code === '23505' && error.message?.includes('username')) {
        // Username conflict - try with a different suffix
        usernameAttempts++;
        username = `${baseUsername}_${usernameAttempts}`;
        profileError = error;
        continue;
      } else {
        // Different error - break and handle it
        profileError = error;
        break;
      }
    }

    if (profileError) {
      console.error('[INVITE CREW] Error creating/updating user profile:', profileError);
      console.error('[INVITE CREW] Profile error details:', {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
      });
      // Try to clean up auth user if profile creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (deleteError) {
        console.error('[INVITE CREW] Error cleaning up auth user:', deleteError);
      }
      return NextResponse.json(
        { error: 'Failed to create user profile', details: profileError.message, code: profileError.code },
        { status: 500 }
      );
    }

    // Create vessel assignment
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      await createVesselAssignment(
        supabaseAdmin as any,
        {
          userId: userId,
          vesselId: vesselId,
          startDate: today,
          endDate: null, // Active assignment
          position: null,
        }
      );
    } catch (assignmentError: any) {
      console.error('[INVITE CREW] Error creating vessel assignment:', assignmentError);
      // Don't fail the whole operation, but log it
    }

    // Send password reset email (this acts as the invitation)
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${SITE_URL}/reset-password`,
      },
    });

    if (resetError) {
      console.error('[INVITE CREW] Error generating reset link:', resetError);
      // Continue anyway - we'll send a custom email
    }

    // Send invitation email
    const invitationHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Welcome to SeaJourney</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:${EMAIL_PRIMARY_BLUE};padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">Welcome to SeaJourney!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 16px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                ${vesselName || 'Your vessel'} has created an account for you on SeaJourney. To get started, you'll need to set up your password.
              </p>
              <p style="margin:0 0 24px;color:#1e1e1e;font-size:16px;line-height:1.6;">
                Your account has been set up with limited access to the Calendar and Export features. You can upgrade your account at any time to access additional features.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="${SITE_URL}/forgot-password?email=${encodeURIComponent(email)}" style="display:inline-block;padding:12px 26px;background-color:${EMAIL_PRIMARY_BLUE};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Set Up Your Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br/>
                <a href="${SITE_URL}/forgot-password?email=${encodeURIComponent(email)}" style="color:${EMAIL_PRIMARY_BLUE};text-decoration:underline;">${SITE_URL}/forgot-password?email=${encodeURIComponent(email)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                This invitation was sent by ${vesselName || 'your vessel'}. If you didn't expect this invitation, you can safely ignore this email.
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

    // Send invitation email if Resend is configured
    if (resend) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: [email],
          subject: `${vesselName || 'Your vessel'} has invited you to SeaJourney`,
          html: invitationHtml,
        });
        console.log('[INVITE CREW] Invitation email sent successfully');
      } catch (emailError: any) {
        console.error('[INVITE CREW] Error sending invitation email:', emailError);
        // Don't fail the whole operation - user is created, they can use forgot password
      }
    } else {
      console.warn('[INVITE CREW] Resend API key not configured - skipping email send');
    }

    // Send welcome-to-SeaJourney email (platform intro, getting started)
    const welcomeResult = await sendWelcomeEmail({ to: email, firstName: firstName || null });
    if (!welcomeResult.success) {
      console.warn('[INVITE CREW] Welcome email not sent:', welcomeResult.error);
    }

    return NextResponse.json({
      success: true,
      userId: userId,
      message: 'Crew member invited successfully',
    });
  } catch (error: any) {
    console.error('[INVITE CREW] Unexpected error:', error);
    console.error('[INVITE CREW] Error stack:', error?.stack);
    console.error('[INVITE CREW] Error details:', {
      message: error?.message,
      name: error?.name,
      code: error?.code,
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
