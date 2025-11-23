
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2, Search, ShieldCheck, ShieldX } from 'lucide-react';
import { format, fromUnixTime } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LogoOnboarding from '@/components/logo-onboarding';

const verificationSchema = z.object({
  officialId: z.string().min(1, 'Official ID is required.'),
  userId: z.string().min(1, 'User ID is required.'),
  verificationCode: z.string().min(6, 'Verification code must be at least 6 characters.'),
});

type VerificationFormValues = z.infer<typeof verificationSchema>;

interface VerificationRecord {
  id: string;
  userId: string;
  recordType: 'testimonial' | 'seatime_report';
  issuedAt: any; // Firestore Timestamp
  expiresAt: any; // Firestore Timestamp
  data: {
    userName: string;
    vesselName: string;
    position: string;
    startDate: any; // Firestore Timestamp
    endDate: any; // Firestore Timestamp
    totalDays: number;
    seaDays: number;
    leaveDays: number;
  };
}

export default function VerificationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firestore = useFirestore();

  const form = useForm<VerificationFormValues>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { officialId: '', userId: '', verificationCode: '' },
  });

  const handleVerification = async (data: VerificationFormValues) => {
    if (!firestore) return;

    setIsLoading(true);
    setRecord(null);
    setError(null);

    try {
      // For now, we are only using the verification code to find the record.
      // The other IDs are collected for future use.
      const docRef = doc(firestore, 'verificationRecords', data.verificationCode);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const recordData = docSnap.data() as VerificationRecord;
        if (recordData.expiresAt && fromUnixTime(recordData.expiresAt.seconds) < new Date()) {
          setError('This verification code has expired.');
        } else {
          setRecord(recordData);
        }
      } else {
        setError('No record found for this verification code.');
      }
    } catch (e) {
      console.error('Verification failed:', e);
      setError('An error occurred while verifying the record. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8">
        <LogoOnboarding />
      </div>
      <div className="relative w-full max-w-lg p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>
        
        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="mt-4 font-headline text-3xl">Sea Time Verification</CardTitle>
            <CardDescription className="mt-2 text-lg text-muted-foreground">
              Enter the required IDs to verify the record's authenticity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleVerification)} className="space-y-4">
                 <FormField
                  control={form.control}
                  name="officialId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Official ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your official government ID..." {...field} className="h-11 text-base rounded-lg bg-input" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Crew Member ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter the crew member's user ID..." {...field} className="h-11 text-base rounded-lg bg-input" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="verificationCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Verification Code</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter document code from the PDF..." {...field} className="h-11 text-base rounded-lg bg-input" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" size="lg" className="h-11 w-full rounded-lg" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-5 w-5" />
                  )}
                  Verify Record
                </Button>
              </form>
            </Form>

            <div className="mt-8">
              {record && (
                <Alert variant="default" className="border-green-500 bg-green-500/5 text-green-400">
                   <ShieldCheck className="h-5 w-5 text-green-500" />
                  <AlertTitle className="font-bold text-green-500">Record Verified</AlertTitle>
                  <AlertDescription>
                      <div className="mt-4 space-y-2 text-card-foreground">
                          <p><strong>Crew Member:</strong> {record.data.userName}</p>
                          <p><strong>Vessel:</strong> {record.data.vesselName}</p>
                          <p><strong>Position:</strong> {record.data.position}</p>
                          <p><strong>Period:</strong> {format(fromUnixTime(record.data.startDate.seconds), 'PPP')} - {format(fromUnixTime(record.data.endDate.seconds), 'PPP')}</p>
                          <p><strong>Total Days Onboard:</strong> {record.data.totalDays}</p>
                          <p><strong>Sea Days:</strong> {record.data.seaDays}</p>
                           <p className="pt-4 text-xs text-muted-foreground">Issued on: {format(fromUnixTime(record.issuedAt.seconds), 'PPP p')}</p>
                      </div>
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                 <Alert variant="destructive">
                  <ShieldX className="h-5 w-5" />
                  <AlertTitle className="font-bold">Verification Failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
