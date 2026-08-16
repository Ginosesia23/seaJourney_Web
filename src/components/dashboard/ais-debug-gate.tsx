'use client';

/**
 * Client-side gate for AIS debug panels.
 * Hides the raw Datalastic UI from normal production use; unlock with a
 * known PIN for real-world debugging. Unlock is in-memory only — every
 * page load starts locked again. This is obscurity, not security —
 * the preview APIs still require a signed-in session.
 */

import { useState, type ReactNode } from 'react';
import { Bug, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Local debug PIN — not a server secret. */
const DEBUG_PIN = '3669';

export function AisDebugGate({
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const unlock = () => {
    if (pin.trim() !== DEBUG_PIN) {
      setError('Incorrect code');
      return;
    }
    setUnlocked(true);
    setShowForm(false);
    setPin('');
    setError(null);
  };

  const lock = () => {
    setUnlocked(false);
    setShowForm(false);
    setPin('');
    setError(null);
  };

  if (unlocked) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={lock}
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            Lock AIS debug
          </Button>
        </div>
        {children}
      </div>
    );
  }

  // Keep the locked state almost invisible on the live site — just a tiny
  // control. Content (and Datalastic fetches) only mount after unlock.
  return (
    <div className="flex justify-end">
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground"
          aria-label="Unlock AIS debug"
          title="Debug"
        >
          <Bug className="h-3 w-3" />
        </button>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/80 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            unlock();
          }}
        >
          <Input
            id="ais-debug-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(null);
            }}
            className="h-8 w-28 rounded-md text-sm"
            placeholder="Code"
          />
          <Button type="submit" size="sm" className="h-8 rounded-md">
            Unlock
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-md"
            onClick={() => {
              setShowForm(false);
              setPin('');
              setError(null);
            }}
          >
            Cancel
          </Button>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
