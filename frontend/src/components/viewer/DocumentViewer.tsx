import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileWarning,
  Maximize2,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, parseApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PreviewFile } from './viewer-context';

// The pdf.js worker is bundled with the app (no CDN).
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const FIT = 2; // index of 1 (fit width)

/**
 * Preview of a PDF (pdf.js) or an image. The file is fetched through the existing authorised download endpoint
 * as a blob (session cookie included), so access control stays on the server; the object URL is revoked on
 * close. Toolbar: name, page n / total, previous and next, zoom out, fit width, zoom in, download, print, close.
 * Keyboard: arrow keys and Page Up/Down change page, + and - zoom, 0 fits the width, Escape closes. On phones it
 * fills the screen and a horizontal swipe changes page.
 */
export default function DocumentViewer({
  file,
  onClose,
}: {
  file: PreviewFile;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(FIT);
  const [width, setWidth] = useState(0);
  const touchX = useRef<number | null>(null);

  // Fetch the file as a blob; revoke the URL when the viewer closes or the file changes.
  useEffect(() => {
    let href: string | null = null;
    let cancelled = false;
    api
      .get<Blob>(file.path, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        href = URL.createObjectURL(res.data);
        setUrl(href);
      })
      .catch((e) => !cancelled && setError(parseApiError(e).message));
    return () => {
      cancelled = true;
      if (href) URL.revokeObjectURL(href);
    };
  }, [file.path]);

  // Fit width follows the viewer size. A callback ref, because the Radix portal mounts after the first render.
  const observer = useRef<ResizeObserver | null>(null);
  const areaRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(240, entry.contentRect.width - 32));
    });
    observer.current.observe(el);
  }, []);

  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const next = useCallback(() => setPage((p) => Math.min(pages || 1, p + 1)), [pages]);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0, z - 1)), []);

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const print = () => {
    if (!url) return;
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward || e.key === 'ArrowDown' || e.key === 'PageDown') next();
    else if (e.key === back || e.key === 'ArrowUp' || e.key === 'PageUp') prev();
    else if (e.key === '+' || e.key === '=') zoomIn();
    else if (e.key === '-') zoomOut();
    else if (e.key === '0') setZoom(FIT);
    else return;
    e.preventDefault();
  };

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    const end = e.changedTouches[0]?.clientX;
    touchX.current = null;
    if (start == null || end == null || zoom > FIT) return;
    const dx = end - start;
    if (Math.abs(dx) < 60) return;
    // Swipe toward the reading start goes forward.
    if (dx < 0 !== rtl) next();
    else prev();
  };

  const isPdf = file.kind === 'pdf';
  const scale = ZOOMS[zoom];
  const toolButton =
    'inline-flex size-10 items-center justify-center rounded-md text-text hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40';

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(26,26,26,0.7)]" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-background sm:inset-4 sm:rounded-lg sm:border sm:border-border lg:inset-x-[8vw] lg:inset-y-6"
        >
          <header className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5 sm:px-3">
            <DialogPrimitive.Title
              className="min-w-0 flex-1 truncate px-1 text-sm font-semibold"
              dir="auto"
            >
              {file.name}
            </DialogPrimitive.Title>
            {isPdf && (
              <div className="flex items-center gap-1" role="group" aria-label={t('Pages')}>
                <button
                  type="button"
                  className={toolButton}
                  onClick={prev}
                  disabled={page <= 1}
                  aria-label={t('Previous page')}
                >
                  <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                </button>
                <span
                  className="min-w-14 text-center text-sm tabular-nums"
                  aria-live="polite"
                  dir="ltr"
                >
                  {pages ? `${page} / ${pages}` : '–'}
                </span>
                <button
                  type="button"
                  className={toolButton}
                  onClick={next}
                  disabled={!pages || page >= pages}
                  aria-label={t('Next page')}
                >
                  <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1" role="group" aria-label={t('Zoom')}>
              <button
                type="button"
                className={toolButton}
                onClick={zoomOut}
                disabled={zoom === 0}
                aria-label={t('Zoom out')}
              >
                <ZoomOut className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={toolButton}
                onClick={() => setZoom(FIT)}
                aria-label={t('Fit width')}
                aria-pressed={zoom === FIT}
              >
                <Maximize2 className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={toolButton}
                onClick={zoomIn}
                disabled={zoom === ZOOMS.length - 1}
                aria-label={t('Zoom in')}
              >
                <ZoomIn className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={toolButton}
                onClick={download}
                disabled={!url}
                aria-label={t('Download')}
              >
                <Download className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cn(toolButton, 'hidden sm:inline-flex')}
                onClick={print}
                disabled={!url}
                aria-label={t('Print')}
              >
                <Printer className="size-5" aria-hidden="true" />
              </button>
              <DialogPrimitive.Close className={toolButton} aria-label={t('Close preview')}>
                <X className="size-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div
            ref={areaRef}
            className="relative flex-1 overflow-auto p-4"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            tabIndex={0}
            aria-label={t('Document')}
          >
            {/* react-pdf suspends while it loads; keep the toolbar visible meanwhile. */}
            <Suspense fallback={<ViewerLoading />}>
              {error ? (
                <ViewerError message={error} onDownload={download} canDownload={false} />
              ) : !url ? (
                <ViewerLoading />
              ) : isPdf ? (
                <Document
                  file={url}
                  loading={<ViewerLoading />}
                  error={
                    <ViewerError
                      message={t('This PDF could not be displayed.')}
                      onDownload={download}
                      canDownload
                    />
                  }
                  onLoadSuccess={({ numPages }) => {
                    setPages(numPages);
                    setPage((p) => Math.min(p, numPages));
                  }}
                  className="flex justify-center"
                >
                  <Page
                    pageNumber={page}
                    width={width ? Math.round(width * scale) : undefined}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={<Skeleton className="h-[70vh] w-full max-w-3xl" />}
                    className="shadow-[0_2px_12px_rgba(0,0,0,0.15)]"
                  />
                </Document>
              ) : (
                <div className="flex min-h-full items-center justify-center">
                  <img
                    src={url}
                    alt={file.name}
                    style={{ width: width ? Math.round(Math.min(width, 900) * scale) : undefined }}
                    className="max-w-none rounded-md bg-surface shadow-[0_2px_12px_rgba(0,0,0,0.15)]"
                    onError={() => setError(t('This image could not be displayed.'))}
                  />
                </div>
              )}
            </Suspense>
          </div>
          {isPdf && pages > 1 && (
            <p className="border-t border-border bg-surface px-3 py-1 text-center text-xs text-text-muted sm:hidden">
              {t('Swipe to change page')}
            </p>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ViewerLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" className="mx-auto w-full max-w-3xl space-y-3">
      <Skeleton className="h-[70vh] w-full" />
      <span className="sr-only">{t('Loading document')}</span>
    </div>
  );
}

function ViewerError({
  message,
  onDownload,
  canDownload,
}: {
  message: string;
  onDownload: () => void;
  canDownload: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-status-rejected-bg text-destructive">
        <FileWarning className="size-6" aria-hidden="true" />
      </span>
      <p className="font-semibold">{message}</p>
      {canDownload && (
        <>
          <p className="text-sm text-text-muted">
            {t('You can still download the file and open it on your device.')}
          </p>
          <Button onClick={onDownload}>
            <Download aria-hidden="true" /> {t('Download')}
          </Button>
        </>
      )}
    </div>
  );
}
