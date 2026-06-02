'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback, useLayoutEffect } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Eye, EyeOff, Move, Check, Crosshair, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface OverlayField {
  fieldName: string;
  suggestedValue: string | null;
  originalValue?: string;
  source: string;
  page?: number;
  bbox?: { yMin: number; xMin: number; yMax: number; xMax: number };
}

interface OriginalDocumentViewerProps {
  file: File;
  /** For images, pass a data URL; for PDFs, null */
  previewUrl: string | null;
  /** Matched + unmatched fields to overlay. */
  fields?: OverlayField[];
  /** Key -> edited value map (same format the filled preview uses). */
  editedValues?: Record<string, string>;
  /**
   * Called when the user adjusts an overlay box. `index` is the position in the
   * combined `[...matched, ...unmatched]` array. Parent should persist the new bbox.
   */
  onFieldBboxChange?: (index: number, bbox: { yMin: number; xMin: number; yMax: number; xMax: number }) => void;
  /**
   * Called when the user shifts ALL boxes on the given page by the same delta
   * (in normalized [0,1000] coordinates). Parent should apply the delta to
   * every field on that page and persist.
   */
  onPageShift?: (page: number, dx: number, dy: number) => void;
  /**
   * Fires whenever the viewer's current page or page count changes. Lets
   * the builder know which page the user is looking at (so new fields can
   * default to the visible page) and how many pages the document has (for
   * the inspector's page picker).
   */
  onPageInfoChange?: (info: { currentPage: number; pageCount: number }) => void;
  /**
   * Fires when the user clicks an overlay box (without dragging it). The
   * builder uses this to sync its right-hand field selection with whatever
   * the user just tapped on the page. `index` is the position in the flat
   * fields array handed in. `mods` reflects the keyboard modifiers at the
   * time of the click so the parent can implement range (shift) / toggle
   * (ctrl/meta) / replace (plain) semantics without plumbing its own
   * listener.
   */
  onFieldSelect?: (
    index: number,
    mods?: { shift: boolean; meta: boolean },
  ) => void;
  /**
   * Indices of the currently-selected fields. The viewer highlights every
   * box that appears in this array and uses group membership to decide
   * whether a drag should move the single box or shift the whole group.
   * Single-select callers can pass a one-element array.
   */
  selectedIndices?: number[];
  /**
   * Fires when the user presses the delete button rendered inside a
   * selected overlay. Builder should remove the matching field from its
   * state. When undefined the delete button is hidden.
   */
  onFieldDelete?: (index: number) => void;
  /**
   * Fires during a multi-select group drag — called once per mousemove
   * with the incremental delta in normalised [0,1000] units, just like
   * `onPageShift`. `indices` lists the fields that were being dragged
   * (always a subset of `selectedIndices` on the current page). Parent
   * should apply dx/dy to each of those fields' bboxes.
   */
  onFieldsMove?: (indices: number[], dx: number, dy: number) => void;
  /**
   * Fires when the user releases a rubber-band lasso selection. `indices`
   * lists every overlay whose centre fell inside the lasso rectangle.
   * `mods` mirrors `onFieldSelect` so the parent can decide between
   * replace (plain) and union (shift/ctrl/meta) semantics.
   */
  onLassoSelect?: (
    indices: number[],
    mods: { shift: boolean; meta: boolean },
  ) => void;
}

type DragMode = 'move' | 'resize';
interface DragState {
  index: number;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startBbox: { yMin: number; xMin: number; yMax: number; xMax: number };
}

/** Source -> border/background class for overlay box. */
function sourceStyle(source: string): string {
  if (source === 'profile')    return 'border-blue-500/80 bg-blue-500/10 hover:bg-blue-500/20';
  if (source === 'vessel')     return 'border-emerald-500/80 bg-emerald-500/10 hover:bg-emerald-500/20';
  if (source === 'captain')    return 'border-amber-500/80 bg-amber-500/10 hover:bg-amber-500/20';
  if (source === 'calculated') return 'border-indigo-500/80 bg-indigo-500/10 hover:bg-indigo-500/20';
  return 'border-slate-400/80 bg-slate-400/10 hover:bg-slate-400/20';
}

