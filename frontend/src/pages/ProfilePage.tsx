import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { toast } from '@/components/ui/toaster';
import { usersApi } from '@/lib/auth-api';
import { applyServerError } from '@/lib/form-errors';
import { formatDate, initials } from '@/lib/format';
import { ROLE_LABEL, roleHome } from '@/lib/navigation';
import { MESSAGES, profileSchema, summaryFor, type ProfileValues } from '@/lib/schemas';
import { useTranslation } from 'react-i18next';

function ReadOnly({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={mono ? 'case-number font-medium' : 'font-medium'}>{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { phone: user?.phone ?? '', profileImage: user?.profileImage ?? '' },
  });

  if (!user) return null;

  async function onValid(values: ProfileValues) {
    setFormError(null);
    try {
      const { user: updated } = await usersApi.updateMe({
        phone: values.phone,
        profileImage: values.profileImage ? values.profileImage : null,
      });
      setUser(updated);
      reset({ phone: updated.phone, profileImage: updated.profileImage ?? '' });
      toast.success(MESSAGES.profileUpdated);
    } catch (error) {
      setFormError(applyServerError(error, setError, ['phone', 'profileImage']));
    }
  }

  const verification = user.lawyerProfile?.verificationStatus;

  return (
    <>
      <PageHeader
        title={t('My profile')}
        description={t(
          'Your account details. You can change your phone number and profile picture.',
        )}
        crumbs={[{ label: t('Dashboard'), to: roleHome(user.role) }, { label: t('My profile') }]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Account details')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              {user.profileImage ? (
                <img
                  src={user.profileImage}
                  alt={`${user.firstName} ${user.lastName}`}
                  className="size-16 rounded-full border border-border object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-on-primary"
                >
                  {initials(user.firstName, user.lastName)}
                </span>
              )}
              <div>
                <p className="font-heading text-lg font-bold">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-sm text-text-muted">{t(ROLE_LABEL[user.role])}</p>
              </div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <ReadOnly label={t('Email address')} value={user.email} />
              {user.username && <ReadOnly label={t('Username')} value={user.username} />}
              <ReadOnly label="CNIC" value={user.cnic} mono />
              <ReadOnly label={t('Member since')} value={formatDate(user.createdAt)} />
              {user.lawyerProfile?.barNumber && (
                <ReadOnly
                  label={t('Bar Council number')}
                  value={user.lawyerProfile.barNumber}
                  mono
                />
              )}
            </dl>
            {verification && (
              <div>
                <p className="mb-1 text-sm text-text-muted">{t('Lawyer verification')}</p>
                <Badge
                  variant={
                    verification === 'VERIFIED'
                      ? 'decided'
                      : verification === 'PENDING'
                        ? 'pending'
                        : 'rejected'
                  }
                >
                  {verification === 'VERIFIED'
                    ? t('Verified')
                    : verification === 'PENDING'
                      ? t('Pending verification')
                      : t('Rejected')}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Edit contact details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              onSubmit={handleSubmit(onValid, (e) => setFormError(summaryFor(e)))}
              className="space-y-4"
            >
              {formError && <Alert variant="error">{formError}</Alert>}
              <Field
                label={t('Mobile number')}
                hint={t('Format: +92 3XX XXXXXXX')}
                error={errors.phone?.message}
                required
              >
                {(p) => <PhoneInput {...p} {...register('phone')} />}
              </Field>
              <Field
                label={t('Profile picture link')}
                hint={t('A link starting with https://. Leave empty to remove your picture.')}
                error={errors.profileImage?.message}
              >
                {(p) => (
                  <Input type="url" placeholder="https://" {...p} {...register('profileImage')} />
                )}
              </Field>
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                <Save aria-hidden="true" /> {t('Save changes')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
