
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Purchases, PurchasesOffering, PurchasesPackage, CustomerInfo, LogLevel } from '@revenuecat/purchases-js';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface RevenueCatContextType {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  isReady: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<void>;
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
      
      // Wait for Firebase user to be loaded
      if (isUserLoading) {
        return;
      }

      Purchases.setLogLevel(LogLevel.DEBUG);

      try {
        if (user) {
           console.log(`RC: about to configure with UID: ${user.uid}`);
           if (!Purchases.isConfigured()) {
             await Purchases.configure({ apiKey, appUserId: user.uid });
             console.log("RC: Configured with UID.");
           } else {
             const currentRCUser = await Purchases.getAppUserID();
             if (currentRCUser !== user.uid) {
               console.log("RC: User changed, logging in new user.");
               await Purchases.logIn(user.uid);
             }
           }
        } else {
          console.log("RC: no user, configuring for anonymous.");
          if (!Purchases.isConfigured()) {
            await Purchases.configure({ apiKey });
            console.log("RC: Configured for anonymous user.");
          } else if (!(await Purchases.isAnonymous())) {
             console.log("RC: User logged out, logging out of RC.");
             await Purchases.logOut();
          }
        }

        const offerings = await Purchases.getOfferings();
        const customerInfo = await Purchases.getCustomerInfo();
        
        setRevenueCatState({
          customerInfo,
          offerings: offerings.current,
          isReady: true,
        });

      } catch (error: any) {
        console.error("RevenueCat initialization or login failed:", error);
        toast({
          title: "Subscription Error",
          description: "Could not connect to the subscription service.",
          variant: "destructive",
        });
        setRevenueCatState((s) => ({ ...s, isReady: true }));
      }
    };

    void initRevenueCat();
  }, [user, isUserLoading, toast]);


  const purchasePackage = async (pkg: PurchasesPackage) => {
    if (!revenueCatState.isReady || !Purchases.isConfigured()) {
      toast({
        title: "Purchase Inactive",
        description: "Payment system is not yet ready.",
        variant: "destructive",
      });
      return;
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      setRevenueCatState(prevState => ({ ...prevState, customerInfo }));
      toast({
        title: "Purchase Successful",
        description: "Your subscription has been activated!",
      });
      router.push('/dashboard');
    } catch (e: any) {
      if (!e.userCancelled) {
        console.error("RevenueCat: Purchase failed.", e);
        toast({
          title: "Purchase Failed",
          description: e.message || "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const restorePurchases = async () => {
    if (!revenueCatState.isReady || !Purchases.isConfigured()) {
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
        description: "We couldn't find any purchases to restore.",
        variant: "destructive",
      });
    }
  };

  return (
    <RevenueCatContext.Provider value={{ ...revenueCatState, purchasePackage, restorePurchases }}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
