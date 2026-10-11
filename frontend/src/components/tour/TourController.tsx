import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/auth/useAuth';
import { usersApi } from '@/lib/auth-api';
import { roleHome } from '@/lib/navigation';
import { START_TOUR_EVENT, TOUR_VERSION, tourSteps } from '@/lib/tour';

const SKIP_KEY = 'da_tour_skip'; // set by screenshot scripts and after a tour in this browser session

const readSkip = () => {
  try {
    return sessionStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
};
const writeSkip = () => {
  try {
    sessionStorage.setItem(SKIP_KEY, '1');
  } catch {
    // storage unavailable: the account flag still stops the next automatic start
  }
};

/** The first element with this data-tour value that is on screen (the drawer is off-canvas on phones). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

/**
 * Resolves when every named element is on screen, or after `ms`: dashboards render some panels only after their
 * data arrives, and a panel that never appears (no data, or hidden on this screen size) is then left out.
 */
function waitFor(names: string[], ms: number) {
  return new Promise<void>((resolve) => {
    const until = Date.now() + ms;
    const tick = () =>
      names.every((n) => findTarget(n)) || Date.now() > until ? resolve() : setTimeout(tick, 150);
    tick();
  });
}

/**
 * Guided tour (driver.js, a lazy chunk). Starts by itself on the dashboard the first time a user signs in after
 * the tour version changed, and again from "Take the tour again". Finishing or closing it saves the version to
 * the account (PATCH /users/me), so it does not start again on another device. Steps whose element is not on
 * screen (for example the sidebar on a phone) are left out.
 */
export function TourController() {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const running = useRef(false);

  const start = useCallback(async () => {
    if (!user || running.current) return;
    running.current = true;
    writeSkip();
    const all = tourSteps(user.role);
    const [{ driver }] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
      waitFor(
        all.flatMap((s) => (s.target && s.target !== 'nav' ? [s.target] : [])),
        3000,
      ),
    ]);
    const steps = all.flatMap((s) => {
      const element = s.target ? findTarget(s.target) : undefined;
      if (s.target && !element) return [];
      return [
        { element: element ?? undefined, popover: { title: t(s.title), description: t(s.text) } },
      ];
    });
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const tour = driver({
      steps,
      showProgress: true,
      progressText: t('{{current}} of {{total}}'),
      nextBtnText: t('Next'),
      prevBtnText: t('Back'),
      doneBtnText: t('Finish'),
      popoverClass: 'da-tour',
      overlayColor: '#1A1A1A',
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      animate: !reduced,
      smoothScroll: !reduced,
      onPopoverRender: (popover) => {
        popover.wrapper.dir = i18n.dir();
        popover.wrapper.lang = i18n.language;
        popover.closeButton.setAttribute('aria-label', t('Close the tour'));
      },
      onDestroyed: () => {
        running.current = false;
        if ((user.tourCompletedVersion ?? 0) >= TOUR_VERSION) return;
        usersApi
          .updateMe({ tourCompletedVersion: TOUR_VERSION })
          .then((res) => setUser(res.user))
          .catch(() => undefined); // the session flag still prevents a restart in this browser
      },
    });
    tour.drive();
  }, [user, t, i18n, setUser]);

  // "Take the tour again": start at once on the dashboard, or go there first and start on arrival.
  const pending = useRef(false);
  useEffect(() => {
    const onStart = () => {
      if (!user) return;
      const home = roleHome(user.role);
      if (window.location.pathname === home) return void start();
      pending.current = true;
      navigate(home);
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [user, navigate, start]);

  useEffect(() => {
    if (!user || pathname !== roleHome(user.role)) return;
    if (pending.current) {
      pending.current = false;
      void start();
      return;
    }
    if (readSkip() || (user.tourCompletedVersion ?? 0) >= TOUR_VERSION) return;
    void start();
  }, [user, pathname, start]);

  return null;
}
