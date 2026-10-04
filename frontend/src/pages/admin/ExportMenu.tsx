import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { reportsApi, type ReportFormat, type ReportKind } from '@/lib/phase4e-api';

const FORMATS: { value: ReportFormat; label: string; hint: string }[] = [
  { value: 'PDF', label: 'PDF document', hint: 'Watermarked pages with a verification footer.' },
  { value: 'EXCEL', label: 'Excel workbook', hint: 'Data sheets plus a Verification sheet.' },
];

/** "Export Document Format File": choose PDF or Excel, then "Execute Data Export Compilation". */
export function ExportMenu({
  kind,
  params,
  disabled,
  title = 'Export Document Format File',
}: {
  kind: ReportKind;
  params: Record<string, unknown>;
  disabled?: boolean;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => reportsApi.exportFile({ kind, format, params }),
    onSuccess: async ({ code }) => {
      setError(null);
      toast.success(`Export compiled and downloaded. Verification code ${code}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'history'] });
    },
    onError: async (e) => {
      // A failed blob download carries its JSON error inside a Blob.
      let message = parseApiError(e).message;
      const data = (e as { response?: { data?: unknown } }).response?.data;
      if (data instanceof Blob) {
        try {
          const body = JSON.parse(await data.text()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // keep the generic message
        }
      }
      setError(message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileDown className="size-5 text-primary" aria-hidden="true" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">File format</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMATS.map((f) => (
              <label
                key={f.value}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name={`export-format-${kind}`}
                  className="mt-1 size-4 accent-primary"
                  checked={format === f.value}
                  onChange={() => setFormat(f.value)}
                />
                <span>
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-sm text-text-muted">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <Alert variant="error">{error}</Alert>}
        <Button onClick={() => run.mutate()} loading={run.isPending} disabled={disabled}>
          <FileDown aria-hidden="true" /> Execute Data Export Compilation
        </Button>
        <p className="text-sm text-text-muted">
          Every file is stamped with a verification code you can check later under Report history.
        </p>
      </CardContent>
    </Card>
  );
}
