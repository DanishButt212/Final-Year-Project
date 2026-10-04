import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Save } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { chamberApi, type ChamberProfile } from '@/lib/chamber-api';
import { applyServerError } from '@/lib/form-errors';
import { MESSAGES, PHONE_REGEX, summaryFor } from '@/lib/schemas';
import { ChipInput } from './shared';

const schema = z.object({
  name: z.string().trim().min(1, MESSAGES.fieldRequired).max(120),
  officeAddress: z.string().trim().min(1, MESSAGES.fieldRequired).max(300),
  partnerNames: z.array(z.string()).max(10),
  barMembershipIds: z.array(z.string()).max(10),
  practiceVerticals: z.array(z.string()).max(12),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || PHONE_REGEX.test(v), 'Phone must be in the format +92 3XX XXXXXXX.'),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email address.'),
  defaultHourlyRatePkr: z
    .string()
    .refine(
      (v) => Number(v) >= 1 && Number(v) <= 1_000_000,
      'Hourly rate must be between PKR 1 and PKR 1,000,000.',
    ),
  lowBalanceThresholdPkr: z
    .string()
    .refine(
      (v) => v !== '' && Number(v) >= 0 && Number(v) <= 100_000_000,
      'Threshold must be between PKR 0 and PKR 100,000,000.',
    ),
});
type Values = z.infer<typeof schema>;

const toValues = (p: ChamberProfile): Values => ({
  name: p.name,
  officeAddress: p.officeAddress ?? '',
  partnerNames: p.partnerNames,
  barMembershipIds: p.barMembershipIds,
  practiceVerticals: p.practiceVerticals,
  phone: p.phone ?? '',
  email: p.email ?? '',
  defaultHourlyRatePkr: Number(p.defaultHourlyRatePkr).toString(),
  lowBalanceThresholdPkr: Number(p.lowBalanceThresholdPkr).toString(),
});

