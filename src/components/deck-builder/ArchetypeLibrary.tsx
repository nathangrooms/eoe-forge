import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { Search, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DECK_BRACKETS,
  bandForScore,
  bandLabel,
  bracketIdForScore,
  formatPowerScore,
  powerTextClass,
} from '@/lib/deck/power';

/**
 * Archetype catalogue.
 *
 * Restored and rewritten. The previous version rendered a `satisfied: true`
 * flag on every requirement — hardcoded, with no deck in scope to satisfy
 * anything — so it drew green ticks and red crosses that meant nothing, and it
 * described each shell with a bare `powerLevel: {min, max}` on an unexplained
 * scale.
 *
 * An archetype is a *target*, not a measurement: it says where a well-built
 * version of the shell lands. That target is now expressed in the same
 * vocabulary as every real score in the app — the canonical band and Commander
 * bracket from `@/lib/deck/power` — so "Aristocrats 6–8" reads as "Mid to High
 * power, brackets 3–4" and lines up with the number the deck will show once it
 * exists.
 */

export interface DeckArchetype {
  id: string;
  name: string;
  description: string;
  formats: string[];
  colors: string[];
  /** Where a well-built version of this shell scores. A target, not a score. */
  targetPower: { min: number; max: number };
  /** The pieces the shell is actually made of. */
  packages: Array<{ name: string; blurb: string; cards: string[] }>;
}

export const DECK_ARCHETYPES: DeckArchetype[] = [
  {
    id: 'aristocrats',
    name: 'Aristocrats',
    description: 'Sacrifice creatures for value and drain the table a point at a time.',
    formats: ['commander', 'brawl'],
    colors: ['B', 'R'],
    targetPower: { min: 6, max: 8 },
    packages: [
      {
        name: 'Sacrifice outlets',
        blurb: 'Free, repeatable outlets are what make the shell a deck rather than a pile.',
        cards: ['Viscera Seer', 'Carrion Feeder', 'Goblin Bombardment', 'Altar of Dementia'],
      },
      {
        name: 'Death payoffs',
        blurb: 'Each death has to cost the table life, or the sacrifices are free for them.',
        cards: ['Blood Artist', 'Zulaport Cutthroat', 'Mayhem Devil', 'Bastion of Remembrance'],
      },
      {
        name: 'Fodder',
        blurb: 'Tokens keep the engine fed without spending real cards.',
        cards: ['Bitterblossom', 'Ophiomancer', 'Grave Titan', 'Pitiless Plunderer'],
      },
    ],
  },
  {
    id: 'control',
    name: 'Control',
    description: 'Answer everything, resolve one threat, and close the game on your terms.',
    formats: ['commander', 'brawl'],
    colors: ['U', 'W'],
    targetPower: { min: 7, max: 9 },
    packages: [
      {
        name: 'Counterspells',
        blurb: 'Cheap, unconditional answers held up across a whole turn cycle.',
        cards: ['Counterspell', 'Swan Song', 'Force of Will', 'Mana Drain'],
      },
      {
        name: 'Sweepers',
        blurb: 'One-sided or asymmetric wipes, so resetting the board is not a reset for you.',
        cards: ['Cyclonic Rift', 'Toxic Deluge', 'Supreme Verdict', 'Farewell'],
      },
      {
        name: 'Draw engines',
        blurb: 'Control loses to running out of answers before it loses to threats.',
        cards: ['Rhystic Study', 'Mystic Remora', 'Consecrated Sphinx', 'Fact or Fiction'],
      },
    ],
  },
  {
    id: 'big-mana',
    name: 'Big mana',
    description: 'Accelerate hard, then land threats the table cannot answer profitably.',
    formats: ['commander', 'brawl'],
    colors: ['G'],
    targetPower: { min: 5, max: 7 },
    packages: [
      {
        name: 'Acceleration',
        blurb: 'Land-based ramp is harder to punish than rocks in a green deck.',
        cards: ['Nature’s Lore', 'Three Visits', 'Cultivate', 'Sylvan Scrying'],
      },
      {
        name: 'Payoffs',
        blurb: 'The mana has to buy something the table cannot ignore.',
        cards: ['Craterhoof Behemoth', 'Vorinclex', 'Avenger of Zendikar', 'Genesis Wave'],
      },
      {
        name: 'Protection',
        blurb: 'One removal spell should not undo four turns of ramp.',
        cards: ['Heroic Intervention', 'Veil of Summer', 'Tyvar’s Stand'],
      },
    ],
  },
  {
    id: 'compact-combo',
    name: 'Two-card combo',
    description: 'Assemble a compact loop and win from an empty board.',
    formats: ['commander'],
    colors: ['U', 'B'],
    targetPower: { min: 8, max: 10 },
    packages: [
      {
        name: 'The combo',
        blurb: 'Two cards, both individually castable, both individually useful.',
        cards: ['Thassa’s Oracle', 'Demonic Consultation', 'Underworld Breach', 'Brain Freeze'],
      },
      {
        name: 'Tutors',
        blurb: 'Compact combos live or die on how reliably you can find the halves.',
        cards: ['Demonic Tutor', 'Vampiric Tutor', 'Imperial Seal', 'Grim Tutor'],
      },
      {
        name: 'Protection',
        blurb: 'Winning through one open blue mana is the whole game.',
        cards: ['Silence', 'Grand Abolisher', 'Pact of Negation', 'Veil of Summer'],
      },
    ],
  },
  {
    id: 'aggro',
    name: 'Aggro',
    description: 'Cheap threats and reach — end the game before the table stabilises.',
    formats: ['standard', 'pioneer', 'modern'],
    colors: ['R'],
    targetPower: { min: 4, max: 6 },
    packages: [
      {
        name: 'One-drops',
        blurb: 'Curve out from turn one or the plan does not work.',
        cards: ['Monastery Swiftspear', 'Goblin Guide', 'Kird Ape'],
      },
      {
        name: 'Burn',
        blurb: 'Reach for the last few points once the board stalls.',
        cards: ['Lightning Bolt', 'Lava Spike', 'Rift Bolt', 'Skewer the Critics'],
      },
    ],
  },
];

