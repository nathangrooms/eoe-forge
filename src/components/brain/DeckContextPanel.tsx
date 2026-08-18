import { useMemo, useState } from 'react';
import { ChevronDown, Crown } from 'lucide-react';
import { CardImage } from '@/components/cards';
import { ManaCost } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

export interface BrainDeckCard {
  card_id: string;
  card_name: string;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
  /** The joined `cards` row, when this printing exists in the catalogue. */
  card: any | null;
}

interface DeckContextPanelProps {
  deckName: string;
  cards: BrainDeckCard[];
  loading: boolean;
  onCardClick?: (card: any) => void;
}

const TYPE_ORDER = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Battle',
  'Land',
] as const;

function primaryType(typeLine: string): string {
  for (const type of TYPE_ORDER) {
    if (new RegExp(`\\b${type}\\b`, 'i').test(typeLine)) return type;
  }
  return 'Other';
}

/**
 * What the assistant is actually holding.
 *
 * `/brain` really does load your decklist and send it as context before it
 * answers — but nothing on screen said so, so the claim was invisible and the
 * page rendered as a chat box next to a list of deck names. This is the receipt:
 * every card in the list, drawn as itself, with the counts and the curve computed
 * from the same rows that go into the request. If a card is on screen here, it is
 * in the payload; if it is missing from the catalogue, that is said out loud
 * rather than quietly dropped.
 */
export function DeckContextPanel({ deckName, cards, loading, onCardClick }: DeckContextPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    const maindeck = cards.filter(c => !c.is_sideboard);
    const commander = maindeck.find(c => c.is_commander) ?? null;
    const rest = maindeck.filter(c => !c.is_commander);

    const total = maindeck.reduce((sum, c) => sum + (c.quantity ?? 1), 0);
    const sideboard = cards
      .filter(c => c.is_sideboard)
      .reduce((sum, c) => sum + (c.quantity ?? 1), 0);
    const unresolved = maindeck.filter(c => !c.card).length;

    const byType = new Map<string, number>();
    const curve = new Array(8).fill(0);
    let mvSum = 0;
    let mvCount = 0;

    for (const entry of maindeck) {
      const quantity = entry.quantity ?? 1;
      const typeLine = entry.card?.type_line ?? '';
      const type = typeLine ? primaryType(typeLine) : 'Unknown';
      byType.set(type, (byType.get(type) ?? 0) + quantity);

      if (entry.card && !/\bLand\b/i.test(typeLine)) {
        const cmc = Number(entry.card.cmc ?? 0) || 0;
        curve[Math.min(7, Math.round(cmc))] += quantity;
        mvSum += cmc * quantity;
        mvCount += quantity;
      }
    }

    /* Most expensive first — the cards a reader wants to see when they ask what
       this deck is, and the ones an answer is most likely to be about. */
    const ordered = [...rest].sort((a, b) => {
      const aMv = Number(a.card?.cmc ?? 0) || 0;
      const bMv = Number(b.card?.cmc ?? 0) || 0;
      if (bMv !== aMv) return bMv - aMv;
      return a.card_name.localeCompare(b.card_name);
    });

    return {
      commander,
      ordered,
      total,
      sideboard,
      unresolved,
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      curve,
      averageMv: mvCount ? mvSum / mvCount : 0,
    };
  }, [cards]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-lg shadow-black/20">
        <p className="text-sm text-muted-foreground">Loading {deckName}…</p>
      </div>
    );
  }

  if (summary.total === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-lg shadow-black/20">
        <p className="text-sm text-muted-foreground">
          {deckName} has no cards recorded, so there is nothing to send as context.
        </p>
      </div>
    );
  }

  const maxCurve = Math.max(...summary.curve, 1);
  const visible = expanded ? summary.ordered : summary.ordered.slice(0, 18);

  return (
    <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What the assistant is reading
        </h3>
        <p className="text-xs text-muted-foreground">
          {summary.total} maindeck card{summary.total === 1 ? '' : 's'} from {deckName} go with every
          question
          {summary.sideboard > 0 && `, plus ${summary.sideboard} in the sideboard`}
          {summary.unresolved > 0 &&
            ` · ${summary.unresolved} not in the card catalogue, sent by name only`}
        </p>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        {/* Commander */}
        {summary.commander && (
          <div className="flex gap-3">
            <div className="w-[8rem] shrink-0">
              {summary.commander.card ? (
                <CardImage
                  card={summary.commander.card}
                  size="md"
                  fill
                  eager
                  onClick={onCardClick ? () => onCardClick(summary.commander!.card) : undefined}
                />
              ) : (
                <div
                  className="flex items-center justify-center rounded-lg bg-muted/40"
                  style={{ aspectRatio: '488 / 680' }}
                >
                  <Crown className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Crown className="h-3 w-3 text-type-commander" aria-hidden="true" />
                Commander
              </p>
              <p className="text-sm font-semibold leading-snug text-foreground">
                {summary.commander.card_name}
              </p>
              {summary.commander.card?.mana_cost && (
                <ManaCost cost={summary.commander.card.mana_cost} size="sm" />
              )}
              {summary.commander.card?.type_line && (
                <p className="text-xs leading-snug text-muted-foreground">
                  {summary.commander.card.type_line}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Curve + type split, both computed from the rows above */}
        <div className="space-y-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Mana curve · {summary.averageMv.toFixed(2)} average
            </p>
            <div className="mt-2 flex gap-1.5">
              {summary.curve.map((count, mv) => (
                <div key={mv} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[0.6rem] tabular-nums text-muted-foreground">
                    {count || ''}
                  </span>
                  <div className="flex h-14 w-full items-end">
                    <div
                      className="w-full rounded-t-sm bg-muted-foreground/35"
                      style={{ height: `${Math.max(2, (count / maxCurve) * 56)}px` }}
                    />
                  </div>
                  <span className="text-[0.6rem] tabular-nums text-muted-foreground">
                    {mv === 7 ? '7+' : mv}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {summary.byType.map(([type, count]) => (
              <span
                key={type}
                className="rounded-md bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {type} <span className="font-semibold tabular-nums text-foreground">{count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The list itself */}
      <div className="mt-5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          The list
        </p>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
          {visible.map(entry => (
            <button
              key={`${entry.card_id}-${entry.card_name}`}
              type="button"
              onClick={onCardClick && entry.card ? () => onCardClick(entry.card) : undefined}
              className={cn(
                'group min-w-0 rounded-lg text-left',
                onCardClick && entry.card && 'cursor-pointer'
              )}
              title={`${entry.quantity > 1 ? `${entry.quantity}× ` : ''}${entry.card_name}`}
            >
              {entry.card ? (
                <div className="relative">
                  <CardImage card={entry.card} size="sm" fill quality="normal" />
                  {entry.quantity > 1 && (
                    <span className="absolute right-1 top-1 rounded bg-background/85 px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums text-foreground">
                      {entry.quantity}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className="flex items-center justify-center rounded bg-muted/30 p-2 text-center text-[0.6rem] leading-tight text-muted-foreground"
                  style={{ aspectRatio: '488 / 680' }}
                >
                  {entry.card_name}
                </div>
              )}
            </button>
          ))}
        </div>

        {summary.ordered.length > 18 && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
              aria-hidden="true"
            />
            {expanded
              ? 'Show fewer'
              : `Show all ${summary.ordered.length} other cards in the context`}
          </button>
        )}
      </div>
    </div>
  );
}
