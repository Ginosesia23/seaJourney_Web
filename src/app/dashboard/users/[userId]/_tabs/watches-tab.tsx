'use client';

import { CrewWatchHistorySection } from '@/components/dashboard/crew-watch-history-section';
import { useSupabase } from '@/supabase';

type Props = {
  userId: string;
  crewDisplayName: string;
};

export function WatchesTab({ userId, crewDisplayName }: Props) {
  const { supabase } = useSupabase();
  return (
    <CrewWatchHistorySection
      supabase={supabase}
      vesselId={null}
      crewUserId={userId}
      crewDisplayName={crewDisplayName}
    />
  );
}
