import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, MessageSquareText, Save, Send } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { applyServerError } from '@/lib/form-errors';
import { roleHome } from '@/lib/navigation';
import { FEEDBACK_CATEGORIES, feedbackApi, type FeedbackCategory } from '@/lib/phase4-api';
import { MESSAGES } from '@/lib/schemas';
import { cn } from '@/lib/utils';

const CHANNELS = [
  { key: 'sms', label: 'SMS', hint: 'Text messages to your registered phone number.' },
  {
    key: 'mobilePush',
    label: 'Mobile Notifications',
    hint: 'Push notifications on the DigitalAdaalat mobile app.',
  },
  { key: 'email', label: 'Email', hint: 'Messages to your registered email address.' },
] as const;

type ChannelKey = (typeof CHANNELS)[number]['key'];

function Switch({
  checked,
  onChange,
  labelId,
  hintId,
  disabled,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  labelId: string;
  hintId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors disabled:opacity-60',
        checked ? 'border-primary bg-primary' : 'border-text-muted bg-surface',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-0.5 size-5 rounded-full transition-all',
          checked ? 'left-[22px] bg-on-primary' : 'left-0.5 bg-text-muted',
        )}
      />
      <span className="sr-only">{checked ? 'On' : 'Off'}</span>
    </button>
  );
}

/** UC-5.3: "Notification Options Preferences". */
export function NotificationPreferencesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Record<ChannelKey, boolean> | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: feedbackApi.getPreferences,
  });
  const current: Record<ChannelKey, boolean> | null =
    prefs ?? (data ? { sms: data.sms, mobilePush: data.mobilePush, email: data.email } : null);

  const save = useMutation({
    mutationFn: () => feedbackApi.savePreferences({ ...(current as Record<ChannelKey, boolean>) }),
    onSuccess: async (res) => {
      setSaved(res.message);
      toast.success(res.message);
      setPrefs(null);
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (!user) return null;
  return (
    <>
      <PageHeader
        title="Notification Options Preferences"
        description="Choose how you want to hear about hearings, payments and case updates."
        crumbs={[
          { label: 'Dashboard', to: roleHome(user.role) },
          { label: 'My Profile', to: '/profile' },
          { label: 'Notification Options' },
        ]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending || !current ? (
        <Skeleton className="h-64 max-w-2xl" />
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-5 text-primary" aria-hidden="true" /> Channels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {saved && <Alert variant="success">{saved}</Alert>}
            <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-background p-4">
              <div>
                <p id="ch-inapp" className="font-semibold">
                  In-app notifications
                </p>
                <p id="ch-inapp-hint" className="text-sm text-text-muted">
                  Always on. They appear under the bell at the top of every page.
                </p>
              </div>
              <Switch checked disabled labelId="ch-inapp" hintId="ch-inapp-hint" />
            </div>
            {CHANNELS.map((c) => (
              <div
                key={c.key}
                className="flex items-start justify-between gap-4 rounded-md border border-border p-4"
              >
                <div>
                  <p id={`ch-${c.key}`} className="font-semibold">
                    {c.label}
                  </p>
                  <p id={`ch-${c.key}-hint`} className="text-sm text-text-muted">
                    {c.hint}
                  </p>
                </div>
                <Switch
                  checked={current[c.key]}
                  onChange={(v) => {
                    setSaved(null);
                    setPrefs({ ...current, [c.key]: v });
                  }}
                  labelId={`ch-${c.key}`}
                  hintId={`ch-${c.key}-hint`}
                />
              </div>
            ))}
            <p className="text-sm text-text-muted">
              In this demo version SMS, mobile and email messages are simulated and only written to
              the server log.
            </p>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              <Save aria-hidden="true" /> Save preferences
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const feedbackSchema = z.object({
  category: z.enum(['USABILITY', 'TECHNICAL_ISSUE', 'SUGGESTION', 'OTHER']),
  rating: z.string(),
  message: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .min(10, 'Enter your feedback in 10 to 2000 characters.')
    .max(2000, 'Enter your feedback in 10 to 2000 characters.'),
});
type FeedbackValues = z.infer<typeof feedbackSchema>;

/** UC-5.4: "System Feedback". */
export function FeedbackPage() {
  const { user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FeedbackValues>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { category: 'USABILITY', rating: '', message: '' },
  });
  const message = useWatch({ control, name: 'message' }) ?? '';

  const send = useMutation({
    mutationFn: (v: FeedbackValues) =>
      feedbackApi.submit({
        message: v.message.trim(),
        category: v.category as FeedbackCategory,
        ...(v.rating ? { rating: Number(v.rating) } : {}),
      }),
    onSuccess: (res) => {
      setSuccess(res.message);
      setFormError(null);
      toast.success(res.message);
      reset();
    },
    onError: (e) => {
      setSuccess(null);
      setFormError(applyServerError(e, setError, ['message', 'category', 'rating']));
    },
  });

  if (!user) return null;
  return (
    <>
      <PageHeader
        title="System Feedback"
        description="Tell us what works and what does not. The registry team reads every message."
        crumbs={[
          { label: 'Dashboard', to: roleHome(user.role) },
          { label: 'My Profile', to: '/profile' },
          { label: 'System Feedback' },
        ]}
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-5 text-primary" aria-hidden="true" /> Your feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={handleSubmit(
              (v) => {
                setFormError(null);
                setSuccess(null);
                send.mutate(v);
              },
              () => {
                setSuccess(null);
                setFormError(MESSAGES.invalidFields);
              },
            )}
            className="space-y-4"
          >
            {success && <Alert variant="success">{success}</Alert>}
            {formError && <Alert variant="error">{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" required error={errors.category?.message}>
                {(p) => (
                  <NativeSelect {...register('category')} {...p}>
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              <Field label="Rating (optional)">
                {(p) => (
                  <NativeSelect {...register('rating')} {...p}>
                    <option value="">No rating</option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'star' : 'stars'}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            </div>
            <Field
              label="Narrative notes"
              required
              hint={`${message.trim().length}/2000 characters (at least 10)`}
              error={errors.message?.message}
            >
              {(p) => (
                <Controller
                  control={control}
                  name="message"
                  render={({ field }) => <Textarea rows={7} maxLength={2000} {...p} {...field} />}
                />
              )}
            </Field>
            <Button type="submit" loading={send.isPending}>
              <Send aria-hidden="true" /> Transmit Feedback Data Log
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
