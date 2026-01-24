'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Pencil, Upload, Trash2, Save, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SignaturePadProps {
  onSave?: (signatureDataUrl: string) => void; // Optional for controlled mode
  existingSignature?: string | null;
  isLoading?: boolean;
  // Controlled mode props (for React Hook Form)
  value?: string | null;
  onChange?: (signatureDataUrl: string | null) => void;
}

export function SignaturePad({ 
  onSave, 
  existingSignature, 
  isLoading = false,
  value,
  onChange,
}: SignaturePadProps) {
  // Determine if we're in controlled mode (using value/onChange)
  // If onChange is provided, we're in controlled mode (value can be undefined initially)
  const isControlled = onChange !== undefined;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Use controlled value if provided, otherwise use internal state
  const [internalSignature, setInternalSignature] = useState<string | null>(existingSignature || null);
  const signatureDataUrl = isControlled ? (value || null) : internalSignature;
  
  const updateSignature = (newValue: string | null) => {
    if (isControlled) {
      // In controlled mode, call onChange immediately (auto-save)
      onChange?.(newValue || null);
    } else {
      // In uncontrolled mode, update internal state
      setInternalSignature(newValue);
    }
  };
  
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'draw' | 'upload'>('draw');
  const { toast } = useToast();

  // Sync controlled value to canvas when it changes externally
  useEffect(() => {
    if (isControlled && value && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = value;
      }
    }
  }, [isControlled, value]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png');
    updateSignature(dataUrl);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateSignature(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image file is too large (max 2MB)',
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImage(dataUrl);
      updateSignature(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!signatureDataUrl) {
      toast({
        title: 'No signature',
        description: 'Please create or upload a signature first',
        variant: 'destructive',
      });
      return;
    }

    // Only call onSave if not in controlled mode (onSave should not be used with controlled mode)
    if (!isControlled && onSave) {
      onSave(signatureDataUrl);
    }
  };

  const handleDelete = () => {
    setUploadedImage(null);
    clearCanvas();
    
    if (!isControlled && onSave) {
      onSave(''); // Send empty string to delete (uncontrolled mode only)
    }
  };

  // If in controlled mode (form usage), don't wrap in Card
  const content = (
    <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'draw' | 'upload')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="draw">
              <Pencil className="h-4 w-4 mr-2" />
              Draw
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="space-y-4">
            <div className="space-y-2">
              <Label>Draw your signature below</Label>
              <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-[200px] cursor-crosshair touch-none"
                  style={{ touchAction: 'none' }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearCanvas}
                  className="flex-1"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signature-upload">Upload signature image</Label>
              <Input
                id="signature-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
              />
              <p className="text-xs text-muted-foreground">
                Accepted formats: PNG, JPG, JPEG. Max size: 2MB
              </p>
              {uploadedImage && (
                <div className="border rounded-lg p-4 bg-white">
                  <img
                    src={uploadedImage}
                    alt="Uploaded signature"
                    className="max-h-[200px] mx-auto"
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Preview existing signature */}
        {existingSignature && !signatureDataUrl && (
          <div className="space-y-2">
            <Label>Current Signature</Label>
            <div className="border rounded-lg p-4 bg-white">
              <img
                src={existingSignature}
                alt="Current signature"
                className="max-h-[200px] mx-auto"
              />
            </div>
          </div>
        )}

        {/* Action buttons - only show Save button in non-controlled mode */}
        {!isControlled && (
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isLoading || !signatureDataUrl}
              className="flex-1"
            >
              {isLoading ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Signature
                </>
              )}
            </Button>
            {(existingSignature || signatureDataUrl) && (
              <Button
                onClick={handleDelete}
                disabled={isLoading}
                variant="outline"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        )}
        
        {/* Clear button for controlled mode - always show if in controlled mode */}
        {isControlled && (
          <div className="flex gap-2">
            <Button
              onClick={handleDelete}
              disabled={isLoading}
              variant="outline"
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Signature
            </Button>
          </div>
        )}
    </div>
  );

  // Return wrapped in Card for uncontrolled mode, or just content for controlled mode
  if (isControlled) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Digital Signature</CardTitle>
        <CardDescription>
          Draw your signature or upload an image. This will be used on crew testimonials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
      </CardContent>
    </Card>
  );
}

