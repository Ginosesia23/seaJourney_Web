# Payment Verification Error Troubleshooting

If you're seeing an error at line 91 (`console.error('Payment verification error:', err)`), follow these steps to identify and fix the issue.

## Enhanced Error Logging

I've added detailed error logging to help identify the issue. Check your browser console and server logs for:

### Client-Side Logs (Browser Console)
- `[CLIENT] Verification result:` - Shows the API response
- `[CLIENT] Updating user subscription:` - Shows what's being updated
- `[CLIENT] Payment verification error:` - Detailed error information

### Server-Side Logs (Terminal/Server Console)
- `[SERVER] Received verification request` - API route was called
- `[SERVER] Retrieving Stripe session:` - Stripe API call
- `[SERVER] Stripe session retrieved:` - Session data
- `[SERVER] Verified payment:` - Success confirmation
- `[SERVER] Error verifying checkout session:` - Error details

## Common Issues and Solutions

### 1. Stripe API Key Missing or Invalid

**Symptoms:**
- Server error: "Stripe error: ..."
- Status 500 from API route

**Solution:**
- Check `.env.local` or `.env` file has:
  ```
  STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
  ```
- Verify the key is correct in Stripe Dashboard → Developers → API keys

### 2. Invalid Session ID

**Symptoms:**
- "Stripe error: No such checkout session: ..."
- Session ID is null or undefined

**Solution:**
- Check the URL has `?session_id=cs_...`
- Verify the session exists in Stripe Dashboard → Payments → Checkout sessions

### 3. Session Not Paid

**Symptoms:**
- "Session not complete. status=..., payment_status=..."
- Payment might still be processing

**Solution:**
- Wait a few seconds and refresh
- Check Stripe Dashboard to see payment status
- For test mode, use test card: `4242 4242 4242 4242`

### 4. Supabase Update Failed (RLS Policy)

**Symptoms:**
- "Failed to update subscription: ..."
- Error mentions "permission denied" or "row-level security"

**Solution:**
- Verify user is authenticated: Check `user?.id` exists
- Check Supabase RLS policies allow updates:
  ```sql
  -- Should exist in your database
  CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);
  ```
- Verify the Supabase client has the user's session

### 5. Network Error

**Symptoms:**
- "Failed to fetch" or "Network error"
- Request times out

**Solution:**
- Check internet connection
- Verify API route is accessible: `/api/stripe/verify-checkout-session`
- Check Next.js server is running

### 6. JSON Parse Error

**Symptoms:**
- "Invalid response from server"
- "Failed to parse JSON response"

**Solution:**
- Check API route is returning valid JSON
- Verify response headers include `Content-Type: application/json`

## Debugging Steps

1. **Check Browser Console**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for `[CLIENT]` prefixed logs
   - Note the exact error message

2. **Check Server Logs**
   - Look at your terminal where `npm run dev` is running
   - Look for `[SERVER]` prefixed logs
   - Note any error messages

3. **Check Network Tab**
   - Open DevTools → Network tab
   - Find the request to `/api/stripe/verify-checkout-session`
   - Check:
     - Request payload (should have `sessionId`)
     - Response status code
     - Response body

4. **Verify Stripe Session**
   - Go to Stripe Dashboard → Payments → Checkout sessions
   - Find the session ID from the URL
   - Check:
     - Status is "complete"
     - Payment status is "paid"
     - Metadata contains `tier`, `userId`, etc.

5. **Verify Supabase Connection**
   - Check Supabase Dashboard → Settings → API
   - Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
   - Test connection in browser console:
     ```javascript
     // In browser console on payment-success page
     const { supabase, user } = useSupabase();
     console.log('User:', user);
     console.log('Supabase client:', supabase);
     ```

## Quick Test

To test the flow manually:

1. **Test API Route Directly:**
   ```bash
   curl -X POST http://localhost:3000/api/stripe/verify-checkout-session \
     -H "Content-Type: application/json" \
     -d '{"sessionId":"cs_test_..."}'
   ```

2. **Test Supabase Update:**
   ```javascript
   // In browser console
   const { supabase, user } = useSupabase();
   await updateUserProfile(supabase, user.id, {
     subscriptionStatus: 'active',
     subscriptionTier: 'premium',
   });
   ```

## Still Having Issues?

If the error persists, share:
1. The exact error message from browser console
2. The server log output
3. The Network tab response
4. Your `.env.local` file (with sensitive values redacted)

