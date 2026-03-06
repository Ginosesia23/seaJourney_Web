'use client';

import { useState, useRef, useMemo, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, FileText, ShieldCheck, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import LogoOnboarding from '@/components/logo-onboarding';
import { createPublicSupabaseClient } from '@/lib/supabase-public';

type CodeType = 'sj' | 'pos';

export default function VerificationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [codeType, setCodeType] = useState<CodeType>('sj');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const supabase = useMemo(() => createPublicSupabaseClient(), []);

  const prefix = codeType === 'sj' ? 'SJ-' : 'POS-';

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
      if (notFound) setNotFound(false);

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
      if (notFound) setNotFound(false);

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
      let codePart: string;
      if (pastedText.startsWith('POS') && pastedText.length >= 11) {
        codePart = pastedText.slice(3, 11);
      } else if (pastedText.startsWith('SJ') && pastedText.length >= 10) {
        codePart = pastedText.slice(2, 10);
      } else {
        codePart = pastedText.slice(0, 8);
      }
      const chars = codePart.split('').slice(0, 8);
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (i < 8) {
          newCode[i] = char;
        }
      });
      setCode(newCode);
      if (notFound) setNotFound(false);

      // Focus the next empty input or the last one
      const nextEmptyIndex = newCode.findIndex((c) => c === '');
      const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : 7;
      if (inputRefs.current[focusIndex]) {
        inputRefs.current[focusIndex]?.focus();
      }
    }
  };

  const handleVerification = async () => {
    const fullCode = code.join('').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (fullCode.length !== 8) return;

    setIsLoading(true);
    setNotFound(false);

    try {
      const codeWithPrefix = prefix + fullCode;
      const codeParam = encodeURIComponent(codeWithPrefix);
      const typeParam = codeType === 'sj' ? 'sj' : 'pos';

      if (codeType === 'pos') {
        const res = await fetch(`/api/verify/proof-of-service?code=${encodeURIComponent(codeWithPrefix)}`);
        const json = res.ok ? await res.json() : {};
        if (json.found && json.record) {
          router.replace(`/verify/result?code=${codeParam}&type=${typeParam}`);
          return;
        }
      } else {
        const { data } = await supabase
          .from('approved_testimonials')
          .select('id')
          .eq('testimonial_code', codeWithPrefix)
          .maybeSingle();
        if (data) {
          router.replace(`/verify/result?code=${codeParam}&type=${typeParam}`);
          return;
        }
      }

      setNotFound(true);
    } catch (e) {
      console.error('[VERIFY PAGE] Verification failed:', e);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const isCodeComplete = code.every(char => char !== '') && code.join('').length === 8;

  return (
    <div className="dark animated-gradient-background flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <LogoOnboarding />
      </div>
      <div className="relative w-full max-w-md sm:max-w-2xl p-1 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
        <div className="absolute -top-px -left-px h-3 w-3 sm:h-4 sm:w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
        <div className="absolute -top-px -right-px h-3 w-3 sm:h-4 sm:w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
        <div className="absolute -bottom-px -left-px h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
        <div className="absolute -bottom-px -right-px h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>

        <Card className="w-full border-none bg-transparent text-card-foreground shadow-none rounded-xl">
          <CardHeader className="text-center px-4 sm:px-6 pt-6 pb-4">
            <div className="mx-auto flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <CardTitle className="mt-3 sm:mt-4 font-headline text-2xl sm:text-3xl">Sea Time Verification</CardTitle>
            <CardDescription className="mt-2 text-sm sm:text-lg text-muted-foreground px-2">
              Enter the verification code from the PDF to verify a testimonial or Proof of Service record.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6">
            <div className="space-y-4 sm:space-y-6">
              {notFound && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Code not found. Try switching to the other document type (SJ or POS) above and verify again.
                  </AlertDescription>
                </Alert>
              )}

              {/* Document type toggle - pill style, centered */}
              <div className="space-y-2 flex flex-col items-center">
                <label className="text-xs sm:text-sm font-semibold text-muted-foreground block">
                  Document type
                </label>
                <div className="flex p-0.5 rounded-full bg-muted/80 border border-border/60 w-full max-w-[10rem]">
                  <button
                    type="button"
                    onClick={() => { setCodeType('sj'); setNotFound(false); }}
                    className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium transition-colors rounded-l-full rounded-r-md outline-none focus:ring-0 focus-visible:ring-0 ${
                      codeType === 'sj'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span>SJ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCodeType('pos'); setNotFound(false); }}
                    className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium transition-colors rounded-r-full rounded-l-md outline-none focus:ring-0 focus-visible:ring-0 ${
                      codeType === 'pos'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>POS</span>
                  </button>
                </div>
              </div>

              {/* Code Input */}
              <div className="space-y-2 sm:space-y-3">
                <label className="text-xs sm:text-sm font-semibold text-muted-foreground text-center block">
                  Verification code
                </label>
                <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                  <span className="text-xl sm:text-2xl font-bold text-primary">{prefix}</span>
                  <div className="flex gap-1 sm:gap-2">
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
                        className="w-9 h-11 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold uppercase bg-background border-2 border-primary/30 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                        disabled={isLoading}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                      />
                    ))}
                  </div>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground text-center mt-1 sm:mt-2 px-2">
                  Enter the 8-character code from the PDF (after {prefix})
                </p>
              </div>

              {/* Verify Button */}
              <Button
                onClick={handleVerification}
                size="lg"
                className="h-11 sm:h-12 w-full rounded-lg text-sm sm:text-base"
                disabled={isLoading || !isCodeComplete}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
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
