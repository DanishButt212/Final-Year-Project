import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format';
import {
  describeProgress,
  STAGE_LABEL,
  type CaseProgressData,
  type StageState,
} from '@/lib/progress';
import { cn } from '@/lib/utils';

const circleClass: Record<StageState, string> = {
  completed: 'border-primary bg-primary text-on-primary',
  current:
    'border-primary bg-surface text-primary ring-2 ring-accent ring-offset-2 ring-offset-surface',
  upcoming: 'border-border bg-surface text-text-muted',
};

/**
 * Case progress: Filed -> Fee Paid -> Allocated -> Hearing -> Decided, as a semantic ordered list.
 * Vertical on phones, horizontal from 768 px; logical properties mirror it in Urdu (RTL).
 * Completed steps are green with a check, the current one has a gold ring, upcoming ones are muted.
 * `staticExample` hides dates and detail (landing page). The fill animation runs once, on mount.
 */
export function CaseProgress({
  progress,
  staticExample = false,
  className,
  headingId,
}: {
  progress: CaseProgressData;
  staticExample?: boolean;
  className?: string;
  /** id of a visible heading that names the list; otherwise it is labelled "Case progress". */
  headingId?: string;
}) {
  const { t } = useTranslation();
  const detail = staticExample ? null : describeProgress(progress, t);
  const last = progress.stages.length - 1;
  const stateText: Record<StageState, string> = {
    completed: t('(completed)'),
    current: t('(current stage)'),
    upcoming: t('(upcoming)'),
  };

  return (
    <div className={cn('da-progress', className)}>
      <ol
        aria-labelledby={headingId}
        aria-label={headingId ? undefined : t('Case progress')}
        className="flex flex-col md:flex-row"
      >
        {progress.stages.map((stage, i) => {
          const isCurrent = stage.state === 'current';
          const nextDone = progress.stages[i + 1]?.state === 'completed';
          return (
            <li
              key={stage.key}
              aria-current={isCurrent ? 'step' : undefined}
              className="relative flex min-w-0 gap-3 pb-6 last:pb-0 md:flex-1 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center"
            >
              {i < last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute start-[15px] top-9 bottom-1 w-0.5 bg-border',
                    'md:start-[calc(50%+1.5rem)] md:end-[calc(-50%+1.5rem)] md:top-[15px] md:bottom-auto md:h-0.5 md:w-auto',
                  )}
                >
                  {stage.state === 'completed' &&
                    (nextDone || progress.stages[i + 1]?.state === 'current') && (
                      <span
                        className="da-progress-fill block size-full bg-primary"
                        style={{ ['--i' as string]: i }}
                      />
                    )}
                </span>
              )}
              <span
                className={cn(
                  'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
                  circleClass[stage.state],
                )}
              >
                {stage.state === 'completed' ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">{i + 1}</span>
                )}
              </span>
              <span className="min-w-0 pt-1 md:px-1 md:pt-0">
                <span
                  className={cn(
                    'block text-sm',
                    isCurrent
                      ? 'font-bold text-text'
                      : stage.state === 'completed'
                        ? 'font-semibold text-text'
                        : 'text-text-muted',
                  )}
                >
                  {t(STAGE_LABEL[stage.key])}
                  <span className="sr-only"> {stateText[stage.state]}</span>
                </span>
                {!staticExample && stage.date && (
                  <span className="block text-xs text-text-muted tabular-nums">
                    <bdi dir="ltr">{formatDate(stage.date)}</bdi>
                  </span>
                )}
                {isCurrent && detail && (
                  <span className="mt-1 block text-xs font-medium text-primary">{detail}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {progress.terminal && detail && (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-dashed border-border bg-row-alt p-3 text-sm text-text-muted">
          <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold text-text">{detail}</span>
            {'. '}
            {t('The case was closed without a decision.')}
          </span>
        </p>
      )}
      {!progress.terminal && !progress.current && detail && (
        <p className="mt-4 text-sm font-medium text-primary">{detail}</p>
      )}
    </div>
  );
}

/** One-line version for case lists and dashboard cards: five segments plus the current stage. */
export function CaseProgressCompact({
  progress,
  className,
}: {
  progress: CaseProgressData;
  className?: string;
}) {
  const { t } = useTranslation();
  const total = progress.stages.length;
  const doneCount = progress.stages.filter((s) => s.state === 'completed').length;
  const label = progress.terminal
    ? describeProgress(progress, t)
    : progress.current
      ? t(STAGE_LABEL[progress.current])
      : t('Decided');
  const position = progress.current ? doneCount + 1 : doneCount;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <span
        role="img"
        aria-label={t('Case progress: stage {{n}} of {{total}}, {{label}}', {
          n: position,
          total,
          label,
        })}
        className="flex shrink-0 gap-0.5"
      >
        {progress.stages.map((s) => (
          <span
            key={s.key}
            className={cn(
              'h-1.5 w-3 rounded-full',
              progress.terminal && s.state !== 'completed'
                ? 'bg-border'
                : s.state === 'completed'
                  ? 'bg-primary'
                  : s.state === 'current'
                    ? 'bg-accent'
                    : 'bg-border',
            )}
          />
        ))}
      </span>
      <span aria-hidden="true" className="truncate text-xs font-medium text-text-muted">
        {label}
      </span>
    </span>
  );
}
