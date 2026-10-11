import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { AuthCard } from '@/components/layout/AuthCard';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { parseApiError } from '@/lib/api';
import { authApi } from '@/lib/auth-api';
import { forgotPasswordSchema, summaryFor, type ForgotPasswordValues } from '@/lib/schemas';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [done, setDone] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onValid({ email }: ForgotPasswordValues) {
    setFormError(null);
    try {
      setDone((await authApi.forgotPassword(email)).message);
    } catch (error) {
      setFormError(parseApiError(error).message);
    }
  }

  return (
    <AuthCard
      title={t('Forgot your password?')}
      description={t('Enter your email address and we will send you a link to choose a new one.')}
      footer={<Link to="/login">{t('Back to log in')}</Link>}
    >
      {done ? (
        <Alert variant="success" title={t('Check your email')}>
          {done}
        </Alert>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
          className="space-y-4"
        >
          {formError && <Alert variant="error">{formError}</Alert>}
          <Field label={t('Email address')} error={errors.email?.message} required>
            {(p) => (
              <Input type="email" autoComplete="email" autoFocus {...p} {...register('email')} />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            <Mail aria-hidden="true" /> {t('Send reset link')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
