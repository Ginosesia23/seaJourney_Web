
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
// import Purchases, { PurchasesOffering, PurchasesPackage, CustomerInfo, LOG_LEVEL } from 'purchases-react-native';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

// Mock types since the library is removed
type CustomerInfo = any;
type PurchasesOffering = any;
type PurchasesPackage = any;

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
  const { user } = useUser();
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
      console.log("RevenueCatProvider: Skipping initialization as package is not installed.");
      // const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;
      // if (!apiKey) {
      //   console.error("RevenueCat API key not found. Please set NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY in your .env file.");
      //   return;
      // }
      // await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      // await Purchases.configure({ apiKey });

      // const offerings = await Purchases.getOfferings();
      // const customerInfo = await Purchases.getCustomerInfo();
      setRevenueCatState({
        customerInfo: null, // offerings.current,
        offerings: null,
        isReady: true
      });
    };
    init();
  }, []);

  useEffect(() => {
    const updateUser = async () => {
      if (user && revenueCatState.isReady) {
        // try {
        //   const { customerInfo } = await Purchases.logIn(user.uid);
        //   setRevenueCatState(prevState => ({ ...prevState, customerInfo }));
        // } catch (error) {
        //   try {
        //     const newCustomerInfo = await Purchases.restorePurchases();
        //     setRevenueCatState(prevState => ({ ...prevState, customerInfo: newCustomerInfo }));
        //   } catch (e) {
        //     console.error("RevenueCat: Could not restore purchases.", e);
        //     toast({
        //       title: "Restore Purchases Failed",
        //       description: "We couldn't restore your previous purchases. Please try again.",
        //       variant: 'destructive',
        //     })
        //   }
        // }
      } else if (!user && revenueCatState.isReady) {
        // try {
        //     const { customerInfo } = await Purchases.logOut();
        //     setRevenueCatState(prevState => ({ ...prevState, customerInfo }));
        // } catch(e) {
        //     console.error("RevenueCat: Failed to log out", e);
        // }
      }
    };
    updateUser();
  }, [user, revenueCatState.isReady, toast]);

  const purchasePackage = async (pkg: PurchasesPackage) => {
    toast({
        title: "Purchase Inactive",
        description: "Payment system is not configured.",
        variant: "destructive"
     });
    // try {
    //   const { customerInfo } = await Purchases.purchasePackage(pkg);
    //   setRevenueCatState(prevState => ({ ...prevState, customerInfo }));
    //   toast({
    //     title: "Purchase Successful",
    //     description: "Your subscription has been activated!",
    //   });
    //   router.push('/dashboard');
    // } catch (e: any) {
    //    if (!e.userCancelled) {
    //      console.error("RevenueCat: Purchase failed.", e);
    //      toast({
    //         title: "Purchase Failed",
    //         description: e.message || "An unexpected error occurred. Please try again.",
    //         variant: "destructive"
    //      });
    //    }
    // }
  };

  const restorePurchases = async () => {
     toast({
        title: "Restore Inactive",
        description: "Payment system is not configured.",
        variant: "destructive"
      });
    // try {
    //   const restoredCustomerInfo = await Purchases.restorePurchases();
    //   setRevenueCatState(prevState => ({ ...prevState, customerInfo: restoredCustomerInfo }));
    //   toast({
    //     title: "Purchases Restored",
    //     description: "Your purchases have been successfully restored.",
    //   });
    // } catch (e: any) {
    //   console.error("RevenueCat: Restore failed.", e);
    //   toast({
    //     title: "Restore Failed",
    //     description: "We couldn't find any purchases to restore.",
    //     variant: "destructive"
    //   });
    // }
  };

  return (
    <RevenueCatContext.Provider value={{ ...revenueCatState, purchasePackage, restorePurchases }}>
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
