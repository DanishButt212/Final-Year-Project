import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Gavel, LocateFixed, MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { adminApi, type CourtRow } from '@/lib/admin-api';
import { applyServerError } from '@/lib/form-errors';
import { MESSAGES } from '@/lib/schemas';
import { UserStatusBadge } from './shared';
import { useTranslation } from 'react-i18next';

/** Geo-fence of a court complex, used to verify intern attendance on the server. */
function GeofenceDialog({ court, onClose }: { court: CourtRow; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [lat, setLat] = useState(court.latitude === null ? '' : String(court.latitude));
  const [lng, setLng] = useState(court.longitude === null ? '' : String(court.longitude));
  const [radius, setRadius] = useState(
    court.geofenceRadiusM === null ? '' : String(court.geofenceRadiusM),
  );
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateGeofence(court.id, {
        latitude: lat.trim() === '' ? null : Number(lat),
        longitude: lng.trim() === '' ? null : Number(lng),
        geofenceRadiusM: radius.trim() === '' ? null : Number(radius),
      }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => setError(parseApiError(e).message),
  });

  function locateMe() {
    if (!('geolocation' in navigator)) {
      setError(t('This browser cannot provide your location.'));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError(t('Location access was denied or is unavailable.'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const bad =
      (lat.trim() === '') !== (lng.trim() === '')
        ? t('Enter both latitude and longitude, or leave both empty.')
        : lat.trim() !== '' && !(Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180)
          ? t('Latitude must be between -90 and 90 and longitude between -180 and 180.')
          : radius.trim() !== '' && !(Number(radius) >= 50 && Number(radius) <= 5000)
            ? t('Radius must be between 50 and 5000 metres.')
            : null;
    if (bad) return setError(bad);
    setError(null);
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <form noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Attendance geo-fence')}</DialogTitle>
            <DialogDescription>{court.name}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}
          <p className="mb-4 text-sm text-text-muted">
            {t(
              'The seeded coordinates are only approximate placeholders for Multan. To test attendance where you are, stand at the spot and use your current location. Leave latitude and longitude empty to remove the geo-fence (attendance cannot be verified at that court).',
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Latitude')}>
              {(p) => (
                <Input
                  inputMode="decimal"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <Field label={t('Longitude')}>
              {(p) => (
                <Input
                  inputMode="decimal"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  {...p}
                />
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t('Radius (metres)')}
                hint={t('Empty uses the default radius from System Policies.')}
              >
                {(p) => (
                  <Input
                    inputMode="numeric"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    {...p}
                  />
                )}
              </Field>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={locateMe}
            loading={locating}
          >
            <LocateFixed aria-hidden="true" /> {t('Use my current location')}
          </Button>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('Save geo-fence')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const roomSchema = z.object({
  name: z.string().trim().min(1, MESSAGES.fieldRequired).max(60, 'Use 60 characters or fewer.'),
  benchNo: z
    .string()
    .trim()
    .regex(/^(\d{1,2})?$/, 'Bench number must be a whole number from 1 to 99.'),
});
type RoomValues = z.infer<typeof roomSchema>;

type RoomTarget =
  | { mode: 'create'; court: CourtRow }
  | { mode: 'edit'; court: CourtRow; room: CourtRow['courtrooms'][number] };

function RoomDialog({ target, onClose }: { target: RoomTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editing = target.mode === 'edit';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RoomValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      name: editing ? target.room.name : '',
      benchNo: editing && target.room.benchNo ? String(target.room.benchNo) : '',
    },
  });

  const save = useMutation({
    mutationFn: (v: RoomValues) => {
      const benchNo = v.benchNo ? Number(v.benchNo) : undefined;
      return editing
        ? adminApi.updateCourtroom(target.room.id, { name: v.name, benchNo })
        : adminApi.createCourtroom({ name: v.name, benchNo, courtId: target.court.id });
    },
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => setFormError(applyServerError(e, setError, ['name', 'benchNo'])),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={handleSubmit((v) => {
            setFormError(null);
            save.mutate(v);
          })}
        >
          <DialogHeader>
            <DialogTitle>{editing ? t('Edit courtroom') : t('Add courtroom')}</DialogTitle>
            <DialogDescription>{target.court.name}</DialogDescription>
          </DialogHeader>
          {formError && (
            <Alert variant="error" className="mb-4">
              {formError}
            </Alert>
          )}
          <div className="space-y-4">
            <Field label={t('Courtroom name')} required error={errors.name?.message}>
              {(p) => <Input autoComplete="off" {...register('name')} {...p} />}
            </Field>
            <Field
              label={t('Bench number')}
              hint={t('Optional, for example 1 for Bench I.')}
              error={errors.benchNo?.message}
            >
              {(p) => <Input inputMode="numeric" {...register('benchNo')} {...p} />}
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? t('Save changes') : t('Add courtroom')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Courts, benches (courtrooms) and the judges with their active caseload. */
export default function CourtsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<RoomTarget | null>(null);
  const [fence, setFence] = useState<CourtRow | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: adminApi.courts,
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      adminApi.updateCourtroom(v.id, { isActive: v.isActive }),
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <PageHeader
        title={t('Courts & Benches')}
        description={t(
          'Courtrooms and the judges attached to each court, with their active caseload.',
        )}
        crumbs={[{ label: t('Dashboard'), to: '/admin' }, { label: t('Courts & Benches') }]}
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <div role="status" aria-label={t('Loading courts')} className="space-y-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <span className="sr-only">{t('Loading…')}</span>
        </div>
      ) : data && data.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={t('No courts configured')} />
        </Card>
      ) : (
        <div className="space-y-6">
          {data?.map((court) => (
            <Card key={court.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{court.name}</CardTitle>
                  <p className="text-sm text-text-muted">
                    {court.city} ·{' '}
                    {court.type === 'HIGH_COURT' ? t('High Court') : t('District & Sessions')}
                  </p>
                  <p className="text-sm text-text-muted">
                    {court.latitude === null
                      ? t('No attendance geo-fence set.')
                      : court.geofenceRadiusM
                        ? t('Geo-fence: {{latitude}}, {{longitude}} · {{radius}} m', {
                            latitude: court.latitude,
                            longitude: court.longitude,
                            radius: court.geofenceRadiusM,
                          })
                        : t('Geo-fence: {{latitude}}, {{longitude}} · default radius', {
                            latitude: court.latitude,
                            longitude: court.longitude,
                          })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setFence(court)}>
                    <MapPin aria-hidden="true" />
                    {court.latitude === null ? t('Set attendance geo-fence') : t('Edit geo-fence')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setTarget({ mode: 'create', court })}
                  >
                    <Plus aria-hidden="true" /> {t('Add courtroom')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                    {t('Courtrooms')}
                  </h3>
                  {court.courtrooms.length === 0 ? (
                    <p className="text-text-muted">{t('No courtrooms yet.')}</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {court.courtrooms.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <span>
                            <span className="font-semibold">{r.name}</span>
                            {r.benchNo && (
                              <span className="ms-2 text-sm text-text-muted">
                                {t('Bench {{benchNo}}', { benchNo: r.benchNo })}
                              </span>
                            )}
                            {!r.isActive && (
                              <Badge variant="neutral" className="ms-2">
                                {t('Inactive')}
                              </Badge>
                            )}
                          </span>
                          <span className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTarget({ mode: 'edit', court, room: r })}
                              aria-label={t('Edit {{name}}', { name: r.name })}
                            >
                              <Pencil aria-hidden="true" /> {t('Edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}
                              disabled={toggle.isPending}
                              aria-label={`${r.isActive ? t('Deactivate') : t('Activate')} ${r.name}`}
                            >
                              {r.isActive ? t('Deactivate') : t('Activate')}
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">
                    {t('Judges')}
                  </h3>
                  {court.judges.length === 0 ? (
                    <EmptyState
                      icon={Gavel}
                      title={t('No judges attached')}
                      description={t('Add a judge from Account Management.')}
                    />
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {court.judges.map((j) => {
                        const room = court.courtrooms.find((r) => r.id === j.courtroomId);
                        return (
                          <li
                            key={j.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                          >
                            <span>
                              <span className="font-semibold">{j.name}</span>
                              <span className="block text-sm text-text-muted">
                                {room ? room.name : t('No fixed courtroom')}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {j.status !== 'ACTIVE' && <UserStatusBadge status={j.status} />}
                              <Badge variant="neutral">
                                {j.activeCases === 1
                                  ? t('1 active case')
                                  : t('{{count}} active cases', { count: j.activeCases })}
                              </Badge>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {fence && <GeofenceDialog key={fence.id} court={fence} onClose={() => setFence(null)} />}
      {target && (
        <RoomDialog
          key={target.mode === 'edit' ? target.room.id : 'new'}
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}
