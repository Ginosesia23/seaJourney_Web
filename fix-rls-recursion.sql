-- Fix Infinite Recursion in RLS Policies
-- Run this in your Supabase SQL Editor to fix the recursive policy issue

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Vessel managers and admins can list users" ON users;

-- The remaining policies are safe and don't cause recursion:
-- 1. "Users can read their own profile" - only checks auth.uid() = id (no table query)
-- 2. "Users can update their own profile" - only checks auth.uid() = id (no table query)
-- 3. "Users can create their own profile" - only checks auth.uid() = id (no table query)

-- If you need admins/vessel managers to list all users, you can:
-- Option 1: Use a security definer function (bypasses RLS)
-- Option 2: Store role in auth.users metadata and check that instead
-- Option 3: Create a separate admin-only view with different RLS rules

