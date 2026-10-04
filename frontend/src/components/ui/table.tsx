import * as React from 'react';
import { cn } from '@/lib/utils';

/** Scrolls horizontally inside its own box on small screens, so the page itself never does. */
export const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
    <table
      ref={ref}
      className={cn('w-full border-collapse text-left text-sm', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

export const TableHeader = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className="bg-primary-soft text-text" {...props} />
);
export const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="[&>tr:nth-child(even)]:bg-row-alt" {...props} />
);
export const TableFooter = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tfoot className="border-t-2 border-border bg-primary-soft" {...props} />
);
export const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-b border-border last:border-0', className)} {...props} />
);
export const TableHead = ({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope="col"
    className={cn(
      'whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide',
      className,
    )}
    {...props}
  />
);
export const TableCell = ({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-3 align-top break-words', className)} {...props} />
);
