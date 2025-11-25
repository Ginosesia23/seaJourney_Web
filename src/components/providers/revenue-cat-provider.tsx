
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
        console.error('RC Error: RevenueCat API key missing');
        setRevenueCatState((s) => ({ ...s, isReady: true }));
        return;
      }
      
      if (isUserLoading) {
        console.log("RC: Waiting for Firebase user to load...");
        return;
      }
      
      console.log("RC: Firebase user loaded, proceeding with RevenueCat init.");

      try {
        if (!Purchases.isConfigured()) {
            console.log("RC: Configuring RevenueCat SDK...");
            Purchases.setLogLevel(LogLevel.DEBUG);
            Purchases.configure({ apiKey });
        }
        
        const purchases = Purchases.getSharedInstance();
        let customerInfo: CustomerInfo | null = null;
        let offerings: Offerings | null = null;

        if (user) {
          console.log("RC: User is logged in, calling logIn with UID:", user.uid);
          const loginResult = await purchases.logIn(user.uid);
          customerInfo = loginResult.customerInfo;
          console.log("RC: LogIn successful. CustomerInfo retrieved:", customerInfo);
        } else {
          console.log("RC: User is anonymous. Getting customer info.");
          if (!purchases.isAnonymous()) {
            console.log("RC: Previous user existed, logging out.");
            await purchases.logOut();
            console.log("RC: Logout successful.");
          }
          customerInfo = await purchases.getCustomerInfo();
          console.log("RC: Anonymous CustomerInfo retrieved:", customerInfo);
        }

        console.log("RC: Fetching offerings...");
        offerings = await purchases.getOfferings();
        console.log("RC: Offerings fetched:", offerings);

        setRevenueCatState({
          customerInfo,
          offerings,
          isReady: true,
        });

      } catch (err: any) {
        console.error("RC Error: RevenueCat initialization failed:", err);
        toast({
          title: "Subscription Error",
          description: err.message || "Could not connect to subscription service.",
          variant: "destructive",
        });
        setRevenueCatState({
          customerInfo: null,
          offerings: null,
          isReady: true, // Set to ready even on error to unblock UI
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
      const { customerInfo: restoredInfo } = await purchases.restorePurchases();
      setRevenueCatState((s) => ({ ...s, customerInfo: restoredInfo }));
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
