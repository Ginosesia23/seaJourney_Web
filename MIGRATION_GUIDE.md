# Firebase to Supabase Migration Guide

This guide will help you complete the migration from Firebase to Supabase for the SeaJourney application.

## Prerequisites

1. Create a Supabase account at https://supabase.com
2. Create a new project in Supabase
3. Get your project URL and anon key from the Supabase dashboard

## Step 1: Set Up Environment Variables

Add the following environment variables to your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Step 2: Run the Database Schema

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy and paste the contents of `supabase-schema.sql`
4. Run the SQL script to create all tables, indexes, and Row Level Security policies

## Step 3: Migrate Existing Data (Optional)

If you have existing data in Firebase, you'll need to export it and import it into Supabase. Here's a general approach:

1. Export data from Firebase Firestore
2. Transform the data to match the Supabase schema (convert nested collections to flat tables with foreign keys)
3. Import the data into Supabase using the SQL Editor or Supabase dashboard

### Data Transformation Notes

- **Users**: Firebase `users/{userId}` → Supabase `user_profiles` table
- **Vessels**: Firebase `users/{userId}/vessels/{vesselId}` → Supabase `vessels` table with `owner_id` foreign key
- **Sea Service**: Firebase `users/{userId}/vessels/{vesselId}/seaService/{serviceId}` → Supabase `sea_service_records` table with `vessel_id` foreign key
- **State Logs**: Firebase `users/{userId}/vessels/{vesselId}/stateLogs/{dateKey}` → Supabase `state_logs` table with `vessel_id` foreign key and `date` column

## Step 4: Update Components

The following components have been updated to use Supabase:

- ✅ `src/app/layout.tsx` - Uses SupabaseProvider
- ✅ `src/app/login/page.tsx` - Uses Supabase Auth
- ✅ `src/app/signup/page.tsx` - Uses Supabase Auth
- ✅ `src/components/layout/header.tsx` - Uses Supabase Auth
- ✅ `src/components/layout/dashboard-header.tsx` - Uses Supabase Auth
- ✅ `src/lib/types.ts` - Updated to remove Firestore Timestamp

## Step 5: Update Dashboard Pages

The dashboard pages still need to be updated. You'll need to:

1. Replace `useFirestore`, `useCollection`, `useDoc` hooks with Supabase equivalents
2. Replace Firestore batch operations with Supabase queries
3. Update date handling (Firestore Timestamp → ISO strings)

### Example Migration Pattern

**Before (Firebase):**
```typescript
const vesselsCollectionRef = useMemoFirebase(() => 
  user ? collection(firestore, 'users', user.uid, 'vessels') : null, 
  [user, firestore]
);
const { data: vessels } = useCollection<Vessel>(vesselsCollectionRef);
```

**After (Supabase):**
```typescript
const { data: vessels, isLoading } = useCollection<Vessel>(
  'vessels',
  { filter: 'owner_id', filterValue: user?.id }
);
```

## Step 6: Testing

1. Test user registration
2. Test user login
3. Test creating vessels
4. Test creating sea service records
5. Test updating state logs
6. Test all dashboard functionality

## Step 7: Remove Firebase Dependencies (Optional)

Once everything is working, you can remove Firebase dependencies:

```bash
npm uninstall firebase firebase-admin
```

## Important Notes

1. **Row Level Security (RLS)**: Supabase uses RLS policies instead of Firestore rules. The policies are defined in the SQL schema.

2. **Real-time Updates**: Supabase supports real-time subscriptions similar to Firestore. The hooks include real-time support.

3. **Batch Operations**: Supabase doesn't have the same batch API as Firestore. Use transactions or multiple queries instead.

4. **Date Handling**: All dates are stored as ISO strings or timestamps in Supabase, not Firestore Timestamps.

5. **User IDs**: Supabase uses UUIDs for user IDs (from auth.users), which matches Firebase's UID system.

## Troubleshooting

### Authentication Issues
- Make sure your Supabase project has email authentication enabled
- Check that the RLS policies allow the operations you're trying to perform

### Data Not Showing
- Verify that RLS policies are correctly set up
- Check that foreign key relationships are correct
- Ensure data was migrated correctly

### Type Errors
- Update all references to `Timestamp` from `firebase/firestore` to use `string` or `Date`
- Update all Firestore collection/document references to use Supabase table names

## Support

If you encounter issues during migration, check:
- Supabase documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com

