# Fix RLS Policies for Users Table

## Problems

### Problem 1: Missing RLS Policies
You're getting this error:
```
Failed to update subscription: new row violates row-level security policy for table "users"
```

This happens because the RLS (Row Level Security) policies don't exist for the `users` table, or they're incorrectly configured.

### Problem 2: Infinite Recursion
You're getting this error:
```
Failed to update subscription: infinite recursion detected in policy for relation "users"
```

This happens when an RLS policy queries the same table it's protecting, causing infinite recursion. The "Vessel managers and admins can list users" policy was causing this.

## Solution

### For Missing Policies
Run the SQL script `fix-users-rls-policies.sql` in your Supabase SQL Editor.

### For Infinite Recursion
Run the SQL script `fix-rls-recursion.sql` to remove the problematic policy.

### Steps:

1. **Open Supabase Dashboard**
   - Go to your Supabase project
   - Navigate to **SQL Editor**

2. **Run the Fix Script**
   - Copy the contents of `fix-users-rls-policies.sql`
   - Paste into the SQL Editor
   - Click **Run**

3. **Verify Policies**
   - Go to **Authentication** → **Policies**
   - Or run this query to see all policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'users';
   ```

## What the Script Does

The script:
1. Enables RLS on the `users` table
2. Creates policies that allow:
   - Users to **read** their own profile
   - Users to **update** their own profile (including subscription fields)
   - Users to **create** their own profile
   - ~~Vessel managers and admins to **list** all users~~ (removed to avoid infinite recursion)

## Policy Details

### 1. Read Own Profile
```sql
CREATE POLICY "Users can read their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);
```
- Users can only see their own profile data

### 2. Update Own Profile
```sql
CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```
- Users can update any field in their own profile
- This includes `subscription_tier` and `subscription_status`

### 3. Create Own Profile
```sql
CREATE POLICY "Users can create their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
```
- Users can only create a profile with their own ID
- Prevents users from creating profiles for other users

### 4. Admins Can List All Users
**⚠️ REMOVED** - This policy caused infinite recursion because it queries the `users` table within a policy on the `users` table.

If you need admins/vessel managers to list all users, consider:
- Using a security definer function that bypasses RLS
- Storing role in `auth.users` metadata and checking that instead
- Creating a separate admin-only view with different RLS rules

## Testing

After running the script, test by:

1. **Making a payment** - The subscription update should work
2. **Updating profile** - Profile updates should work
3. **Signing up** - New user creation should work

## Troubleshooting

If you still get errors:

1. **Check if RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'users';
   ```
   - `rowsecurity` should be `true`

2. **Check existing policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'users';
   ```

3. **Check user authentication:**
   - Make sure the user is logged in
   - Verify `auth.uid()` returns the correct user ID

4. **Check user ID matches:**
   - The `id` in the `users` table must match `auth.uid()`
   - Run: `SELECT auth.uid(), id FROM users WHERE id = auth.uid();`

## Alternative: Disable RLS (NOT RECOMMENDED)

If you need to temporarily disable RLS for testing:
```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
```

**⚠️ Warning:** This removes all security. Only use for testing, never in production!

