import { CalendarDays } from 'lucide-react';
import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { inputClasses } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { displayToIso, isoToDisplay } from '@/lib/date-input';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type DateChange = { target: { value: string; name?: string } };

export interface DatePickerProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
> {
  /** ISO date "YYYY-MM-DD", or "" when empty. */
  value: string;
  /** Called with an event-like object whose target.value is the ISO date ("" when cleared). */
  onChange: (e: DateChange) => void;
  min?: string;
  max?: string;
}

/**
 * Shared date field: shows and accepts DD-MM-YYYY (typed, or picked from the calendar) and reports
 * YYYY-MM-DD, so every form uses the same format whatever the browser locale is.
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onChange, min, max, name, className, disabled, onBlur, ...props }, ref) => {
    const { t, i18n } = useTranslation();
    const urdu = i18n.language === 'ur';
    // Urdu month and weekday names with Western digits; English stays en-GB.
    const locale = urdu ? 'ur-PK-u-nu-latn' : 'en-GB';
    const [text, setText] = React.useState(isoToDisplay(value));
    const [open, setOpen] = React.useState(false);
    React.useEffect(() => setText(isoToDisplay(value)), [value]);

    const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);
    const emit = (iso: string) => onChange({ target: { value: iso, name } });

    return (
      // The DD-MM-YYYY field reads left to right in both languages, like every other date.
      <div className={cn('relative', className)} dir="ltr">
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          placeholder="DD-MM-YYYY"
          autoComplete="off"
          name={name}
          disabled={disabled}
          value={text}
          className={cn(inputClasses, 'pe-11')}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (next.trim() === '') return emit('');
            const iso = displayToIso(next);
            if (iso && inRange(iso)) emit(iso);
          }}
          onBlur={(e) => {
            // An unfinished or out-of-range entry falls back to the last valid date.
            if (text.trim() !== '' && !(displayToIso(text) && inRange(displayToIso(text)!))) {
              setText(isoToDisplay(value));
            }
            onBlur?.(e);
          }}
          {...props}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('Choose a date from the calendar')}
              className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-md text-text-muted hover:text-primary disabled:opacity-50"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="da-calendar">
            <DayPicker
              dir={urdu ? 'rtl' : 'ltr'}
              formatters={{
                formatCaption: (d) =>
                  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d),
                formatWeekdayName: (d) =>
                  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d),
              }}
              labels={{
                labelNext: () => t('Go to the next month'),
                labelPrevious: () => t('Go to the previous month'),
              }}
              mode="single"
              weekStartsOn={1}
              selected={value ? toDate(value) : undefined}
              defaultMonth={value ? toDate(value) : min ? toDate(min) : undefined}
              disabled={[
                ...(min ? [{ before: toDate(min) }] : []),
                ...(max ? [{ after: toDate(max) }] : []),
              ]}
              onSelect={(d) => {
                if (!d) return;
                emit(toIso(d));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
DatePicker.displayName = 'DatePicker';