function SettingsForm({ profile }: { profile: ChamberProfile }) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(profile) });

  const save = useMutation({
    mutationFn: (v: Values) =>
      chamberApi.saveProfile({
        name: v.name.trim(),
        officeAddress: v.officeAddress.trim(),
        partnerNames: v.partnerNames,
        barMembershipIds: v.barMembershipIds,
        practiceVerticals: v.practiceVerticals,
        phone: v.phone.trim() || undefined,
        email: v.email.trim() || undefined,
        defaultHourlyRatePkr: Number(v.defaultHourlyRatePkr),
        lowBalanceThresholdPkr: Number(v.lowBalanceThresholdPkr),
      }),
    onSuccess: async (res) => {
      setFormError(null);
      setSuccess(res.message);
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['chamber'] });
    },
    onError: (e) => {
      setSuccess(null);
      setFormError(
        applyServerError(e, setError, [
          'name',
          'officeAddress',
          'partnerNames',
          'barMembershipIds',
          'practiceVerticals',
          'phone',
          'email',
          'defaultHourlyRatePkr',
          'lowBalanceThresholdPkr',
        ]),
      );
    },
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={handleSubmit(
        (v) => {
          setFormError(null);
          setSuccess(null);
          save.mutate(v);
        },
        (errs) => {
          setSuccess(null);
          setFormError(summaryFor(errs));
        },
      )}
    >
      {success && <Alert variant="success">{success}</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-primary" aria-hidden="true" /> Firm identity
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Chamber name" required error={errors.name?.message}>
            {(p) => <Input maxLength={120} {...p} {...register('name')} />}
          </Field>
          <Field label="Chamber phone" error={errors.phone?.message} hint="+92 3XX XXXXXXX">
            {(p) => <Input inputMode="tel" {...p} {...register('phone')} />}
          </Field>
          <div className="md:col-span-2">
            <Field label="Office Physical Address" required error={errors.officeAddress?.message}>
              {(p) => <Textarea rows={2} maxLength={300} {...p} {...register('officeAddress')} />}
            </Field>
          </div>
          <Field label="Chamber email" error={errors.email?.message}>
            {(p) => <Input type="email" maxLength={120} {...p} {...register('email')} />}
          </Field>
          <div className="md:col-span-2 grid gap-4 md:grid-cols-1">
            <Field
              label="Sub-partner Names"
              error={errors.partnerNames?.message}
              hint="Press Enter or Add after each name (up to 10)."
            >
              {(p) => (
                <Controller
                  control={control}
                  name="partnerNames"
                  render={({ field }) => (
                    <ChipInput
                      label="Sub-partner names"
                      values={field.value}
                      onChange={field.onChange}
                      max={10}
                      id={p.id}
                      invalid={p['aria-invalid']}
                      describedBy={p['aria-describedby']}
                    />
                  )}
                />
              )}
            </Field>
            <Field
              label="Bar Association Membership IDs"
              error={errors.barMembershipIds?.message}
              hint="Up to 10 IDs."
            >
              {(p) => (
                <Controller
                  control={control}
                  name="barMembershipIds"
                  render={({ field }) => (
                    <ChipInput
                      label="Bar membership IDs"
                      values={field.value}
                      onChange={field.onChange}
                      max={10}
                      id={p.id}
                      invalid={p['aria-invalid']}
                      describedBy={p['aria-describedby']}
                    />
                  )}
                />
              )}
            </Field>
            <Field
              label="Practice Verticals"
              error={errors.practiceVerticals?.message}
              hint="For example Criminal Defence, Family Law (up to 12)."
            >
              {(p) => (
                <Controller
                  control={control}
                  name="practiceVerticals"
                  render={({ field }) => (
                    <ChipInput
                      label="Practice verticals"
                      values={field.value}
                      onChange={field.onChange}
                      max={12}
                      id={p.id}
                      invalid={p['aria-invalid']}
                      describedBy={p['aria-describedby']}
                    />
                  )}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Default hourly rate (PKR)"
            required
            error={errors.defaultHourlyRatePkr?.message}
            hint="Used when a billable entry has no rate of its own."
          >
            {(p) => (
              <Input
                type="number"
                step="0.01"
                min="1"
                inputMode="decimal"
                {...p}
                {...register('defaultHourlyRatePkr')}
              />
            )}
          </Field>
          <Field
            label="Low balance threshold (PKR)"
            required
            error={errors.lowBalanceThresholdPkr?.message}
            hint="Clients below this retainer balance are flagged."
          >
            {(p) => (
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                {...p}
                {...register('lowBalanceThresholdPkr')}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <Button type="submit" loading={save.isPending}>
        <Save aria-hidden="true" /> Update Firm Directory Profiles
      </Button>
    </form>
  );
}

/** "Chamber Settings & Identity Profile" */
export default function ChamberSettingsPage() {
  const { data, isPending, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['chamber', 'profile'],
    queryFn: chamberApi.profile,
  });
  return (
    <>
      <PageHeader
        title="Chamber Settings & Identity Profile"
        description="Update the identity and billing defaults of your chamber."
        crumbs={[{ label: 'Dashboard', to: '/lawyer' }, { label: 'Chamber Settings' }]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-96 max-w-3xl" />
      ) : (
        data && (
          <div className="max-w-3xl space-y-6">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2">
                <p>
                  <span className="text-sm text-text-muted">Chamber ID</span>
                  <br />
                  <span className="case-number text-lg font-semibold">{data.chamberCode}</span>
                </p>
                <p>
                  <span className="text-sm text-text-muted">Licence status</span>
                  <br />
                  <Badge variant={data.licenseStatus === 'ACTIVE' ? 'decided' : 'rejected'}>
                    {data.licenseStatus === 'ACTIVE' ? 'Active' : 'Suspended'}
                  </Badge>
                </p>
                <p>
                  <span className="text-sm text-text-muted">Senior lawyer</span>
                  <br />
                  <span className="font-medium">{data.lawyerName}</span>
                </p>
                <p className="w-full text-sm text-text-muted">
                  Use the Chamber ID with your email on the Chamber desk login form.
                </p>
              </CardContent>
            </Card>
            <SettingsForm key={dataUpdatedAt} profile={data} />
          </div>
        )
      )}
    </>
  );
}
