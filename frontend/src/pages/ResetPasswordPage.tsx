import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthCard } from '@/components/layout/AuthCard';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { authApi } from '@/lib/auth-api';
import { applyServerError } from '@/lib/form-errors';
import { resetPasswordSchema, summaryFor, type ResetPasswordValues } from '@/lib/schemas';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  async function onValid({ password, confirmPassword }: ResetPasswordValues) {
    setFormError(null);
    try {
      const { message } = await authApi.resetPassword(token, password, confirmPassword);
      toast.success(message);
      navigate('/login', { replace: true, state: { notice: message } });
    } catch (error) {
      setFormError(applyServerError(error, setError, ['password', 'confirmPassword']));
    }
  }

  return (
    <AuthCard title="Choose a new password" footer={<Link to="/login">Back to log in</Link>}>
      {!token ? (
        <Alert variant="error" title="This link cannot be used">
          This password reset link is invalid or has expired.{' '}
          <Link to="/forgot-password">Request a new link</Link>.
        </Alert>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
          className="space-y-4"
        >
          {formError && (
            <Alert variant="error">
              {formError} <Link to="/forgot-password">Request a new link</Link>.
            </Alert>
          )}
          <Field
            label="New password"
            hint="At least 8 characters with an uppercase letter, a lowercase letter and a number."
            error={errors.password?.message}
            required
          >
            {(p) => (
              <PasswordInput
                autoComplete="new-password"
                autoFocus
                {...p}
                {...register('password')}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
            {(p) => (
              <PasswordInput autoComplete="new-password" {...p} {...register('confirmPassword')} />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            <KeyRound aria-hidden="true" /> Update password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
