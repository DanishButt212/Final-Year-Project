import { NextHearingChip } from '@/components/hearing/NextHearingCard';
import { StatusBadge } from '@/components/ui/status-badge';
import type { CaseStatus } from '@/lib/case-status';
import type { CaseProgressData } from '@/lib/progress';
import { CaseProgressCompact } from './CaseProgress';

/** Status column of case lists and cards: the status badge, the one-line stepper and the next hearing. */
export function CaseStatusCell({
  status,
  progress,
}: {
  status: CaseStatus;
  progress?: CaseProgressData;
}) {
  const next = progress?.nextHearing;
  return (
    <span className="flex flex-col items-start gap-1.5">
      <StatusBadge status={status} />
      {progress && <CaseProgressCompact progress={progress} />}
      {next && <NextHearingChip date={next.date} startTime={next.startTime} />}
    </span>
  );
}
