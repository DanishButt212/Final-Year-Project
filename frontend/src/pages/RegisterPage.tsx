import { zodResolver } from '@hookform/resolvers/zod';
import { Scale, UserRound, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { AuthCard } from '@/components/layout/AuthCard';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { toast } from '@/components/ui/toaster';
import { authApi } from '@/lib/auth-api';
import { applyServerError } from '@/lib/form-errors';
import { registerSchema, summaryFor, type RegisterValues } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

import { msg } from '@/i18n';

const FIELDS = [
  'firstName',
  'lastName',
  'cnic',
  'email',
  'phone',
  'password',
  'confirmPassword',
  'barNumber',
  'role',
] as const;

const ROLE_OPTIONS = [
  {
    value: 'LITIGANT',
    label: msg('Litigant'),
    hint: msg('I am a party to a case'),
    icon: UserRound,
  },
  { value: 'LAWYER', label: msg('Lawyer'), hint: 'I run a chamber', icon: Scale },
] as const;

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'LITIGANT' },
  });
  const role = useWatch({ control, name: 'role' });

  async function onValid(values: RegisterValues) {
    setFormError(null);
    try {
      const payload = {
        ...values,
        barNumber: values.role === 'LAWYER' && values.barNumber ? values.barNumber : undefined,
      };
      const { message } = await authApi.register(payload);
      toast.success(message);
      navigate('/login', { replace: true, state: { notice: message } });
    } catch (error) {
      setFormError(applyServerError(error, setError, FIELDS));
    }
  }

  return (
    <AuthCard
      wide
      title={t('Create an account')}
      description={t(
        'Public registration is for litigants and lawyers. Other accounts are created by an administrator.',
      )}
      footer={
        <p>
          {t('Already registered?')}{' '}
          <Link to="/login" className="font-semibold">
            {t('Log in')}
          </Link>
        </p>
      }
    >
      <form
        noValidate
        onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
        className="space-y-5"
      >
        {formError && <Alert variant="error">{formError}</Alert>}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('I am registering as a')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-surface p-3',
                  role === value ? 'border-2 border-primary bg-primary-soft' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  value={value}
                  className="size-4 accent-[#01411c]"
                  {...register('role')}
                />
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('First name')} error={errors.firstName?.message} required>
            {(p) => <Input autoComplete="given-name" {...p} {...register('firstName')} />}
          </Field>
          <Field label={t('Last name')} error={errors.lastName?.message} required>
            {(p) => <Input autoComplete="family-name" {...p} {...register('lastName')} />}
          </Field>
          <Field
            label="CNIC"
            hint={t('Format: 12345-1234567-1')}
            error={errors.cnic?.message}
            required
          >
            {(p) => (
              <Input
                inputMode="numeric"
                placeholder="12345-1234567-1"
                {...p}
                {...register('cnic')}
              />
            )}
          </Field>
          <Field
            label={t('Mobile number')}
            hint={t('Format: +92 3XX XXXXXXX')}
            error={errors.phone?.message}
            required
          >
            {(p) => <PhoneInput {...p} {...register('phone')} />}
          </Field>
        </div>

        <Field label={t('Email address')} error={errors.email?.message} required>
          {(p) => <Input type="email" autoComplete="email" {...p} {...register('email')} />}
        </Field>

        {role === 'LAWYER' && (
          <Field
            label={t('Bar Council number')}
            required
            hint={t('An administrator checks it with the Bar Council before you can file cases.')}
            error={errors.barNumber?.message}
          >
            {(p) => <Input {...p} {...register('barNumber')} />}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('Password')}
            hint={t(
              'At least 8 characters with an uppercase letter, a lowercase letter and a number.',
            )}
            error={errors.password?.message}
            required
          >
            {(p) => <PasswordInput autoComplete="new-password" {...p} {...register('password')} />}
          </Field>
          <Field label={t('Confirm password')} error={errors.confirmPassword?.message} required>
            {(p) => (
              <PasswordInput autoComplete="new-password" {...p} {...register('confirmPassword')} />
            )}
          </Field>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <UserPlus aria-hidden="true" /> {t('Create account')}
        </Button>
      </form>
    </AuthCard>
  );
}
