import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, LogIn, RotateCcw, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { CaseProgress } from '@/components/case/CaseProgress';
import { CaseStatusLookup } from '@/components/landing/CaseStatusLookup';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { caseTypeLabel } from '@/lib/case-status';
import { formatDate } from '@/lib/format';
import { publicApi, UCN_FORMAT_MESSAGE, UCN_REGEX } from '@/lib/public-api';

function StatusSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('Loading')} className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-8 w-64 max-w-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-5 w-32" />
        <div className="mt-5 grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
      <span className="sr-only">{t('Loading…')}</span>
    </div>
  );
}

/** /status/:ucn — public, non-sensitive progress of one case. */
export default function PublicStatusPage() {
  const { t } = useTranslation();
  const { ucn: raw = '' } = useParams();
  const ucn = raw.trim().toUpperCase();
  const valid = UCN_REGEX.test(ucn);

  const query = useQuery({
    queryKey: ['public', 'case-status', ucn],
    queryFn: () => publicApi.caseStatus(ucn),
    enabled: valid,
    retry: false,
    staleTime: 60_000,
  });

  const error = query.error ? parseApiError(query.error) : null;
  const data = query.data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />{' '}
        {t('Back to home page')}
      </Link>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{t('Case status')}</h1>

      <div className="mt-6 space-y-6">
        {!valid ? (
          <Alert variant="error" title={t(UCN_FORMAT_MESSAGE)} />
        ) : query.isPending ? (
          <StatusSkeleton />
        ) : error ? (
          error.statusCode === 404 ? (
            <Alert variant="error" title={t('No case found with this UCN.')}>
              <p>
                <bdi dir="ltr" className="case-number">
                  {ucn}
                </bdi>{' '}
                · {t('Check the number on your filing receipt and try again.')}
              </p>
            </Alert>
          ) : error.statusCode === 429 ? (
            <Alert variant="error" title={t('Too many lookups from your connection.')}>
              {t('Please wait a minute and try again.')}
            </Alert>
          ) : error.statusCode === 400 ? (
            <Alert variant="error" title={t(UCN_FORMAT_MESSAGE)} />
          ) : (
            <div className="space-y-3">
              <Alert variant="error" title={t('The case status could not be loaded.')}>
                {t(error.message)}
              </Alert>
              <Button
                variant="secondary"
                onClick={() => void query.refetch()}
                loading={query.isFetching}
              >
                <RotateCcw aria-hidden="true" /> {t('Try again')}
              </Button>
            </div>
          )
        ) : data ? (
          <>
            <section
              aria-labelledby="case-heading"
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 id="case-heading" className="sr-only">
                {t('Case')}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <bdi dir="ltr" className="case-number text-xl font-semibold text-text sm:text-2xl">
                  {data.ucn}
                </bdi>
                <CopyButton value={data.ucn} label={t('Copy UCN')} />
              </div>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-text-muted">{t('Case category')}</dt>
                  <dd className="font-semibold">{t(caseTypeLabel(data.caseType))}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Court')}</dt>
                  <dd className="font-semibold">{data.court ?? t('Not yet assigned')}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">{t('Filing date')}</dt>
                  <dd className="font-semibold tabular-nums">
                    <bdi dir="ltr">{formatDate(data.filingDate)}</bdi>
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="progress-heading"
              className="rounded-lg border border-border bg-surface p-5"
            >
              <h2 id="progress-heading" className="mb-5 text-lg font-bold">
                {t('Progress')}
              </h2>
              <CaseProgress progress={data.progress} headingId="progress-heading" />
            </section>

            {data.nextHearing && (
              <section
                aria-labelledby="hearing-heading"
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h2 id="hearing-heading" className="flex items-center gap-2 text-lg font-bold">
                  <CalendarClock className="size-5 text-primary" aria-hidden="true" />
                  {t('Next hearing')}
                </h2>
                <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-text-muted">{t('Date')}</dt>
                    <dd className="font-semibold tabular-nums">
                      <bdi dir="ltr">{formatDate(data.nextHearing.date)}</bdi>
                    </dd>
                  </div>
                  {data.nextHearing.published ? (
                    <>
                      <div>
                        <dt className="text-text-muted">{t('Time')}</dt>
                        <dd className="font-semibold tabular-nums">
                          <bdi dir="ltr">
                            {data.nextHearing.startTime}
                            {data.nextHearing.endTime ? ` – ${data.nextHearing.endTime}` : ''}
                          </bdi>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-text-muted">{t('Courtroom')}</dt>
                        <dd className="font-semibold">{data.nextHearing.courtroom ?? '—'}</dd>
                      </div>
                    </>
                  ) : (
                    <p className="text-text-muted sm:col-span-2">
                      {t(
                        'The time and courtroom appear here once the cause list for that day is published.',
                      )}
                    </p>
                  )}
                </dl>
                {data.nextHearing.isVirtual && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-text-muted">
                    <Video className="size-4" aria-hidden="true" />
                    {t('This is a virtual hearing. Parties join from their portal.')}
                  </p>
                )}
              </section>
            )}
          </>
        ) : null}

        <Alert
          variant="info"
          title={t('Only public case progress is shown. Sign in to see full details.')}
        >
          <p>
            {t(
              'Names, documents, fees and orders are visible only to the parties, their lawyers and the court.',
            )}
          </p>
          <Link to="/login" className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold">
            <LogIn className="size-4 rtl:-scale-x-100" aria-hidden="true" /> {t('Sign in')}
          </Link>
        </Alert>

        <CaseStatusLookup key={ucn} compact headingLevel="h2" initial={data ? '' : ucn} />
      </div>
    </div>
  );
}
