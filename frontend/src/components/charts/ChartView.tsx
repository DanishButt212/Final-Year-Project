import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartRow } from './chart-types';

const AXIS = { fill: 'var(--color-text-muted)', fontSize: 12 };
const GRID = 'var(--color-border)';
const TOOLTIP_STYLE = {
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 13,
};

/**
 * The Recharts part of a chart card (a lazy chunk, loaded with the first dashboard chart). Always drawn left to
 * right, also in Urdu, so time runs the same way as in the tables and calendars. Colours come from the design
 * tokens (--color-chart-1..5); a row may set its own colour.
 */
export default function ChartView({
  kind,
  rows,
  color = 'var(--color-chart-2)',
  seriesLabel,
  tickInterval,
  horizontal = false,
}: {
  kind: 'bar' | 'line';
  rows: ChartRow[];
  color?: string;
  seriesLabel: string;
  tickInterval?: number;
  horizontal?: boolean;
}) {
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'var(--color-primary-soft)' }}
      contentStyle={TOOLTIP_STYLE}
      labelFormatter={(_, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.full ?? ''}
      formatter={(_, __, item) => [(item.payload as ChartRow).display, seriesLabel]}
    />
  );
  const axisProps = { tick: AXIS, stroke: GRID, tickLine: false };
  const yTick = (v: number) =>
    Math.abs(v) >= 1000
      ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
      : String(v);

  return (
    <div dir="ltr" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'line' ? (
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" interval={tickInterval ?? 'preserveStartEnd'} {...axisProps} />
            <YAxis allowDecimals={false} tickFormatter={yTick} {...axisProps} />
            {tooltip}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={!prefersReducedMotion()}
            />
          </LineChart>
        ) : horizontal ? (
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={yTick} {...axisProps} />
            <YAxis type="category" dataKey="label" width={120} {...axisProps} />
            {tooltip}
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              maxBarSize={28}
              isAnimationActive={!prefersReducedMotion()}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color ?? color} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" interval={tickInterval ?? 0} {...axisProps} />
            <YAxis allowDecimals={false} tickFormatter={yTick} {...axisProps} />
            {tooltip}
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={!prefersReducedMotion()}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color ?? color} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
