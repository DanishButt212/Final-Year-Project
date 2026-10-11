import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';
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
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { adminApi, type AllocatePayload } from '@/lib/admin-api';
import { useTranslation } from 'react-i18next';

/** Allocate (or re-allocate) a case: pick court, courtroom and judge, or let the system pick at random. */
export function AllocateDialog({
  caseId,
  ucn,
  reallocate,
  feeStatus,
  open,
  onOpenChange,
}: {
  caseId: string;
  ucn: string;
  reallocate: boolean;
  feeStatus?: 'PAID' | 'UNPAID' | 'NOT_GENERATED';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [courtId, setCourtId] = useState('');
  const [courtroomId, setCourtroomId] = useState('');
  const [judgeId, setJudgeId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const courts = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: adminApi.courts,
    enabled: open,
  });
  const court = courts.data?.find((c) => c.id === courtId);
  const rooms = court?.courtrooms.filter((r) => r.isActive) ?? [];
  const judges = court?.judges.filter((j) => j.status === 'ACTIVE') ?? [];

  const allocate = useMutation({
    mutationFn: (payload: AllocatePayload) => adminApi.allocate(caseId, payload),
    onSuccess: async (res) => {
      toast.success(
        res.mode === 'RANDOM'
          ? `Randomly allocated to ${res.judge.name} (${res.court}${res.courtroom ? `, ${res.courtroom}` : ''}).`
          : res.message,
      );
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => setError(parseApiError(e).message),
  });

  const common = {
    courtId,
    courtroomId: courtroomId || undefined,
    reallocate: reallocate || undefined,
  };

  function manual() {
    if (!courtId || !judgeId) {
      setError(t('Choose a court and a judge, or allocate randomly.'));
      return;
    }
    setError(null);
    allocate.mutate({ mode: 'MANUAL', ...common, judgeId });
  }

  function random() {
    if (!courtId) {
      setError(t('Choose a court first.'));
      return;
    }
    setError(null);
    allocate.mutate({ mode: 'RANDOM', ...common });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !allocate.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reallocate ? t('Re-allocate case') : t('Allocate case')}</DialogTitle>
          <DialogDescription>
            <span className="case-number">{ucn}</span>.{' '}
            {t(
              'Choose a court, then a courtroom and judge. Random allocation picks the judge with the fewest active cases.',
            )}
          </DialogDescription>
        </DialogHeader>
        {!reallocate && feeStatus && feeStatus !== 'PAID' && (
          <Alert variant="error" title={t('Court fee is unpaid for this case.')} className="mb-4">
            {t(
              'A case can be allocated only after its court fee challan is paid. Allocation will be refused until then.',
            )}
          </Alert>
        )}
        {reallocate && (
          <Alert variant="info" className="mb-4">
            {t(
              'This case already has a judge. Allocating again records the previous judge in the case history.',
            )}
          </Alert>
        )}
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}
        <div className="space-y-4">
          <Field label={t('Court')} required>
            {(p) => (
              <NativeSelect
                value={courtId}
                onChange={(e) => {
                  setCourtId(e.target.value);
                  setCourtroomId('');
                  setJudgeId('');
                  setError(null);
                }}
                {...p}
              >
                <option value="">{t('Choose a court')}</option>
                {courts.data
                  ?.filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('Courtroom')} hint={t('Optional. Defaults to the judge’s courtroom.')}>
            {(p) => (
              <NativeSelect
                value={courtroomId}
                disabled={!courtId}
                onChange={(e) => setCourtroomId(e.target.value)}
                {...p}
              >
                <option value="">{t('Default courtroom')}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('Judge')} hint={t('Active cases per judge are shown in brackets.')}>
            {(p) => (
              <NativeSelect
                value={judgeId}
                disabled={!courtId}
                onChange={(e) => setJudgeId(e.target.value)}
                {...p}
              >
                <option value="">{t('Choose a judge')}</option>
                {judges.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.activeCases === 1
                      ? t('{{name}} (1 active case)', { name: j.name })
                      : t('{{name}} ({{activeCases}} active cases)', {
                          name: j.name,
                          activeCases: j.activeCases,
                        })}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <DialogFooter className="sm:flex-wrap">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={allocate.isPending}
          >
            {t('Cancel')}
          </Button>
          <Button variant="secondary" onClick={random} disabled={allocate.isPending}>
            <Shuffle aria-hidden="true" /> {t('Allocate randomly')}
          </Button>
          <Button onClick={manual} loading={allocate.isPending}>
            {t('Allocate to selected judge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
