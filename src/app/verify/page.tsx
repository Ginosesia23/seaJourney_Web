'use client';

import { useState, useRef, KeyboardEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import LogoOnboarding from '@/components/logo-onboarding';

export default function VerificationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();

  const handleInputChange = (index: number, value: string) => {
    // Only allow alphanumeric characters
    const cleanedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (cleanedValue.length > 1) {
      // Handle paste - split the value across multiple inputs
      const chars = cleanedValue.split('').slice(0, 8);
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (index + i < 8) {
          newCode[index + i] = char;
        }
      });
      setCode(newCode);
      
      // Focus the next empty input or the last one
      const nextEmptyIndex = newCode.findIndex((c, i) => i >= index && c === '');
      const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : Math.min(index + chars.length, 7);
      if (inputRefs.current[focusIndex]) {
        inputRefs.current[focusIndex]?.focus();
      }
    } else {
      // Single character input
      const newCode = [...code];
      newCode[index] = cleanedValue;
      setCode(newCode);
      
      // Auto-advance to next input if a character was entered
      if (cleanedValue && index < 7) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      // If current field is empty and backspace is pressed, go to previous field
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pastedText.length > 0) {
      const chars = pastedText.split('').slice(0, 8);
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (i < 8) {
          newCode[i] = char;
        }
      });
      setCode(newCode);
      
      // Focus the next empty input or the last one
      const nextEmptyIndex = newCode.findIndex((c) => c === '');
      const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : 7;
      if (inputRefs.current[focusIndex]) {
        inputRefs.current[focusIndex]?.focus();
      }
    }
  };

  const handleVerification = async () => {
    const fullCode = code.join('');
    
    if (fullCode.length !== 8) {
      return;
    }

    setIsLoading(true);

    try {
      // Redirect to results page with code
      const codeParam = encodeURIComponent(fullCode);
      router.push(`/verify/result?code=${codeParam}`);
    } catch (e) {
      console.error('Verification failed:', e);
      setIsLoading(false);
    }
  };

  const isCodeComplete = code.every(char => char !== '') && code.join('').length === 8;

  return (
    <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="mb-8">
        <LogoOnboarding />
      </div>
      <div className="relative w-full max-w-2xl p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>
        
        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="mt-4 font-headline text-3xl">Sea Time Verification</CardTitle>
            <CardDescription className="mt-2 text-lg text-muted-foreground">
              Enter the document verification code from the PDF to verify the record's authenticity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Code Input */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-muted-foreground text-center block">
                  Document Verification Code
                </label>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-bold text-primary">SJ-</span>
                  <div className="flex gap-2">
                    {code.map((char, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          inputRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="text"
                        maxLength={1}
                        value={char}
                        onChange={(e) => handleInputChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={index === 0 ? handlePaste : undefined}
                        className="w-12 h-14 text-center text-2xl font-bold uppercase bg-background border-2 border-primary/30 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        disabled={isLoading}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Enter the 8-character code from the PDF footer
                </p>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerification}
                size="lg"
                className="h-12 w-full rounded-lg"
                disabled={isLoading || !isCodeComplete}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-5 w-5" />
                    Verify Record
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