interface ArchetypeLibraryProps {
  currentFormat: string;
  /** Start a new build from this shell. */
  onStartFromTemplate?: (template: DeckArchetype) => void;
  className?: string;
}

function TargetPower({ range }: { range: { min: number; max: number } }) {
  const midpoint = (range.min + range.max) / 2;
  const band = bandForScore(midpoint);
  const lowBracket = bracketIdForScore(range.min);
  const highBracket = bracketIdForScore(range.max);
  const bracketText =
    lowBracket === highBracket
      ? `Bracket ${lowBracket} · ${DECK_BRACKETS[highBracket].name}`
      : `Brackets ${lowBracket}–${highBracket}`;

  return (
    <div className="rounded-lg bg-muted/40 p-3 shadow-sm">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Target power
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('text-2xl font-bold leading-none tabular-nums', powerTextClass(band))}>
          {formatPowerScore(range.min)}–{formatPowerScore(range.max)}
        </span>
        <span className="text-xs text-muted-foreground">/ 10</span>
      </p>
      <p className={cn('mt-1.5 text-xs font-semibold', powerTextClass(band))}>{bandLabel(band)}</p>
      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{bracketText}</p>
    </div>
  );
}

export function ArchetypeLibrary({
  currentFormat,
  onStartFromTemplate,
  className,
}: ArchetypeLibraryProps) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return DECK_ARCHETYPES.filter(a => a.formats.includes(currentFormat)).filter(
      a =>
        !needle ||
        a.name.toLowerCase().includes(needle) ||
        a.description.toLowerCase().includes(needle) ||
        a.packages.some(p => p.cards.some(c => c.toLowerCase().includes(needle)))
    );
  }, [currentFormat, query]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search archetypes and key cards…"
          className="pl-9"
        />
      </div>

      {results.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No archetype matches that in {currentFormat}.
        </p>
      ) : (
        <div className="space-y-3">
          {results.map(archetype => {
            const open = openId === archetype.id;
            return (
              <div key={archetype.id} className="rounded-xl bg-muted/30 p-4 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold">{archetype.name}</h3>
                      <ColorIdentity colors={archetype.colors} size="xs" className="gap-1" />
                    </div>
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">
                      {archetype.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenId(open ? null : archetype.id)}
                      >
                        {open ? 'Hide the shell' : 'What goes in it'}
                      </Button>
                      {onStartFromTemplate && (
                        <Button size="sm" onClick={() => onStartFromTemplate(archetype)}>
                          <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                          Build this
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="w-full sm:w-40 sm:flex-shrink-0">
                    <TargetPower range={archetype.targetPower} />
                  </div>
                </div>

                {open && (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {archetype.packages.map(pkg => (
                      <div key={pkg.name} className="rounded-lg bg-background/60 p-3 shadow-sm">
                        <p className="text-sm font-semibold">{pkg.name}</p>
                        <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">
                          {pkg.blurb}
                        </p>
                        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {pkg.cards.map(card => (
                            <li key={card} className="truncate">
                              {card}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ArchetypeLibrary;
