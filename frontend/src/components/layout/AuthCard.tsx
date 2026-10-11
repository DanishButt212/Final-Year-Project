import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SealLogo } from '@/components/brand/SealLogo';
import { Card } from '@/components/ui/card';

/** Centered card used by login, register and password pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
  wide,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-8 sm:py-12">
      <div className={`mx-auto mb-3 w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />{' '}
          {t('Back to home page')}
        </Link>
      </div>
      <Card className={`mx-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="border-b border-border px-6 py-5 text-center">
          <span className="mx-auto mb-2 flex justify-center">
            <SealLogo size={64} title="" />
          </span>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        <div className="p-6">{children}</div>
        {footer && (
          <div className="border-t border-border px-6 py-4 text-center text-sm">{footer}</div>
        )}
      </Card>
    </div>
  );
}
