import { vaultKey } from '@/lib/query-keys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Download,
  FileText,
  Lock,
  Paperclip,
  Pencil,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { PdfDropZone } from '@/components/ui/pdf-drop-zone';
import { ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { casesApi } from '@/lib/cases-api';
import { formatDate, formatFileSize } from '@/lib/format';
import {
  EVIDENCE_CATEGORIES,
  evidenceApi,
  type EvidenceCategory,
  type VaultItem,
} from '@/lib/phase4-api';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

// eslint-disable-next-line react-refresh/only-export-components -- message constant, translated where shown
export const LOCKED_TOOLTIP = msg('Action Denied: Document is locked by order of the bench.');
// eslint-disable-next-line react-refresh/only-export-components -- message constant, translated where shown
export const EXHIBIT_ADDED = msg('Digital Exhibit Log Added Successfully.');
const MIN_DESC = 10;
const MAX_DESC = 500;

const categoryLabel = (c: EvidenceCategory | null) =>
  EVIDENCE_CATEGORIES.find((x) => x.value === c)?.label ?? '—';

function ShaCell({ sha }: { sha: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs" title={sha}>
        {sha.slice(0, 10)}…
      </span>
      <button
        type="button"
        aria-label={t('Copy SHA-256')}
        className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-primary-soft hover:text-primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(sha);
            toast.success(t('SHA-256 copied.'));
          } catch {
            toast.error(t('Could not copy. Select the value and copy it manually.'));
          }
        }}
      >
        <Copy className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}

function LockedBadge() {
  const { t } = useTranslation();
  return (
    <Badge variant="neutral">
      <span className="inline-flex items-center gap-1">
        <Lock className="size-3" aria-hidden="true" /> {t('Locked')}
      </span>
    </Badge>
  );
}

