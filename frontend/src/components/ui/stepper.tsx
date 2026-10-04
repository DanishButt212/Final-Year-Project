import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Horizontal step indicator. The current step is announced with aria-current="step". */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <p className="mb-2 text-sm font-semibold text-text-muted sm:hidden">
        Step {current} of {steps.length}: {steps[current - 1]}
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = n < current ? 'done' : n === current ? 'current' : 'todo';
          return (
            <li
              key={label}
              className={cn('flex items-center gap-2', n < steps.length && 'flex-1')}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
                  state === 'done' && 'border-primary bg-primary text-on-primary',
                  state === 'current' && 'border-primary bg-surface text-primary',
                  state === 'todo' && 'border-border bg-surface text-text-muted',
                )}
              >
                {state === 'done' ? <Check className="size-4" aria-hidden="true" /> : n}
              </span>
              <span
                className={cn(
                  'hidden text-sm sm:inline',
                  state === 'current' ? 'font-bold text-text' : 'text-text-muted',
                )}
              >
                {label}
                <span className="sr-only">
                  {state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ''}
                </span>
              </span>
              {n < steps.length && (
                <span
                  aria-hidden="true"
                  className={cn('h-0.5 flex-1', n < current ? 'bg-primary' : 'bg-border')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
