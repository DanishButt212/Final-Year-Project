import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LAWYER_PENDING_MESSAGE } from '@/hooks/use-filing-gate';
import { chamberApi, type RetainerStatus } from '@/lib/chamber-api';
import { cn } from '@/lib/utils';

/** Wraps every /lawyer/chamber page: only VERIFIED lawyers get in, everyone else sees a clear banner. */
export function ChamberGate() {
  const { user } = useAuth();
  const status = user?.lawyerProfile?.verificationStatus;
  if (status === 'VERIFIED') return <Outlet />;
  return (
    <>
      <PageHeader title="Chamber" description="Your private chamber workspace." />
      <Alert
        variant={status === 'REJECTED' ? 'error' : 'info'}
        title={status === 'REJECTED' ? 'Verification rejected' : 'Verification pending'}
      >
        {status === 'REJECTED'
          ? 'Your Bar Council registration could not be verified, so the chamber is not available. Please contact the registrar.'
          : `${LAWYER_PENDING_MESSAGE} The chamber becomes available once the registry verifies you.`}
      </Alert>
    </>
  );
}

export const RETAINER_LABEL: Record<RetainerStatus, string> = {
  OK: 'Healthy',
  LOW: 'Low balance',
  OVERDRAWN: 'Overdrawn',
};

export function RetainerBadge({ status }: { status: RetainerStatus }) {
  return (
    <Badge variant={status === 'OK' ? 'decided' : status === 'LOW' ? 'pending' : 'rejected'}>
      {RETAINER_LABEL[status]}
    </Badge>
  );
}

/** Negative balances read "Overdrawn" with the amount; the sign is always shown. */
export const balanceText = (balance: string) => {
  const n = Number(balance);
  const abs = Math.abs(n).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-PKR ${abs}` : `PKR ${abs}`;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-text-muted">{label}</p>
          <p className="break-words text-xl font-bold">{value}</p>
          {hint && <p className="text-sm text-text-muted">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Chips input: type a value and press Enter or "Add". Used for names, IDs, verticals and keywords. */
export function ChipInput({
  label,
  values,
  onChange,
  max,
  invalid,
  describedBy,
  id,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  invalid?: boolean;
  describedBy?: string;
  id: string;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase()) || values.length >= max) {
      setText('');
      return;
    }
    onChange([...values, v]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={values.length >= max}
          aria-label={`Add to ${label}`}
        >
          <Plus aria-hidden="true" /> Add
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {values.map((v) => (
            <li
              key={v}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border border-border bg-primary-soft py-1 pl-2.5 pr-1 text-sm',
              )}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="flex size-6 items-center justify-center rounded hover:bg-surface"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Reads the supervising chamber's clients for selects. */
export function useClientOptions() {
  return useQuery({
    queryKey: ['chamber', 'client-options'],
    queryFn: chamberApi.clientOptions,
  });
}

export function BackToDashboard() {
  return (
    <Button asChild variant="secondary">
      <Link to="/lawyer/chamber">Chamber dashboard</Link>
    </Button>
  );
}

/** Today as YYYY-MM-DD in the local time zone, for date inputs. */
export const todayInput = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