/** Exhibit upload form (UC-5.1). */
function UploadPanel({ caseId, blockedReason }: { caseId: string; blockedReason: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<EvidenceCategory>('SCANNED_DOCUMENT');
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const disabled = Boolean(blockedReason);
  const meta = EVIDENCE_CATEGORIES.find((c) => c.value === category)!;

  const upload = useMutation({
    mutationFn: () =>
      evidenceApi.upload(caseId, { category, description: description.trim(), files }, setProgress),
    onSuccess: async (res) => {
      setSuccess(res.message || EXHIBIT_ADDED);
      toast.success(res.message || EXHIBIT_ADDED);
      setFiles([]);
      setDescription('');
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: vaultKey(caseId) });
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (e) => {
      setProgress(null);
      setError(parseApiError(e).message);
    },
  });

  function pick(list: FileList | null) {
    if (!list) return;
    const allowed = meta.extensions;
    const chosen = Array.from(list);
    const bad = chosen.find((f) => !allowed.includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
    if (bad) {
      setLocalError(
        t('Choose files of the type {{category}} only ({{extensions}}).', {
          category: t(meta.label),
          extensions: allowed.join(', '),
        }),
      );
      return;
    }
    setLocalError(null);
    setFiles((cur) => [...cur, ...chosen].slice(0, 5));
    if (inputRef.current) inputRef.current.value = '';
  }

  const descOk = description.trim().length >= MIN_DESC && description.trim().length <= MAX_DESC;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Upload digital exhibits')}</CardTitle>
        <p className="text-sm text-text-muted">
          {t(
            'Files are encrypted and sealed with a SHA-256 hash. Video: mp4, webm. Audio: mp3, wav, m4a. Scanned records: pdf, jpg, png. Up to 5 files at a time.',
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {blockedReason && <Alert variant="info">{blockedReason}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset disabled={disabled || upload.isPending} className="space-y-4">
          <Field label={t('File category')} required>
            {(p) => (
              <NativeSelect
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as EvidenceCategory);
                  setFiles([]);
                  setLocalError(null);
                }}
                {...p}
              >
                {EVIDENCE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.label)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label={t('Choose exhibit files')}
              accept={meta.extensions.map((x) => `.${x}`).join(',')}
              onChange={(e) => pick(e.target.files)}
            />
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              <UploadCloud aria-hidden="true" /> {t('Choose files')}
            </Button>
            {localError && (
              <p role="alert" className="mt-2 text-sm font-medium text-destructive">
                {localError}
              </p>
            )}
            {files.length > 0 && (
              <ul className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 break-words">
                      {f.name} <span className="text-text-muted">({formatFileSize(f.size)})</span>
                    </span>
                    <button
                      type="button"
                      aria-label={t('Remove {{name}}', { name: f.name })}
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-primary-soft"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Field
            label={t('Descriptive summary')}
            required
            hint={t('{{count}}/{{max}} characters (at least {{min}})', {
              count: description.trim().length,
              max: MAX_DESC,
              min: MIN_DESC,
            })}
          >
            {(p) => (
              <Textarea
                rows={3}
                maxLength={MAX_DESC}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                {...p}
              />
            )}
          </Field>
          {progress !== null && <ProgressBar value={progress} label={t('Uploading exhibits')} />}
          <Button
            type="button"
            loading={upload.isPending}
            disabled={files.length === 0 || !descOk}
            onClick={() => {
              setSuccess(null);
              setError(null);
              upload.mutate();
            }}
          >
            <Paperclip aria-hidden="true" /> {t('Submit Exhibit Entry to Vault')}
          </Button>
        </fieldset>
      </CardContent>
    </Card>
  );
}

function ExhibitRow({
  caseId,
  item,
  selection,
}: {
  caseId: string;
  item: VaultItem;
  selection?: { ids: Set<string>; toggle: (id: string) => void };
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: vaultKey(caseId) });
  const save = useMutation({
    mutationFn: () => evidenceApi.updateDescription(caseId, item.id, text.trim()),
    onSuccess: async (res) => {
      toast.success(res.message);
      setEditing(false);
      setError(null);
      await refresh();
    },
    onError: (e) => setError(parseApiError(e).message),
  });
  const remove = useMutation({
    mutationFn: () => evidenceApi.remove(caseId, item.id),
    onSuccess: async (res) => {
      toast.success(res.message);
      setConfirming(false);
      await refresh();
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(parseApiError(e).message);
    },
  });

  async function download() {
    setDownloading(true);
    try {
      await evidenceApi.downloadExhibit(caseId, item);
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <TableRow>
      {selection && (
        <TableCell>
          <input
            type="checkbox"
            className="size-4"
            aria-label={t('Select {{name}}', { name: item.name })}
            disabled={item.locked}
            checked={selection.ids.has(item.id)}
            onChange={() => selection.toggle(item.id)}
          />
        </TableCell>
      )}
      <TableCell className="min-w-56">
        <span className="block font-medium">{item.name}</span>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              rows={3}
              maxLength={MAX_DESC}
              value={text}
              aria-label={t('Exhibit description')}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              {t('{{length}}/{{MAX_DESC}} (at least {{MIN_DESC}})', {
                length: text.trim().length,
                MAX_DESC,
                MIN_DESC,
              })}
            </p>
            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => save.mutate()}
                loading={save.isPending}
                disabled={text.trim().length < MIN_DESC}
              >
                {t('Save')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setText(item.description ?? '');
                  setError(null);
                }}
              >
                {t('Cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <span className="block text-sm text-text-muted">{item.description}</span>
        )}
        {item.locked && item.lockReason && (
          <span className="mt-1 block text-xs text-text-muted">
            {t('Order: {{lockReason}}', { lockReason: item.lockReason })}
          </span>
        )}
      </TableCell>
      <TableCell>{categoryLabel(item.category)}</TableCell>
      <TableCell className="whitespace-nowrap">{formatFileSize(item.sizeBytes)}</TableCell>
      <TableCell>
        <ShaCell sha={item.sha256} />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(item.uploadedAt)}
        <span className="block text-sm text-text-muted">{item.uploadedBy}</span>
      </TableCell>
      <TableCell>{item.locked && <LockedBadge />}</TableCell>
      <TableCell>
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={download}
            loading={downloading}
            aria-label={t('Download {{name}}', { name: item.name })}
          >
            <Download aria-hidden="true" /> {t('Download')}
          </Button>
          {item.canEdit && (
            <>
              <span title={item.locked ? LOCKED_TOOLTIP : undefined}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.locked}
                  onClick={() => setEditing(true)}
                  aria-label={t('Edit description of {{name}}', { name: item.name })}
                >
                  <Pencil aria-hidden="true" /> {t('Edit')}
                </Button>
              </span>
              <span title={item.locked ? LOCKED_TOOLTIP : undefined}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.locked}
                  onClick={() => setConfirming(true)}
                  aria-label={
                    item.locked
                      ? t('Delete {{name}}. {{LOCKED_TOOLTIP}}', {
                          name: item.name,
                          LOCKED_TOOLTIP,
                        })
                      : t('Delete {{name}}', { name: item.name })
                  }
                >
                  <Trash2 aria-hidden="true" /> {t('Delete')}
                </Button>
              </span>
            </>
          )}
        </div>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t('Delete this exhibit?')}
          description={t(
            '{{name}} will be removed from the vault. The deletion is recorded in the audit trail.',
            { name: item.name },
          )}
          confirmLabel={t('Delete')}
          destructive
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      </TableCell>
    </TableRow>
  );
}

