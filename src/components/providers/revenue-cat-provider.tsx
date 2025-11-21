
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
      // 1. Get API key
      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;
      if (!apiKey) {
        console.error("RevenueCat API key not found. Purchases will be disabled.");
        setRevenueCatState(s => ({ ...s, isReady: true }));
        return;
      }
      
      // 2. Always wait for Firebase to finish loading
      if (isUserLoading) {
        return;
      }

      // 3. We have a user, so configure and log them in
      if (user && user.uid) {
        try {
          // Check if already configured, otherwise configure
          if (!Purchases.isConfigured()) {
            Purchases.configure({
              apiKey,
            });
            console.log("RC: Configured with API key.");
          }
          
          const logInResult = await Purchases.logIn(user.uid);
          console.log("RC: Logged in with UID:", user.uid);
          
          const offerings = await Purchases.getOfferings();
          
          setRevenueCatState({
            customerInfo: logInResult.customerInfo,
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
      }
      // 4. No user, handle anonymous state or log out
      else {
        try {
          if (!Purchases.isConfigured()) {
             Purchases.configure({apiKey});
          }
          
          // If a user was logged in, log them out. Otherwise, we can treat as anonymous.
          if (!(await Purchases.isAnonymous())) {
             console.log("RC: no user, logging out");
            const customerInfo = await Purchases.logOut();
            setRevenueCatState({ customerInfo, offerings: null, isReady: true });
          } else {
             console.log("RC: no user, already anonymous.");
             const offerings = await Purchases.getOfferings();
             const customerInfo = await Purchases.getCustomerInfo();
             setRevenueCatState({ customerInfo, offerings: offerings.current, isReady: true });
          }
        } catch (error) {
          console.error("RevenueCat anonymous/logout failed:", error);
          setRevenueCatState(s => ({...s, isReady: true }));
        }
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
