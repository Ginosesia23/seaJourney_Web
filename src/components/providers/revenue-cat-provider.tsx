
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Purchases, type PurchasesOffering, type CustomerInfo, LogLevel, type Offerings } from '@revenuecat/purchases-js';
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

      // Configure the SDK
      Purchases.setLogLevel(LogLevel.DEBUG);
      Purchases.configure({ apiKey });

      try {
        let customerInfo: CustomerInfo;
        
        if (user) {
          console.log(`RC: Logging in user: ${user.uid}`);
          const loginResult = await Purchases.logIn(user.uid);
          customerInfo = loginResult.customerInfo;
        } else {
          console.log("RC: User is anonymous or logged out.");
           if (!Purchases.isAnonymous()) {
            await Purchases.logOut();
          }
          customerInfo = await Purchases.getCustomerInfo();
        }

        const offerings = await Purchases.getOfferings();
        
        console.log('RevenueCat Offerings:', offerings);
        console.log('RevenueCat CustomerInfo:', customerInfo);

        setRevenueCatState({
          customerInfo,
          offerings,
          isReady: true,
        });

      } catch (error: any) {
        console.error("RevenueCat initialization or login failed:", error);
        toast({
          title: "Subscription Error",
          description: error.message || "Could not connect to the subscription service.",
          variant: "destructive",
        });
        setRevenueCatState((s) => ({ ...s, isReady: true, customerInfo: null, offerings: null }));
      }
    };

    void initRevenueCat();
  }, [user, isUserLoading, toast]);

  const restorePurchases = async () => {
    if (!Purchases.isConfigured()) {
        toast({
            title: "Restore Inactive",
            description: "Payment system is not yet ready.",
            variant: "destructive",
        });
        return;
    }
    try {
        const restoredCustomerInfo = await Purchases.restorePurchases();
        setRevenueCatState(prevState => ({ ...prevState, customerInfo: restoredCustomerInfo }));
        toast({
            title: "Purchases Restored",
            description: "Your purchases have been successfully restored.",
        });
    } catch (e: any) {
        console.error("RevenueCat: Restore failed.", e);
        toast({
            title: "Restore Failed",
            description: e.message || "We couldn't find any purchases to restore.",
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
