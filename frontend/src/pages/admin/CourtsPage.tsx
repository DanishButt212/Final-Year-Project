import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Gavel, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { adminApi, type CourtRow } from '@/lib/admin-api';
import { applyServerError } from '@/lib/form-errors';
import { MESSAGES } from '@/lib/schemas';
import { UserStatusBadge } from './shared';

const roomSchema = z.object({
  name: z.string().trim().min(1, MESSAGES.fieldRequired).max(60, 'Use 60 characters or fewer.'),
  benchNo: z
    .string()
    .trim()
    .regex(/^(\d{1,2})?$/, 'Bench number must be a whole number from 1 to 99.'),
});
type RoomValues = z.infer<typeof roomSchema>;

type RoomTarget =
  | { mode: 'create'; court: CourtRow }
  | { mode: 'edit'; court: CourtRow; room: CourtRow['courtrooms'][number] };

function RoomDialog({ target, onClose }: { target: RoomTarget; onClose: () => void }) {
  const queryClient = useQueryClient();
  const editing = target.mode === 'edit';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RoomValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      name: editing ? target.room.name : '',
      benchNo: editing && target.room.benchNo ? String(target.room.benchNo) : '',
    },
  });

  const save = useMutation({
    mutationFn: (v: RoomValues) => {
      const benchNo = v.benchNo ? Number(v.benchNo) : undefined;
      return editing
        ? adminApi.updateCourtroom(target.room.id, { name: v.name, benchNo })
        : adminApi.createCourtroom({ name: v.name, benchNo, courtId: target.court.id });
    },
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => setFormError(applyServerError(e, setError, ['name', 'benchNo'])),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={handleSubmit((v) => {
            setFormError(null);
            save.mutate(v);
          })}
        >
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit courtroom' : 'Add courtroom'}</DialogTitle>
            <DialogDescription>{target.court.name}</DialogDescription>
          </DialogHeader>
          {formError && (
            <Alert variant="error" className="mb-4">
              {formError}
            </Alert>
          )}
          <div className="space-y-4">
            <Field label="Courtroom name" required error={errors.name?.message}>
              {(p) => <Input autoComplete="off" {...register('name')} {...p} />}
            </Field>
            <Field
              label="Bench number"
              hint="Optional, for example 1 for Bench I."
              error={errors.benchNo?.message}
            >
              {(p) => <Input inputMode="numeric" {...register('benchNo')} {...p} />}
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? 'Save changes' : 'Add courtroom'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Courts, benches (courtrooms) and the judges with their active caseload. */
export default function CourtsPage() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<RoomTarget | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: adminApi.courts,
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      adminApi.updateCourtroom(v.id, { isActive: v.isActive }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <PageHeader
        title="Courts & Benches"
        description="Courtrooms and the judges attached to each court, with their active caseload."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'Courts & Benches' }]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <div role="status" aria-label="Loading courts" className="space-y-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : data && data.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No courts configured" />
        </Card>
      ) : (
        <div className="space-y-6">
          {data?.map((court) => (
            <Card key={court.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{court.name}</CardTitle>
                  <p className="text-sm text-text-muted">
                    {court.city} ·{' '}
                    {court.type === 'HIGH_COURT' ? 'High Court' : 'District & Sessions'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setTarget({ mode: 'create', court })}
                >
                  <Plus aria-hidden="true" /> Add courtroom
                </Button>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                    Courtrooms
                  </h3>
                  {court.courtrooms.length === 0 ? (
                    <p className="text-text-muted">No courtrooms yet.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {court.courtrooms.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <span>
                            <span className="font-semibold">{r.name}</span>
                            {r.benchNo && (
                              <span className="ml-2 text-sm text-text-muted">
                                Bench {r.benchNo}
                              </span>
                            )}
                            {!r.isActive && (
                              <Badge variant="neutral" className="ml-2">
                                Inactive
                              </Badge>
                            )}
                          </span>
                          <span className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTarget({ mode: 'edit', court, room: r })}
                              aria-label={`Edit ${r.name}`}
                            >
                              <Pencil aria-hidden="true" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}
                              disabled={toggle.isPending}
                              aria-label={`${r.isActive ? 'Deactivate' : 'Activate'} ${r.name}`}
                            >
                              {r.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                    Judges
                  </h3>
                  {court.judges.length === 0 ? (
                    <EmptyState
                      icon={Gavel}
                      title="No judges attached"
                      description="Add a judge from Account Management."
                    />
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {court.judges.map((j) => {
                        const room = court.courtrooms.find((r) => r.id === j.courtroomId);
                        return (
                          <li
                            key={j.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <span>
                              <span className="font-semibold">{j.name}</span>
                              <span className="block text-sm text-text-muted">
                                {room ? room.name : 'No fixed courtroom'}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {j.status !== 'ACTIVE' && <UserStatusBadge status={j.status} />}
                              <Badge variant="neutral">
                                {j.activeCases} active {j.activeCases === 1 ? 'case' : 'cases'}
                              </Badge>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {target && (
        <RoomDialog
          key={target.mode === 'edit' ? target.room.id : 'new'}
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
