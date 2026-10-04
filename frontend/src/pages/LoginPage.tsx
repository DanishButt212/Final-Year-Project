import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { AuthCard } from '@/components/layout/AuthCard';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { CHAMBER_LOGIN_FAILED, loginToast } from '@/lib/login-messages';
import { roleHome } from '@/lib/navigation';
import {
  chamberLoginSchema,
  loginSchema,
  MESSAGES,
  summaryFor,
  type ChamberLoginValues,
  type LoginValues,
} from '@/lib/schemas';

function ChamberLoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChamberLoginValues>({ resolver: zodResolver(chamberLoginSchema) });

  async function onValid(v: ChamberLoginValues) {
    setFormError(null);
    try {
      const { message } = await login(v.identifier, v.password, v.chamberCode.trim());
      toast.success(message);
      navigate('/lawyer/chamber', { replace: true });
    } catch (error) {
      const body = parseApiError(error);
      // Every chamber mismatch gets the same message, so nothing about the chamber is revealed.
      setFormError(body.statusCode === 401 ? CHAMBER_LOGIN_FAILED : body.message);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
      className="space-y-4"
    >
      {formError && <Alert variant="error">{formError}</Alert>}
      <Field
        label="Chamber ID"
        required
        error={errors.chamberCode?.message}
        hint="Shown on Chamber Settings, for example CH-000001."
      >
        {(p) => (
          <Input
            autoComplete="off"
            autoCapitalize="characters"
            {...p}
            {...register('chamberCode')}
          />
        )}
      </Field>
      <Field label="Personal email" required error={errors.identifier?.message}>
        {(p) => <Input type="email" autoComplete="username" {...p} {...register('identifier')} />}
      </Field>
      <Field label="Password" required error={errors.password?.message}>
        {(p) => <PasswordInput autoComplete="current-password" {...p} {...register('password')} />}
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        <Building2 aria-hidden="true" /> Enter chamber
      </Button>
    </form>
  );
}

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
      toast.success(loginToast(user.role, message));
      const home = roleHome(user.role);
      navigate(state?.from?.startsWith(home) ? state.from : home, { replace: true });
    } catch (error) {
      const body = parseApiError(error);
      // Never reveal which half of the credentials was wrong, or which role the account has.
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
      <Tabs defaultValue="standard">
        <TabsList aria-label="Login type">
          <TabsTrigger value="standard">Log in</TabsTrigger>
          <TabsTrigger value="chamber">Chamber desk login</TabsTrigger>
        </TabsList>
        <TabsContent value="standard">
          <form
            noValidate
            onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
            className="space-y-4"
          >
            {state?.notice && <Alert variant="success">{state.notice}</Alert>}
            {formError && <Alert variant="error">{formError}</Alert>}

            <Field label="Email or username" error={errors.identifier?.message} required>
              {(p) => (
                <Input autoComplete="username" autoFocus {...p} {...register('identifier')} />
              )}
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
        </TabsContent>
        <TabsContent value="chamber">
          <p className="mb-4 text-sm text-text-muted">
            For senior lawyers: enter your unique Chamber ID together with your email and password.
          </p>
          <ChamberLoginForm />
        </TabsContent>
      </Tabs>
    </AuthCard>
  );
}
