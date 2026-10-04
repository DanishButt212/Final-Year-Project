import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
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

const decimal2 = /^\d{1,10}(\.\d{1,2})?$/;

const policySchema = z.object({
  maxAttachmentMb: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d+$/, 'Enter a whole number of MB.')
    .refine((v) => Number(v) >= 1 && Number(v) <= 100, 'Enter a value from 1 to 100 MB.'),
  caseRegistrationOpen: z.boolean(),
  filingFeeRateModifier: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a percentage with at most two decimals.')
    .refine((v) => Number(v) >= 0 && Number(v) <= 100, 'Enter a percentage from 0 to 100.'),
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
  fees: s.fees.map((f) => ({ caseType: f.caseType, amount: f.amount })),
});

/** UC-2.3: Global Variables and Application Constants. */
export default function PoliciesPage() {
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
        title="Global Variables and Application Constants"
        description="System-wide policies. Changes apply immediately to everyone."
        crumbs={[{ label: 'Dashboard', to: '/admin' }, { label: 'System Policies' }]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <div role="status" aria-label="Loading policies" className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
          <span className="sr-only">Loading…</span>
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
              <CardTitle>Filing and uploads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field
                label="Max Attachment Limit (MB)"
                required
                hint="PDF files above this size are refused. Allowed range 1 to 100 MB."
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
                    Case registration open
                  </p>
                  <p id="reg-hint" className="text-sm text-text-muted">
                    {open
                      ? 'Litigants and verified lawyers can file new cases.'
                      : 'New case filing is closed. Users see "Case registration is currently closed."'}
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
                          field.value ? 'left-[22px] bg-on-primary' : 'left-0.5 bg-text-muted',
                        )}
                      />
                      <span className="sr-only">{field.value ? 'On' : 'Off'}</span>
                    </button>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Court fees</CardTitle>
              <p className="text-sm text-text-muted">
                Filing fee per case type in PKR, and a percentage modifier applied on top.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field
                label="Filing Fee Rate Modifier (%)"
                required
                hint="0 to 100. Applied to the filing fees below."
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
                    label={`${caseTypeLabel(f.caseType as Settings['fees'][number]['caseType'])} filing fee (PKR)`}
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
            <Save aria-hidden="true" /> Apply Policy Changes System-Wide
          </Button>
        </form>
      )}
    </>
  );
}