function sourceTextColor(source: string): string {
  if (source === 'profile')    return 'text-blue-700 dark:text-blue-300';
  if (source === 'vessel')     return 'text-emerald-700 dark:text-emerald-300';
  if (source === 'captain')    return 'text-amber-700 dark:text-amber-300';
  if (source === 'calculated') return 'text-indigo-700 dark:text-indigo-300';
  return 'text-slate-600 dark:text-slate-300';
}

/**
 * Renders the original uploaded document with optional value-overlay hotspots
 * positioned using normalized [0,1000] bounding boxes returned by the AI.
 */
export function OriginalDocumentViewer({ file, previewUrl, fields = [], editedValues = {}, onFieldBboxChange, onPageShift, onPageInfoChange, onFieldSelect, selectedIndices, onFieldDelete, onFieldsMove, onLassoSelect }: OriginalDocumentViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [adjustMode, setAdjustMode] = useState(false);
  const [alignMode, setAlignMode] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  // The canvas pixel buffer dimensions (canvasSize) are NOT the same as the
  // canvas's rendered CSS dimensions — `max-w-full` can scale it down. We
  // need the rendered CSS size to position overlays and convert drag pixels to
  // normalized [0,1000] units. Track it via ResizeObserver so it stays in sync
  // whenever the container resizes (initial layout, sidebar toggle, etc.).
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);
  const pdfDocRef = useRef<any>(null);
  const dragRef = useRef<DragState | null>(null);
  // For align mode: we accumulate a delta between mousedown and mouseup,
  // then flush it once to the parent via onPageShift.
  const alignDragRef = useRef<{ startClientX: number; startClientY: number; lastDx: number; lastDy: number } | null>(null);
  // For multi-select group moves inside adjust mode. Tracks the cumulative
  // delta so we can forward only the INCREMENTAL delta to the parent on
  // each mousemove (same pattern the align-all drag uses). We also stash
  // the indices the drag started against so late selection changes mid-
  // drag can't bleed into the group being moved.
  const groupDragRef = useRef<{
    indices: number[];
    startClientX: number;
    startClientY: number;
    lastDx: number;
    lastDy: number;
  } | null>(null);
  // Lasso / rubber-band selection. Kept in React state (not a ref) so the
  // dashed rectangle re-renders as the user drags. Coordinates are stored
  // in document-local pixels so we can render directly and hit-test
  // against the overlay boxes (which are positioned in percent of
  // canvasSize).
  const [lasso, setLasso] = useState<{
    startDocX: number;
    startDocY: number;
    currentDocX: number;
    currentDocY: number;
    modifiers: { shift: boolean; meta: boolean };
  } | null>(null);
  const lassoRef = useRef<typeof lasso>(null);
  useEffect(() => {
    lassoRef.current = lasso;
  }, [lasso]);

  // O(1) membership lookup for overlay rendering + drag decisions. Using
  // a Set avoids an indexOf per box per render on large templates.
  const selectedIndexSet = useMemo(
    () => new Set(selectedIndices ?? []),
    [selectedIndices],
  );

  const isPDF = file.type === 'application/pdf';

  // Fields visible on current page, with valid bounding boxes. Preserve the
  // original global index so we can call back onFieldBboxChange with the right
  // position in the combined fields array.
  const overlayFields = useMemo(() => {
    return fields
      .map((f, globalIndex) => ({ field: f, globalIndex }))
      .filter(({ field: f }) => {
        const pageOf = f.page ?? 1;
        if (pageOf !== currentPage) return false;
        const b = f.bbox;
        if (!b) return false;
        if (b.xMax <= b.xMin || b.yMax <= b.yMin) return false;
        return b.xMin >= 0 && b.xMax <= 1000 && b.yMin >= 0 && b.yMax <= 1000;
      });
  }, [fields, currentPage]);

  const hasOverlays = overlayFields.length > 0;

  useEffect(() => {
    if (!isPDF) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const renderPDF = async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;

        if (cancelled) return;
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
        setCurrentPage(1);

        await renderPage(pdf, 1);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to render PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderPDF();
    return () => { cancelled = true; };
  }, [file, isPDF]);

  useEffect(() => {
    if (pdfDocRef.current && currentPage > 0) {
      renderPage(pdfDocRef.current, currentPage);
    }
  }, [currentPage]);

  const renderPage = async (pdf: any, pageNum: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const page = await pdf.getPage(pageNum);
    // Measure the OUTER container (not canvas.parentElement) because the
    // inner wrapper can be 0-width before the canvas lays out.
    const outerWidth = containerRef.current?.clientWidth ?? 0;
    const containerWidth = outerWidth > 100 ? outerWidth : 760; // safe fallback
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(containerWidth / unscaledViewport.width, 2);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    await page.render({ canvasContext: ctx, viewport }).promise;
    setCanvasSize({ width: viewport.width, height: viewport.height });
  };

  // Track the element's actual CSS rendered size via ResizeObserver so that
  // overlay percentages and drag-delta conversions are always accurate,
  // regardless of how `max-w-full` scales the element relative to its
  // pixel buffer size.
  useLayoutEffect(() => {
    const el = isPDF ? canvasRef.current : imgRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setRenderedSize({ width, height });
      }
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update(); // capture immediately if already laid out
    return () => ro.disconnect();
  // Re-attach whenever the file or page changes (canvas element may be re-created).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPDF, canvasSize]); // canvasSize changing means a new page was rendered

  // For images, capture natural size once loaded.
  const handleImgLoad = () => {
    const img = imgRef.current;
    if (img) setCanvasSize({ width: img.clientWidth, height: img.clientHeight });
  };

  // ---- Drag / resize handling for adjust mode ----
  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent, globalIndex: number, bbox: { yMin: number; xMin: number; yMax: number; xMax: number }, mode: DragMode) => {
      if (!adjustMode || !onFieldBboxChange) return;
      e.preventDefault();
      e.stopPropagation();
      // Group move: if the user grabs a box that's part of a multi-
      // selection AND we have somewhere to forward group deltas to,
      // start a group drag instead of a single-box drag. Resizing stays
      // single-box only (group-resize doesn't have an obvious UX: scale
      // from which corner? proportional or absolute?).
      if (
        mode === 'move' &&
        onFieldsMove &&
        selectedIndexSet.size > 1 &&
        selectedIndexSet.has(globalIndex)
      ) {
        groupDragRef.current = {
          indices: Array.from(selectedIndexSet),
          startClientX: e.clientX,
          startClientY: e.clientY,
          lastDx: 0,
          lastDy: 0,
        };
        return;
      }
      dragRef.current = {
        index: globalIndex,
        mode,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startBbox: { ...bbox },
      };
    },
    [adjustMode, onFieldBboxChange, onFieldsMove, selectedIndexSet],
  );

  // Lasso start: only fires when the mousedown target is the document
  // surface itself (canvas / image / docRef) — overlay boxes stop
  // propagation in `handleOverlayMouseDown`, so those clicks never reach
  // this handler. We intentionally only enable lasso in adjust mode
  // because that's the mode dedicated to positioning fields; in normal
  // browsing mode a drag on empty canvas should stay a no-op.
  const handleLassoMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!adjustMode || !onLassoSelect || !docRef.current) return;
      // Don't start a lasso on right-click, middle-click, or if the
      // target is an interactive element (resize handle / delete button
      // — those also stopPropagation, but belt + braces).
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = docRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setLasso({
        startDocX: x,
        startDocY: y,
        currentDocX: x,
        currentDocY: y,
        modifiers: { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey },
      });
    },
    [adjustMode, onLassoSelect],
  );

  useEffect(() => {
    if (!adjustMode) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!renderedSize) return;

      // --- Group drag (multi-select move) ------------------------------
      // Handled before single-box drag because groupDragRef + dragRef are
      // mutually exclusive: the mousedown handler only sets one of them.
      const gdrag = groupDragRef.current;
      if (gdrag && onFieldsMove) {
        e.preventDefault();
        const totalDxPx = e.clientX - gdrag.startClientX;
        const totalDyPx = e.clientY - gdrag.startClientY;
        const totalDx = (totalDxPx / renderedSize.width) * 1000;
        const totalDy = (totalDyPx / renderedSize.height) * 1000;
        const incDx = totalDx - gdrag.lastDx;
        const incDy = totalDy - gdrag.lastDy;
        if (incDx !== 0 || incDy !== 0) {
          onFieldsMove(gdrag.indices, incDx, incDy);
          gdrag.lastDx = totalDx;
          gdrag.lastDy = totalDy;
        }
        return;
      }

      // --- Single-box drag (existing behaviour) ------------------------
      const drag = dragRef.current;
      const doc = docRef.current;
      if (!drag || !doc || !onFieldBboxChange) return;
      e.preventDefault();
      const dxPx = e.clientX - drag.startClientX;
      const dyPx = e.clientY - drag.startClientY;
      const dx = (dxPx / renderedSize.width) * 1000;
      const dy = (dyPx / renderedSize.height) * 1000;
      const { startBbox, mode, index } = drag;

      let next: { yMin: number; xMin: number; yMax: number; xMax: number };
      if (mode === 'move') {
        const w = startBbox.xMax - startBbox.xMin;
        const h = startBbox.yMax - startBbox.yMin;
        const nx = clamp(startBbox.xMin + dx, 0, 1000 - w);
        const ny = clamp(startBbox.yMin + dy, 0, 1000 - h);
        next = { xMin: nx, yMin: ny, xMax: nx + w, yMax: ny + h };
      } else {
        const nxMax = clamp(startBbox.xMax + dx, startBbox.xMin + 10, 1000);
        const nyMax = clamp(startBbox.yMax + dy, startBbox.yMin + 10, 1000);
        next = { xMin: startBbox.xMin, yMin: startBbox.yMin, xMax: nxMax, yMax: nyMax };
      }
      onFieldBboxChange(index, next);
    };

    const onMouseUp = () => {
      dragRef.current = null;
      groupDragRef.current = null;
    };

    // passive: false so preventDefault actually suppresses default browser behavior.
    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [adjustMode, renderedSize, onFieldBboxChange, onFieldsMove]);

  // Lasso drag: extend the rubber-band rectangle on mousemove, and on
  // mouseup compute which overlays have their centre inside the box
  // then hand that array up to the parent along with the stored
  // modifier flags. Using the centre (rather than strict containment)
  // matches mouse-selection UX in most design tools and is more
  // forgiving with small boxes.
  useEffect(() => {
    if (!adjustMode || !onLassoSelect) return;
    if (!lasso) return;

    const onMove = (e: MouseEvent) => {
      const doc = docRef.current;
      if (!doc) return;
      e.preventDefault();
      const rect = doc.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      setLasso((prev) =>
        prev ? { ...prev, currentDocX: x, currentDocY: y } : prev,
      );
    };

    const onUp = () => {
      const snap = lassoRef.current;
      if (!snap || !renderedSize) {
        setLasso(null);
        return;
      }
      const x1 = Math.min(snap.startDocX, snap.currentDocX);
      const x2 = Math.max(snap.startDocX, snap.currentDocX);
      const y1 = Math.min(snap.startDocY, snap.currentDocY);
      const y2 = Math.max(snap.startDocY, snap.currentDocY);
      // Treat a near-zero drag as a deselect click (parent decides how
      // to interpret modifiers — usually "replace selection with empty").
      const dragged = Math.abs(x2 - x1) > 4 || Math.abs(y2 - y1) > 4;
      if (!dragged) {
        onLassoSelect([], snap.modifiers);
        setLasso(null);
        return;
      }
      // Convert lasso rect (doc pixels) to the 0..1000 normalized space
      // the overlay bboxes use, then pick every visible overlay whose
      // centre falls inside it. We check overlayFields — which already
      // filters by current page — so we never select fields on pages
      // the user isn't looking at.
      const nx1 = (x1 / renderedSize.width) * 1000;
      const nx2 = (x2 / renderedSize.width) * 1000;
      const ny1 = (y1 / renderedSize.height) * 1000;
      const ny2 = (y2 / renderedSize.height) * 1000;
      const hits: number[] = [];
      for (const { field: f, globalIndex } of overlayFields) {
        const b = f.bbox;
        if (!b) continue;
        const cx = (b.xMin + b.xMax) / 2;
        const cy = (b.yMin + b.yMax) / 2;
        if (cx >= nx1 && cx <= nx2 && cy >= ny1 && cy <= ny2) {
          hits.push(globalIndex);
        }
      }
      onLassoSelect(hits, snap.modifiers);
      setLasso(null);
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [adjustMode, renderedSize, lasso, onLassoSelect, overlayFields]);

  // ---- Align-all handling: drag anywhere on the document to shift every
  // box on the current page by the same delta. Applies incremental deltas so
  // state updates stay bounded (each call moves boxes by only the NEW delta
  // since the previous mousemove, never by the cumulative delta).
  const handleAlignMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!alignMode || !onPageShift) return;
      e.preventDefault();
      e.stopPropagation();
      alignDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastDx: 0,
        lastDy: 0,
      };
    },
    [alignMode, onPageShift],
  );

  useEffect(() => {
    if (!alignMode || !onPageShift) return;

    const onMouseMove = (e: MouseEvent) => {
      const drag = alignDragRef.current;
      if (!drag || !renderedSize) return;
      // Block text selection / autoscroll while actively dragging.
      e.preventDefault();
      const totalDxPx = e.clientX - drag.startClientX;
      const totalDyPx = e.clientY - drag.startClientY;
      const totalDx = (totalDxPx / renderedSize.width) * 1000;
      const totalDy = (totalDyPx / renderedSize.height) * 1000;
      // Apply only the INCREMENTAL delta since the last move.
      const incDx = totalDx - drag.lastDx;
      const incDy = totalDy - drag.lastDy;
      if (incDx !== 0 || incDy !== 0) {
        onPageShift(currentPage, incDx, incDy);
        drag.lastDx = totalDx;
        drag.lastDy = totalDy;
      }
    };

    const onMouseUp = () => {
      alignDragRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [alignMode, renderedSize, currentPage, onPageShift]);

  // Surface page info to the parent. We fire this on mount + every change
  // so the builder can default new fields to the visible page and show a
  // page picker in the inspector.
  useEffect(() => {
    onPageInfoChange?.({ currentPage, pageCount: Math.max(1, pageCount) });
  }, [currentPage, pageCount, onPageInfoChange]);

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        Failed to load document preview
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex w-full flex-col items-stretch gap-3">
      {/* Overlay toggle.
          `sticky top-[53px]` pins this inline toolbar flush with the
          bottom of the Form Builder's main sticky toolbar. The main
          toolbar's stuck height (in viewport y) is exactly 53px:
          -16 top offset + 16 pt-4 + 40 content row (h-10 buttons) +
          12 pb-3 + 1 border = 53. Using a Tailwind preset like
          `top-16` (64px) leaves an 11px gap. Keep this in sync if the
          main toolbar's padding or button height changes. We use an
          opaque-ish background + backdrop-blur so the document pages
          scrolling behind don't bleed through. `z-20` sits under the
          main toolbar (z-30) and above the document overlays. If the
          viewer is ever used outside the Form Builder it just stays
          sticky at the same offset, which is a harmless no-op on pages
          that aren't tall enough to scroll. */}
      {fields.length > 0 && (
        <div className="sticky top-[53px] z-20 flex w-full items-center justify-between gap-3 rounded-lg border bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80 px-3 py-2">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {hasOverlays ? `${overlayFields.length} overlay${overlayFields.length === 1 ? '' : 's'} on this page` : 'No overlays available on this page'}
            </span>
            {selectedIndexSet.size > 1 && (
              <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {selectedIndexSet.size} selected
              </span>
            )}
            {hasOverlays && (
              <div className="flex items-center gap-3">
                {[
                  { source: 'profile',    label: 'Profile' },
                  { source: 'vessel',     label: 'Vessel' },
                  { source: 'calculated', label: 'Calculated' },
                  { source: 'captain',    label: 'Captain' },
                  { source: 'manual',     label: 'Manual' },
                ].map(({ source, label }) => (
                  <div key={source} className="flex items-center gap-1">
                    <span className={cn('inline-block h-2 w-2 rounded-sm border', sourceStyle(source))} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onPageShift && hasOverlays && showOverlay && (
              <Button
                variant={alignMode ? 'default' : 'outline'}
                size="sm"
                className="h-7 rounded-lg text-xs"
                onClick={() => {
                  setAlignMode((m) => !m);
                  if (!alignMode) setAdjustMode(false);
                }}
              >
                {alignMode ? <Check className="mr-1.5 h-3 w-3" /> : <Crosshair className="mr-1.5 h-3 w-3" />}
                {alignMode ? 'Done aligning' : 'Align all'}
              </Button>
            )}
            {onFieldBboxChange && hasOverlays && showOverlay && (
              <Button
                variant={adjustMode ? 'default' : 'outline'}
                size="sm"
                className="h-7 rounded-lg text-xs"
                onClick={() => {
                  setAdjustMode((m) => !m);
                  if (!adjustMode) setAlignMode(false);
                }}
              >
                {adjustMode ? <Check className="mr-1.5 h-3 w-3" /> : <Move className="mr-1.5 h-3 w-3" />}
                {adjustMode ? 'Done adjusting' : 'Adjust single'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-lg text-xs"
              onClick={() => setShowOverlay((s) => !s)}
              disabled={!hasOverlays}
            >
              {showOverlay ? <EyeOff className="mr-1.5 h-3 w-3" /> : <Eye className="mr-1.5 h-3 w-3" />}
              {showOverlay ? 'Hide overlay' : 'Show overlay'}
            </Button>
          </div>
        </div>
      )}
      {alignMode && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary">
          Drag anywhere on the document to shift ALL boxes on this page by the same amount. Useful when the whole page is offset in one direction. Release and drag again to continue.
        </div>
      )}
      {adjustMode && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary">
          Drag a box to move it, or its bottom-right corner to resize.
          {onLassoSelect && (
            <> Drag empty space to lasso multiple fields; <kbd className="rounded border bg-background px-1 text-[10px]">Shift</kbd>/<kbd className="rounded border bg-background px-1 text-[10px]">{typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'}</kbd>-click to toggle individual boxes, then drag any selected box to move the whole group.</>
          )}
        </div>
      )}

      {loading && isPDF && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rendering document…
        </div>
      )}

      {/* Document + overlay container — position: relative so overlays anchor correctly.
          Uses inline-block inside a centered flex parent so the overlay layer exactly
          matches the rendered document dimensions (not full tab width). */}
      <div
        ref={docRef}
        className={cn(
          'relative mx-auto max-w-full self-center',
          (alignMode || adjustMode) && 'select-none',
          alignMode && 'cursor-move',
          // In adjust mode a drag on empty canvas starts a lasso — show a
          // crosshair so users understand that's a selection surface and
          // not just page background.
          adjustMode && !alignMode && onLassoSelect && 'cursor-crosshair',
        )}
        style={{
          display: loading && isPDF ? 'none' : 'inline-block',
          // Do NOT set an explicit width here. The canvas renders at its natural
          // CSS size (constrained by max-w-full on its container). We let the
          // inline-block docRef shrink-wrap that, then use ResizeObserver
          // (renderedSize) for overlay positioning. Setting width to the pdfjs
          // pixel buffer size (canvasSize) causes a mismatch when max-w-full
          // constrains the canvas to a smaller CSS width.
          // Disable touch scroll / pinch while in an editing mode so drags don't scroll the page.
          touchAction: alignMode || adjustMode ? 'none' : undefined,
        }}
        onMouseDown={
          alignMode
            ? handleAlignMouseDown
            : adjustMode && onLassoSelect
            ? handleLassoMouseDown
            : undefined
        }
        onDragStart={(e) => e.preventDefault()}
      >
        {isPDF ? (
          <canvas
            ref={canvasRef}
            className="block max-w-full rounded-lg border shadow-sm"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
        ) : previewUrl ? (
          <img
            ref={imgRef}
            src={previewUrl}
            alt="Uploaded document"
            className="block max-w-full rounded-lg border shadow-sm"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onLoad={handleImgLoad}
          />
        ) : null}

        {/* Lasso rubber-band — rendered BELOW the overlay layer so the
            boxes still catch hover/click while a lasso is in progress,
            but the dashed rectangle is visible across the whole
            selection area. Pointer-events-none because the lasso itself
            should never swallow clicks. */}
        {lasso && renderedSize && (
          (() => {
            const x1 = Math.min(lasso.startDocX, lasso.currentDocX);
            const y1 = Math.min(lasso.startDocY, lasso.currentDocY);
            const x2 = Math.max(lasso.startDocX, lasso.currentDocX);
            const y2 = Math.max(lasso.startDocY, lasso.currentDocY);
            return (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-primary/70 bg-primary/10 rounded-sm"
                style={{
                  left: `${x1}px`,
                  top: `${y1}px`,
                  width: `${x2 - x1}px`,
                  height: `${y2 - y1}px`,
                }}
              />
            );
          })()
        )}

        {/* Overlay layer */}
        {showOverlay && hasOverlays && renderedSize && (
          <div className="pointer-events-none absolute inset-0">
            {overlayFields.map(({ field: f, globalIndex }, idx) => {
              const b = f.bbox!;
              const leftPct = (b.xMin / 1000) * 100;
              const topPct = (b.yMin / 1000) * 100;
              const widthPct = ((b.xMax - b.xMin) / 1000) * 100;
              const heightPct = ((b.yMax - b.yMin) / 1000) * 100;
              const key = `${f.fieldName}-${globalIndex}`;
              const displayValue =
                editedValues[`${f.fieldName}-${globalIndex}`] ??
                editedValues[`${f.fieldName}-${idx}`] ??
                f.suggestedValue ??
                f.originalValue ??
                '';

              const isSelected = selectedIndexSet.has(globalIndex);
              return (
                <div
                  key={key}
                  className={cn(
                    'group absolute rounded-sm border-2 transition-colors duration-150',
                    // Boxes catch pointer events only when NOT in align mode (so align-drag passes through the whole surface).
                    alignMode ? 'pointer-events-none' : 'pointer-events-auto',
                    adjustMode ? 'cursor-move ring-2 ring-primary/40' : onFieldSelect ? 'cursor-pointer' : '',
                    sourceStyle(f.source),
                    isSelected && 'ring-2 ring-offset-1 ring-primary shadow-lg z-10',
                  )}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                  title={`${f.fieldName}: ${displayValue || '(empty)'}`}
                  onMouseDown={(e) => handleOverlayMouseDown(e, globalIndex, b, 'move')}
                  onClick={(e) => {
                    if (!onFieldSelect) return;
                    // In adjust mode a click follows every drag; if the user
                    // actually moved the box we don't want the click to
                    // additionally re-select it. The drag handler runs on
                    // mousemove, so if there was any movement the bbox
                    // already changed — but a pure tap still fires here.
                    e.stopPropagation();
                    onFieldSelect(globalIndex, {
                      shift: e.shiftKey,
                      meta: e.metaKey || e.ctrlKey,
                    });
                  }}
                >
                  {/* Label above the box — sticky in adjust mode, hover-only otherwise */}
                  <div
                    className={cn(
                      'pointer-events-none absolute left-0 -top-5 max-w-[260px] truncate rounded-sm bg-background/95 px-1.5 py-0.5 text-[10px] font-medium shadow-sm ring-1 ring-border',
                      adjustMode ? 'opacity-100' : 'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                      sourceTextColor(f.source),
                    )}
                  >
                    {f.fieldName}
                  </div>
                  {/* Inline value rendered inside the box when something to show */}
                  {displayValue && !adjustMode && (
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 flex items-center justify-start overflow-hidden px-0.5 text-[10px] font-medium leading-none',
                        sourceTextColor(f.source),
                      )}
                    >
                      <span className="truncate">{displayValue}</span>
                    </div>
                  )}
                  {/* Resize handle — only in adjust mode */}
                  {adjustMode && (
                    <div
                      role="button"
                      aria-label="Resize"
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-sm border border-background bg-primary shadow"
                      onMouseDown={(e) => handleOverlayMouseDown(e, globalIndex, b, 'resize')}
                    />
                  )}
                  {/* Delete button — appears on selected or hovered box so the
                      user can remove mis-detected fields right on the page.
                      Suppressed in align mode (pointer events are off on the
                      box anyway) to keep the whole-page drag surface clean. */}
                  {onFieldDelete && !alignMode && (
                    <button
                      type="button"
                      aria-label={`Delete ${f.fieldName}`}
                      title="Delete field"
                      className={cn(
                        'absolute -top-2 -right-2 h-5 w-5 rounded-full bg-rose-600 text-white shadow-md ring-2 ring-background',
                        'flex items-center justify-center',
                        'transition-opacity duration-150',
                        isSelected
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                        'hover:bg-rose-700',
                      )}
                      onMouseDown={(e) => {
                        // Stop the overlay's move-drag from starting when
                        // the user mousedowns on the delete button.
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFieldDelete(globalIndex);
                      }}
                    >
                      <X className="h-3 w-3" strokeWidth={3} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Page nav for PDFs */}
      {isPDF && pageCount > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="h-7 w-7 p-0 rounded-lg"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {currentPage} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pageCount}
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            className="h-7 w-7 p-0 rounded-lg"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
