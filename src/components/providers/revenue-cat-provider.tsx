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

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<Offerings | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initRC = async () => {
      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_PUBLIC_API_KEY;

      if (!apiKey) {
        console.error('RC Error: RevenueCat API key missing');
        setIsReady(true);
        return;
      }

      // Wait for Firebase auth to resolve
      if (isUserLoading) {
        console.log('RC: Waiting for Firebase user to load…');
        return;
      }

      try {
        Purchases.setLogLevel(LogLevel.DEBUG);

        // Configure ONCE with an appUserId (either Firebase UID or anonymous)
        if (!Purchases.isConfigured()) {
          const appUserId = user
            ? user.uid
            : Purchases.generateRevenueCatAnonymousAppUserId();

          console.log('RC: Configuring SDK with appUserId:', appUserId);

          Purchases.configure({
            apiKey,
            appUserId,
          });
        }

        const purchases = Purchases.getSharedInstance();

        // Fetch customer info + offerings
        console.log('RC: Fetching customerInfo and offerings…');
        const [info, offs] = await Promise.all([
          purchases.getCustomerInfo(),
          purchases.getOfferings(),
        ]);

        console.log('RC: customerInfo:', info);
        console.log('RC: offerings:', offs);

        setCustomerInfo(info);
        setOfferings(offs);
        setIsReady(true);
      } catch (err: any) {
        console.error('RC Error: RevenueCat initialization failed:', err);
        toast({
          title: 'Subscription Error',
          description: err.message || 'Could not connect to subscription service.',
          variant: 'destructive',
        });
        setCustomerInfo(null);
        setOfferings(null);
        setIsReady(true);
      }
    };

    void initRC();
  }, [user, isUserLoading, toast]);

  const restorePurchases = async () => {
    if (!Purchases.isConfigured()) {
      toast({
        title: 'Not ready',
        description: 'Subscription system not initialized yet.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const purchases = Purchases.getSharedInstance();
      const { customerInfo: restoredInfo } = await purchases.restorePurchases();
      setCustomerInfo(restoredInfo);
      toast({
        title: 'Restored',
        description: 'Your purchases have been restored!',
      });
    } catch (err: any) {
      console.error('Restore failed:', err);
      toast({
        title: 'Restore failed',
        description: err.message || 'Unable to restore.',
        variant: 'destructive',
      });
    }
  };

  return (
    <RevenueCatContext.Provider
      value={{ customerInfo, offerings, isReady, restorePurchases }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
};

export default RevenueCatProvider;
