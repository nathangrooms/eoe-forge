/**
 * Press a control the way a person presses it.
 *
 * ONE IMPLEMENTATION, because there were two and they disagreed. `sweep.mjs`
 * and `press.mjs` each had their own, both doing `el.click()` inside
 * `page.evaluate`, which dispatches a synthetic `click` event and nothing else.
 * Radix — which is every shadcn tab, dropdown, switch, select and dialog
 * trigger in this app — opens on POINTER events, so a synthetic click activates
 * none of them.
 *
 * That is worse than a missing check. It is a check that says "fine" about the
 * majority of the interface: the sweep reported all nine admin tabs as "no
 * request and no change" while a real click on the same page moved the URL to
 * `?tab=dev` and drew the console. Puppeteer's own `.click()` sends the
 * pointer, mouse and click events a browser sends.
 *
 * Fixing it in one file and not the other is how the two tools came to give
 * different answers about the same button, so it lives here and both import it.
 */

/**
 * What counts as a control, and what does NOT.
 *
 * `:not(nav *)` and `:not(header *)` are the point. The left menu and the top
 * bar are on every page, so a sweep of `/templates` spent FIFTEEN of its
 * eighteen presses on Home, Card Search, Tutor and the rest — the same fifteen
 * links it had already pressed on `/collection`, `/decks` and `/wishlist` — and
 * the limit then cut the run off before it reached "Use template" or "Details",
 * which are the controls that exist only on that page.
 *
 * The chrome is worth sweeping once. It is not worth sweeping on every route.
 */
export const CONTROLS =
  'button:not(nav *):not(header *), a[role="button"]:not(nav *):not(header *), a[href]:not(nav *):not(header *)';

/**
 * The label a control answers to: its text, then `title`, then `aria-label`.
 *
 * A card tile is an `<a>` wrapping an `<img>` and nothing else, so its
 * `textContent` is empty. That is not a rare shape here — every deck tile,
 * every card in every rail and all eleven archetype strips are image-only
 * links, which meant the probes could not see the most common clickable thing
 * in the product. Both attributes are already set for screen readers, so there
 * is nothing to add to the app.
 */
export const labelOf = el =>
  (
    (el.textContent || '').trim() ||
    el.getAttribute('title') ||
    el.getAttribute('aria-label') ||
    ''
  ).replace(/\s+/g, ' ');

/** Every pressable label on the page, in DOM order, duplicates included. */
export async function controlLabels(page) {
  return page.evaluate(
    (sel, src) => {
      const label = new Function(`return (${src})`)();
      return [...document.querySelectorAll(sel)].map(label).filter(t => t.length > 0 && t.length < 60);
    },
    CONTROLS,
    labelOf.toString()
  );
}

/**
 * Press the control whose label matches, exactly first and by prefix second.
 *
 * Returns `true` for a real pointer press, `'synthetic'` when Puppeteer refused
 * because the element has no clickable point (covered, off screen, zero sized)
 * and the DOM event was used instead, and `false` when nothing matched or the
 * match was disabled. The three are distinguished so a synthetic fallback is
 * never mistaken for a real press.
 */
export async function pressControl(page, want) {
  const target = want.trim().toLowerCase();
  const handles = await page.$$(CONTROLS);

  let exact = null;
  let loose = null;
  for (const handle of handles) {
    const info = await page.evaluate(
      (el, src) => {
        const label = new Function(`return (${src})`)();
        return {
          text: label(el).toLowerCase(),
          off: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
        };
      },
      handle,
      labelOf.toString()
    );
    if (info.off) continue;
    if (info.text === target) { exact = handle; break; }
    if (!loose && info.text.startsWith(target)) loose = handle;
  }

  const chosen = exact ?? loose;
  if (!chosen) return false;

  try {
    await chosen.click({ delay: 20 });
    return true;
  } catch {
    /* No clickable point. Scroll it in and try once more before falling back. */
    try {
      await chosen.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await new Promise(r => setTimeout(r, 250));
      await chosen.click({ delay: 20 });
      return true;
    } catch {
      await chosen.evaluate(el => el.click());
      return 'synthetic';
    }
  }
}
