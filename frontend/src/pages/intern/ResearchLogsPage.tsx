import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { NotebookPen, Pencil, Save } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { internApi, MSG, type ResearchLog } from '@/lib/chamber-api';
import { applyServerError } from '@/lib/form-errors';
import { formatDate } from '@/lib/format';
import { MESSAGES } from '@/lib/schemas';
import { ChipInput } from '@/pages/chamber/shared';
import { LogStatusBadge } from '@/pages/chamber/InternsPages';

const NOTES_MESSAGE = 'Relevant law notes must be 50 to 5000 characters.';
const schema = z.object({
  caseNumber: z.string().min(1, MESSAGES.fieldRequired),
  keywords: z.array(z.string()).min(1, 'Add at least one keyword.'),
  citation: z.string().trim().min(1, MSG.incompleteLog),
  notes: z
    .string()
    .trim()
    .min(1, MSG.incompleteLog)
    .min(50, NOTES_MESSAGE)
    .max(5000, NOTES_MESSAGE),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = { caseNumber: '', keywords: [], citation: '', notes: '' };

/** "Apprentice Diary / Research Logs" */
export default function ResearchLogsPage() {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ResearchLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const cases = useQuery({ queryKey: ['intern', 'cases'], queryFn: internApi.cases });
  const list = useQuery({
    queryKey: ['intern', 'logs', page],
    queryFn: () => internApi.logs({ page, limit: 8 }),
    placeholderData: keepPreviousData,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const notes = useWatch({ control, name: 'notes' }) ?? '';

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        caseNumber: v.caseNumber,
        keywords: v.keywords,
        citation: v.citation.trim(),
        notes: v.notes.trim(),
      };
      return editing ? internApi.updateLog(editing.id, body) : internApi.createLog(body);
    },
    onSuccess: async (res) => {
      setFormError(null);
      setSuccess(res.message);
      toast.success(res.message);
      setEditing(null);
      reset(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ['intern'] });
    },
    onError: (e) => {
      setSuccess(null);
      setFormError(applyServerError(e, setError, ['caseNumber', 'keywords', 'citation', 'notes']));
    },
  });

  const startEdit = (l: ResearchLog) => {
    setEditing(l);
    setSuccess(null);
    setFormError(null);
    reset({ caseNumber: l.ucn ?? '', keywords: l.keywords, citation: l.citation, notes: l.notes });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader
        title="Apprentice Diary / Research Logs"
        description="Record the legal research you did. Each log is linked to your chamber's private repository and reviewed by your supervisor."
        crumbs={[{ label: 'Dashboard', to: '/intern' }, { label: 'Research Logs' }]}
      />
      <div ref={formRef}>
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NotebookPen className="size-5 text-primary" aria-hidden="true" />
              {editing ? 'Edit research log' : 'New research log'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              className="space-y-4"
              onSubmit={handleSubmit(
                (v) => {
                  setFormError(null);
                  setSuccess(null);
                  save.mutate(v);
                },
                (errs) => {
                  setSuccess(null);
                  // The exact message the requirement document prescribes when a citation box is empty.
                  setFormError(
                    errs.citation?.message === MSG.incompleteLog ||
                      errs.notes?.message === MSG.incompleteLog
                      ? MSG.incompleteLog
                      : MESSAGES.invalidFields,
                  );
                },
              )}
            >
              {success && <Alert variant="success">{success}</Alert>}
              {formError && <Alert variant="error">{formError}</Alert>}
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Target Case Number"
                  required
                  error={errors.caseNumber?.message}
                  hint="Cases your supervising lawyer appears in."
                >
                  {(p) => (
                    <NativeSelect {...p} {...register('caseNumber')}>
                      <option value="">Select a case</option>
                      {cases.data?.map((c) => (
                        <option key={c.id} value={c.ucn}>
                          {c.ucn} · {c.title}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Citation Reference" required error={errors.citation?.message}>
                  {(p) => (
                    <Input
                      maxLength={300}
                      placeholder="PLD 2022 SC 100"
                      {...p}
                      {...register('citation')}
                    />
                  )}
                </Field>
                <div className="md:col-span-2">
                  <Field
                    label="Keywords"
                    required
                    error={errors.keywords?.message}
                    hint="Press Enter or Add after each keyword."
                  >
                    {(p) => (
                      <Controller
                        control={control}
                        name="keywords"
                        render={({ field }) => (
                          <ChipInput
                            label="Keywords"
                            values={field.value}
                            onChange={field.onChange}
                            max={15}
                            id={p.id}
                            invalid={p['aria-invalid']}
                            describedBy={p['aria-describedby']}
                          />
                        )}
                      />
                    )}
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Relevant Law Notes"
                    required
                    error={errors.notes?.message}
                    hint={`${notes.trim().length}/5000 characters (at least 50)`}
                  >
                    {(p) => <Textarea rows={7} maxLength={5000} {...p} {...register('notes')} />}
                  </Field>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={save.isPending}>
                  <Save aria-hidden="true" />{' '}
                  {editing ? 'Resubmit Research Record Log' : 'Submit Research Record Log'}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditing(null);
                      setFormError(null);
                      reset(EMPTY);
                    }}
                  >
                    Cancel editing
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 text-xl font-bold">My research logs</h2>
      {list.isError && <Alert variant="error">{parseApiError(list.error).message}</Alert>}
      {list.isPending ? (
        <TableSkeleton rows={3} cols={4} />
      ) : list.data && list.data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={NotebookPen}
            title="No research logs yet"
            description="Submit your first research record above."
          />
        </Card>
      ) : (
        list.data && (
          <>
            <ul className="space-y-3">
              {list.data.data.map((l) => (
                <li key={l.id}>
                  <Card>
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p>
                          <span className="case-number font-semibold">{l.ucn ?? 'No case'}</span>{' '}
                          <span className="text-text-muted">{formatDate(l.entryDate)}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <LogStatusBadge status={l.status} />
                          {l.status !== 'APPROVED' && (
                            <Button size="sm" variant="secondary" onClick={() => startEdit(l)}>
                              <Pencil aria-hidden="true" /> Edit
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="font-medium">{l.citation}</p>
                      <p className="text-sm text-text-muted">{l.keywords.join(', ')}</p>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm">{l.notes}</p>
                      {l.reviewComment && (
                        <p className="rounded-md border border-border bg-primary-soft p-2 text-sm">
                          <strong>Supervisor comment:</strong> {l.reviewComment}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination
              page={list.data.meta.page}
              totalPages={list.data.meta.totalPages}
              total={list.data.meta.total}
              onPageChange={setPage}
            />
          </>
        )
      )}
    </>
  );
}
