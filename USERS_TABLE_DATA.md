# Users Table Data Structure

This document describes all the data that is stored in the `users` table in Supabase.

## Table Schema

The `users` table has the following columns:

| Column Name | Type | Required | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | UUID | ✅ Yes | - | Primary key, references `auth.users(id)` |
| `email` | TEXT | ✅ Yes | - | User's email address |
| `username` | TEXT | ✅ Yes | - | User's username |
| `first_name` | TEXT | ❌ No | `null` | User's first name |
| `last_name` | TEXT | ❌ No | `null` | User's last name |
| `profile_picture` | TEXT | ❌ No | `null` | URL to user's profile picture |
| `bio` | TEXT | ❌ No | `null` | User's biography/description |
| `registration_date` | TIMESTAMPTZ | ✅ Yes | `NOW()` | When the user registered |
| `role` | TEXT | ✅ Yes | `'crew'` | User role: `'crew'`, `'captain'`, `'vessel'`, or `'admin'` |
| `subscription_tier` | TEXT | ✅ Yes | `'free'` | Subscription tier (e.g., `'free'`, `'premium'`, `'pro'`) |
| `subscription_status` | TEXT | ✅ Yes | `'inactive'` | Status: `'active'`, `'inactive'`, or `'past-due'` |
| `active_vessel_id` | UUID | ❌ No | `null` | ID of currently active vessel |
| `active_sea_service_id` | UUID | ❌ No | `null` | ID of currently active sea service record |
| `created_at` | TIMESTAMPTZ | ✅ Yes | `NOW()` | Record creation timestamp (auto) |
| `updated_at` | TIMESTAMPTZ | ✅ Yes | `NOW()` | Last update timestamp (auto) |

## Data Added During Signup

When a user signs up on `/signup`, the following data is inserted:

```typescript
{
  id: authData.user.id,                    // From Supabase Auth
  email: data.email,                        // From signup form
  username: data.username,                  // From signup form
  first_name: '',                           // Empty string (can be updated later)
  last_name: '',                            // Empty string (can be updated later)
  registration_date: new Date().toISOString(), // Current timestamp
  role: 'crew',                             // Default role
  subscription_tier: 'free',                // Default tier
  subscription_status: 'inactive',           // Default status
}
```

**Note:** `profile_picture`, `bio`, `active_vessel_id`, and `active_sea_service_id` are not set during signup (remain `null`).

## Data Added/Updated via `updateUserProfile`

The `updateUserProfile` function can create or update user records. Here's what happens:

### When User Doesn't Exist (Creates New User)

If the user doesn't exist in the `users` table, a new record is created with:

```typescript
{
  id: userId,                              // User ID from auth
  email: updates.email || user.email,      // From updates or fetched from auth
  username: updates.username || `user_${userId.slice(0, 8)}`, // From updates or auto-generated
  first_name: updates.firstName || null,    // From updates or null
  last_name: updates.lastName || null,      // From updates or null
  bio: updates.bio || null,                // From updates or null
  role: 'crew',                            // Always defaults to 'crew'
  subscription_tier: updates.subscriptionTier || 'free',      // From updates or 'free'
  subscription_status: updates.subscriptionStatus || 'inactive', // From updates or 'inactive'
  active_vessel_id: updates.activeVesselId || null,           // From updates or null
  active_sea_service_id: updates.activeSeaServiceId || null,   // From updates or null
  registration_date: new Date().toISOString(), // Current timestamp
}
```

### When User Exists (Updates Existing User)

Only the fields provided in `updates` are updated:

```typescript
// Only these fields can be updated (if provided):
{
  active_vessel_id?: string | null,
  active_sea_service_id?: string | null,
  username?: string,
  first_name?: string,
  last_name?: string,
  bio?: string,
  subscription_tier?: string,
  subscription_status?: string,
}
```

## Data Flow Examples

### 1. User Signs Up
**Location:** `src/app/signup/page.tsx`

```typescript
// User provides: email, username, password
// Creates in users table:
{
  id: "uuid-from-auth",
  email: "user@example.com",
  username: "johndoe",
  first_name: "",
  last_name: "",
  role: "crew",
  subscription_tier: "free",
  subscription_status: "inactive",
  registration_date: "2024-01-15T10:30:00Z"
}
```

### 2. User Updates Profile
**Location:** `src/components/dashboard/user-profile.tsx`

```typescript
// User updates: username, firstName, lastName, bio
// Updates in users table:
{
  username: "newusername",
  first_name: "John",
  last_name: "Doe",
  bio: "Maritime professional"
}
```

### 3. User Subscribes to Premium
**Location:** `src/app/payment-success/page.tsx`

```typescript
// After payment verification, updates:
{
  subscription_tier: "premium",
  subscription_status: "active"
}
```

### 4. User Sets Active Vessel
**Location:** `src/app/dashboard/current/page.tsx`

```typescript
// When user selects a vessel:
{
  active_vessel_id: "vessel-uuid",
  active_sea_service_id: "sea-service-uuid" // Optional
}
```

## Field Details

### Required Fields (Always Set)
- **`id`**: UUID from Supabase Auth
- **`email`**: User's email (from signup or auth)
- **`username`**: User's chosen username (or auto-generated if missing)
- **`registration_date`**: Timestamp when user was created
- **`role`**: Always defaults to `'crew'`
- **`subscription_tier`**: Defaults to `'free'`
- **`subscription_status`**: Defaults to `'inactive'`

### Optional Fields (May Be Null)
- **`first_name`**: Can be empty/null
- **`last_name`**: Can be empty/null
- **`profile_picture`**: URL to image (not currently set in code)
- **`bio`**: User biography
- **`active_vessel_id`**: Set when user selects a vessel
- **`active_sea_service_id`**: Set when user starts sea service

### Auto-Managed Fields
- **`created_at`**: Set automatically by database
- **`updated_at`**: Updated automatically by database trigger

## Data Validation

- **`role`**: Must be one of: `'crew'`, `'captain'`, `'vessel'`, `'admin'`
- **`subscription_status`**: Must be one of: `'active'`, `'inactive'`, `'past-due'`
- **`id`**: Must reference a valid `auth.users(id)` record
- **`active_vessel_id`**: Must reference a valid `vessels(id)` if set
- **`active_sea_service_id`**: Must reference a valid `sea_service_records(id)` if set

## Notes

1. **Email Source**: Email is always fetched from Supabase Auth if not provided in updates
2. **Username Fallback**: If username is missing during user creation, it defaults to `user_` + first 8 chars of user ID
3. **Upsert on Signup**: Signup uses `upsert` to handle edge cases where user might already exist
4. **Auto-Creation**: The `updateUserProfile` function automatically creates users if they don't exist

