import { BarChart3, Table2 } from 'lucide-react';
import { lazy, Suspense, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ChartRow } from './chart-types';

const ChartView = lazy(() => import('./ChartView'));

/**
 * A dashboard chart with a one-sentence summary (shown, and used as the chart's accessible name) and a
 * "View as table" toggle that shows the same numbers as a table. The chart library is a lazy chunk.
 */
export function ChartCard({
  title,
  summary,
  rows,
  kind = 'bar',
  color,
  labelHeader,
  valueHeader,
  tickInterval,
  horizontal,
  height = 'h-60',
  empty,
  footer,
  className,
}: {
  title: string;
  summary: string;
  rows: ChartRow[];
  kind?: 'bar' | 'line';
  color?: string;
  labelHeader: string;
  valueHeader: string;
  tickInterval?: number;
  horizontal?: boolean;
  height?: string;
  /** Shown instead of the chart when every value is zero or missing. */
  empty?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const [table, setTable] = useState(false);
  const summaryId = useId();
  const isEmpty = rows.every((r) => !r.value);

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-lg">{title}</CardTitle>
          <p id={summaryId} className="mt-1 text-sm text-text-muted">
            {summary}
          </p>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setTable((v) => !v)}
            aria-pressed={table}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {table ? (
              <BarChart3 className="size-4" aria-hidden="true" />
            ) : (
              <Table2 className="size-4" aria-hidden="true" />
            )}
            {table ? t('View as chart') : t('View as table')}
          </button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {isEmpty ? (
          <p className="flex h-24 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-text-muted">
            {empty ?? t('Nothing to show yet.')}
          </p>
        ) : table ? (
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <Table aria-describedby={summaryId}>
              <TableHeader>
                <TableRow>
                  <TableHead>{labelHeader}</TableHead>
                  <TableHead className="text-end">{valueHeader}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>{r.full}</TableCell>
                    <TableCell className="text-end tabular-nums">{r.display}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div role="img" aria-label={`${title}. ${summary}`} className={cn(height, 'w-full')}>
            <Suspense fallback={<Skeleton className="h-full w-full" />}>
              <ChartView
                kind={kind}
                rows={rows}
                color={color}
                seriesLabel={valueHeader}
                tickInterval={tickInterval}
                horizontal={horizontal}
              />
            </Suspense>
          </div>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}

/** A single figure with a label, for numbers that are not a series (pending decisions, average days). */
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-sm font-semibold text-text-muted">{label}</p>
        <p className="mt-1 font-serif text-3xl font-bold text-primary tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      </CardContent>
    </Card>
  );
}
