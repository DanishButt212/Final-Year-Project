import { useQueryClient, type Query } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { parseApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const failed = (q: Query) => q.state.status === 'error';

/**
 * Error state for data that failed to load: the server's message and a "Try again" button that refetches
 * every query on screen that failed. The button is left out when nothing on screen can be retried
 * (for example a refused action).
 */
export function QueryError({ error, className }: { error: unknown; className?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const retryable =
    queryClient.getQueryCache().findAll({ type: 'active', predicate: failed }).length > 0;

  const retry = async () => {
    setRetrying(true);
    try {
      await queryClient.refetchQueries({ type: 'active', predicate: failed });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Alert variant="error" className={cn('items-start', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>{parseApiError(error).message}</span>
        {retryable && (
          <Button size="sm" variant="secondary" onClick={retry} loading={retrying}>
            <RotateCw aria-hidden="true" /> {t('Try again')}
          </Button>
        )}
      </div>
    </Alert>
  );
}
