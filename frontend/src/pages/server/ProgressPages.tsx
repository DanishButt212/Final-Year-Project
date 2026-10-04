import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, LocateFixed, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { parseApiError } from '@/lib/api';
import { serverApi, TELEMETRY_ERROR } from '@/lib/summons-api';
import { NotFoundPage } from '@/pages/ErrorPages';
import {
  compressPhoto,
  telemetryProblem,
  useLiveLocation,
  type LocationState,
} from './field-tools';
import { SignatureCanvas, type SignatureHandle } from './SignatureCanvas';

const BIG = 'min-h-12 w-full text-base';
const NOTES_MESSAGE = 'Field observation notes must be 5 to 500 characters.';

/** Live accuracy indicator with a retry button. */
function LocationPanel({
  loc,
  maxAccuracyM,
  restart,
}: {
  loc: LocationState;
  maxAccuracyM: number;
  restart: () => void;
}) {
  const good = loc.status === 'ready' && loc.point.accuracyM <= maxAccuracyM;
  return (
    <div
      className="rounded-md border border-border bg-surface p-3"
      aria-live="polite"
      data-testid="location-panel"
    >
      <p className="flex items-center gap-2 font-semibold">
        <LocateFixed className="size-5 text-primary" aria-hidden="true" />
        {loc.status === 'locating' && 'Getting a GPS fix...'}
        {loc.status === 'error' && 'Location unavailable'}
        {loc.status === 'ready' && (good ? 'GPS accuracy is good' : 'GPS accuracy is too low')}
      </p>
      {loc.status === 'ready' && (
        <p className="mt-1 text-sm">
          Accuracy ±{Math.round(loc.point.accuracyM)} m (needs {maxAccuracyM} m or better).
        </p>
      )}
      {loc.status === 'error' && (
        <p className="mt-1 text-sm">Allow location access in the browser and try again.</p>
      )}
      {(loc.status === 'error' || (loc.status === 'ready' && !good)) && (
        <Button type="button" variant="secondary" className="mt-2 min-h-12" onClick={restart}>
          <RefreshCw aria-hidden="true" /> Retry location
        </Button>
      )}
    </div>
  );
}

function useFieldContext(summonsId: string | undefined) {
  const detail = useQuery({
    queryKey: ['server', 'summons', summonsId],
    queryFn: () => serverApi.detail(summonsId as string),
    enabled: Boolean(summonsId),
    retry: false,
  });
  const summary = useQuery({ queryKey: ['server', 'summary'], queryFn: serverApi.summary });
  return { detail, maxAccuracyM: summary.data?.maxGpsAccuracyM ?? 100 };
}

