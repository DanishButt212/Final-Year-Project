import { Gavel } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DECISION_LABEL, type CaseDecision } from '@/lib/cases-api';
import { formatDateTime } from '@/lib/format';
import { useTranslation } from 'react-i18next';

/** The final order of a decided case, shown on every case page (litigant, lawyer, admin, judge). */
export function DecisionBlock({ decision }: { decision: CaseDecision | null | undefined }) {
  const { t } = useTranslation();
  if (!decision) return null;
  return (
    <Card className="mb-6 border-primary">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Gavel className="size-5 text-primary" aria-hidden="true" /> {t('Decision')}
          {decision.type && <Badge variant="decided">{DECISION_LABEL[decision.type]}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-text-muted">
          {decision.judge
            ? t(
                'Decided on {{dateTime}} by {{judge}}. This order is final and the case is closed.',
                {
                  dateTime: formatDateTime(decision.decidedAt),
                  judge: decision.judge,
                },
              )
            : t('Decided on {{dateTime}}. This order is final and the case is closed.', {
                dateTime: formatDateTime(decision.decidedAt),
              })}
        </p>
        <p className="whitespace-pre-wrap">
          {decision.orderText ?? t('The detailed order was announced in court.')}
        </p>
      </CardContent>
    </Card>
  );
}
