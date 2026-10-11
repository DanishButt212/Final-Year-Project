import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { useTranslation } from 'react-i18next';

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('Pagination')}
      className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm"
    >
      <p className="text-text-muted" aria-live="polite">
        {total === 1
          ? t('Page {{page}} of {{totalPages}} ({{total}} record)', { page, totalPages, total })
          : t('Page {{page}} of {{totalPages}} ({{total}} records)', { page, totalPages, total })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="rtl:-scale-x-100" aria-hidden="true" /> {t('Previous')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('Next')} <ChevronRight className="rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
