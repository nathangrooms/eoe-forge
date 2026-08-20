/**
 * /play/mats — the mat you play on.
 *
 * A destination rather than a panel, because it holds a library: uploading has
 * a file to choose, a wait, a failure to explain, and mats to delete. The two
 * places that already pick a surface, the lobby and the in-game menu, are the
 * right size for six swatches and stay exactly as they were.
 *
 * Only the lobby links here. The in-game menu deliberately does not: following
 * a route change from inside a running game unmounts the board and loses it, so
 * it says where pictures live instead of offering to take you there.
 *
 * The page is a shell. Everything it does lives in `PlaymatManager`, which sits
 * beside the rest of the play surface because that is where mats are drawn.
 */

import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { PlaymatManager } from '@/components/play/PlaymatManager';

export default function Playmats() {
  return (
    <StandardPageLayout
      title="Playmat"
      description="The surface you play on. It follows your account, so it is the same on every device."
    >
      <PlaymatManager />
    </StandardPageLayout>
  );
}
