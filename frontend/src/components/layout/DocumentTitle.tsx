import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

const APP = 'DigitalAdaalat';

/**
 * Browser tab title per page: "<Page name> | DigitalAdaalat", taken from the page's main heading, so every
 * route (portal pages, process-server console, error pages) gets its own title without per-page code.
 */
export function DocumentTitle() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const update = () => {
      const heading = document.querySelector('main h1, h1')?.textContent?.trim();
      const name = pathname === '/' ? t('Home') : heading;
      const next = name ? `${name} | ${APP}` : APP;
      if (document.title !== next) document.title = next;
    };
    update();
    // Headings appear after data loads (and change on in-page navigation): follow them.
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, t, i18n.language]);
  return null;
}
