'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  Purchases,
  type CustomerInfo,
  type Offerings,
  LogLevel,
} from '@revenuecat/purchases-js';

import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

interface RevenueCatContextType {
  customerInfo: CustomerInfo | null;
  offerings: Offerings | null;
  isReady: boolean;
  restorePurchases: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export const useRevenueCat = () => {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
};

const RevenueCatProvider = ({ children }: { children: ReactNode }) => {
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const [revenueCatState, setRevenueCatState] = useState<{
    customerInfo: CustomerInfo | null;
    offerings: Offerings | null;
    isReady: boolean;
  }>({
    customerInfo: null,
    offerings: null,
    isReady: false,
  });

  useEffect(() => {
    const initRC = async () => {
      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;

      if (!apiKey) {
        console.error('RevenueCat API key missing');
        setRevenueCatState((s) => ({ ...s, isReady: true }));
        return;
      }

      // Wait until Firebase auth resolves
      if (isUserLoading) return;

      try {
        // Always set log level
        Purchases.setLogLevel(LogLevel.DEBUG);

        // --- 1) FORCE CLEAR ANY INVALID CACHED USER BEFORE FIRST CONFIGURE ---
        if (!Purchases.isConfigured()) {
          console.log("RC: Pre-configure cache cleanup (logOut)");
          await Purchases.logOut().catch(() => {});
        }

        // --- 2) CONFIGURE (ONLY ONCE) ---
        if (!Purchases.isConfigured()) {
          console.log("RC: Configuring RevenueCat…");
          Purchases.configure({ apiKey });
        }

        // Get instance for web SDK
        const purchases = Purchases.getSharedInstance();

        let customerInfo: CustomerInfo;

        // --- 3) LOGGED IN USER ---
        if (user && user.uid) {
          console.log("RC: Logging in user:", user.uid);

          // Guard against accidental bad uid
          if (
            user.uid === '[Not provided]' ||
            user.uid === '' ||
            typeof user.uid !== 'string'
          ) {
            console.warn("RC: Invalid UID detected, skipping RC login:", user.uid);
            setRevenueCatState((s) => ({ ...s, isReady: true }));
            return;
          }

          const loginResult = await purchases.logIn(user.uid);
          customerInfo = loginResult.customerInfo;
        }

        // --- 4) ANONYMOUS USER ---
        else {
          console.log("RC: Anonymous user (not logged in)");
          if (!purchases.isAnonymous()) {
            await purchases.logOut().catch(() => {});
          }
          customerInfo = await purchases.getCustomerInfo();
        }

        // --- 5) FETCH OFFERINGS ---
        const offerings = await purchases.getOfferings();

        console.log("RC: CustomerInfo:", customerInfo);
        console.log("RC: Offerings:", offerings);

        setRevenueCatState({
          customerInfo,
          offerings,
          isReady: true,
        });

      } catch (err: any) {
        console.error("RevenueCat initialization failed:", err);

        toast({
          title: "Subscription Error",
          description: err.message || "RevenueCat could not initialize.",
          variant: "destructive",
        });

        setRevenueCatState({
          customerInfo: null,
          offerings: null,
          isReady: true,
        });
      }
    };

    void initRC();
  }, [user, isUserLoading, toast]);

  // --- RESTORE PURCHASES ---
  const restorePurchases = async () => {
    if (!Purchases.isConfigured()) {
      toast({
        title: "Not ready",
        description: "Subscription system not initialized yet.",
        variant: "destructive",
      });
      return;
    }

    try {
      const purchases = Purchases.getSharedInstance();
      const restored = await purchases.restorePurchases();
      setRevenueCatState((s) => ({ ...s, customerInfo: restored }));
      toast({
        title: "Restored",
        description: "Your purchases have been restored!",
      });
    } catch (err: any) {
      console.error("Restore failed:", err);
      toast({
        title: "Restore failed",
        description: err.message || "Unable to restore.",
        variant: "destructive",
      });
    }
  };

  return (
    <RevenueCatContext.Provider
      value={{ ...revenueCatState, restorePurchases }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
