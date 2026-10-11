import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import type { CaseProgressData } from '@/lib/progress';
import { CaseProgress } from './CaseProgress';

/** "Case progress" card shown at the top of every case detail page (litigant, lawyer, judge, admin). */
export function CaseProgressPanel({ progress }: { progress?: CaseProgressData }) {
  const { t } = useTranslation();
  const headingId = useId();
  if (!progress) return null;
  return (
    <Card className="mb-6" data-tour="case-progress">
      <CardContent>
        <h2 id={headingId} className="mb-5 text-lg font-bold">
          {t('Case progress')}
        </h2>
        <CaseProgress progress={progress} headingId={headingId} />
      </CardContent>
    </Card>
  );
}
