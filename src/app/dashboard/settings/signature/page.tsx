'use client';

import { useState, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { SignaturePad } from '@/components/signature-pad';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function SignatureSettingsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch user profile
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    console.log('[SIGNATURE PAGE] User profile:', {
      id: userProfileRaw.id,
      role: role,
      allKeys: Object.keys(userProfileRaw),
      hasSignatureField: 'signature' in userProfileRaw,
    });
    return {
      ...userProfileRaw,
      role: role,
      signature: (userProfileRaw as any).signature || null,
    } as UserProfile;
  }, [userProfileRaw]);

  const isCaptain = userProfile?.role === 'captain';
  
  console.log('[SIGNATURE PAGE] Access check:', {
    userId: user?.id,
    userRole: userProfile?.role,
    isCaptain,
    isLoadingProfile,
  });

  const handleSaveSignature = async (signatureDataUrl: string) => {
    if (!user?.id) {
      toast({
        title: 'Authentication error',
        description: 'User not authenticated',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // If signatureDataUrl is empty, delete the signature
      const signatureValue = signatureDataUrl === '' ? null : signatureDataUrl;

      console.log('[SIGNATURE] Saving signature for user:', user.id, {
        hasSignature: !!signatureValue,
        signatureLength: signatureValue?.length || 0,
        signaturePreview: signatureValue?.substring(0, 50)
      });

      const { error, data } = await supabase
        .from('users')
        .update({ 
          signature: signatureValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select();

      if (error) {
        console.error('[SIGNATURE] Error saving signature:', error);
        toast({
          title: 'Error',
          description: `Failed to save signature: ${error.message}`,
          variant: 'destructive',
        });
        return;
      }

      console.log('[SIGNATURE] Signature saved successfully:', {
        updatedRows: data?.length || 0,
        hasSignatureInResponse: !!data?.[0]?.signature
      });

      toast({
        title: 'Success',
        description: signatureValue ? 'Signature saved successfully' : 'Signature deleted successfully',
      });
      
      // Refresh the page to show updated signature
      router.refresh();
    } catch (error) {
      console.error('Error saving signature:', error);
      toast({
        title: 'Error',
        description: 'Failed to save signature',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!isCaptain) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">Digital Signature</h1>
          <p className="text-muted-foreground">
            Manage your digital signature for crew testimonials
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This feature is only available for captain accounts. Digital signatures are used to approve crew testimonials.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Digital Signature</h1>
        <p className="text-muted-foreground">
          Manage your digital signature for crew testimonials
        </p>
      </div>

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          Your signature will appear on approved testimonials for crew members. You can either draw your signature using the canvas or upload an image of your signature.
        </AlertDescription>
      </Alert>

      <SignaturePad
        onSave={handleSaveSignature}
        existingSignature={userProfile?.signature}
        isLoading={isLoading}
      />
    </div>
  );
}

