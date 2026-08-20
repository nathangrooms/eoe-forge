/**
 * Stop the dev server reloading the page in the middle of a measurement.
 *
 * THE PROBLEM THIS SOLVES IS NOT THEORETICAL
 * ------------------------------------------
 * More than one workflow edits this repo at a time. Every save any of them
 * makes sends a full page reload down Vite's socket, and the reload lands on
 * whatever step a measurement run happens to be in. The sheet unmounts, the
 * harness's ready flag goes back to false, and what happens next depends on
 * timing: a PDF taken of a page showing the word "loading", a screenshot of a
 * detached element that throws, or nothing at all and the run passes.
 *
 * That last case is the dangerous one. A measurement that is right most of the
 * time and silently wrong the rest of the time is worse than no measurement,
 * because the number still gets written down. The proxy sheet's print phase
 * has already been lost once this way.
 *
 * WHAT IT DOES
 * ------------
 * Answers `/@vite/client` with a stub. Modules import two things from it at
 * runtime: `createHotContext`, which they call to get `import.meta.hot`, and
 * `updateStyle`, which is how every CSS file reaches the page. The stub keeps
 * `updateStyle` working for real, because an emptied one would leave the sheet
 * unstyled and the run would measure a page with no stylesheet. Everything to
 * do with listening for changes is dropped, including the socket.
 *
 * The repo is not touched and the dev server is not reconfigured, so other
 * workflows keep their hot reload while this run does not get one.
 *
 * Call it after creating the page and before navigating.
 */

const VITE_CLIENT_STUB = `
const styles = new Map();
export function updateStyle(id, content) {
  let el = styles.get(id);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
    styles.set(id, el);
  }
  el.textContent = content;
}
export function removeStyle(id) {
  const el = styles.get(id);
  if (el) { el.remove(); styles.delete(id); }
}
export function createHotContext() {
  const noop = () => {};
  return { accept: noop, acceptExports: noop, dispose: noop, prune: noop,
           decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay extends HTMLElement {}
`;

/**
 * @param {import('puppeteer').Page} page
 * @param {(...args: unknown[]) => void} [log] told once, so a run says why it
 *   will not pick up an edit made while it is running.
 */
export async function disableHotReload(page, log) {
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('/@vite/client')) {
      req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }).catch(() => {});
      return;
    }
    req.continue().catch(() => {});
  });
  log?.('  hot reload is off for this run, so a save by another workflow cannot reload the page mid-measurement');
}
