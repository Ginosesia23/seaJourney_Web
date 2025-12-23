# Testimonials: Direct to Captain Implementation

## Overview

This implementation allows users to send testimonial requests directly to captains who are registered SeaJourney users without requiring email input. The system automatically detects active captains for vessels and routes requests to their inbox.

## What Was Changed

### 1. Database Schema (`add-testimonials-captain-user-id.sql`)

Added `captain_user_id` column to the `testimonials` table:
- **Column**: `captain_user_id` (UUID, nullable, references `auth.users`)
- **Purpose**: Links testimonials directly to captain user accounts
- **Benefits**: 
  - Testimonials automatically appear in captain's inbox
  - No email matching required for SeaJourney users
  - Better security and user experience

**Key Changes:**
- Added `captain_user_id` column with foreign key constraint
- Created indexes for efficient querying
- Updated RLS policies to:
  - Allow users to create testimonials with `captain_user_id`
  - Allow captains to view testimonials addressed to them by `captain_user_id`
  - Allow captains to update (approve/reject) testimonials addressed to them

### 2. TypeScript Types (`src/lib/types.ts`)

Added `captain_user_id: string | null` to the `Testimonial` interface.

### 3. Form Submission (`src/app/dashboard/testimonials/page.tsx`)

**Auto-Detection:**
- When a vessel is selected, the system checks for active signing authorities
- If an active SeaJourney captain is found, their `user_id` is stored in `captain_user_id`
- Captain email and name are auto-filled from the captain's user profile

**Submission Logic:**
- If `captain_user_id` is set: Request goes directly to captain's inbox (status: `pending_captain`)
- If only `captain_email` is provided (external captain): Email is sent via signoff link
- If neither is provided: Testimonial is saved as draft

### 4. Inbox Query (`src/app/dashboard/inbox/page.tsx`)

Updated to query testimonials by:
1. **Primary**: `captain_user_id` matching current user (SeaJourney captains)
2. **Fallback**: `captain_email` matching current user's email (external captains)

This ensures both SeaJourney users and external captains receive requests appropriately.

## How It Works

### For Users Requesting Testimonials:

1. **Open Request Form**: User clicks "Request Testimonial"
2. **Select Vessel**: Current vessel is auto-selected (or user selects different vessel)
3. **Auto-Detection**: System automatically finds active captain for selected vessel
4. **Captain Found (SeaJourney User)**:
   - Captain info displayed in card
   - Email field hidden (auto-filled)
   - User only needs to select date range
   - Submit → Request goes to captain's inbox automatically
5. **No Active Captain Found**:
   - User can manually enter captain email
   - Email is sent via signoff link

### For Captains Receiving Requests:

1. **Inbox Access**: Captains see requests in their Inbox page
2. **Automatic Visibility**: Requests with matching `captain_user_id` appear automatically
3. **Approval/Rejection**: Captains can approve or reject directly from inbox
4. **No Email Required**: For SeaJourney users, no email needs to be sent

## Database Migration Steps

1. **Run the SQL migration**:
   ```sql
   -- Execute: add-testimonials-captain-user-id.sql
   ```

2. **Verify the migration**:
   ```sql
   -- Check column was added
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'testimonials' AND column_name = 'captain_user_id';
   
   -- Check indexes were created
   SELECT indexname FROM pg_indexes
   WHERE tablename = 'testimonials' AND indexname LIKE '%captain_user_id%';
   
   -- Check RLS policies
   SELECT policyname FROM pg_policies
   WHERE tablename = 'testimonials' AND policyname LIKE '%captain%';
   ```

## RLS Policy Details

### 1. Users Can Create Testimonials
- **Policy**: `Users can create testimonials with captain_user_id`
- **Permission**: Users can create testimonials for any captain
- **Validation**: If `captain_user_id` is set, it must reference a valid user

### 2. Captains Can View Their Testimonials
- **Policy**: `Captains can view testimonials addressed to them by user_id`
- **Permission**: Captains see testimonials where `captain_user_id = auth.uid()`
- **Also**: Admins can view all testimonials

### 3. Captains Can Update Their Testimonials
- **Policy**: `Captains can update testimonials addressed to them`
- **Permission**: Captains can approve/reject testimonials addressed to them
- **Restriction**: Can only update if status is `pending_captain`

## Backward Compatibility

- **Existing testimonials**: Continue to work (may have `captain_user_id = NULL`)
- **External captains**: Still supported via `captain_email` matching
- **Email-based requests**: Still function for non-SeaJourney captains

## Benefits

1. **Improved UX**: No need to manually enter captain email when captain is a SeaJourney user
2. **Better Security**: Direct user-to-user relationship via database
3. **Automatic Routing**: Requests appear in inbox immediately
4. **Reduced Errors**: No email typos or mismatches
5. **Real-time**: No email delivery delays for SeaJourney users

## Testing Checklist

- [ ] Run SQL migration successfully
- [ ] Create testimonial with active SeaJourney captain → Verify appears in captain's inbox
- [ ] Create testimonial with external captain email → Verify email is sent
- [ ] Captain can view testimonial in inbox
- [ ] Captain can approve testimonial
- [ ] Captain can reject testimonial
- [ ] User can see testimonial status updates
- [ ] Verify RLS policies prevent unauthorized access

## Notes

- The `vessel_signing_authorities` table is used to determine active captains
- Only primary signing authorities (`is_primary = true`) are considered
- Only active signing authorities (`end_date IS NULL`) are considered
- Captains must have approved captaincy requests to be active signing authorities
