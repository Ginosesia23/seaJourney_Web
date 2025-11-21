
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Purchases, PurchasesOffering, CustomerInfo, LogLevel } from '@revenuecat/purchases-js';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface RevenueCatContextType {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
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
  const router = useRouter();

  const [revenueCatState, setRevenueCatState] = useState<{
    customerInfo: CustomerInfo | null;
    offerings: PurchasesOffering | null;
    isReady: boolean;
  }>({
    customerInfo: null,
    offerings: null,
    isReady: false,
  });

  useEffect(() => {
    const initRevenueCat = async () => {
      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;
      if (!apiKey) {
        console.error("RevenueCat API key not found. Purchases will be disabled.");
        setRevenueCatState(s => ({ ...s, isReady: true }));
        return;
      }
      
      if (isUserLoading) {
        return;
      }

      Purchases.setLogLevel(LogLevel.DEBUG);
      
      let purchases: Purchases;
      if (user) {
        console.log(`RC: Configuring for user: ${user.uid}`);
        purchases = new Purchases(apiKey, user.uid);
      } else {
        console.log("RC: Configuring for anonymous user.");
        purchases = new Purchases(apiKey);
      }

      try {
        const customerInfo = await purchases.getCustomerInfo();
        const offerings = await purchases.getOfferings();
        
        setRevenueCatState({
          customerInfo,
          offerings: offerings.current,
          isReady: true,
        });

      } catch (error: any) {
        console.error("RevenueCat initialization failed:", error);
        toast({
          title: "Subscription Error",
          description: "Could not connect to the subscription service.",
          variant: "destructive",
        });
        setRevenueCatState((s) => ({ ...s, isReady: true, customerInfo: null, offerings: null }));
      }
    };

    void initRevenueCat();
  }, [user, isUserLoading, toast]);

  const restorePurchases = async () => {
    if (!revenueCatState.isReady) {
      toast({
        title: "Restore Inactive",
        description: "Payment system is not yet ready.",
        variant: "destructive",
      });
      return;
    }
    try {
      // Restore logic will need to re-initialize an instance if not available
      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;
      if (!apiKey) {
        throw new Error("RevenueCat API key not configured for restore.");
      }
      const purchases = new Purchases(apiKey, user?.uid);
      const restoredCustomerInfo = await purchases.restorePurchases();

      setRevenueCatState(prevState => ({ ...prevState, customerInfo: restoredCustomerInfo }));
      toast({
        title: "Purchases Restored",
        description: "Your purchases have been successfully restored.",
      });
    } catch (e: any) {
      console.error("RevenueCat: Restore failed.", e);
      toast({
        title: "Restore Failed",
        description: "We couldn't find any purchases to restore.",
        variant: "destructive",
      });
    }
  };

  return (
    <RevenueCatContext.Provider value={{ ...revenueCatState, restorePurchases }}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
