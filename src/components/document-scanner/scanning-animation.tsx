'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const SCAN_STEPS = [
  { text: 'Analyzing document structure…', icon: '📄' },
  { text: 'Identifying form fields…', icon: '🔍' },
  { text: 'Reading field labels…', icon: '📝' },
  { text: 'Extracting values…', icon: '✨' },
  { text: 'Matching to crew profile…', icon: '👤' },
  { text: 'Mapping vessel data…', icon: '🚢' },
  { text: 'Calculating sea time…', icon: '⚓' },
  { text: 'Finalizing results…', icon: '✅' },
];

/**
 * Premium scanning animation shown while the AI processes a document.
 * Features: animated document with scan line, floating extraction dots,
 * rotating status messages, and a pulsing glow effect.
 */
export function ScanningAnimation() {
  const [stepIndex, setStepIndex] = useState(0);
  const [dotsVisible, setDotsVisible] = useState<number[]>([]);

  // Rotate through status messages
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % SCAN_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // Animate extraction dots appearing on the document
  useEffect(() => {
    const dotPositions = [0, 1, 2, 3, 4, 5, 6, 7];
    let current = 0;
    setDotsVisible([]);
    const interval = setInterval(() => {
      if (current < dotPositions.length) {
        setDotsVisible((prev) => [...prev, dotPositions[current]]);
        current++;
      } else {
        // Reset and start again
        setDotsVisible([]);
        current = 0;
      }
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const step = SCAN_STEPS[stepIndex];

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Document mockup with scan effect */}
      <div className="relative w-48 h-64">
        {/* Glow background */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 blur-2xl animate-pulse" />

        {/* Document shape */}
        <div className="relative w-full h-full rounded-xl border-2 border-primary/30 bg-card shadow-2xl overflow-hidden">
          {/* Document header bar */}
          <div className="h-8 border-b border-primary/10 bg-gradient-to-r from-primary/5 to-violet-500/5 flex items-center px-3 gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/10" />
            <div className="ml-auto h-1.5 w-8 rounded-full bg-primary/15" />
          </div>

          {/* Fake form lines */}
          <div className="p-3 space-y-3">
            {/* Field rows - they light up when "extracted" */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const isFound = dotsVisible.includes(i);
              return (
                <div key={i} className="flex items-center gap-2">
                  {/* Label placeholder */}
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-500',
                      isFound ? 'bg-primary/60 w-8' : 'bg-muted-foreground/15 w-6',
                    )}
                    style={{ width: `${20 + (i % 3) * 8}px` }}
                  />
                  {/* Value placeholder */}
                  <div className="flex-1 relative">
                    <div
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-700',
                        isFound
                          ? 'bg-gradient-to-r from-primary/50 to-violet-500/50'
                          : 'bg-muted-foreground/10',
                      )}
                      style={{ width: isFound ? '100%' : `${40 + (i % 4) * 12}%` }}
                    />
                    {/* Extraction sparkle */}
                    {isFound && (
                      <div className="absolute -right-1 -top-1 animate-in zoom-in-50 fade-in duration-300">
                        <div className="h-3 w-3 rounded-full bg-primary/30 flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scanning beam — moves top to bottom */}
          <div
            className="absolute left-0 right-0 h-12 pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, transparent 0%, rgba(var(--primary-rgb, 99 102 241) / 0.08) 40%, rgba(var(--primary-rgb, 99 102 241) / 0.15) 50%, rgba(var(--primary-rgb, 99 102 241) / 0.08) 60%, transparent 100%)',
              animation: 'scanBeam 2.5s ease-in-out infinite',
            }}
          />

          {/* Scan line */}
          <div
            className="absolute left-2 right-2 h-[2px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)',
              boxShadow: '0 0 12px 2px hsl(var(--primary) / 0.4)',
              animation: 'scanLine 2.5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Corner accents */}
        <div className="absolute -top-1 -left-1 h-4 w-4 border-t-2 border-l-2 border-primary/50 rounded-tl-sm" />
        <div className="absolute -top-1 -right-1 h-4 w-4 border-t-2 border-r-2 border-primary/50 rounded-tr-sm" />
        <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-primary/50 rounded-bl-sm" />
        <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-primary/50 rounded-br-sm" />
      </div>

      {/* Status text with rotating messages */}
      <div className="flex flex-col items-center gap-2 min-h-[3rem]">
        <div
          key={stepIndex}
          className="flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-500"
        >
          <span className="text-lg">{step.icon}</span>
          <span className="text-sm font-medium text-foreground/80">{step.text}</span>
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary/60"
              style={{
                animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes scanLine {
          0% { top: 2rem; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: calc(100% - 1rem); opacity: 0; }
        }
        @keyframes scanBeam {
          0% { top: 0; }
          100% { top: calc(100% - 3rem); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
