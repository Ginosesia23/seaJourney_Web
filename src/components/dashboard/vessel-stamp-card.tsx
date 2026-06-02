'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Stamp, Upload, Trash2, Loader2, FileImage } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_EXTENSIONS = 'PNG, JPG, JPEG';

interface VesselStampCardProps {
  vesselId: string | undefined;
  vesselName?: string | null;
  stamp?: string | null;
  isLoading?: boolean;
  /** Called after a successful save so the parent can refresh its vessel data. */
  onSaved?: () => void;
}

export function VesselStampCard({
  vesselId,
  vesselName,
  stamp,
  isLoading = false,
  onSaved,
}: VesselStampCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { toast } = useToast();

  const persistStamp = async (stampValue: string | null) => {
    if (!vesselId) {
      toast({
        title: 'No vessel',
        description: 'Cannot save the stamp because no vessel is loaded.',
        variant: 'destructive',
      });
      return;
    }

    const response = await fetch('/api/vessels/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vesselId,
        updates: { stamp: stampValue },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Failed to save vessel stamp');
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image (PNG or JPG).',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: 'File too large',
        description: 'Stamp images must be 2 MB or smaller.',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;
      setIsSaving(true);
      try {
        await persistStamp(dataUrl);
        toast({
          title: 'Stamp saved',
          description: 'Your ship\u2019s stamp will now appear on generated documents.',
        });
        onSaved?.();
      } catch (error: any) {
        toast({
          title: 'Could not save stamp',
          description: error?.message || 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await persistStamp(null);
      toast({
        title: 'Stamp removed',
        description: 'Documents will no longer include the ship\u2019s stamp.',
      });
      onSaved?.();
    } catch (error: any) {
      toast({
        title: 'Could not remove stamp',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Card className="rounded-xl border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stamp className="h-5 w-5" />
          Ship&rsquo;s Stamp
        </CardTitle>
        <CardDescription>
          Upload your vessel&rsquo;s official stamp. It will be automatically added to testimonials and
          other generated documents in the &ldquo;Ship&rsquo;s Stamp&rdquo; field.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-9 w-40" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-6 min-h-[180px]">
              {stamp ? (
                <img
                  src={stamp}
                  alt={vesselName ? `${vesselName} ship\u2019s stamp` : 'Ship\u2019s stamp'}
                  className="max-h-40 max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center text-center text-sm text-muted-foreground">
                  <FileImage className="h-8 w-8 mb-2 opacity-60" />
                  <p>No stamp uploaded yet</p>
                  <p className="text-xs mt-1">
                    A clear scan of your ship&rsquo;s stamp on a white background works best.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vessel-stamp-upload" className="sr-only">
                Upload ship&rsquo;s stamp
              </Label>
              <Input
                ref={fileInputRef}
                id="vessel-stamp-upload"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                disabled={isSaving || isRemoving}
                className="hidden"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving || isRemoving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving&hellip;
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      {stamp ? 'Replace stamp' : 'Upload stamp'}
                    </>
                  )}
                </Button>
                {stamp && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemove}
                    disabled={isSaving || isRemoving}
                  >
                    {isRemoving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Removing&hellip;
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </>
                    )}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Accepted formats: {ACCEPTED_EXTENSIONS}. Max size 2&nbsp;MB. Use a transparent or
                white background for the cleanest result on documents.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
