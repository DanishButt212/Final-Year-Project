import { QueryError } from '@/components/ui/query-error';
import { isoToDdMmYyyy } from '@/lib/scheduling-api';
import { remindersApi } from '@/lib/admin-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { BellRing, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { settingsApi, type Settings } from '@/lib/admin-api';
import { caseTypeLabel } from '@/lib/case-status';
import { formatPkr } from '@/lib/format';
import { MESSAGES } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const decimal2 = /^\d{1,10}(\.\d{1,2})?$/;

const policySchema = z.object({
  maxAttachmentMb: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of MB.'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 100, 'Enter a value from 1 to 100 MB.'),
  caseRegistrationOpen: z.boolean(),
  filingFeeRateModifier: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d{1,3}(\.\d{1,2})?$/, msg('Enter a percentage with at most two decimals.'))
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, 'Enter a percentage from 0 to 100.'),
  courtDayStart: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 09:00 (24-hour).'),
  courtDayEnd: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 14:00 (24-hour).'),
  adValoremPercent: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d{1,2}(\.\d{1,2})?$/, msg('Enter a percentage with at most two decimals.'))
    .refine((v) => Number(v) >= 0 && Number(v) <= 10, 'Enter a percentage from 0 to 10.'),
  adValoremCapPkr: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(decimal2, 'Enter an amount of 0 or more with at most two decimals.'),
  challanDueDays: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of days.'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 90, 'Enter a value from 1 to 90 days.'),
  maxEvidenceMb: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of MB.'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 200, 'Enter a value from 1 to 200 MB.'),
  attendanceDefaultRadiusM: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of metres.'))
    .refine((v) => Number(v) >= 50 && Number(v) <= 5000, 'Enter a value from 50 to 5000 metres.'),
  attendanceMaxAccuracyM: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of metres.'))
    .refine((v) => Number(v) >= 10 && Number(v) <= 1000, 'Enter a value from 10 to 1000 metres.'),
  summonsMaxGpsAccuracyM: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of metres.'))
    .refine((v) => Number(v) >= 10 && Number(v) <= 500, 'Enter a value from 10 to 500 metres.'),
  summonsDefaultDueDays: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of days.'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 90, 'Enter a value from 1 to 90 days.'),
  securityEscalationThreshold: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of attempts.'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 20, 'Enter a value from 1 to 20 attempts.'),
  hearingSlotMinutes: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, msg('Enter a whole number of minutes.'))
    .refine((v) => Number(v) >= 10 && Number(v) <= 240, 'Enter a value from 10 to 240 minutes.'),
  fees: z.array(
    z.object({
      caseType: z.string(),
      amount: z
        .string()
        .trim()
        .min(1, MESSAGES.fieldRequired)
        .regex(decimal2, 'Enter an amount of 0 or more with at most two decimals.'),
    }),
  ),
});
type PolicyValues = z.infer<typeof policySchema>;

const toValues = (s: Settings): PolicyValues => ({
  maxAttachmentMb: String(s.maxAttachmentMb),
  caseRegistrationOpen: s.caseRegistrationOpen,
  filingFeeRateModifier: s.filingFeeRateModifier,
  courtDayStart: s.courtDayStart,
  courtDayEnd: s.courtDayEnd,
  hearingSlotMinutes: String(s.hearingSlotMinutes),
  adValoremPercent: s.adValoremPercent,
  adValoremCapPkr: s.adValoremCapPkr,
  challanDueDays: String(s.challanDueDays),
  maxEvidenceMb: String(s.maxEvidenceMb),
  attendanceDefaultRadiusM: String(s.attendanceDefaultRadiusM),
  attendanceMaxAccuracyM: String(s.attendanceMaxAccuracyM),
  summonsMaxGpsAccuracyM: String(s.summonsMaxGpsAccuracyM),
  summonsDefaultDueDays: String(s.summonsDefaultDueDays),
  securityEscalationThreshold: String(s.securityEscalationThreshold),
  fees: s.fees.map((f) => ({ caseType: f.caseType, amount: f.amount })),
});

