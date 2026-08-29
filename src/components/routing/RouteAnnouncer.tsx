import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { titleFor } from '@/lib/routes/routeMeta';

/**
 * Says where you have arrived, and puts you there.
 *
 * ## What was wrong
 *
 * Measured on a keyboard-and-screen-reader walk: activating any link left focus
 * on `BODY (reading position lost)`, nothing was announced, and `document.title`
 * was `"DeckMatrix - MTG Deck Builder & Collection Manager"` on every single
 * route. So a navigation produced no signal of any kind, and the only way back
 * to the content was to tab the whole page from the top again.
 *
 * On `/cards/:id` this compounded: choosing one of twelve printing tiles is a
 * route change, so picking a printing silently reset you to nowhere.
 *
 * ## What it does, and why in this order
 *
 * 1. Sets `document.title`. That alone is what most screen readers speak on a
 *    page change, and it is also what a browser tab and a bookmark show.
 * 2. Announces the same words in a polite live region. A single page app does
 *    not fire a real page load, so several readers never speak the title on
 *    their own. The region is emptied first: repeating identical text into a
 *    live region is often dropped as unchanged.
 * 3. Moves focus to `<main>`. It is given `tabindex="-1"` so it can hold focus
 *    without joining the tab order, and `focus({ preventScroll: true })` so the
 *    move does not fight the scroll below.
 * 4. Scrolls: to the element named by the url hash if there is one, otherwise
 *    to the top.
 *
 * ## The first render is deliberately skipped
 *
 * On a cold load the browser has just done all of this itself. Stealing focus
 * out of the address bar on arrival is worse than doing nothing, so only real
 * in-app navigations announce.
 */
export function RouteAnnouncer() {
  const { pathname, hash } = useLocation();
  const first = useRef(true);
  const region = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const title = titleFor(pathname);
    document.title = title;

    if (first.current) {
      first.current = false;
      return;
    }

    /* The page's own content is what should be announced when it has a heading,
       because "Deck" is less use than the deck's name. Fall back to the title. */
    const raf = window.requestAnimationFrame(() => {
      const heading = document.querySelector('main h1');
      const spoken = (heading?.textContent || '').trim() || title.replace(/ · DeckMatrix$/, '');

      if (region.current) {
        region.current.textContent = '';
        window.setTimeout(() => {
          if (region.current) region.current.textContent = spoken;
        }, 60);
      }

      const main = document.querySelector<HTMLElement>('main');
      if (main) {
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }

      const target = hash ? document.getElementById(hash.slice(1)) : null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (!hash) window.scrollTo(0, 0);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [pathname, hash]);

  return (
    <div
      ref={region}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      /* Not `role="status"` as well: doubling the role and the live attribute
         makes some readers speak it twice, which is the same fault the two
         mounted toasters caused elsewhere. */
    />
  );
}
