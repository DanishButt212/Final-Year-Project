import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  GraduationCap,
  Receipt,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseApiError } from '@/lib/api';
import { chamberApi } from '@/lib/chamber-api';
import { formatDate, formatPkr } from '@/lib/format';
import { RetainerBadge, StatCard } from './shared';
import { balanceText } from './helpers';

const AXIS = { fontSize: 12, fill: 'var(--color-text-muted)' };

/** Chamber Dashboard: stat cards, weekly billing chart, low-balance clients, pending reviews and next hearings. */
export default function ChamberDashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['chamber', 'dashboard'],
    queryFn: chamberApi.dashboard,
  });

  const weekly = (data?.weeklyBilled ?? []).map((w) => ({
    week: formatDate(w.weekStart).slice(0, 5),
    amount: Number(w.amount),
  }));

  return (
    <>
      <PageHeader
        title="Chamber Dashboard"
        description={
          data
            ? `${data.chamber.name} · Chamber ID ${data.chamber.chamberCode}`
            : 'Your chamber at a glance.'
        }
        crumbs={[{ label: 'Dashboard', to: '/lawyer' }, { label: 'Chamber Dashboard' }]}
        actions={
          <Button asChild>
            <Link to="/lawyer/chamber/clients/new">
              <Users aria-hidden="true" /> New client
            </Link>
          </Button>
        }
      />
      {isError && <Alert variant="error">{parseApiError(error).message}</Alert>}
      {isPending ? (
        <Skeleton className="h-64" />
      ) : (
        data && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Clients" value={data.clients} icon={Users} />
              <StatCard
                label="Billed this month"
                value={formatPkr(data.billedThisMonth)}
                hint={`${data.hoursThisMonth} hours`}
                icon={Clock}
              />
              <StatCard label="Retainer held" value={formatPkr(data.retainerHeld)} icon={Wallet} />
              <StatCard
                label="Expenses this month"
                value={formatPkr(data.expensesThisMonth)}
                icon={Receipt}
              />
              <StatCard label="Active interns" value={data.interns} icon={GraduationCap} />
              <StatCard
                label="Research logs to review"
                value={data.pendingReviews}
                icon={GraduationCap}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Billed per week (last 8 weeks)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    role="img"
                    aria-label={`Billed amount per week: ${weekly.map((w) => `${w.week} PKR ${w.amount}`).join(', ')}`}
                    className="h-60"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="var(--color-border)" vertical={false} />
                        <XAxis dataKey="week" tick={AXIS} stroke="var(--color-border)" />
                        <YAxis
                          tick={AXIS}
                          stroke="var(--color-border)"
                          tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                        />
                        <Tooltip formatter={(v) => formatPkr(Number(v))} />
                        <Bar dataKey="amount" name="Billed" fill="var(--color-chart-2)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-primary" aria-hidden="true" /> Low balance
                    clients ({data.lowBalanceCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.lowBalanceClients.length === 0 ? (
                    <p className="text-text-muted">All client retainers are healthy.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {data.lowBalanceClients.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <Link to={`/lawyer/chamber/clients/${c.id}`} className="font-medium">
                            {c.name}
                          </Link>
                          <span className="flex items-center gap-2">
                            <span>{balanceText(c.balance)}</span>
                            <RetainerBadge status={c.status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button asChild variant="secondary" className="mt-4">
                    <Link to="/lawyer/chamber/retainer">Retainer accounts</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-5 text-primary" aria-hidden="true" /> Next hearings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.nextHearings.length === 0 ? (
                  <p className="text-text-muted">No upcoming hearings in your cases.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.nextHearings.map((h) => (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                      >
                        <span>
                          <Link
                            to={`/lawyer/cases/${h.caseId}`}
                            className="case-number font-medium"
                          >
                            {h.ucn}
                          </Link>{' '}
                          <span className="text-text-muted">{h.title}</span>
                        </span>
                        <span>
                          {formatDate(h.date)} {h.startTime ?? ''} ·{' '}
                          {h.courtroom ?? 'Courtroom TBA'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )
      )}
    </>
  );
}
