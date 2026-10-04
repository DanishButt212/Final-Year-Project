import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gavel } from 'lucide-react';
import { useState } from 'react';
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
import { Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { DECISION_LABEL, type DecisionType } from '@/lib/cases-api';
import { judgeApi } from '@/lib/phase4e-api';
import { formatDate } from '@/lib/format';

const refresh = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ['judge'] }),
    qc.invalidateQueries({ queryKey: ['cases'] }),
  ]);

/** Per-hearing "Record outcome": completed or adjourned, with order notes. */
export function OutcomeDialog({
  hearing,
  onClose,
}: {
  hearing: { id: string; date: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'COMPLETED' | 'ADJOURNED'>('COMPLETED');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => judgeApi.recordOutcome(hearing.id, { status, orderNotes: notes.trim() }),
    onSuccess: async (r) => {
      toast.success(r.message);
      await refresh(qc);
      onClose();
    },
    onError: (e) => {
      const body = parseApiError(e);
      setFormError(body.message);
      setError(body.details?.[0]?.messages[0] ?? null);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const len = notes.trim().length;
    if (len < 10 || len > 2000) {
      setError('Order notes must be between 10 and 2000 characters.');
      return setFormError('Please correct the highlighted fields.');
    }
    setError(null);
    setFormError(null);
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <form noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Record outcome</DialogTitle>
            <DialogDescription>Hearing of {formatDate(hearing.date)}.</DialogDescription>
          </DialogHeader>
          {formError && (
            <Alert variant="error" className="mb-3">
              {formError}
            </Alert>
          )}
          <div className="space-y-4">
            <Field label="Outcome" required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="COMPLETED">Completed</option>
                  <option value="ADJOURNED">Adjourned (a new date is needed)</option>
                </NativeSelect>
              )}
            </Field>
            <Field
              label="Order notes"
              required
              error={error ?? undefined}
              hint="10 to 2000 characters. Visible to the parties on the hearing record."
            >
              {(p) => (
                <Textarea
                  rows={5}
                  maxLength={2000}
                  {...p}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              )}
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save outcome
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Decide case": type and order text, then a confirmation that explains it is final. */
export function DecideDialog({
  caseId,
  ucn,
  onClose,
}: {
  caseId: string;
  ucn: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<DecisionType>('JUDGMENT');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const decide = useMutation({
    mutationFn: () => judgeApi.decide(caseId, { decisionType: type, orderText: text.trim() }),
    onSuccess: async (r) => {
      toast.success(r.message);
      await refresh(qc);
      onClose();
    },
    onError: (e) => {
      const body = parseApiError(e);
      setConfirming(false);
      setFormError(body.message);
      setError(body.details?.[0]?.messages[0] ?? null);
    },
  });

  function review(e: React.FormEvent) {
    e.preventDefault();
    const len = text.trim().length;
    if (len < 20 || len > 5000) {
      setError('The order must be between 20 and 5000 characters.');
      return setFormError('Please correct the highlighted fields.');
    }
    setError(null);
    setFormError(null);
    setConfirming(true);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !decide.isPending && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        {confirming ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Decide {ucn} as {DECISION_LABEL[type]}?
              </DialogTitle>
              <DialogDescription>This decision is final.</DialogDescription>
            </DialogHeader>
            <Alert variant="error">
              Once recorded, the case is closed and cannot be changed, re-allocated or reopened. All
              future hearings are cancelled and their slots released, every exhibit is locked, and
              the filer and the lawyers are notified.
            </Alert>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={decide.isPending}
              >
                Go back
              </Button>
              <Button
                variant="destructive"
                loading={decide.isPending}
                onClick={() => decide.mutate()}
              >
                <Gavel aria-hidden="true" /> Record final decision
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={review}>
            <DialogHeader>
              <DialogTitle>Decide case</DialogTitle>
              <DialogDescription>
                {ucn}. You can decide a case only after at least one hearing has taken place.
              </DialogDescription>
            </DialogHeader>
            {formError && (
              <Alert variant="error" className="mb-3">
                {formError}
              </Alert>
            )}
            <div className="space-y-4">
              <Field label="Decision type" required>
                {(p) => (
                  <NativeSelect
                    {...p}
                    value={type}
                    onChange={(e) => setType(e.target.value as DecisionType)}
                  >
                    <option value="JUDGMENT">Judgment</option>
                    <option value="DISMISSED">Dismissed</option>
                    <option value="DISPOSED">Disposed</option>
                  </NativeSelect>
                )}
              </Field>
              <Field
                label="Order"
                required
                error={error ?? undefined}
                hint="20 to 5000 characters."
              >
                {(p) => (
                  <Textarea
                    rows={8}
                    maxLength={5000}
                    {...p}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Review decision</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
