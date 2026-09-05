'use client';

import * as React from 'react';
import { useSupabase } from '@/supabase';
import { bearerHeaders } from '@/lib/applications/client';
import {
  CERTIFICATE_PRESETS,
  type CertificatePreset,
} from '@/lib/certificates/presets';

export function useCertificateCatalog(opts?: { includeOther?: boolean }) {
  const includeOther = opts?.includeOther !== false;
  const { session } = useSupabase();
  const [presets, setPresets] = React.useState<CertificatePreset[]>(CERTIFICATE_PRESETS);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setPresets(CERTIFICATE_PRESETS);
      setIsLoading(false);
      return;
    }
    try {
      const qs = includeOther ? '' : '?includeOther=0';
      const res = await fetch(`/api/certificate-catalog${qs}`, {
        headers: bearerHeaders(token),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.presets) && json.presets.length > 0) {
        setPresets(json.presets);
      } else {
        setPresets(CERTIFICATE_PRESETS);
      }
    } catch {
      setPresets(CERTIFICATE_PRESETS);
    } finally {
      setIsLoading(false);
    }
  }, [includeOther, session?.access_token]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const getById = React.useCallback(
    (id: string) => presets.find((p) => p.id === id),
    [presets],
  );

  return { presets, isLoading, refresh, getById };
}
