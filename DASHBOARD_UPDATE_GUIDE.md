# Dashboard Pages Update Guide

This guide provides examples for updating dashboard pages from Firebase to Supabase.

## Common Patterns

### 1. Replacing Firestore Collections

**Before (Firebase):**
```typescript
const vesselsCollectionRef = useMemoFirebase(() => 
  user ? collection(firestore, 'users', user.uid, 'vessels') : null, 
  [firestore, user?.uid]
);
const { data: vessels, isLoading } = useCollection<Vessel>(vesselsCollectionRef);
```

**After (Supabase):**
```typescript
import { useCollection } from '@/supabase/database';

const { data: vessels, isLoading } = useCollection<Vessel>(
  'vessels',
  { 
    filter: 'owner_id', 
    filterValue: user?.id,
    orderBy: 'created_at',
    ascending: false
  }
);
```

### 2. Replacing Firestore Documents

**Before (Firebase):**
```typescript
const userProfileRef = useMemoFirebase(() => 
  user ? doc(firestore, 'users', user.uid) : null, 
  [firestore, user?.uid]
);
const { data: userProfile } = useDoc<UserProfile>(userProfileRef);
```

**After (Supabase):**
```typescript
import { useDoc } from '@/supabase/database';

const { data: userProfile, isLoading } = useDoc<UserProfile>(
  'users',
  user?.id
);
```

### 3. Creating Documents

**Before (Firebase):**
```typescript
const newVessel = { name: 'Vessel Name', type: 'Yacht', ownerId: user.uid };
await addDoc(vesselsCollectionRef, newVessel);
```

**After (Supabase):**
```typescript
import { createVessel } from '@/supabase/database/queries';

await createVessel(supabase, {
  ownerId: user.id,
  name: 'Vessel Name',
  type: 'Yacht',
});
```

### 4. Batch Operations

**Before (Firebase):**
```typescript
const batch = writeBatch(firestore);
batch.set(docRef1, data1);
batch.set(docRef2, data2);
await batch.commit();
```

**After (Supabase):**
```typescript
// Option 1: Use Supabase transaction (if needed)
const { error } = await supabase.rpc('transaction_function', { ... });

// Option 2: Use helper functions that handle multiple operations
import { updateStateLogsBatch } from '@/supabase/database/queries';
await updateStateLogsBatch(supabase, vesselId, logs);
```

### 5. Updating Documents

**Before (Firebase):**
```typescript
await updateDoc(docRef, { notes: 'New notes' });
```

**After (Supabase):**
```typescript
const { error } = await supabase
  .from('sea_service_records')
  .update({ notes: 'New notes' })
  .eq('id', recordId);
```

### 6. Date Handling

**Before (Firebase):**
```typescript
import { Timestamp } from 'firebase/firestore';
startDate: Timestamp.fromDate(data.startDate)
// Reading
const date = fromUnixTime(timestamp.seconds);
```

**After (Supabase):**
```typescript
// Writing
startDate: data.startDate.toISOString()
// Reading
const date = new Date(isoString);
```

### 7. Querying Nested Data

**Before (Firebase):**
```typescript
const serviceRef = collection(firestore, 'users', user.uid, 'vessels', vesselId, 'seaService');
const logsRef = collection(firestore, 'users', user.uid, 'vessels', vesselId, 'stateLogs');
```

**After (Supabase):**
```typescript
import { getVesselSeaService, getVesselStateLogs } from '@/supabase/database/queries';

const seaService = await getVesselSeaService(supabase, vesselId);
const stateLogs = await getVesselStateLogs(supabase, vesselId);
```

## Example: Updating current/page.tsx

Here's how to update the main parts of `current/page.tsx`:

```typescript
// Replace imports
import { useSupabase, useUser } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { 
  getUserProfile, 
  createVessel, 
  createSeaServiceRecord,
  updateStateLogsBatch,
  updateUserProfile 
} from '@/supabase/database/queries';

// In component
const { supabase } = useSupabase();
const { user } = useUser();

// Replace vessel collection
const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
  'vessels',
  { filter: 'owner_id', filterValue: user?.id }
);

// Replace user profile
const { data: userProfile, isLoading: isLoadingProfile } = useDoc<UserProfile>(
  'user_profiles',
  user?.id
);

// Replace sea service record
const { data: currentService } = useDoc<SeaServiceRecord>(
  'sea_service_records',
  userProfile?.activeSeaServiceId
);

// Replace state logs
const { data: stateLogs } = useCollection<StateLog>(
  'state_logs',
  { 
    filter: 'vessel_id', 
    filterValue: currentVessel?.id,
    orderBy: 'date',
    ascending: true
  }
);

// Update create vessel function
async function onAddVesselSubmit(data: AddVesselFormValues) {
  if (!user?.id) return;
  setIsSavingVessel(true);
  try {
    await createVessel(supabase, {
      ownerId: user.id,
      name: data.name,
      type: data.type,
      officialNumber: data.officialNumber,
    });
    addVesselForm.reset();
    setIsAddVesselDialogOpen(false);
  } catch (error) {
    console.error('Error creating vessel:', error);
    toast({
      title: 'Error',
      description: 'Failed to create vessel',
      variant: 'destructive',
    });
  } finally {
    setIsSavingVessel(false);
  }
}

// Update date handling
const startDate = currentService 
  ? new Date(currentService.startDate) 
  : null;
```

## Tips

1. **Use helper functions**: The `queries.ts` file provides helper functions for common operations
2. **Handle errors**: Always wrap Supabase operations in try-catch blocks
3. **Loading states**: The hooks provide `isLoading` states automatically
4. **Real-time**: Real-time subscriptions are enabled by default in the hooks
5. **Type safety**: Keep using TypeScript types, they work the same way

