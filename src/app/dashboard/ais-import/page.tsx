'use client';

import { useState, useEffect } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Database, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Ship,
  Route,
  Navigation,
  Zap,
  Wrench
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { UserProfile, Vessel } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function AISImportPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch user profile
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile
  const userProfile = userProfileRaw ? {
    ...userProfileRaw,
    activeVesselId: (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId,
    role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
  } as UserProfile : null;

  const isVesselManager = userProfile?.role === 'vessel';
  const activeVesselId = userProfile?.activeVesselId;

  // Fetch vessel data
  const { data: vesselData } = useDoc<Vessel>('vessels', activeVesselId || null);

  useEffect(() => {
    if (!isLoadingProfile) {
      setIsLoading(false);
      
      // Redirect if not vessel manager
      if (userProfile && !isVesselManager) {
        router.push('/dashboard');
        return;
      }
    }
  }, [isLoadingProfile, userProfile, isVesselManager, router]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.csv', '.json', '.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a CSV, JSON, or Excel file.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // TODO: Implement AIS data import logic
      // This is a placeholder for the actual implementation
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate upload

      toast({
        title: 'File Uploaded',
        description: 'Your AIS data file has been uploaded successfully. Processing will begin shortly.',
      });
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading || isLoadingProfile) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isVesselManager) {
    return null; // Will redirect
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AIS Data Import</h1>
            <p className="text-muted-foreground">
              Import your vessel's historical AIS data to automatically populate sea service records
            </p>
          </div>
        </div>
      </div>

      {/* Development Status */}
      <Alert className="border-purple-500/50 bg-purple-500/10">
        <Wrench className="h-4 w-4 text-purple-500" />
        <AlertTitle className="text-purple-500">Feature in Development</AlertTitle>
        <AlertDescription className="text-purple-200">
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Development Progress</span>
              <span className="text-sm font-semibold">32%</span>
            </div>
            <Progress value={32} className="h-2 bg-purple-900/30" />
            <p className="text-xs mt-2">This feature is currently in development and will be available soon.</p>
          </div>
        </AlertDescription>
      </Alert>

      {/* Main Content */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle>Upload AIS Data</CardTitle>
            <CardDescription>
              Upload your vessel's AIS data file to import historical records
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Drop your file here or click to browse</p>
                <p className="text-xs text-muted-foreground">
                  Supported formats: CSV, JSON, Excel (.xlsx, .xls)
                </p>
              </div>
              <input
                type="file"
                id="ais-file-upload"
                className="hidden"
                accept=".csv,.json,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={true}
              />
              <Button
                onClick={() => document.getElementById('ais-file-upload')?.click()}
                disabled={true}
                className="mt-4"
              >
                <Upload className="mr-2 h-4 w-4" />
                Select File (Coming Soon)
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                File upload is currently disabled while this feature is being developed.
              </p>
            </div>

            {vesselData && (
              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Ship className="h-4 w-4" />
                  <span>Importing for: <strong className="text-foreground">{vesselData.name}</strong></span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features & Info */}
        <Card>
          <CardHeader>
            <CardTitle>What Gets Imported</CardTitle>
            <CardDescription>
              Your AIS data will be processed to create the following records
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  icon: Route,
                  title: 'Past Passages',
                  description: 'Complete passage history with departure/arrival ports and dates',
                  color: 'text-blue-500',
                },
                {
                  icon: Navigation,
                  title: 'Vessel States',
                  description: 'Automatic vessel state logs (underway, at anchor, in port)',
                  color: 'text-purple-500',
                },
                {
                  icon: Zap,
                  title: 'Historical Data',
                  description: 'Backfill years of operational data instantly',
                  color: 'text-green-500',
                },
              ].map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border">
                    <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`h-5 w-5 ${feature.color}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm">{feature.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Requirements</h4>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>AIS data file in supported format</li>
                <li>Data must include timestamps and vessel positions</li>
                <li>File size limit: 50MB</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Learn more about AIS data import and supported formats
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="outline" asChild>
              <a href="/for-vessels" target="_blank" rel="noopener noreferrer">
                <FileText className="mr-2 h-4 w-4" />
                Documentation
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/dashboard/feedback">
                <AlertCircle className="mr-2 h-4 w-4" />
                Contact Support
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