/**
 * "Manage Vault Docs" (UC-5.2): pleadings (locked on filing) and digital exhibits of a case.
 * `readOnly` hides upload, edit and delete (judge view). `selection` adds checkboxes for the judge's lock order.
 */
export default function VaultPanel({
  caseId,
  canAttachPleadings = false,
  readOnly = false,
  selection,
}: {
  caseId: string;
  canAttachPleadings?: boolean;
  readOnly?: boolean;
  selection?: { ids: Set<string>; toggle: (id: string) => void };
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: vaultKey(caseId),
    queryFn: () => evidenceApi.vault(caseId),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [pleadingError, setPleadingError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const attach = useMutation({
    mutationFn: () => casesApi.addDocuments(caseId, files, setProgress),
    onSuccess: async (res) => {
      toast.success(res.message);
      setFiles([]);
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: vaultKey(caseId) });
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: (e) => {
      setProgress(null);
      setPleadingError(parseApiError(e).message);
    },
  });

  if (isPending) return <Skeleton className="h-64" />;
  if (isError || !data) return <Alert variant="error">{parseApiError(error).message}</Alert>;

  async function download(item: VaultItem) {
    setDownloading(item.id);
    try {
      await evidenceApi.downloadPleading(caseId, item);
    } catch (e) {
      toast.error(parseApiError(e).message);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('Pleadings')}</CardTitle>
          <p className="flex items-center gap-1.5 text-sm text-text-muted">
            <Lock className="size-4" aria-hidden="true" />{' '}
            {t('Pleadings are locked to the case number and cannot be changed or deleted.')}
          </p>
        </CardHeader>
        {data.pleadings.length === 0 ? (
          <EmptyState icon={FileText} title={t('No pleadings attached yet')} />
        ) : (
          <div className="p-5">
            <Table aria-label={t('Pleadings')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Size')}</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead>{t('Uploaded')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('Actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pleadings.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="min-w-48 font-medium">
                      {d.name} <LockedBadge />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatFileSize(d.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <ShaCell sha={d.sha256} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(d.uploadedAt)}
                      <span className="block text-sm text-text-muted">{d.uploadedBy}</span>
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={downloading === d.id}
                        onClick={() => download(d)}
                        aria-label={t('Download {{name}}', { name: d.name })}
                      >
                        <Download aria-hidden="true" /> {t('Download')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {canAttachPleadings && !readOnly && (
          <CardContent className="space-y-3 border-t border-border">
            <p className="font-semibold">{t('Attach more pleadings')}</p>
            {pleadingError && <Alert variant="error">{pleadingError}</Alert>}
            <PdfDropZone
              files={files}
              onFilesChange={(next) => {
                setPleadingError(null);
                setFiles(next);
              }}
              disabled={attach.isPending}
            />
            {progress !== null && <ProgressBar value={progress} label={t('Uploading pleadings')} />}
            <Button
              disabled={files.length === 0 || attach.isPending}
              loading={attach.isPending}
              onClick={() => {
                setPleadingError(null);
                attach.mutate();
              }}
            >
              <Paperclip aria-hidden="true" />{' '}
              {files.length > 1
                ? t('Attach {{count}} documents', { count: files.length })
                : t('Attach document')}
            </Button>
          </CardContent>
        )}
      </Card>

      {!readOnly && <UploadPanel caseId={caseId} blockedReason={data.uploadBlockedReason} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('Exhibits')}</CardTitle>
          <p className="text-sm text-text-muted">
            {t(
              'Digital exhibits submitted to the vault. A judge can lock exhibits by order of the bench.',
            )}
          </p>
        </CardHeader>
        {data.exhibits.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('No exhibits in the vault')}
            description={t('Submitted video, audio and scanned records appear here.')}
          />
        ) : (
          <div className="p-5">
            <Table aria-label={t('Exhibits')}>
              <TableHeader>
                <TableRow>
                  {selection && (
                    <TableHead>
                      <span className="sr-only">{t('Select')}</span>
                    </TableHead>
                  )}
                  <TableHead>{t('Exhibit')}</TableHead>
                  <TableHead>{t('Category')}</TableHead>
                  <TableHead>{t('Size')}</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead>{t('Added')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('Actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.exhibits.map((x) => (
                  <ExhibitRow key={x.id} caseId={caseId} item={x} selection={selection} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
