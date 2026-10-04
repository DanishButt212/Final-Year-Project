import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Camera,
  ExternalLink,
  MapPin,
  RefreshCw,
  Save,
  ScrollText,
  UserCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { MESSAGES, PHONE_REGEX } from '@/lib/schemas';
import { mapsLink, serverApi, type ServerSummons } from '@/lib/summons-api';
import { NotFoundPage } from '@/pages/ErrorPages';
import { OverdueBadge, PriorityBadge, SummonsStatusBadge } from './badges';

const BIG = 'min-h-12 w-full text-base';

function RosterCard({ s }: { s: ServerSummons }) {
  return (
    <li>
      <Link
        to={`/process-server/summons/${s.id}`}
        className="block rounded-md border border-border bg-surface p-4 no-underline hover:border-primary focus-visible:outline-primary"
      >
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={s.priority} />
          <OverdueBadge overdue={s.overdue} />
          <SummonsStatusBadge status={s.status} />
        </div>
        <p className="mt-2 text-lg font-bold text-text">{s.recipientName}</p>
        <p className="flex items-start gap-1.5 text-text">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {s.serviceAddress}
        </p>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
          <span className="case-number text-text">{s.ucn}</span>
          <span>
            {s.noticeType === 'NOTICE' ? 'Notice' : 'Summons'} · due {formatDate(s.dueBy)}
          </span>
        </p>
      </Link>
    </li>
  );
}

/** "My Duty Roster": pending summons and notices assigned to this server. */
export function RosterPage() {
  const roster = useQuery({ queryKey: ['server', 'roster'], queryFn: serverApi.roster });
  const summary = useQuery({ queryKey: ['server', 'summary'], queryFn: serverApi.summary });

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Duty Roster</h1>
          <p className="text-text-muted">Sorted by urgency, due date and sector.</p>
        </div>
        <Button
          variant="secondary"
          className="min-h-12"
          onClick={() => {
            void roster.refetch();
            void summary.refetch();
          }}
          loading={roster.isFetching}
          aria-label="Refresh roster"
        >
          <RefreshCw aria-hidden="true" /> Refresh
        </Button>
      </div>
      {summary.data && (
        <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['Open', summary.data.open],
            ['Overdue', summary.data.overdue],
            ['Done this week', summary.data.executedThisWeek],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-md border border-border bg-surface p-2">
              <dd className="text-xl font-bold">{v}</dd>
              <dt className="text-xs text-text-muted">{k}</dt>
            </div>
          ))}
        </dl>
      )}
      {roster.isError && <Alert variant="error">{parseApiError(roster.error).message}</Alert>}
      {roster.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : roster.data && roster.data.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title={roster.data.message ?? 'No outstanding summons found in your queue.'}
            description="New assignments from the registry appear here."
          />
        </Card>
      ) : (
        roster.data && (
          <ul className="space-y-3" aria-label="Duty roster">
            {roster.data.data.map((s) => (
              <RosterCard key={s.id} s={s} />
            ))}
          </ul>
        )
      )}
    </>
  );
}

/** One summons: address with a Maps link, attempts timeline and the two field actions. */
export function SummonsPage() {
  const { summonsId } = useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ['server', 'summons', summonsId],
    queryFn: () => serverApi.detail(summonsId as string),
    enabled: Boolean(summonsId),
    retry: false,
  });
  if (isPending) return <Skeleton className="h-96" />;
  if (error || !data) {
    return !data && parseApiError(error).statusCode !== 404 ? (
      <Alert variant="error">{parseApiError(error).message}</Alert>
    ) : (
      <NotFoundPage />
    );
  }
  const open = data.status === 'ASSIGNED' || data.status === 'ATTEMPT_IN_PROGRESS';
  return (
    <>
      <Link to="/process-server" className="mb-3 inline-block text-sm font-semibold">
        Back to roster
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={data.priority} />
        <OverdueBadge overdue={data.overdue} />
        <SummonsStatusBadge status={data.status} />
      </div>
      <h1 className="mt-2 text-2xl font-bold">{data.recipientName}</h1>
      <Card className="mt-3">
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-text-muted">Service address</p>
            <p className="text-lg font-medium">{data.serviceAddress}</p>
            <p className="text-sm text-text-muted">Sector: {data.sector}</p>
          </div>
          <Button asChild variant="secondary" className={BIG}>
            <a href={mapsLink(data.serviceAddress)} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" /> Open in Maps
            </a>
          </Button>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-text-muted">Case number</dt>
              <dd className="case-number font-semibold">{data.ucn}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Due</dt>
              <dd className="font-semibold">{formatDate(data.dueBy)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-text-muted">Case</dt>
              <dd>{data.caseTitle}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <h2 className="mb-2 mt-6 text-lg font-bold">Attempts</h2>
      {data.attempts.length === 0 ? (
        <p className="text-text-muted">No progress entries yet.</p>
      ) : (
        <ol className="space-y-2" aria-label="Attempts timeline">
          {data.attempts.map((a) => (
            <li key={a.id} className="rounded-md border border-border bg-surface p-3">
              <p className="text-sm font-semibold">
                {formatDateTime(a.createdAt)}{' '}
                <span className="font-normal text-text-muted">
                  · GPS ±{Math.round(Number(a.accuracyM))} m
                </span>
              </p>
              <p>{a.notes}</p>
            </li>
          ))}
        </ol>
      )}

      {data.status === 'EXECUTED' && (
        <Alert variant="success" title="Executed" className="mt-6">
          Proof secured on {formatDateTime(data.executedAt)} (
          {data.serviceMode === 'PERSONAL_DELIVERY'
            ? 'delivered in person'
            : 'refused, affixed to gate'}
          ).
        </Alert>
      )}
      {data.status === 'CANCELLED' && (
        <Alert variant="info" title="Cancelled" className="mt-6">
          The registry cancelled this summons.
        </Alert>
      )}
      {open && (
        <div className="mt-6 space-y-3">
          <Button asChild className={BIG}>
            <Link to={`/process-server/summons/${data.id}/attempt`}>
              <MapPin aria-hidden="true" /> Attempt in Progress
            </Link>
          </Button>
          {data.status === 'ATTEMPT_IN_PROGRESS' ? (
            <Button asChild variant="secondary" className={BIG}>
              <Link to={`/process-server/summons/${data.id}/finalize`}>
                <Camera aria-hidden="true" /> Finalize Notice Execution
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-text-muted">
              Commit a progress log entry first; then you can finalize the execution.
            </p>
          )}
        </div>
      )}
    </>
  );
}

