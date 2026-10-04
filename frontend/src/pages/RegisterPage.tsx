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
import { toast } from '@/components/ui/toaster';
import { authApi } from '@/lib/auth-api';
import { applyServerError } from '@/lib/form-errors';
import { registerSchema, summaryFor, type RegisterValues } from '@/lib/schemas';
import { cn } from '@/lib/utils';

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
  { value: 'LITIGANT', label: 'Litigant', hint: 'I am a party to a case', icon: UserRound },
  { value: 'LAWYER', label: 'Lawyer', hint: 'I run a chamber', icon: Scale },
] as const;

export default function RegisterPage() {
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
      title="Create an account"
      description="Public registration is for litigants and lawyers. Other accounts are created by an administrator."
      footer={
        <p>
          Already registered?{' '}
          <Link to="/login" className="font-semibold">
            Log in
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
          <legend className="mb-2 text-sm font-medium">I am registering as a</legend>
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
          <Field label="First name" error={errors.firstName?.message} required>
            {(p) => <Input autoComplete="given-name" {...p} {...register('firstName')} />}
          </Field>
          <Field label="Last name" error={errors.lastName?.message} required>
            {(p) => <Input autoComplete="family-name" {...p} {...register('lastName')} />}
          </Field>
          <Field label="CNIC" hint="Format: 12345-1234567-1" error={errors.cnic?.message} required>
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
            label="Mobile number"
            hint="Format: +92 3XX XXXXXXX"
            error={errors.phone?.message}
            required
          >
            {(p) => (
              <Input
                type="tel"
                autoComplete="tel"
                placeholder="+92 300 1234567"
                {...p}
                {...register('phone')}
              />
            )}
          </Field>
        </div>

        <Field label="Email address" error={errors.email?.message} required>
          {(p) => <Input type="email" autoComplete="email" {...p} {...register('email')} />}
        </Field>

        {role === 'LAWYER' && (
          <Field
            label="Bar Council number"
            hint="Optional now. An administrator verifies your registration before you can act as a verified lawyer."
            error={errors.barNumber?.message}
          >
            {(p) => <Input {...p} {...register('barNumber')} />}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Password"
            hint="At least 8 characters with an uppercase letter, a lowercase letter and a number."
            error={errors.password?.message}
            required
          >
            {(p) => <PasswordInput autoComplete="new-password" {...p} {...register('password')} />}
          </Field>
          <Field label="Confirm password" error={errors.confirmPassword?.message} required>
            {(p) => (
              <PasswordInput autoComplete="new-password" {...p} {...register('confirmPassword')} />
            )}
          </Field>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <UserPlus aria-hidden="true" /> Create account
        </Button>
      </form>
    </AuthCard>
  );
}
