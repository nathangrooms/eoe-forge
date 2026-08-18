import { Player } from '@/lib/simulation/types';
import { GroupedCardDisplay } from './GroupedCardDisplay';
import { cn } from '@/lib/utils';

interface DetailedPlayerZoneProps {
  player: Player;
  isActive: boolean;
  hasPriority: boolean;
  orientation: 'top' | 'bottom';
  onRegisterCard?: (instanceId: string, element: HTMLElement | null) => void;
  damages: Map<string, Array<{ id: string; amount: number; timestamp: number }>>;
  attackers: any[];
  blockers: any[];
}

/**
 * Battlefield rows for one player.
 *
 * Two things this used to get wrong:
 *
 * 1. Permanents were matched by five independent `type_line.includes()` calls
 *    with one exclusion, so an Enchantment Creature appeared in both the
 *    Creatures and Enchantments rows and an artifact land appeared twice.
 *    Classification is now single-bucket with an explicit precedence, and
 *    Battles — a permanent type since March of the Machine — finally have a row.
 * 2. isActive / hasPriority / orientation were destructured and then never
 *    referenced, so the two zones looked identical no matter whose turn it was.
 */

type Bucket = 'lands' | 'battles' | 'planeswalkers' | 'creatures' | 'artifacts' | 'enchantments';

/** One permanent goes in exactly one row. Precedence matters for hybrids. */
export function classifyPermanent(typeLine: string): Bucket {
  const t = typeLine ?? '';
  if (t.includes('Land')) return 'lands';
  if (t.includes('Battle')) return 'battles';
  if (t.includes('Planeswalker')) return 'planeswalkers';
  if (t.includes('Creature')) return 'creatures';
  if (t.includes('Artifact')) return 'artifacts';
  return 'enchantments';
}

/** Row colour comes from the app's own --type-* tokens, not a private palette. */
const ROWS: Array<{ key: Bucket; label: string; accent: string }> = [
  { key: 'creatures', label: 'Creatures', accent: 'text-type-creatures' },
  { key: 'planeswalkers', label: 'Planeswalkers', accent: 'text-type-planeswalkers' },
  { key: 'battles', label: 'Battles', accent: 'text-type-battles' },
  { key: 'artifacts', label: 'Artifacts', accent: 'text-type-artifacts' },
  { key: 'enchantments', label: 'Enchantments', accent: 'text-type-enchantments' },
  { key: 'lands', label: 'Lands', accent: 'text-type-lands' },
];

function ZoneRow({
  label,
  accent,
  count,
  children,
}: {
  label: string;
  accent: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full rounded-lg bg-muted/25 p-2">
      <div className={cn('mb-1.5 text-[10px] font-bold uppercase tracking-wide', accent)}>
        {label} ({count})
      </div>
      <div className="overflow-x-auto overflow-y-hidden">{children}</div>
    </div>
  );
}

export const DetailedPlayerZone = ({
  player,
  isActive,
  hasPriority,
  orientation,
  onRegisterCard,
  damages,
  attackers,
  blockers,
}: DetailedPlayerZoneProps) => {
  const isTop = orientation === 'top';

  const buckets: Record<Bucket, typeof player.battlefield> = {
    lands: [],
    battles: [],
    planeswalkers: [],
    creatures: [],
    artifacts: [],
    enchantments: [],
  };
  for (const card of player.battlefield) {
    buckets[classifyPermanent(card.type_line)].push(card);
  }

  const commanderName = player.commandZone[0]?.name;
  const commanderOnBattlefield = commanderName
    ? player.battlefield.some(c => c.name === commanderName)
    : false;
  const commanderTax = player.commanderCastCount * 2;

  // Opponent's rows read top-down, yours bottom-up, so the two boards mirror
  // across the divider the way a real table does.
  const rowOrder = isTop ? ROWS : [...ROWS].reverse();

  const zoneRows = (
    <>
      {rowOrder.map(row =>
        buckets[row.key].length > 0 ? (
          <ZoneRow
            key={row.key}
            label={row.label}
            accent={row.accent}
            count={buckets[row.key].length}
          >
            <GroupedCardDisplay
              cards={buckets[row.key]}
              compact
              onRegisterCard={onRegisterCard}
              damages={row.key === 'creatures' ? damages : undefined}
              attackers={row.key === 'creatures' ? attackers : undefined}
              blockers={row.key === 'creatures' ? blockers : undefined}
            />
          </ZoneRow>
        ) : null
      )}

      {player.graveyard.length > 0 && (
        <ZoneRow
          label="Graveyard"
          accent="text-muted-foreground"
          count={player.graveyard.length}
        >
          <GroupedCardDisplay
            cards={player.graveyard.slice(-5)}
            compact
            onRegisterCard={onRegisterCard}
          />
        </ZoneRow>
      )}

      {player.exile.length > 0 && (
        <ZoneRow label="Exile" accent="text-muted-foreground" count={player.exile.length}>
          <GroupedCardDisplay
            cards={player.exile.slice(-5)}
            compact
            onRegisterCard={onRegisterCard}
          />
        </ZoneRow>
      )}

      {player.hand.length > 0 && (
        <ZoneRow label="Hand" accent="text-muted-foreground" count={player.hand.length}>
          <GroupedCardDisplay cards={player.hand} compact onRegisterCard={onRegisterCard} />
        </ZoneRow>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg transition-colors',
        // Priority is the single most important piece of state in a Magic game
        // view, so it gets the strongest treatment — a ring rather than a
        // border, because a border is the hairline the design law bans and it
        // also shifts the layout the moment priority changes hands.
        hasPriority ? 'ring-2 ring-foreground' : isActive ? 'bg-accent/40' : ''
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 px-2 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground',
          isTop ? 'order-first' : 'order-last pb-2 pt-1'
        )}
      >
        <span className="font-semibold text-foreground">{player.name}</span>
        {isActive && <span>active turn</span>}
        {hasPriority && <span className="font-semibold text-foreground">has priority</span>}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto px-2 pb-2">
        {player.commandZone.length > 0 && (
          <ZoneRow
            label="Command zone"
            accent="text-type-commander"
            count={player.commandZone.length}
          >
            <GroupedCardDisplay
              cards={player.commandZone}
              compact
              onRegisterCard={onRegisterCard}
            />
            <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
              {commanderTax > 0 && <span>Commander tax +{commanderTax} generic</span>}
              {commanderOnBattlefield && <span>Commander is on the battlefield</span>}
            </div>
          </ZoneRow>
        )}

        {zoneRows}

        {player.battlefield.length === 0 &&
          player.hand.length === 0 &&
          player.graveyard.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              Nothing on the battlefield yet.
            </p>
          )}
      </div>
    </div>
  );
};
