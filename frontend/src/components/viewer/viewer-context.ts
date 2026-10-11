import { createContext, useContext } from 'react';

/** A file to preview: fetched from an authorised API path, so access control stays on the server. */
export interface PreviewFile {
  /** API path, e.g. /cases/<id>/documents/<docId>/download */
  path: string;
  /** Shown in the toolbar and used for the download. */
  name: string;
  kind: 'pdf' | 'image';
}

export interface ViewerState {
  open: (file: PreviewFile) => void;
}

export const ViewerContext = createContext<ViewerState | null>(null);

/** Opens the document viewer (PDF) or image lightbox. A no-op outside the provider (isolated tests). */
export function useViewer(): ViewerState {
  return useContext(ViewerContext) ?? { open: () => undefined };
}

/** PDFs open in the PDF viewer, common image types in the lightbox; anything else has no preview. */
export function previewKind(nameOrType: string): PreviewFile['kind'] | null {
  const v = nameOrType.toLowerCase();
  if (v.endsWith('.pdf') || v.includes('application/pdf')) return 'pdf';
  if (/\.(png|jpe?g|webp|gif)$/.test(v) || v.startsWith('image/')) return 'image';
  return null;
}
