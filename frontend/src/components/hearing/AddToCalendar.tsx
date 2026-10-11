import { CalendarPlus, Download, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadIcs, googleCalendarUrl, type CalendarHearing } from '@/lib/calendar';

export interface AddToCalendarProps {
  hearing: {
    id: string;
    ucn: string;
    date: string;
    startTime: string | null;
    endTime?: string | null;
    courtroom?: string | null;
    court?: string | null;
    isVirtual?: boolean;
  };
  /** Path of the case page in this portal, e.g. /litigant/cases/<id>. */
  casePath: string;
  size?: 'sm' | 'default';
}

/** "Add to calendar": Google Calendar (new tab) or a downloaded .ics file with a reminder one day before. */
export function AddToCalendar({ hearing, casePath, size = 'sm' }: AddToCalendarProps) {
  const { t } = useTranslation();
  const event: CalendarHearing = {
    ...hearing,
    caseUrl: `${window.location.origin}${casePath}`,
    title: t('Hearing: {{ucn}}', { ucn: hearing.ucn }),
    details: hearing.isVirtual
      ? t('Virtual hearing for case {{ucn}}. Join from your DigitalAdaalat portal.', {
          ucn: hearing.ucn,
        })
      : t('Court hearing for case {{ucn}}.', { ucn: hearing.ucn }),
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size={size}>
          <CalendarPlus aria-hidden="true" /> {t('Add to calendar')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            {t('Google Calendar')}
            <span className="sr-only"> {t('(opens in a new tab)')}</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadIcs(event)}>
          <Download className="size-4" aria-hidden="true" />
          {t('Download .ics')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
