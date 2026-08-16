'use client';

import * as React from 'react';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScrubSample } from '@/lib/passages-map/scrub-along-track';

export type PassageTimelineMeta = {
  vesselId: string;
  passageIndex: number;
  vesselName: string;
  colorHex: string;
  routeLabel: string;
  startTime?: string;
  endTime?: string;
  distanceNm?: number;
};

type PassageTimelineBarProps = {
  meta: PassageTimelineMeta;
  progress: number;
  sample: ScrubSample | null;
  onProgressChange: (progress: number) => void;
  onClose: () => void;
  className?: string;
};

function formatClock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Bottom glass timeline for a selected AIS passage — drag to scrub a
 * live marker along the track from departure to arrival.
 */
export function PassageTimelineBar({
  meta,
  progress,
  sample,
  onProgressChange,
  onClose,
  className,
}: PassageTimelineBarProps) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const progressRef = React.useRef(progress);
  // Local thumb position while dragging so the bar stays 1:1 with the
  // pointer even if a parent re-render is briefly deferred.
  const [dragProgress, setDragProgress] = React.useState<number | null>(null);
  React.useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const setFromClientX = React.useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const next = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setDragProgress(next);
      progressRef.current = next;
      onProgressChange(next);
    },
    [onProgressChange],
  );

  const endDrag = React.useCallback(() => {
    draggingRef.current = false;
    setDragProgress(null);
  }, []);

  React.useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const next = Math.min(1, progressRef.current + dt / 45_000);
      progressRef.current = next;
      onProgressChange(next);
      if (next >= 1) {
        setIsPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, onProgressChange]);

  const displayProgress = dragProgress ?? progress;
  const pct = Math.round(displayProgress * 100);
  const accent = meta.colorHex || '#38bdf8';

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-3xl rounded-2xl border border-white/10',
        'bg-slate-950/90 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl',
        'ring-1 ring-white/5',
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
              style={{ backgroundColor: accent, color: accent }}
            />
            <p className="truncate text-sm font-semibold tracking-tight text-white">
              {meta.routeLabel}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-white/45">
            {meta.vesselName}
            {typeof meta.distanceNm === 'number'
              ? ` · ${Math.round(meta.distanceNm).toLocaleString()} NM`
              : ''}
            {' · '}
            Live scrub
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-white/50 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          title="Close timeline (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2 text-[11px] text-white/70 sm:grid-cols-4">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/35">Time</div>
          <div className="truncate tabular-nums">{formatClock(sample?.atMs)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/35">Speed</div>
          <div className="tabular-nums">
            {sample?.speedKn != null ? `${sample.speedKn.toFixed(1)} kn` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/35">Along</div>
          <div className="tabular-nums">
            {sample
              ? `${sample.distanceFromStartNm.toFixed(sample.distanceFromStartNm < 10 ? 1 : 0)} NM`
              : '—'}
          </div>
        </div>
        <div className="hidden sm:block">
          <div className="text-[9px] uppercase tracking-wider text-white/35">Remaining</div>
          <div className="tabular-nums">{formatDurationMs(sample?.remainingMs)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => {
            setIsPlaying(false);
            setDragProgress(null);
            onProgressChange(0);
          }}
          title="Jump to start"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => setIsPlaying((p) => !p)}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => {
            setIsPlaying(false);
            setDragProgress(null);
            onProgressChange(1);
          }}
          title="Jump to end"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </Button>

        <div
          ref={trackRef}
          className="relative mx-1 h-8 flex-1 cursor-pointer touch-none select-none"
          onPointerDown={(e) => {
            // Capture on THIS element so move/up keep firing here even
            // when the pointer leaves the track (window listeners miss
            // captured pointer events in some browsers).
            draggingRef.current = true;
            setIsPlaying(false);
            e.currentTarget.setPointerCapture(e.pointerId);
            setFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            setFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            endDrag();
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            endDrag();
          }}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Scrub along passage"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onProgressChange(Math.max(0, displayProgress - 0.02));
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              onProgressChange(Math.min(1, displayProgress + 0.02));
            } else if (e.key === 'Home') {
              e.preventDefault();
              onProgressChange(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              onProgressChange(1);
            }
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${accent}88, ${accent})`,
            }}
          />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg"
            style={{ left: `${pct}%`, backgroundColor: accent }}
          />
        </div>

        <div className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/55">
          {pct}%
        </div>
      </div>

      <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-[0.12em] text-white/30">
        <span>Departure</span>
        <span>Arrival</span>
      </div>
    </div>
  );
}
