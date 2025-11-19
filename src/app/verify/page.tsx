'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, getDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Loader2, Search, ShieldCheck, ShieldX } from 'lucide-react';
import { format, differenceInDays, fromUnixTime } from 'date-fns';

import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const verificationSchema = z.object({
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
    defaultValues: { verificationCode: '' },
  });

  const handleVerification = async (data: VerificationFormValues) => {
    if (!firestore) return;

    setIsLoading(true);
    setRecord(null);
    setError(null);

    try {
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
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 py-16 sm:py-24">
        <div className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <Card className="rounded-xl">
            <CardHeader className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="mt-4 font-headline text-3xl">Sea Time Verification Portal</CardTitle>
              <CardDescription className="mt-2 text-lg">
                Enter the unique verification code from a SeaJourney document to verify its authenticity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleVerification)} className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name="verificationCode"
                    render={({ field }) => (
                      <FormItem className="flex-grow">
                        <FormLabel className="sr-only">Verification Code</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter code..." {...field} className="h-11 text-base" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" size="lg" className="h-11" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-5 w-5" />
                    )}
                    Verify
                  </Button>
                </form>
              </Form>

              <div className="mt-8">
                {record && (
                  <Alert variant="default" className="border-green-500 bg-green-500/5 text-green-700 dark:text-green-400">
                     <ShieldCheck className="h-5 w-5 text-green-500" />
                    <AlertTitle className="font-bold text-green-600 dark:text-green-500">Record Verified</AlertTitle>
                    <AlertDescription>
                        <div className="mt-4 space-y-2 text-foreground">
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
      </main>
      <Footer />
    </div>
  );
}
