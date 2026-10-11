import { TableSkeleton } from '@/components/ui/skeleton';

/** Shown while a route's code chunk loads (the existing table skeleton, announced as "Loading"). */
export function PageLoading() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}