const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, MESSAGES.fieldRequired)
    .regex(PHONE_REGEX, 'Phone must be in the format +92 3XX XXXXXXX.'),
});
type ProfileValues = z.infer<typeof profileSchema>;

/** "Staff Profile Settings": precinct, sector and badge are read-only; phone and photo are editable. */
export function ServerProfilePage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['server', 'profile'],
    queryFn: serverApi.profile,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { phone: '' },
  });

  useEffect(() => {
    if (data) reset({ phone: data.phone });
  }, [data, reset]);

  const hasPhoto = data?.hasPhoto;
  useEffect(() => {
    if (!hasPhoto) return;
    let url: string | null = null;
    let live = true;
    serverApi
      .profilePhoto()
      .then((u) => {
        if (live) {
          url = u;
          setPhotoUrl(u);
        } else URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasPhoto]);

  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const save = useMutation({
    mutationFn: (v: ProfileValues) => serverApi.updateProfile({ phone: v.phone, photo }),
    onSuccess: async (res) => {
      setSuccess(res.message);
      setFormError(null);
      setPhoto(null);
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['server', 'profile'] });
    },
    onError: (e) => {
      setSuccess(null);
      setFormError(parseApiError(e).message);
    },
  });

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Staff Profile Settings</h1>
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-96" />
      ) : (
        data && (
          <Card>
            <CardContent>
              <form
                noValidate
                className="space-y-4"
                onSubmit={handleSubmit((v) => {
                  setSuccess(null);
                  save.mutate(v);
                })}
              >
                {success && <Alert variant="success">{success}</Alert>}
                {formError && <Alert variant="error">{formError}</Alert>}
                <div className="flex items-center gap-4">
                  <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary-soft">
                    {preview || photoUrl ? (
                      <img
                        src={preview ?? photoUrl ?? ''}
                        alt="Profile verification photo"
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserCircle className="size-10 text-primary" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p className="text-lg font-bold">{data.name}</p>
                    <p className="text-sm text-text-muted">{data.email}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-text-muted">Badge number</dt>
                    <dd className="font-semibold">{data.badgeNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Badge status</dt>
                    <dd>
                      <Badge variant={data.badgeStatus === 'ACTIVE' ? 'decided' : 'rejected'}>
                        {data.badgeStatus === 'ACTIVE' ? 'Active' : 'Suspended'}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Precinct</dt>
                    <dd className="font-semibold">{data.precinct}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Assigned sector</dt>
                    <dd className="font-semibold">{data.sector}</dd>
                  </div>
                </dl>
                <Field
                  label="Phone number"
                  required
                  error={errors.phone?.message}
                  hint="+92 3XX XXXXXXX"
                >
                  {(p) => (
                    <Input inputMode="tel" className="min-h-12" {...p} {...register('phone')} />
                  )}
                </Field>
                <Field label="Profile verification photo" hint="JPEG or PNG, up to 5 MB.">
                  {(p) => (
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      capture="user"
                      className="block w-full text-sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
                        previewRef.current = f ? URL.createObjectURL(f) : null;
                        setPreview(previewRef.current);
                        setPhoto(f);
                      }}
                      {...p}
                    />
                  )}
                </Field>
                <Button type="submit" className={BIG} loading={save.isPending}>
                  <Save aria-hidden="true" /> Save profile
                </Button>
              </form>
            </CardContent>
          </Card>
        )
      )}
    </>
  );
}