/** "Attempt in Progress": GPS-stamped progress entry. */
export function AttemptPage() {
  const { summonsId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { detail, maxAccuracyM } = useFieldContext(summonsId);
  const loc = useLiveLocation();
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = useMutation({
    mutationFn: () => {
      if (loc.status !== 'ready') throw new Error(TELEMETRY_ERROR);
      return serverApi.attempt(summonsId as string, { ...loc.point, notes: notes.trim() });
    },
    onSuccess: async (res) => {
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['server'] });
      navigate(`/process-server/summons/${summonsId}`);
    },
    // The form data is kept so the officer can retry without retyping.
    onError: (e) =>
      setError(
        e instanceof Error && e.message === TELEMETRY_ERROR
          ? TELEMETRY_ERROR
          : parseApiError(e).message,
      ),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = notes.trim();
    if (n.length < 5 || n.length > 500) return setNotesError(NOTES_MESSAGE);
    setNotesError(null);
    const problem = telemetryProblem(loc, maxAccuracyM);
    if (problem) return setError(problem);
    commit.mutate();
  }

  if (detail.isPending) return <Skeleton className="h-80" />;
  if (!detail.data) return <NotFoundPage />;
  const s = detail.data;

  return (
    <>
      <Link
        to={`/process-server/summons/${s.id}`}
        className="mb-3 inline-block text-sm font-semibold"
      >
        Back to summons
      </Link>
      <h1 className="text-2xl font-bold">Attempt in Progress</h1>
      <p className="mb-4 text-text-muted">
        {s.recipientName} · <span className="case-number">{s.ucn}</span>
      </p>
      <form noValidate onSubmit={submit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        <LocationPanel loc={loc} maxAccuracyM={maxAccuracyM} restart={loc.restart} />
        <Field
          label="Field observation notes"
          required
          error={notesError ?? undefined}
          hint={`${notes.trim().length}/500 characters (at least 5)`}
        >
          {(p) => (
            <Textarea
              rows={5}
              maxLength={500}
              placeholder="Premises locked, Recipient refused to meet..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              {...p}
            />
          )}
        </Field>
        <Button type="submit" className={BIG} loading={commit.isPending}>
          <Send aria-hidden="true" /> Commit Progress Log Entry
        </Button>
      </form>
    </>
  );
}

/** "Finalize Notice Execution": signature, photo, location, confirmation. */
export function FinalizePage() {
  const { summonsId } = useParams();
  const queryClient = useQueryClient();
  const { detail, maxAccuracyM } = useFieldContext(summonsId);
  const loc = useLiveLocation();
  const sig = useRef<SignatureHandle>(null);
  const sending = useRef(false);

  const [refused, setRefused] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (loc.status !== 'ready') throw new Error(TELEMETRY_ERROR);
      const signature = refused ? null : await sig.current?.toBlob();
      return serverApi.finalize(summonsId as string, {
        ...loc.point,
        notes: notes.trim(),
        serviceMode: refused ? 'REFUSED_AFFIXED' : 'PERSONAL_DELIVERY',
        photo: photo as Blob,
        signature,
      });
    },
    onSuccess: async (res) => {
      setDone(res.message);
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['server'] });
    },
    onError: (e) => {
      sending.current = false;
      setConfirming(false);
      setError(
        e instanceof Error && e.message === TELEMETRY_ERROR
          ? TELEMETRY_ERROR
          : parseApiError(e).message,
      );
    },
  });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose a photo taken with the camera.');
    setError(null);
    const blob = await compressPhoto(file);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(blob);
    setPreview(previewRef.current);
    setPhoto(blob);
  }

  function review() {
    setError(null);
    const n = notes.trim();
    if (!photo) return setError('A photo of the served notice is required.');
    if (!refused && (sig.current?.isEmpty() ?? true))
      return setError('The recipient signature is required unless service was refused.');
    if (n.length < 5 || n.length > 500) return setError(NOTES_MESSAGE);
    const problem = telemetryProblem(loc, maxAccuracyM);
    if (problem) return setError(problem);
    setConfirming(true);
  }

  function confirm() {
    if (sending.current) return; // no double submit
    sending.current = true;
    submit.mutate();
  }

  if (detail.isPending) return <Skeleton className="h-80" />;
  if (!detail.data) return <NotFoundPage />;
  const s = detail.data;

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold">{done}</h1>
          <p className="text-text-muted">
            The execution of the summons to {s.recipientName} is sealed.
          </p>
          <Button asChild className={BIG}>
            <Link to="/process-server">Back to Duty Roster</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Link
        to={`/process-server/summons/${s.id}`}
        className="mb-3 inline-block text-sm font-semibold"
      >
        Back to summons
      </Link>
      <h1 className="text-2xl font-bold">Finalize Notice Execution</h1>
      <p className="mb-4 text-text-muted">
        {s.recipientName} · <span className="case-number">{s.ucn}</span>
      </p>
      <div className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}

        <label className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
          <span className="font-semibold">Refused Service / Affixed to Gate</span>
          <input
            type="checkbox"
            role="switch"
            checked={refused}
            onChange={(e) => {
              setRefused(e.target.checked);
              setConfirming(false);
            }}
            className="size-6 accent-primary"
          />
        </label>

        {!refused && (
          <section aria-labelledby="sig-title" className="space-y-2">
            <h2 id="sig-title" className="text-lg font-bold">
              Recipient signature
            </h2>
            <SignatureCanvas ref={sig} onChange={setHasInk} />
          </section>
        )}

        <section aria-labelledby="photo-title" className="space-y-2">
          <h2 id="photo-title" className="text-lg font-bold">
            Photo of the served notice <span className="text-destructive">*</span>
          </h2>
          {preview && (
            <img
              src={preview}
              alt="Preview of the served notice"
              className="max-h-72 w-full rounded-md border border-border object-contain"
            />
          )}
          <label className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-primary bg-surface px-4 font-semibold text-primary focus-within:outline focus-within:outline-2">
            {preview ? (
              <RotateCcw className="size-4" aria-hidden="true" />
            ) : (
              <Camera className="size-4" aria-hidden="true" />
            )}
            {preview ? 'Retake photo' : 'Take photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </section>

        <LocationPanel loc={loc} maxAccuracyM={maxAccuracyM} restart={loc.restart} />

        <Field
          label="Field observation notes"
          required
          hint={`${notes.trim().length}/500 characters (at least 5)`}
        >
          {(p) => (
            <Textarea
              rows={4}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              {...p}
            />
          )}
        </Field>

        {confirming ? (
          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-lg font-bold">Confirm and submit</h2>
              <ul className="space-y-1 text-sm">
                <li>
                  Service mode:{' '}
                  {refused ? 'Refused service / affixed to gate' : 'Personal delivery'}
                </li>
                <li>Signature: {refused ? 'Not required' : hasInk ? 'Captured' : 'Missing'}</li>
                <li>Photo: {photo ? 'Captured' : 'Missing'}</li>
                <li>
                  GPS accuracy: ±{loc.status === 'ready' ? Math.round(loc.point.accuracyM) : '?'} m
                </li>
              </ul>
              <p className="text-sm text-text-muted">
                After submitting, the proof is sealed and cannot be changed.
              </p>
              <Button
                className={BIG}
                onClick={confirm}
                loading={submit.isPending}
                disabled={submit.isPending}
              >
                <Send aria-hidden="true" /> Confirm and Submit Proof
              </Button>
              <Button
                variant="secondary"
                className={BIG}
                onClick={() => setConfirming(false)}
                disabled={submit.isPending}
              >
                Edit
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Button className={BIG} onClick={review}>
            Review and confirm
          </Button>
        )}
      </div>
    </>
  );
}
