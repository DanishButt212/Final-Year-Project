import { useQuery } from '@tanstack/react-query';
import { chamberApi, type RetainerStatus } from '@/lib/chamber-api';

export const RETAINER_LABEL: Record<RetainerStatus, string> = {
  OK: 'Healthy',
  LOW: 'Low balance',
  OVERDRAWN: 'Overdrawn',
};

/** Negative balances read "Overdrawn" with the amount; the sign is always shown. */
export const balanceText = (balance: string) => {
  const n = Number(balance);
  const abs = Math.abs(n).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-PKR ${abs}` : `PKR ${abs}`;
};

/** Reads the supervising chamber's clients for selects. */
export function useClientOptions() {
  return useQuery({
    queryKey: ['chamber', 'client-options'],
    queryFn: chamberApi.clientOptions,
  });
}

/** Today as YYYY-MM-DD in the local time zone, for date inputs. */
export const todayInput = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
