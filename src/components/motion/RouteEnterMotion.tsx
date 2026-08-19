import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MOTION_KEYFRAMES, motionTiming, usePrefersReducedMotion } from '@/lib/motion';

/**
 * A page arriving.
 *
 * Navigating used to swap one full screen for another between two frames, which
 * is the single loudest "assembled" tell in the product: nothing in the physical
 * world replaces itself instantly, so an interface that does reads as a set of
 * documents rather than as one application. 180ms of fade and an 8px rise is
 * enough to say the page arrived, and short enough that nobody clicking through
 * quickly ever waits on it — the route is already committed and interactive
 * before this starts.
 *
 * ## No wrapper element
 *
 * It renders nothing and finds `#main-content` itself, the same way
 * `ZoneTravelLayer` reads the board out of the DOM rather than keeping a
 * parallel registry. Wrapping every route in an animated `<div>` would have put
 * a new box in the layout of forty-three pages, several of which size
 * themselves against `<main>`, to buy an animation. Not worth one pixel of
 * risk.
 *
 * ## Why it mounts inside the Suspense boundary
 *
 * Routes are code-split, so the pathname changes some time before the page
 * exists. Keyed on the pathname *inside* the boundary, this mounts in the same
 * commit as the resolved page — so the animation plays on the page, never on
 * the loading spinner.
 *
 * ## The excluded routes are not an oversight
 *
 * Play, the simulator and the running life counter each raise a
 * `position: fixed` board at mount. A `transform` on an ancestor makes that
 * ancestor the containing block for fixed descendants, so for the 180ms of the
 * animation those boards would be inset by the nav rail and then jump into
 * place when it ended. An animation that causes the exact fault it was added to
 * cure is not worth having, so those three fade nothing.
 */
const IMMERSIVE_ROUTES = ['/play', '/simulate', '/life'];

function isImmersive(pathname: string): boolean {
  return IMMERSIVE_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}

export function RouteEnterMotion() {
  const { pathname } = useLocation();
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (reduced || isImmersive(pathname)) return;

    // Signed-out routes other than the shared-content ones render no <main>.
    const main = document.getElementById('main-content');
    if (!main) return;

    const animation = main.animate(MOTION_KEYFRAMES.enter, motionTiming('enter'));
    /* No fill mode, and cancelled on the way out: the moment it lands there is
       no transform left on <main> at all, so nothing inside it inherits a
       containing block it did not have before. */
    return () => animation.cancel();
  }, [pathname, reduced]);

  return null;
}

export default RouteEnterMotion;
