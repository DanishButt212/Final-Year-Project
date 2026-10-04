import { FileText, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatFileSize } from '@/lib/format';
import { usePublicSettings } from '@/hooks/use-public-settings';
import { checkPdfFiles } from '@/lib/pdf-files';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Drag-and-drop or click-to-choose PDF picker with a per-file list (name, size, remove).
 * Files are checked here (extension, active size limit, count); the server checks the real content again.
 */
export function PdfDropZone({
  files,
  onFilesChange,
  disabled,
  serverError,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  /** An error returned by the server for the files (for example a fake PDF). */
  serverError?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { maxAttachmentMb } = usePublicSettings();
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const error = localError ?? serverError ?? null;

  function addFiles(list: FileList | File[] | null) {
    if (!list || disabled) return;
    const { accepted, error: problem } = checkPdfFiles(Array.from(list), files, maxAttachmentMb);
    setLocalError(problem);
    if (accepted.length > 0) onFilesChange([...files, ...accepted]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center',
          dragging ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
          error && 'border-destructive',
        )}
      >
        <UploadCloud className="size-8 text-primary" aria-hidden="true" />
        <p className="font-semibold">Drag PDF files here</p>
        <p className="text-sm text-text-muted">
          or choose them from your device. PDF only, up to {maxAttachmentMb} MB each, at most 10
          files.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose PDF files"
          data-testid="pdf-input"
          disabled={disabled}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = ''; // allow choosing the same file again after removing it
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose PDF files
        </Button>
      </div>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      {files.length > 0 && (
        <ul
          className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface"
          aria-label="Selected files"
        >
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words text-sm font-medium">{file.name}</span>
              <span className="shrink-0 text-sm text-text-muted">{formatFileSize(file.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setLocalError(null);
                  onFilesChange(files.filter((f) => f !== file));
                }}
                aria-label={`Remove ${file.name}`}
                className="flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-primary-soft hover:text-destructive disabled:opacity-50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
