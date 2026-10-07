import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toaster';
import { adminApi } from '@/lib/admin-api';
import { parseApiError } from '@/lib/api';
import {
  isoToDdMmYyyy,
  schedulingApi,
  slotPassed,
  todayIso,
  weekdayName,
  type Board,
  type Conflict,
  type HearingView,
} from '@/lib/scheduling-api';
import { cn } from '@/lib/utils';

export const CLEAR_MESSAGE = 'Anti-clash verification successful: No schedule conflicts detected.';

/** Conflicts returned with a 409 (details) or a 400 (field message). */
function errorConflicts(error: unknown): { text: string; conflicts: Conflict[] } {
  const body = parseApiError(error);
  const details = (body.details ?? []) as unknown as { message?: unknown }[];
  const conflicts = details.filter((d) => typeof d.message === 'string') as unknown as Conflict[];
  return { text: body.message, conflicts };
}

function ConflictList({ conflicts, text }: { conflicts: Conflict[]; text: string }) {
  return (
    <Alert variant="error" title={conflicts.length ? 'Scheduling conflict' : undefined}>
      {conflicts.length === 0 ? (
        text
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {conflicts.map((c, i) => (
            <li key={i}>{c.message}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

function useInvalidateSchedule() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['scheduling'] });
}

// ---------------------------------------------------------------- schedule hearing

export function ScheduleHearingDialog({
  board,
  initial,
  onClose,
}: {
  board: Board;
  initial: { courtroomId?: string; date: string; slot?: number };
  onClose: () => void;
}) {
  const invalidate = useInvalidateSchedule();
  const [search, setSearch] = useState('');
  const [caseId, setCaseId] = useState('');
  const [judgeId, setJudgeId] = useState('');
  const [courtroomId, setCourtroomId] = useState(
    initial.courtroomId ?? board.courtrooms[0]?.id ?? '',
  );
  const [date, setDate] = useState(initial.date);
  const [slot, setSlot] = useState(initial.slot ?? board.slots[0]?.slot ?? 1);
  const [purpose, setPurpose] = useState('');
  const [isVirtual, setIsVirtual] = useState(false);
  const [serverError, setServerError] = useState<{ text: string; conflicts: Conflict[] } | null>(
    null,
  );

  const cases = useQuery({
    queryKey: ['scheduling', 'cases', board.court.id, search],
    queryFn: () => schedulingApi.schedulableCases(board.court.id, search),
  });
  const courts = useQuery({ queryKey: ['admin', 'courts'], queryFn: adminApi.courts });
  const judges =
    courts.data
      ?.find((c) => c.id === board.court.id)
      ?.judges.filter((j) => j.status === 'ACTIVE') ?? [];
  const chosen = cases.data?.find((c) => c.id === caseId);

  const ready = Boolean(caseId && courtroomId && date && slot);
  const check = useQuery({
    queryKey: ['scheduling', 'check', caseId, courtroomId, judgeId, date, slot],
    queryFn: () =>
      schedulingApi.check({ caseId, courtroomId, judgeId: judgeId || undefined, date, slot }),
    enabled: ready,
    retry: false,
  });
  const checkError = check.isError ? errorConflicts(check.error) : null;

  const save = useMutation({
    mutationFn: () =>
      schedulingApi.create({
        caseId,
        courtroomId,
        judgeId: judgeId || undefined,
        date,
        slot,
        purpose: purpose.trim() || undefined,
        isVirtual,
      }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await invalidate();
      onClose();
    },
    onError: (e) => setServerError(errorConflicts(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule hearing</DialogTitle>
          <DialogDescription>
            {board.court.name}. The anti-clash check runs as you choose.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Find a case" hint="Cases without an upcoming hearing are listed first.">
            {(p) => (
              <Input
                type="search"
                placeholder="Case number or title"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                {...p}
              />
            )}
          </Field>
          <Field label="Case" required>
            {(p) => (
              <NativeSelect
                value={caseId}
                onChange={(e) => {
                  setCaseId(e.target.value);
                  const c = cases.data?.find((x) => x.id === e.target.value);
                  setJudgeId(c?.judgeId ?? '');
                  setServerError(null);
                }}
                {...p}
              >
                <option value="">Choose a case</option>
                {cases.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ucn} · {c.title}
                    {c.hasUpcomingHearing ? ' (has hearing)' : ''}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judge" hint={chosen?.judge ? `Case judge: ${chosen.judge}` : undefined}>
              {(p) => (
                <NativeSelect value={judgeId} onChange={(e) => setJudgeId(e.target.value)} {...p}>
                  <option value="">Case judge</option>
                  {judges.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Courtroom" required>
              {(p) => (
                <NativeSelect
                  value={courtroomId}
                  onChange={(e) => setCourtroomId(e.target.value)}
                  {...p}
                >
                  {board.courtrooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Date" required>
              {(p) => (
                <Input
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <Field label="Time slot" required>
              {(p) => (
                <NativeSelect value={slot} onChange={(e) => setSlot(Number(e.target.value))} {...p}>
                  {board.slots
                    .filter((s) => s.slot === slot || !slotPassed(date, s.start))
                    .map((s) => (
                      <option key={s.slot} value={s.slot}>
                        {s.start}–{s.end}
                      </option>
                    ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label="Purpose (optional)">
            {(p) => (
              <Input
                maxLength={200}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                {...p}
              />
            )}
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={isVirtual}
              onChange={(e) => setIsVirtual(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Virtual hearing</span>
              <span className="block text-text-muted">
                Held in the virtual courtroom. The parties get a join link once the Admin Bench
                opens the session.
              </span>
            </span>
          </label>

          <div aria-live="polite" className="space-y-2">
            {ready && check.isPending && (
              <p className="text-sm text-text-muted">Checking availability…</p>
            )}
            {check.data?.valid && (
              <Alert variant="success" title="Clear/Valid">
                {check.data.message}
              </Alert>
            )}
            {check.data && !check.data.valid && (
              <ConflictList conflicts={check.data.conflicts} text={check.data.message} />
            )}
            {checkError && <ConflictList conflicts={checkError.conflicts} text={checkError.text} />}
            {serverError && (
              <ConflictList conflicts={serverError.conflicts} text={serverError.text} />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              save.mutate();
            }}
            loading={save.isPending}
            disabled={!ready || !check.data?.valid}
          >
            <CalendarClock aria-hidden="true" /> Schedule hearing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- reschedule / resolve conflict

export function RescheduleDialog({
  board,
  hearing,
  onClose,
}: {
  board: Board;
  hearing: HearingView;
  onClose: () => void;
}) {
  const invalidate = useInvalidateSchedule();
  const flagged = hearing.conflicts.length > 0;
  const [date, setDate] = useState(hearing.date);
  const [slot, setSlot] = useState(hearing.slot);
  const [courtroomId, setCourtroomId] = useState(hearing.courtroom?.id ?? '');
  const [error, setError] = useState<{ text: string; conflicts: Conflict[] } | null>(null);

  const vacancy = useQuery({
    queryKey: ['scheduling', 'available', hearing.caseId, hearing.id],
    queryFn: () =>
      schedulingApi.availableSlots({
        caseId: hearing.caseId,
        days: 14,
        excludeHearingId: hearing.id,
      }),
  });

  const check = useQuery({
    queryKey: [
      'scheduling',
      'check',
      hearing.caseId,
      courtroomId,
      hearing.judge.id,
      date,
      slot,
      hearing.id,
    ],
    queryFn: () =>
      schedulingApi.check({
        caseId: hearing.caseId,
        courtroomId,
        judgeId: hearing.judge.id,
        date,
        slot,
        hearingId: hearing.id,
      }),
    enabled: Boolean(date && courtroomId),
    retry: false,
  });
  const checkError = check.isError ? errorConflicts(check.error) : null;

  const save = useMutation({
    mutationFn: () =>
      schedulingApi.reschedule(hearing.id, {
        date,
        slot,
        courtroomId,
        resolveConflict: flagged,
      }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await invalidate();
      onClose();
    },
    onError: (e) => setError(errorConflicts(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{flagged ? 'Resolve conflict' : 'Reschedule hearing'}</DialogTitle>
          <DialogDescription>
            <span className="case-number">{hearing.ucn}</span> · {hearing.title}. Currently{' '}
            {isoToDdMmYyyy(hearing.date)} at {hearing.startTime} in {hearing.courtroom?.name}.
          </DialogDescription>
        </DialogHeader>
        {flagged && (
          <div className="mb-4">
            <ConflictList conflicts={hearing.conflicts} text="" />
          </div>
        )}

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">
              Open slots (judge, courtroom and lawyers all free)
            </p>
            {vacancy.isPending ? (
              <p className="text-sm text-text-muted">Looking for open slots…</p>
            ) : vacancy.data && vacancy.data.days.length === 0 ? (
              <p className="text-sm text-text-muted">No open slots in the next 14 days.</p>
            ) : (
              <div className="max-h-52 space-y-3 overflow-y-auto rounded-md border border-border p-3">
                {vacancy.data?.days.map((d) => (
                  <div key={d.date}>
                    <p className="mb-1 text-sm font-semibold">
                      {weekdayName(d.date)} {isoToDdMmYyyy(d.date)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {d.slots.map((s) => {
                        const room =
                          s.courtrooms.find((r) => r.id === courtroomId) ?? s.courtrooms[0];
                        const active =
                          date === d.date && slot === s.slot && courtroomId === room.id;
                        return (
                          <button
                            key={s.slot}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              setDate(d.date);
                              setSlot(s.slot);
                              setCourtroomId(room.id);
                              setError(null);
                            }}
                            className={cn(
                              'min-h-9 rounded-md border px-3 text-sm font-medium',
                              active
                                ? 'border-primary bg-primary text-on-primary'
                                : 'border-border bg-surface hover:bg-primary-soft',
                            )}
                          >
                            {s.start} · {room.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date">
              {(p) => (
                <Input
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <Field label="Time slot">
              {(p) => (
                <NativeSelect value={slot} onChange={(e) => setSlot(Number(e.target.value))} {...p}>
                  {board.slots
                    .filter((s) => s.slot === slot || !slotPassed(date, s.start))
                    .map((s) => (
                      <option key={s.slot} value={s.slot}>
                        {s.start}–{s.end}
                      </option>
                    ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Courtroom">
              {(p) => (
                <NativeSelect
                  value={courtroomId}
                  onChange={(e) => setCourtroomId(e.target.value)}
                  {...p}
                >
                  {board.courtrooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>

          <div aria-live="polite" className="space-y-2">
            {check.data?.valid && (
              <Alert variant="success" title="Clear/Valid">
                {check.data.message}
              </Alert>
            )}
            {check.data && !check.data.valid && (
              <ConflictList conflicts={check.data.conflicts} text={check.data.message} />
            )}
            {checkError && <ConflictList conflicts={checkError.conflicts} text={checkError.text} />}
            {error && <ConflictList conflicts={error.conflicts} text={error.text} />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              save.mutate();
            }}
            loading={save.isPending}
            disabled={!check.data?.valid}
          >
            {flagged ? 'Save and clear flag' : 'Reschedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- cancel

export function CancelHearingDialog({
  hearing,
  onClose,
}: {
  hearing: HearingView;
  onClose: () => void;
}) {
  const invalidate = useInvalidateSchedule();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: () => schedulingApi.cancel(hearing.id, reason.trim()),
    onSuccess: async (res) => {
      toast.success(res.message);
      await invalidate();
      onClose();
    },
    onError: (e) =>
      setError(parseApiError(e).details?.[0]?.messages?.[0] ?? parseApiError(e).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !cancel.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel hearing</DialogTitle>
          <DialogDescription>
            <span className="case-number">{hearing.ucn}</span> on {isoToDdMmYyyy(hearing.date)} at{' '}
            {hearing.startTime}. The slot is released and everyone on the case is notified.
          </DialogDescription>
        </DialogHeader>
        <Field label="Reason for cancelling" required error={error ?? undefined}>
          {(p) => (
            <Textarea
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
            Keep hearing
          </Button>
          <Button
            variant="destructive"
            loading={cancel.isPending}
            onClick={() => {
              if (!reason.trim()) return setError('Please enter a reason for cancelling.');
              setError(null);
              cancel.mutate();
            }}
          >
            Cancel hearing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- auto-generate

export function AutoGenerateDialog({ board, onClose }: { board: Board; onClose: () => void }) {
  const invalidate = useInvalidateSchedule();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const cases = useQuery({
    queryKey: ['scheduling', 'cases', board.court.id, ''],
    queryFn: () => schedulingApi.schedulableCases(board.court.id),
  });
  const unscheduled = useMemo(
    () => cases.data?.filter((c) => !c.hasUpcomingHearing) ?? [],
    [cases.data],
  );
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof schedulingApi.autoGenerate>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () =>
      schedulingApi.autoGenerate({
        courtId: board.court.id,
        date: board.date,
        caseIds: [...selected],
      }),
    onSuccess: async (res) => {
      setResult(res);
      toast.success(res.message);
      await invalidate();
    },
    onError: (e) => setError(parseApiError(e).message),
  });

  const allSelected = unscheduled.length > 0 && unscheduled.every((c) => selected.has(c.id));

  return (
    <Dialog open onOpenChange={(o) => !o && !run.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auto-generate schedule</DialogTitle>
          <DialogDescription>
            Places the chosen cases in the first free slots of {board.weekday}{' '}
            {isoToDdMmYyyy(board.date)}, using each case’s judge and a courtroom of this court.
            Clashing slots are skipped.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="error" className="mb-3">
            {error}
          </Alert>
        )}
        {result ? (
          <div className="space-y-4">
            <Alert variant="success" title={result.message} />
            {result.placed.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Placed</p>
                <ul className="space-y-1 text-sm">
                  {result.placed.map((h) => (
                    <li key={h.id}>
                      <span className="case-number">{h.ucn}</span> · {h.startTime} ·{' '}
                      {h.courtroom?.name} · {h.judge.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.unplaced.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Not placed</p>
                <ul className="space-y-1 text-sm">
                  {result.unplaced.map((u) => (
                    <li key={u.caseId}>
                      <span className="case-number">{u.ucn ?? u.caseId}</span>: {u.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {cases.isPending ? (
              <p className="text-text-muted">Loading cases…</p>
            ) : unscheduled.length === 0 ? (
              <Alert variant="info">
                Every allocated case in this court already has a hearing.
              </Alert>
            ) : (
              <fieldset className="space-y-2">
                <legend className="sr-only">Cases to schedule</legend>
                <label className="flex min-h-10 items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? new Set(unscheduled.map((c) => c.id)) : new Set(),
                      )
                    }
                  />
                  Select all ({unscheduled.length})
                </label>
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {unscheduled.map((c) => (
                    <li key={c.id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 hover:bg-primary-soft">
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={selected.has(c.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            setSelected(next);
                          }}
                        />
                        <span>
                          <span className="case-number block text-sm">{c.ucn}</span>
                          <span className="block font-medium">{c.title}</span>
                          <span className="block text-sm text-text-muted">{c.judge}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={run.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  run.mutate();
                }}
                loading={run.isPending}
                disabled={selected.size === 0 || !board.isWorkingDay}
              >
                <Wand2 aria-hidden="true" /> Generate schedule
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- run-check result

export function RunCheckPanel({
  result,
  onResolve,
}: {
  result: Awaited<ReturnType<typeof schedulingApi.runCheck>>;
  onResolve: (h: HearingView) => void;
}) {
  if (result.valid) {
    return (
      <Alert variant="success" title="Clear/Valid">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="size-4" aria-hidden="true" /> {result.message}
        </span>
      </Alert>
    );
  }
  const list = result.conflicts as HearingView[];
  return (
    <Alert
      variant="error"
      title={`${list.length} hearing${list.length === 1 ? '' : 's'} in conflict`}
    >
      <ul className="mt-2 space-y-3">
        {list.map((h) => (
          <li key={h.id} className="flex flex-wrap items-start justify-between gap-2">
            <span>
              <span className="case-number text-sm">{h.ucn}</span> · {h.startTime} ·{' '}
              {h.courtroom?.name}
              {h.conflicts.map((c, i) => (
                <span key={i} className="block text-sm">
                  {c.message}
                </span>
              ))}
            </span>
            <Button size="sm" variant="secondary" onClick={() => onResolve(h)}>
              Resolve
            </Button>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
