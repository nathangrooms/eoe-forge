import { FINISH_LABEL, type Finish } from '@/lib/shopping';

/**
 * The little markers that sit on a list card: how many copies, and the finish
 * when it is not a plain one.
 *
 * WHY THEY SIT AT THE BOTTOM
 * --------------------------
 * They used to sit at `top-2`, which is exactly where a Magic card prints its
 * NAME on the left and its MANA COST on the right. Caught on the first
 * screenshot run rather than in review: the shopping grid read "monic Tutor",
 * "na Crypt" and "stic Study", because a chrome badge was parked over the one
 * word that tells a player which card they are looking at. The bottom left
 * strip carries the set code, collector number and artist credit at about four
 * points, which is the least load-bearing text on the card, so that is where
 * they go. The bottom RIGHT is deliberately left alone because that is where
 * power and toughness print.
 *
 * WHY IT IS A COMPONENT AND NOT TWO COPIES
 * ----------------------------------------
 * The shopping grid and the proxy grid had this markup written out twice,
 * identically. That is the beginning of the drift this project already has too
 * much of, and it is why one of the two would have been fixed and the other
 * left reading "na Crypt".
 */
export function ListCardBadges({ quantity, finish }: { quantity: number; finish: Finish }) {
  return (
    <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1">
      <span className="rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground shadow-sm">
        {quantity}
      </span>
      {finish !== 'nonfoil' && (
        <span className="rounded-full bg-background/90 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-foreground shadow-sm">
          {FINISH_LABEL[finish]}
        </span>
      )}
    </span>
  );
}
