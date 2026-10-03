import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { AuthCard } from '@/components/layout/AuthCard';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { roleHome } from '@/lib/navigation';
import { loginSchema, MESSAGES, summaryFor, type LoginValues } from '@/lib/schemas';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; notice?: string } | null;
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onValid(values: LoginValues) {
    setFormError(null);
    try {
      const { message, user } = await login(values.identifier, values.password);
      toast.success(message);
      const home = roleHome(user.role);
      navigate(state?.from?.startsWith(home) ? state.from : home, { replace: true });
    } catch (error) {
      const body = parseApiError(error);
      // Never reveal which half of the credentials was wrong.
      setFormError(body.statusCode === 401 ? MESSAGES.loginFailed : body.message);
    }
  }

  return (
    <AuthCard
      title="Log in"
      description="Use your email address. Administrators can also use their username."
      footer={
        <p>
          New here?{' '}
          <Link to="/register" className="font-semibold">
            Create an account
          </Link>
        </p>
      }
    >
      <form
        noValidate
        onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
        className="space-y-4"
      >
        {state?.notice && <Alert variant="success">{state.notice}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}

        <Field label="Email or username" error={errors.identifier?.message} required>
          {(p) => <Input autoComplete="username" autoFocus {...p} {...register('identifier')} />}
        </Field>
        <Field label="Password" error={errors.password?.message} required>
          {(p) => (
            <PasswordInput autoComplete="current-password" {...p} {...register('password')} />
          )}
        </Field>

        <div className="text-right text-sm">
          <Link to="/forgot-password">Forgot your password?</Link>
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          <LogIn aria-hidden="true" /> Log in
        </Button>
      </form>
    </AuthCard>
  );
}
