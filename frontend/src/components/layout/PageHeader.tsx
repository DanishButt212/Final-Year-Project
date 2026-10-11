import { useTranslation } from 'react-i18next';
import { translateText } from '@/lib/server-messages';
import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
}: {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  useTranslation(); // re-render on language change
  return (
    <div className="mb-6">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">
            <bdi>{translateText(title)}</bdi>
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-text-muted">{translateText(description)}</p>
          )}
        </div>
        {actions && <div className="no-print flex gap-2">{actions}</div>}
      </div>
    </div>
  );
}
