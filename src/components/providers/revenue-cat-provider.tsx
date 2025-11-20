
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
    const init = async () => {
      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;
      if (!apiKey) {
        console.error("RevenueCat API key not found. Please set NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY in your .env file.");
        setRevenueCatState(s => ({ ...s, isReady: true }));
        return;
      }
      // Ensure Purchases is not already configured
      if (!Purchases.isConfigured()) {
        Purchases.setLogLevel(LogLevel.DEBUG);
        try {
          Purchases.configure({ apiKey });
        } catch (e: any) {
          console.error("RevenueCat configuration failed:", e.message);
          return;
        }
      }

      const offerings = await Purchases.getOfferings();
      const customerInfo = await Purchases.getCustomerInfo();
      setRevenueCatState({
        customerInfo: customerInfo,
        offerings: offerings.current,
        isReady: true
      });
    };
    init();
  }, []);

  useEffect(() => {
    const updateUser = async () => {
      // Wait until Firebase user is loaded and RevenueCat is ready
      if (isUserLoading || !revenueCatState.isReady || !Purchases.isConfigured()) {
        return;
      }

      if (user && user.uid) {
        try {
          const { customerInfo } = await Purchases.logIn(user.uid);
          setRevenueCatState(prevState => ({ ...prevState, customerInfo }));
        } catch (error) {
          console.warn("RevenueCat: Could not log in. Trying to restore purchases.", error);
          try {
            const newCustomerInfo = await Purchases.restorePurchases();
            setRevenueCatState(prevState => ({ ...prevState, customerInfo: newCustomerInfo }));
          } catch (e) {
            console.error("RevenueCat: Could not restore purchases.", e);
            toast({
              title: "Restore Purchases Failed",
              description: "We couldn't restore your previous purchases. Please try again.",
              variant: 'destructive',
            })
          }
        }
      } else if (!user) {
        try {
            const { customerInfo } = await Purchases.logOut();
            setRevenueCatState(prevState => ({ ...prevState, customerInfo }));
        } catch(e) {
            console.error("RevenueCat: Failed to log out", e);
        }
      }
    };
    updateUser();
  }, [user, isUserLoading, revenueCatState.isReady, toast]);

  const purchasePackage = async (pkg: PurchasesPackage) => {
    if (!process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY) {
        toast({
            title: "Purchase Inactive",
            description: "Payment system is not configured.",
            variant: "destructive"
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
            variant: "destructive"
         });
       }
    }
  };

  const restorePurchases = async () => {
     if (!process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY) {
      toast({
        title: "Restore Inactive",
        description: "Payment system is not configured.",
        variant: "destructive"
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
        variant: "destructive"
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
