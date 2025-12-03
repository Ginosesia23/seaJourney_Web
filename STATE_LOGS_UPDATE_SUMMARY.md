# State Logs Table Format Update

## New Table Format

The `state_logs` table now uses the following format:

- `id`: uuid (primary key)
- `user_id`: uuid (required, references auth.users)
- `vessel_id`: uuid (required, references vessels)
- `state`: text (required)
- `log_date`: date (required, renamed from `date`)
- `created_at`: timestamptz (required, default NOW())
- `updated_at`: timestamptz (required, default NOW())

Unique constraint: `(user_id, vessel_id, log_date)`

## Changes Made

### 1. TypeScript Types (`src/lib/types.ts`)
- Updated `StateLog` interface to match new format:
  - `id`: string (UUID)
  - `userId`: string (UUID)
  - `vesselId`: string (UUID)
  - `state`: DailyStatus
  - `logDate`: string (YYYY-MM-DD format)
  - `createdAt?`: string (ISO timestamp)
  - `updatedAt?`: string (ISO timestamp)

### 2. Database Schema (`supabase-schema.sql`)
- Updated `state_logs` table definition
- Added `user_id` column
- Renamed `date` to `log_date`
- Updated unique constraint to include `user_id`
- Updated indexes
- Updated RLS policies to check `user_id`

### 3. Database Queries (`src/supabase/database/queries.ts`)
- Updated `getVesselStateLogs()` to:
  - Accept optional `userId` parameter
  - Query `log_date` instead of `date`
  - Transform data to match TypeScript interface
- Updated `updateStateLogsBatch()` to:
  - Require `userId` parameter
  - Use `logDate` in input
  - Map to `log_date` in database
  - Use new unique constraint

### 4. Migration Script (`update-state-logs-table-format.sql`)
- Created migration script to update existing table
- Renames `date` to `log_date`
- Adds `user_id` column
- Updates constraints and indexes
- Updates RLS policies

## Code Updates

### Files that have been updated:

1. ✅ **src/app/dashboard/current/page.tsx**
   - Updated `updateStateLogsBatch` calls to include `userId` and use `logDate`
   - Changed from `useCollection` to `getVesselStateLogs` for proper data transformation
   - Updated references from `log.id === dateKey` to `log.logDate === dateKey`
   - All state log operations now use the new format

### Files that still need updates:

2. **src/app/dashboard/history/page.tsx**
   - Update `getVesselStateLogs` calls to pass `userId` (already accepts optional userId)
   - Update references from `date` to `logDate` if used

3. **src/app/dashboard/vessels/page.tsx**
   - Update `getVesselStateLogs` calls to pass `userId` (already accepts optional userId)
   - Update references from `date` to `logDate` if used

4. **src/app/dashboard/page.tsx**
   - Update `getVesselStateLogs` calls to pass `userId` (already accepts optional userId)
   - Update references from `date` to `logDate` if used

5. **src/app/actions.ts**
   - Update state logs queries to use new column names (`log_date` instead of `date`)
   - Add `user_id` filtering where needed
   - Transform data appropriately

## Helper Function

✅ Created `transformStateLog()` helper function in `src/supabase/database/queries.ts`:
- Transforms database records (snake_case) to TypeScript interface (camelCase)
- Supports both old (`date`) and new (`log_date`) column names during migration
- Used automatically in `getVesselStateLogs()` function

## Migration Steps

1. Run the migration script `update-state-logs-table-format.sql` in Supabase SQL Editor
2. Populate `user_id` for existing records (if any)
3. Set `user_id` to NOT NULL (uncomment in migration script)
4. Update all TypeScript code to use new format
5. Test all state log operations

