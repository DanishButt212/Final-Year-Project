import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="no-print mb-4 text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-text-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.to && !last ? (
                <Link to={item.to} className="rounded-sm underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={last ? 'font-semibold text-text' : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight className="size-4" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
