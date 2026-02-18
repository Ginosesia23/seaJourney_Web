import type { SupabaseClient } from '@supabase/supabase-js';
import type { Testimonial } from '@/lib/types';

const APP_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'https://www.seajourney.co.uk';

export type ToastFn = (props: {
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
}) => void;

/**
 * Create or reuse a secure signoff token for a testimonial and store it in the DB.
 */
export async function createOrGetSignoffToken(
  supabase: SupabaseClient,
  testimonialId: string,
  captainEmail: string
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('testimonials')
    .select('signoff_token, signoff_token_expires_at, signoff_target_email')
    .eq('id', testimonialId)
    .maybeSingle();

  if (existingError) {
    console.error('Error checking existing token:', existingError);
    throw existingError;
  }

  const now = new Date();
  if (
    existing?.signoff_token &&
    existing.signoff_token_expires_at &&
    existing.signoff_target_email === captainEmail &&
    new Date(existing.signoff_token_expires_at) > now
  ) {
    return existing.signoff_token as string;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error: updateError } = await supabase
    .from('testimonials')
    .update({
      signoff_token: token,
      signoff_token_expires_at: expiresAt.toISOString(),
      signoff_target_email: captainEmail,
    })
    .eq('id', testimonialId);

  if (updateError) {
    console.error('Error creating signoff token:', updateError);
    throw updateError;
  }

  return token;
}

/**
 * Request captain signoff: set token on testimonial and send signoff email via Edge Function.
 * Use when sending a testimonial to an external captain (no SeaJourney account / no captain_user_id).
 * If signoffToken is provided (e.g. from API create-signoff-token), it is used and no client-side
 * update is done—use this when the token was already saved server-side (e.g. vessel manager flow).
 */
export async function requestCaptainSignoff(
  supabase: SupabaseClient,
  testimonial: Testimonial & { vessel_name?: string; signoffToken?: string },
  toast: ToastFn
): Promise<void> {
  if (!testimonial.captain_email) {
    throw new Error('Captain email is required');
  }

  const captainEmail = testimonial.captain_email.trim();
  const normalizedEmail = captainEmail.toLowerCase();
  const captainName = testimonial.captain_name || 'Captain';
  const vesselName = testimonial.vessel_name ?? 'Your Vessel';

  const token = testimonial.signoffToken
    ? testimonial.signoffToken
    : await createOrGetSignoffToken(supabase, testimonial.id, normalizedEmail);

  const signoffLink = `${APP_URL}/testimonials/signoff?token=${encodeURIComponent(
    token
  )}&email=${encodeURIComponent(normalizedEmail)}`;

  const { error } = await supabase.functions.invoke('send-signoff-request', {
    body: {
      captainEmail,
      captainName,
      vesselName,
      signoffLink,
      pdfUrl: testimonial.pdf_url || null,
    },
  });

  if (error) {
    console.error('Error sending signoff email:', error);
    let errorDescription = error.message || 'Unknown error';
    if (error.message?.includes('Failed to fetch') || error.message?.includes('Failed to send a request')) {
      errorDescription = `Email function appears to be unavailable. Please verify the Edge Function 'send-signoff-request' is deployed in Supabase.`;
    } else if (error.context?.status === 400) {
      errorDescription = `The email request was invalid. Please contact the captain manually.`;
    } else {
      errorDescription = `Email failed: ${errorDescription}. Please contact the captain manually.`;
    }
    toast({
      title: 'Request created',
      description: errorDescription,
      variant: 'destructive',
    });
    return;
  }

  if (!testimonial.signoffToken) {
    await supabase
      .from('testimonials')
      .update({ status: 'pending_captain' })
      .eq('id', testimonial.id);
  }

  toast({
    title: 'Request sent',
    description: `Testimonial request has been sent to ${captainEmail}. The captain can view, approve, and add comments via the link in the email.`,
  });
}
