import { TermsHint } from '@/components/glossary/Term';
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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      setError(t('Order notes must be between 10 and 2000 characters.'));
      return setFormError(t('Please correct the highlighted fields.'));
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
            <DialogTitle>{t('Record outcome')}</DialogTitle>
            <DialogDescription>
              {t('Hearing of {{date}}.', { date: formatDate(hearing.date) })}
            </DialogDescription>
          </DialogHeader>
          <TermsHint ids={['adjournment', 'order', 'interim-order']} className="mb-3" />
          {formError && (
            <Alert variant="error" className="mb-3">
              {formError}
            </Alert>
          )}
          <div className="space-y-4">
            <Field label={t('Outcome')} required>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="COMPLETED">{t('Completed')}</option>
                  <option value="ADJOURNED">{t('Adjourned (a new date is needed)')}</option>
                </NativeSelect>
              )}
            </Field>
            <Field
              label={t('Order notes')}
              required
              error={error ?? undefined}
              hint={t('10 to 2000 characters. Visible to the parties on the hearing record.')}
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
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('Save outcome')}
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
  const { t } = useTranslation();
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
      setError(t('The order must be between 20 and 5000 characters.'));
      return setFormError(t('Please correct the highlighted fields.'));
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
                {t('Decide {{ucn}} as {{item}}?', { ucn, item: DECISION_LABEL[type] })}
              </DialogTitle>
              <DialogDescription>{t('This decision is final.')}</DialogDescription>
            </DialogHeader>
            <Alert variant="error">
              {t(
                'Once recorded, the case is closed and cannot be changed, re-allocated or reopened. All future hearings are cancelled and their slots released, every exhibit is locked, and the filer and the lawyers are notified.',
              )}
            </Alert>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={decide.isPending}
              >
                {t('Go back')}
              </Button>
              <Button
                variant="destructive"
                loading={decide.isPending}
                onClick={() => decide.mutate()}
              >
                <Gavel aria-hidden="true" /> {t('Record final decision')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={review}>
            <DialogHeader>
              <DialogTitle>{t('Decide case')}</DialogTitle>
              <DialogDescription>
                {t(
                  '{{ucn}}. You can decide a case only after at least one hearing has taken place.',
                  { ucn },
                )}
              </DialogDescription>
            </DialogHeader>
            <TermsHint ids={['judgment', 'dismissal', 'disposal', 'decree']} className="mb-3" />
            {formError && (
              <Alert variant="error" className="mb-3">
                {formError}
              </Alert>
            )}
            <div className="space-y-4">
              <Field label={t('Decision type')} required>
                {(p) => (
                  <NativeSelect
                    {...p}
                    value={type}
                    onChange={(e) => setType(e.target.value as DecisionType)}
                  >
                    <option value="JUDGMENT">{t('Judgment')}</option>
                    <option value="DISMISSED">{t('Dismissed')}</option>
                    <option value="DISPOSED">{t('Disposed')}</option>
                  </NativeSelect>
                )}
              </Field>
              <Field
                label={t('Order')}
                required
                error={error ?? undefined}
                hint={t('20 to 5000 characters.')}
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
                {t('Cancel')}
              </Button>
              <Button type="submit">{t('Review decision')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
