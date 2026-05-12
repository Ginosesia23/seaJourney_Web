'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { createSupabaseClient } from './client';
import type { User, Session } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';

interface SupabaseProviderProps {
  children: ReactNode;
}

interface SupabaseContextState {
  supabase: SupabaseClient | null;
  user: User | null;
  session: Session | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export const SupabaseContext = createContext<SupabaseContextState | undefined>(undefined);

export interface SupabaseServicesAndUser {
  supabase: SupabaseClient;
  user: User | null;
  session: Session | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export interface UserHookResult {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [userError, setUserError] = useState<Error | null>(null);

  const supabase = useMemo(() => {
    try {
      return createSupabaseClient();
    } catch (error) {
      console.error('Failed to create Supabase client:', error);
      setUserError(error instanceof Error ? error : new Error('Failed to initialize Supabase client'));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsUserLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
        setUserError(error);
        setIsUserLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsUserLoading(false);
    });

    // Listen for auth changes. IMPORTANT: when the browser tab regains
    // focus Supabase fires `TOKEN_REFRESHED` with a *new* session object
    // whose `user` has the same id but a different reference. If we blindly
    // call `setUser` every time, every downstream hook that depends on the
    // user object (e.g. `useDoc`) will re-run its effect, flip back to
    // loading, and refetch — which the user experiences as the whole page
    // reloading every time they switch browser tabs.
    //
    // To prevent that we update `session` as needed (we still want the
    // fresh access_token for API calls), but only call `setUser` when the
    // user id actually changes — i.e. true sign-in / sign-out / user switch.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      const newUser = newSession?.user ?? null;
      setSession(newSession);
      setUser((prev) => {
        if ((prev?.id ?? null) === (newUser?.id ?? null)) {
          // Same identity — preserve the existing reference so downstream
          // effects keyed on `user` don't re-fire on every token refresh.
          return prev;
        }
        return newUser;
      });
      setIsUserLoading(false);
      setUserError(null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const contextValue = useMemo(
    (): SupabaseContextState => ({
      supabase,
      user,
      session,
      isUserLoading,
      userError,
    }),
    [supabase, user, session, isUserLoading, userError]
  );

  return <SupabaseContext.Provider value={contextValue}>{children}</SupabaseContext.Provider>;
};

export const useSupabase = (): SupabaseServicesAndUser => {
  const context = useContext(SupabaseContext);

  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider.');
  }

  if (!context.supabase) {
    throw new Error('Supabase client not available.');
  }

  return {
    supabase: context.supabase,
    user: context.user,
    session: context.session,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
};

export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError } = useSupabase();
  return { user, isUserLoading, userError };
};

