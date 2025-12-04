# Testimonials Page Implementation

## Overview

The testimonials page has been fully implemented with all requested features. Users can now request testimonials from vessel captains, track their status, and view pending, approved, and rejected testimonials.

## Features Implemented

### 1. **Testimonial Request Form**
   - **Vessel Selection**: Users can select from vessels they have logged time on
   - **Date Range Selection**: Start and end date pickers (restricted to past dates)
   - **Captain Email**: Required field for the captain's email address
   - **Captain Name**: Optional field for the captain's name
   - **Validation**: 
     - Ensures end date is after start date
     - Prevents future dates from being selected
     - Validates email format

### 2. **Testimonials Table**
   - **Tabbed View**: Tabs for All, Pending, Approved, and Rejected testimonials
   - **Status Badges**: Visual indicators with icons for each status
   - **Information Display**:
     - Vessel name with icon
     - Date range with calendar icon
     - Captain name and email
     - Request date
     - Status badge
     - Response details (rating, content for approved; reason for rejected)

### 3. **Status Management**
   - **Pending**: Yellow badge with clock icon - awaiting captain response
   - **Approved**: Green badge with checkmark - shows rating and testimonial content
   - **Rejected**: Red badge with X icon - shows rejection reason

### 4. **Additional Features**
   - Only shows vessels the user has actually logged time on
   - Proper date validation (no future dates)
   - Responsive design matching other dashboard pages
   - Loading states and empty states
   - Toast notifications for success/error messages

## Database Schema

A new table `testimonial_requests` has been created with the following structure:

```sql
CREATE TABLE testimonial_requests (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  vessel_id UUID REFERENCES vessels(id),
  captain_email TEXT NOT NULL,
  captain_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  testimonial_content TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Setup Instructions

### 1. Create the Database Table

Run the SQL file in your Supabase SQL Editor:
```bash
create-testimonial-requests-table.sql
```

This will:
- Create the `testimonial_requests` table
- Set up indexes for performance
- Enable Row Level Security (RLS)
- Create RLS policies for users to manage their own requests
- Set up triggers for automatic `updated_at` timestamps

### 2. Email Functionality (TODO)

The page currently logs email details to the console. To implement actual email sending:

1. **Set up an email service** (e.g., Resend, SendGrid, or Supabase Email)
2. **Create a server action or API route** to send emails
3. **Email Template** should include:
   - Link to approve/reject the testimonial
   - Vessel name
   - Date range
   - User information
   - Unique token for secure access

Example email structure (to be implemented):
```typescript
// In a server action or API route
async function sendTestimonialRequestEmail({
  captainEmail,
  captainName,
  vesselName,
  userName,
  startDate,
  endDate,
  requestId,
}) {
  // Send email with approval/rejection link
  // Link should include: /testimonials/respond?token={secureToken}&requestId={requestId}
}
```

### 3. Captain Response Interface (Optional)

To allow captains to respond directly, you could create:
- A public route: `/testimonials/respond?token={token}&requestId={id}`
- A form for captains to:
  - Approve and write testimonial with rating
  - Reject with reason
- Token verification to ensure security

## File Changes

### New Files
- `/src/app/dashboard/testimonials/page.tsx` - Complete testimonials page
- `/create-testimonial-requests-table.sql` - Database schema
- `/TESTIMONIALS_IMPLEMENTATION.md` - This documentation

### Modified Files
- `/src/lib/types.ts` - Added `TestimonialRequest` interface and `TestimonialStatus` type

## Usage

1. **Requesting a Testimonial**:
   - Click "Request Testimonial" button
   - Select a vessel (only vessels with logged time are shown)
   - Choose date range (start and end dates)
   - Enter captain's email (required)
   - Optionally enter captain's name
   - Click "Send Request"

2. **Viewing Testimonials**:
   - Use tabs to filter by status (All, Pending, Approved, Rejected)
   - View all details in the table
   - See ratings and content for approved testimonials
   - See rejection reasons for rejected testimonials

## Next Steps

1. ✅ Run the SQL migration to create the table
2. ⏳ Set up email service and implement email sending
3. ⏳ (Optional) Create captain response interface
4. ⏳ (Optional) Add export functionality for approved testimonials
5. ⏳ (Optional) Add reminder emails for pending requests

## Notes

- The page automatically filters vessels to only show ones the user has logged time on
- Future dates are prevented in the date picker
- All date ranges are validated before submission
- The UI matches the design patterns used throughout the dashboard
- RLS policies ensure users can only see and manage their own testimonial requests

