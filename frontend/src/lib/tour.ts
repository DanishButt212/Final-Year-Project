import { msg } from '@/i18n';
import type { Role } from './types';

/**
 * Bump when the tour changes enough that everyone should see it again. The account stores the last version
 * finished or skipped (User.tourCompletedVersion); the tour starts by itself while that is lower.
 */
export const TOUR_VERSION = 1;

export { START_TOUR_EVENT } from './tour-events';

export interface TourStep {
  /** data-tour value of the element to highlight; none for a centred step. */
  target?: string;
  title: string;
  text: string;
}

const WELCOME: TourStep = {
  title: msg('Welcome to DigitalAdaalat'),
  text: msg(
    'A short tour of your dashboard. Use the arrow keys or the buttons to move; Escape closes it.',
  ),
};
const NAV: TourStep = {
  target: 'nav',
  title: msg('Your menu'),
  text: msg(
    'Every page of your portal is here. On a phone, open it with the menu button at the top.',
  ),
};
const SEARCH: TourStep = {
  target: 'search',
  title: msg('Search anything'),
  text: msg(
    'Find a case by its number or a party name, open a page or start an action. Shortcut: Ctrl+K.',
  ),
};
const PREFERENCES: TourStep = {
  target: 'preferences',
  title: msg('Language and text size'),
  text: msg(
    'Switch between English and Urdu and make the text larger. Your choice is saved to your account.',
  ),
};
const NOTIFICATIONS: TourStep = {
  target: 'notifications',
  title: msg('Notifications'),
  text: msg('Hearing dates, payments, orders and summons updates arrive here.'),
};
const ACCOUNT: TourStep = {
  target: 'account',
  title: msg('Your account'),
  text: msg('Your profile and settings. You can take this tour again from here at any time.'),
};
const GLOSSARY: TourStep = {
  title: msg('Legal terms explained'),
  text: msg(
    'Underlined legal terms show a short explanation when you tap or hover them. The full glossary is in the account menu.',
  ),
};
const NEXT_HEARING: TourStep = {
  target: 'next-hearing',
  title: msg('Your next hearing'),
  text: msg(
    'Date, time and courtroom of your next hearing, with a button to add it to your calendar.',
  ),
};
const INSIGHTS: TourStep = {
  target: 'insights',
  title: msg('At a glance'),
  text: msg('Charts of your caseload. Each chart has a short summary and can be shown as a table.'),
};

const PARTY: TourStep[] = [
  {
    target: 'new-case',
    title: msg('File a case'),
    text: msg(
      'Start a new case here. The form saves nothing until you submit, and you get a case number at once.',
    ),
  },
  {
    target: 'recent-cases',
    title: msg('Your recent cases'),
    text: msg(
      'Each case shows its status and how far it has come: filed, fee paid, allocated, hearing, decided.',
    ),
  },
  NEXT_HEARING,
  INSIGHTS,
];

const STEPS: Record<Role, TourStep[]> = {
  LITIGANT: PARTY,
  LAWYER: [
    {
      target: 'chamber-id',
      title: msg('Your chamber'),
      text: msg(
        'Your Chamber ID. Your chamber desk uses it to sign in; manage clients, hours and interns from the menu.',
      ),
    },
    ...PARTY,
  ],
  JUDGE: [
    NEXT_HEARING,
    {
      target: 'today-cause-list',
      title: msg("Today's cause list"),
      text: msg(
        'The cases fixed before you today, in order. Record the outcome of each hearing from the case.',
      ),
    },
    INSIGHTS,
    {
      target: 'allocated-cases',
      title: msg('Your allocated cases'),
      text: msg('Every case the registrar has allocated to you, with its stage and next hearing.'),
    },
  ],
  ADMIN: [
    {
      target: 'analytics',
      title: msg('Live figures'),
      text: msg('Cases, pending allocations and documents for all courts or one court precinct.'),
    },
    {
      target: 'pending-allocation',
      title: msg('Waiting for allocation'),
      text: msg('New cases waiting for a judge. Open the case registry to allocate them.'),
    },
    INSIGHTS,
  ],
  INTERN: [
    {
      target: 'intern-stats',
      title: msg('Your internship'),
      text: msg(
        'Attendance this month and your research logs. Mark attendance from the court premises each day.',
      ),
    },
  ],
  PROCESS_SERVER: [
    {
      target: 'roster-summary',
      title: msg('Your duty roster'),
      text: msg(
        'Summons assigned to you, the urgent ones first. Open one to record an attempt or the proof of service.',
      ),
    },
  ],
};

/** The steps for a role, in order: welcome, the dashboard, then the shared header controls. */
export function tourSteps(role: Role): TourStep[] {
  const shell =
    role === 'PROCESS_SERVER'
      ? [SEARCH, NOTIFICATIONS]
      : [SEARCH, PREFERENCES, NOTIFICATIONS, ACCOUNT];
  return [WELCOME, NAV, ...STEPS[role], ...shell, GLOSSARY];
}
