import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { ViewerContext, type PreviewFile } from './viewer-context';

const DocumentViewer = lazy(() => import('./DocumentViewer'));

/** Holds the file being previewed; the viewer itself (pdf.js) is a lazy chunk loaded at the first preview. */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<PreviewFile | null>(null);
  const open = useCallback((f: PreviewFile) => setFile(f), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <ViewerContext.Provider value={value}>
      {children}
      {file && (
        <Suspense fallback={null}>
          <DocumentViewer file={file} onClose={() => setFile(null)} />
        </Suspense>
      )}
    </ViewerContext.Provider>
  );
}
