'use client';

import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PdfCoordinatePickerProps = {
  /** Shown until the user uploads a file — e.g. `/forms/AMSA_Form_771.pdf` */
  defaultDocumentUrl?: string;
  title?: string;
  description?: string;
};

/** pdf-lib overlay convention: x from left, top from top of page (points). */
function formatCoordSnippet(x: number, top: number): string {
  return `{ x: ${x}, top: ${top} }`;
}

type MarkerNorm = { nx: number; ny: number };

export function PdfCoordinatePicker({
  defaultDocumentUrl,
  title = 'PDF coordinate picker',
  description = 'Upload a PDF or use the default template. Click anywhere on the page — coordinates are copied for use with pdf-lib overlays (same convention as generateAmsa771Testimonial). Use PDF.js here, not the browser’s built-in PDF viewer.',
}: PdfCoordinatePickerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [defaultUsed, setDefaultUsed] = useState(!!defaultDocumentUrl);
  const effectiveSrc = blobUrl ?? defaultDocumentUrl ?? null;

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  const [last, setLast] = useState<{ x: number; top: number } | null>(null);
  const [marker, setMarker] = useState<MarkerNorm | null>(null);
  const [copied, setCopied] = useState(false);

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderStateRef = useRef<{
    viewport: PageViewport;
    pageHeightPt: number;
  } | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      void pdfDocumentRef.current?.destroy().catch(() => {});
      pdfDocumentRef.current = null;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Load PDF document when effectiveSrc changes
  useEffect(() => {
    if (!effectiveSrc) {
      setPdfDocument(null);
      setNumPages(0);
      setPageNum(1);
      return;
    }

    let cancelled = false;
    setDocLoading(true);
    setLoadError(null);
    pageRef.current = null;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const prev = pdfDocumentRef.current;
        if (prev) {
          try {
            await prev.destroy();
          } catch {
            /* ignore */
          }
          pdfDocumentRef.current = null;
        }

        const loadingTask = pdfjs.getDocument(effectiveSrc);
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy().catch(() => {});
          return;
        }
        pdfDocumentRef.current = pdf;
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);
        setPageNum(1);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load PDF');
          pdfDocumentRef.current = null;
          setPdfDocument(null);
          setNumPages(0);
        }
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveSrc]);

  // Current PDF page → pageRef
  useEffect(() => {
    if (!pdfDocument) {
      pageRef.current = null;
      return;
    }

    let cancelled = false;
    pageRef.current = null;

    (async () => {
      try {
        const page = await pdfDocument.getPage(pageNum);
        if (cancelled) return;
        pageRef.current = page;
        setCanvasEpoch((n) => n + 1);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load page');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pageNum]);

  // Render canvas when container size or page changes
  useEffect(() => {
    if (!pdfDocument) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const render = async () => {
      const page = pageRef.current;
      if (!page) return;

      const cw = container.clientWidth;
      if (cw < 8) return;

      const base = page.getViewport({ scale: 1 });
      const scale = cw / base.width;
      const viewport = page.getViewport({ scale });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const prev = renderTaskRef.current;
      if (prev) {
        try {
          prev.cancel();
        } catch {
          /* ignore */
        }
        renderTaskRef.current = null;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch (e: unknown) {
        const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
        if (name === 'RenderingCancelledException') return;
        throw e;
      } finally {
        renderTaskRef.current = null;
      }

      renderStateRef.current = { viewport, pageHeightPt: base.height };
      setDims({ w: viewport.width, h: viewport.height });
    };

    const ro = new ResizeObserver(() => {
      void render();
    });
    ro.observe(container);

    void render();

    return () => {
      ro.disconnect();
      const t = renderTaskRef.current;
      if (t) {
        try {
          t.cancel();
        } catch {
          /* ignore */
        }
      }
    };
  }, [pdfDocument, canvasEpoch, pageNum]);

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const st = renderStateRef.current;
    if (!canvas || !st) return;

    const rect = canvas.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const vy = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const [pdfX, pdfY] = st.viewport.convertToPdfPoint(vx, vy);
    const top = st.pageHeightPt - pdfY;

    const x = Math.round(pdfX * 10) / 10;
    const t = Math.round(top * 10) / 10;
    const coords = { x, top: t };
    setLast(coords);
    setMarker({ nx: vx / canvas.width, ny: vy / canvas.height });

    const text = formatCoordSnippet(coords.x, coords.top);
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    })();
  }, []);

  const copyAgain = useCallback(async () => {
    if (!last) return;
    try {
      await navigator.clipboard.writeText(formatCoordSnippet(last.x, last.top));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [last]);

  const onFile = useCallback((file: File | null) => {
    if (!file || file.type !== 'application/pdf') {
      setLoadError(file ? 'Please choose a PDF file.' : '');
      return;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const url = URL.createObjectURL(file);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = url;
    setBlobUrl(url);
    setDefaultUsed(false);
    setLast(null);
    setMarker(null);
    setLoadError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const useDefaultTemplate = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlobUrl(null);
    setDefaultUsed(!!defaultDocumentUrl);
    setLast(null);
    setMarker(null);
    setLoadError(null);
  }, [defaultDocumentUrl]);

  const snippet = last ? formatCoordSnippet(last.x, last.top) : '';

  return (
    <div className="mx-auto max-w-[min(100%,96rem)] space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>

      <div className="bg-card/95 supports-[backdrop-filter]:bg-card/90 sticky top-0 z-40 space-y-4 rounded-lg border border-border/80 p-4 shadow-md backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
          <div className="space-y-2">
            <Label htmlFor="pdf-upload">PDF file</Label>
            <input
              id="pdf-upload"
              type="file"
              accept="application/pdf"
              className="text-muted-foreground block w-full max-w-md text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {defaultDocumentUrl ? (
            <Button type="button" variant="outline" onClick={useDefaultTemplate}>
              Use default template
            </Button>
          ) : null}
          {numPages > 1 ? (
            <div className="space-y-2">
              <Label>Page</Label>
              <Select
                value={String(pageNum)}
                onValueChange={(v) => setPageNum(Number.parseInt(v, 10) || 1)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      Page {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Last click (auto-copied)</p>
          {docLoading ? (
            <p className="text-muted-foreground text-sm">Loading PDF…</p>
          ) : loadError ? (
            <p className="text-destructive text-sm">{loadError}</p>
          ) : !effectiveSrc ? (
            <p className="text-muted-foreground text-sm">
              Upload a PDF{defaultDocumentUrl ? ', or use the default template button' : ''}, then click the preview.
            </p>
          ) : last ? (
            <div className="space-y-3">
              <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs leading-relaxed">
                {`x: ${last.x}  top: ${last.top}  (pt; top from top of page, pdf-lib / SeaJourney overlays)`}
              </pre>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <pre className="bg-muted min-h-[2.75rem] flex-1 overflow-x-auto rounded-md p-3 text-xs leading-relaxed">
                  {snippet}
                </pre>
                <Button type="button" className="shrink-0 sm:self-start" onClick={copyAgain} disabled={!snippet}>
                  {copied ? 'Copied' : 'Copy again'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Click the preview to capture coordinates (copied automatically).</p>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="bg-muted/40 relative w-full overflow-hidden rounded-lg border shadow-sm"
        style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : { minHeight: 'min(70vh, 900px)' }}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {!effectiveSrc ? (
          <div className="text-muted-foreground flex min-h-[320px] items-center justify-center p-6 text-sm">
            No document loaded.
          </div>
        ) : loadError && !pdfDocument ? (
          <div className="text-destructive p-6 text-sm">{loadError}</div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              role="presentation"
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onClick={onCanvasClick}
              title="Click to sample x / top"
            />
            {marker ? (
              <div className="pointer-events-none absolute inset-0 z-10">
                <div
                  className="absolute bg-red-500/75"
                  style={{
                    left: 0,
                    right: 0,
                    top: `${marker.ny * 100}%`,
                    height: 1,
                    transform: 'translateY(-50%)',
                  }}
                />
                <div
                  className="absolute bg-red-500/75"
                  style={{
                    top: 0,
                    bottom: 0,
                    left: `${marker.nx * 100}%`,
                    width: 1,
                    transform: 'translateX(-50%)',
                  }}
                />
                <div
                  className="absolute h-2.5 w-2.5 rounded-full border-2 border-red-600 bg-background shadow-md ring-1 ring-red-500/30"
                  style={{
                    left: `${marker.nx * 100}%`,
                    top: `${marker.ny * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {effectiveSrc ? (
          <>
            Source: {blobUrl ? 'Uploaded file' : defaultUsed && defaultDocumentUrl ? defaultDocumentUrl : 'PDF'}
            {numPages > 0 ? ` · ${numPages} page(s)` : ''}
          </>
        ) : null}
      </p>
    </div>
  );
}