/** UC-2.3: Global Variables and Application Constants. */
export default function PoliciesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: settingsApi.get,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PolicyValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      maxAttachmentMb: '25',
      caseRegistrationOpen: true,
      filingFeeRateModifier: '0',
      courtDayStart: '09:00',
      courtDayEnd: '14:00',
      hearingSlotMinutes: '30',
      adValoremPercent: '1',
      adValoremCapPkr: '50000',
      challanDueDays: '7',
      maxEvidenceMb: '100',
      attendanceDefaultRadiusM: '300',
      attendanceMaxAccuracyM: '150',
      summonsMaxGpsAccuracyM: '100',
      summonsDefaultDueDays: '7',
      securityEscalationThreshold: '3',
      fees: [],
    },
  });
  useEffect(() => {
    if (data) reset(toValues(data));
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (v: PolicyValues) =>
      settingsApi.update({
        maxAttachmentMb: Number(v.maxAttachmentMb),
        caseRegistrationOpen: v.caseRegistrationOpen,
        filingFeeRateModifier: v.filingFeeRateModifier,
        courtDayStart: v.courtDayStart,
        courtDayEnd: v.courtDayEnd,
        hearingSlotMinutes: Number(v.hearingSlotMinutes),
        adValoremPercent: v.adValoremPercent,
        adValoremCapPkr: v.adValoremCapPkr,
        challanDueDays: Number(v.challanDueDays),
        maxEvidenceMb: Number(v.maxEvidenceMb),
        attendanceDefaultRadiusM: Number(v.attendanceDefaultRadiusM),
        attendanceMaxAccuracyM: Number(v.attendanceMaxAccuracyM),
        summonsMaxGpsAccuracyM: Number(v.summonsMaxGpsAccuracyM),
        summonsDefaultDueDays: Number(v.summonsDefaultDueDays),
        securityEscalationThreshold: Number(v.securityEscalationThreshold),
        fees: v.fees.map((f) => ({
          caseType: f.caseType as Settings['fees'][number]['caseType'],
          amount: f.amount,
        })),
      }),
    onSuccess: async (res) => {
      setSuccess(res.message);
      setFormError(null);
      toast.success(res.message);
      reset(toValues(res.settings));
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => {
      setSuccess(null);
      const body = parseApiError(e);
      setFormError(body.details?.[0]?.messages[0] ?? body.message);
    },
  });

  const open = useWatch({ control, name: 'caseRegistrationOpen' });
  const fees = useWatch({ control, name: 'fees' });

  return (
    <>
      <PageHeader
        title={t('Global Variables and Application Constants')}
        description={t('System-wide policies. Changes apply immediately to everyone.')}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('System Policies') }]}
      />
      {isError && <QueryError error={error} />}
      {isPending ? (
        <div role="status" aria-label={t('Loading policies')} className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
          <span className="sr-only">{t('Loading…')}</span>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit(
            (v) => {
              setSuccess(null);
              setFormError(null);
              save.mutate(v);
            },
            () => {
              setSuccess(null);
              setFormError(MESSAGES.invalidFields);
            },
          )}
          className="max-w-3xl space-y-6"
        >
          {success && <Alert variant="success">{success}</Alert>}
          {formError && <Alert variant="error">{formError}</Alert>}

          <Card>
            <CardHeader>
              <CardTitle>{t('Filing and uploads')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field
                label={t('Max Attachment Limit (MB)')}
                required
                hint={t('PDF files above this size are refused. Allowed range 1 to 100 MB.')}
                error={errors.maxAttachmentMb?.message}
              >
                {(p) => (
                  <Input
                    inputMode="numeric"
                    className="max-w-40"
                    {...register('maxAttachmentMb')}
                    {...p}
                  />
                )}
              </Field>

              <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
                <div>
                  <p id="reg-label" className="font-semibold">
                    {t('Case registration open')}
                  </p>
                  <p id="reg-hint" className="text-sm text-text-muted">
                    {open
                      ? t('Litigants and verified lawyers can file new cases.')
                      : t(
                          'New case filing is closed. Users see "Case registration is currently closed."',
                        )}
                  </p>
                </div>
                <Controller
                  control={control}
                  name="caseRegistrationOpen"
                  render={({ field }) => (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.value}
                      aria-labelledby="reg-label"
                      aria-describedby="reg-hint"
                      onClick={() => field.onChange(!field.value)}
                      className={cn(
                        'relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors',
                        field.value ? 'border-primary bg-primary' : 'border-text-muted bg-surface',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute top-0.5 size-5 rounded-full transition-all',
                          field.value ? 'start-[22px] bg-on-primary' : 'start-0.5 bg-text-muted',
                        )}
                      />
                      <span className="sr-only">{field.value ? 'On' : t('Off')}</span>
                    </button>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Fee calculation and evidence')}</CardTitle>
              <p className="text-sm text-text-muted">
                {t(
                  'Civil Suits pay the base fee plus an ad valorem percentage of the claim value (up to the cap). The filing fee rate modifier is then applied to the sum.',
                )}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t('Ad valorem percentage (%)')}
                required
                hint={t('0 to 10')}
                error={errors.adValoremPercent?.message}
              >
                {(p) => <Input inputMode="decimal" {...register('adValoremPercent')} {...p} />}
              </Field>
              <Field
                label={t('Ad valorem cap (PKR)')}
                required
                error={errors.adValoremCapPkr?.message}
              >
                {(p) => <Input inputMode="decimal" {...register('adValoremCapPkr')} {...p} />}
              </Field>
              <Field
                label={t('Challan due days')}
                required
                hint={t('1 to 90')}
                error={errors.challanDueDays?.message}
              >
                {(p) => <Input inputMode="numeric" {...register('challanDueDays')} {...p} />}
              </Field>
              <Field
                label={t('Max evidence file size (MB)')}
                required
                hint={t('1 to 200')}
                error={errors.maxEvidenceMb?.message}
              >
                {(p) => <Input inputMode="numeric" {...register('maxEvidenceMb')} {...p} />}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Intern attendance')}</CardTitle>
              <p className="text-sm text-text-muted">
                {t(
                  'Attendance is verified on the server against each court geo-fence (set on Courts & Benches). The default radius applies to courts without their own radius.',
                )}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t('Default geo-fence radius (m)')}
                required
                hint={t('50 to 5000')}
                error={errors.attendanceDefaultRadiusM?.message}
              >
                {(p) => (
                  <Input inputMode="numeric" {...register('attendanceDefaultRadiusM')} {...p} />
                )}
              </Field>
              <Field
                label={t('Maximum location accuracy (m)')}
                required
                hint={t('10 to 1000. Check-ins reporting a worse accuracy are rejected.')}
                error={errors.attendanceMaxAccuracyM?.message}
              >
                {(p) => (
                  <Input inputMode="numeric" {...register('attendanceMaxAccuracyM')} {...p} />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Summons and process servers')}</CardTitle>
              <p className="text-sm text-text-muted">
                {t(
                  'Process servers must commit progress and proof with a GPS accuracy at least this good. A device location can be spoofed and is not matched to the address in this prototype.',
                )}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t('Maximum GPS accuracy (m)')}
                required
                hint={t('10 to 500')}
                error={errors.summonsMaxGpsAccuracyM?.message}
              >
                {(p) => (
                  <Input inputMode="numeric" {...register('summonsMaxGpsAccuracyM')} {...p} />
                )}
              </Field>
              <Field
                label={t('Default due period (days)')}
                required
                hint={t('1 to 90')}
                error={errors.summonsDefaultDueDays?.message}
              >
                {(p) => <Input inputMode="numeric" {...register('summonsDefaultDueDays')} {...p} />}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Security')}</CardTitle>
              <p className="text-sm text-text-muted">
                {t(
                  'An account or address refused this many times on admin routes within 10 minutes raises a Security Alert and its sessions are ended.',
                )}
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('Escalation alert threshold (attempts)')}
                required
                hint={t('1 to 20')}
                error={errors.securityEscalationThreshold?.message}
              >
                {(p) => (
                  <Input inputMode="numeric" {...register('securityEscalationThreshold')} {...p} />
                )}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Court hours and hearing slots')}</CardTitle>
              <p className="text-sm text-text-muted">
                {t(
                  'Courts sit Monday to Friday. Hearings are booked in consecutive slots inside these hours. These cannot be changed while upcoming hearings exist.',
                )}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-3">
              <Field
                label={t('Court day start')}
                required
                hint={t('24-hour, for example 09:00')}
                error={errors.courtDayStart?.message}
              >
                {(p) => <Input placeholder="09:00" {...register('courtDayStart')} {...p} />}
              </Field>
              <Field
                label={t('Court day end')}
                required
                hint={t('24-hour, for example 14:00')}
                error={errors.courtDayEnd?.message}
              >
                {(p) => <Input placeholder="14:00" {...register('courtDayEnd')} {...p} />}
              </Field>
              <Field
                label={t('Hearing slot length (minutes)')}
                required
                hint={t('10 to 240')}
                error={errors.hearingSlotMinutes?.message}
              >
                {(p) => <Input inputMode="numeric" {...register('hearingSlotMinutes')} {...p} />}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Court fees')}</CardTitle>
              <p className="text-sm text-text-muted">
                {t('Filing fee per case type in PKR, and a percentage modifier applied on top.')}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field
                label={t('Filing Fee Rate Modifier (%)')}
                required
                hint={t('0 to 100. Applied to the filing fees below.')}
                error={errors.filingFeeRateModifier?.message}
              >
                {(p) => (
                  <Input
                    inputMode="decimal"
                    className="max-w-40"
                    {...register('filingFeeRateModifier')}
                    {...p}
                  />
                )}
              </Field>
              <div className="space-y-3">
                {fees.map((f, i) => (
                  <Field
                    key={f.caseType}
                    label={t('{{caseTypeLabel}} filing fee (PKR)', {
                      caseTypeLabel: caseTypeLabel(
                        f.caseType as Settings['fees'][number]['caseType'],
                      ),
                    })}
                    hint={
                      Number.isFinite(Number(f.amount)) && f.amount
                        ? formatPkr(f.amount)
                        : undefined
                    }
                    error={errors.fees?.[i]?.amount?.message}
                    required
                  >
                    {(p) => (
                      <Input
                        inputMode="decimal"
                        className="max-w-48"
                        // i18n-ignore
                        {...register(`fees.${i}.amount`)}
                        {...p}
                      />
                    )}
                  </Field>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button type="submit" size="lg" loading={save.isPending}>
            <Save aria-hidden="true" /> {t('Apply Policy Changes System-Wide')}
          </Button>
        </form>
      )}
      <ReminderRunCard />
    </>
  );
}

/** Runs the daily hearing reminder job on demand (it also runs every day at 08:00 Pakistan time). */
function ReminderRunCard() {
  const { t } = useTranslation();
  const run = useMutation({
    mutationFn: remindersApi.run,
    onSuccess: (r) =>
      toast.success(
        t('Hearing reminders for {{date}}: {{sent}} sent, {{alreadySent}} already sent earlier.', {
          date: isoToDdMmYyyy(r.date),
          sent: r.sent,
          alreadySent: r.alreadySent,
        }),
      ),
    onError: (e) => toast.error(parseApiError(e).message),
  });
  return (
    <Card className="mt-6" aria-labelledby="reminders-heading">
      <CardHeader>
        <CardTitle id="reminders-heading">{t('Hearing reminders')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-muted">
          {t(
            'Every day at 08:00 (Pakistan time) everyone on a hearing scheduled for the next day gets one reminder: the parties, their lawyers and the judge. Running it again never sends a reminder twice.',
          )}
        </p>
        <Button variant="secondary" onClick={() => run.mutate()} loading={run.isPending}>
          <BellRing aria-hidden="true" /> {t("Send tomorrow's reminders now")}
        </Button>
      </CardContent>
    </Card>
  );
}
