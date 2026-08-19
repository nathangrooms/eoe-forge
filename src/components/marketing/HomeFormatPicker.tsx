import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManaCost } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton } from '@/components/cards/CardImage';
import { countCardsWhere, selectCardsWhere } from '@/lib/supabase/jsonPath';
import { Section, SectionHeading } from '@/components/marketing/Section';
import { cn } from '@/lib/utils';

/**
 * Pick a format, see what you can build in it.
 *
 * This replaces "Every format, with real legality" — six tiles reading
 * "Legacy 32,715", which told a player nothing they could act on and fired six
 * concurrent count queries to say it. A legality claim is only worth making if
 * it is demonstrated, so each format now shows the SKELETON OF A DECK in that
 * format: the roles a list needs, filled with real cards, drawn whole at 5:7.
 *
 * Honesty model, because this section makes a legality claim about specific
 * cards:
 *
 *   - The card ids below are chosen by hand — a deliberately editorial pick of
 *     recognisable staples, because ranking the pool by price surfaces vintage
 *     collector rares and Secret Lair crossovers rather than cards anyone plays.
 *   - The claim "legal in this format" is NOT taken from that hand-picking. Each
 *     query filters on `legalities->>'<format>' = 'legal'`, so a card that gets
 *     banned or rotates simply stops appearing here — the row shrinks rather
 *     than lying. (The catalogue is current: Dockside Extortionist and Jeweled
 *     Lotus already read `banned` in Commander.)
 *   - The one number kept from the old section is the live count of legal cards,
 *     now a supporting line under six real cards rather than the whole exhibit.
 *   - The rules line for each format is the format's actual deck-construction
 *     rule, not a statistic.
 *
 * Queries: one row fetch plus one count for the format on screen, both cached
 * per format, against the per-format expression indexes. The old section fired
 * six counts on mount before anyone had chosen anything.
 */

interface Pick {
  /** Scryfall id, verified present in the catalogue. */
  id: string;
  /** The job this card does in a list. */
  role: string;
}

interface FormatDef {
  key: string;
  label: string;
  /** The format's real deck-construction rules. */
  rules: string;
  picks: Pick[];
}

const FORMATS: FormatDef[] = [
  {
    key: 'commander',
    label: 'Commander',
    rules: '100 cards · singleton · colour identity enforced',
    picks: [
      { id: 'd0d33d52-3d28-4635-b985-51e126289259', role: 'Commander' }, // Atraxa, Praetors' Voice
      { id: '3d994115-378d-4685-a5dc-e448831da434', role: 'Ramp' }, // Arcane Signet
      { id: '0e7ff4dc-af63-4342-9a44-d059e62bd14c', role: 'Removal' }, // Swords to Plowshares
      { id: '6ada256f-2e55-4c1f-b4d3-d7b10b498956', role: 'Card draw' }, // Sylvan Library
      { id: 'a24b4cb6-cebb-428b-8654-74347a6a8d63', role: 'Tutor' }, // Demonic Tutor
      { id: '317f1133-7cf8-4b7a-919e-88c45f8c2c3a', role: 'Finisher' }, // Avacyn, Angel of Hope
    ],
  },
  {
    key: 'modern',
    label: 'Modern',
    rules: '60 cards · four copies · 8th Edition forward',
    picks: [
      { id: 'a9738cda-adb1-47fb-9f4c-ecd930228c4d', role: 'Threat' }, // Ragavan, Nimble Pilferer
      { id: '77c6fa74-5543-42ac-9ead-0e890b188e99', role: 'Removal' }, // Lightning Bolt
      { id: 'f3537373-ef54-4578-9d05-6216420ee349', role: 'Card draw' }, // Esper Sentinel
      { id: '5ea568df-04a1-4012-98ec-ba75e189e0ca', role: 'Ramp' }, // Utopia Sprawl
      { id: 'b18fe7e0-8344-40cc-b242-83f01c6be7a6', role: 'Tutor' }, // Chord of Calling
      { id: '3aad15a2-8a1b-4460-9b06-e85863081878', role: 'Land' }, // Cavern of Souls
    ],
  },
  {
    key: 'pioneer',
    label: 'Pioneer',
    rules: '60 cards · four copies · Return to Ravnica forward',
    picks: [
      { id: 'd67be074-cdd4-41d9-ac89-0a0456c4e4b2', role: 'Threat' }, // Sheoldred, the Apocalypse
      { id: '6e9d8fe4-fd9b-4923-92bf-7dd6b8fa02e7', role: 'Removal' }, // Fatal Push
      { id: 'cfa7b456-7e83-4587-a875-9b35fde318c2', role: 'Card advantage' }, // Collected Company
      { id: '834b27a0-dfd7-4f96-8cde-cacac4b24acc', role: 'Ramp' }, // Nykthos, Shrine to Nyx
      { id: '3aad15a2-8a1b-4460-9b06-e85863081878', role: 'Land' }, // Cavern of Souls
      { id: '276f5cee-a501-4658-bd4d-7a044bf1ccbc', role: 'Finisher' }, // Craterhoof Behemoth
    ],
  },
  {
    key: 'standard',
    label: 'Standard',
    rules: '60 cards · four copies · the current rotation',
    picks: [
      { id: '64a5d494-efa1-446b-bebe-2ad36e154376', role: 'Threat' }, // Ugin, Eye of the Storms
      { id: '73a065e3-b530-4e62-ab3c-4f6f908184ec', role: 'Planeswalker' }, // Elspeth, Storm Slayer
      { id: 'e20da6b5-1057-4a28-9e85-07de714e262f', role: 'Card draw' }, // Wan Shi Tong, Librarian
      { id: '6a0b230b-d391-4998-a3f7-7b158a0ec2cd', role: 'Ramp' }, // Llanowar Elves
      { id: '3aad15a2-8a1b-4460-9b06-e85863081878', role: 'Land' }, // Cavern of Souls
      { id: '276f5cee-a501-4658-bd4d-7a044bf1ccbc', role: 'Finisher' }, // Craterhoof Behemoth
    ],
  },
  {
    key: 'pauper',
    label: 'Pauper',
    rules: '60 cards · four copies · commons only',
    picks: [
      { id: 'cedd44eb-f381-46e1-bcb0-88416b4ce33d', role: 'Threat' }, // Gurmag Angler
      { id: '4686b51c-e02b-48c1-bafe-e8d08a5407b9', role: 'Removal' }, // Journey to Nowhere
      { id: 'dd29a0e5-c1de-4e8a-8866-715e9f9cde1f', role: 'Card selection' }, // Preordain
      { id: '4f616706-ec97-4923-bb1e-11a69fbaa1f8', role: 'Counterspell' }, // Counterspell
      { id: '6c877da3-68fa-41d0-8a24-8c79fcd8ecc1', role: 'Fast mana' }, // Lotus Petal
      { id: '77c6fa74-5543-42ac-9ead-0e890b188e99', role: 'Burn' }, // Lightning Bolt
    ],
  },
  {
    key: 'legacy',
    label: 'Legacy',
    rules: '60 cards · four copies · nearly the whole card pool',
    picks: [
      { id: '89f612d6-7c59-4a7b-a87d-45f789e88ba5', role: 'Interaction' }, // Force of Will
      { id: 'b5545882-6963-4729-b2c6-fb4bdc75ffcc', role: 'Card draw' }, // Brainstorm
      { id: '20c4aae1-7665-4df7-bd51-a1d95bf8a17d', role: 'Threat' }, // Murktide Regent
      { id: '0e7ff4dc-af63-4342-9a44-d059e62bd14c', role: 'Removal' }, // Swords to Plowshares
      { id: 'f340cbf7-5bbe-45b9-a4bf-d1caa500ff93', role: 'Fast mana' }, // Chrome Mox
      { id: 'aaafb9bc-7cea-4624-a227-595544fa42b0', role: 'Land' }, // Wasteland
    ],
  },
];

const COLUMNS = 'id,name,mana_cost,cmc,type_line,rarity,color_identity,image_uris,faces,layout,prices';

interface FormatCard {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string;
  rarity: string | null;
  color_identity: string[] | null;
  image_uris: Record<string, string> | null;
  faces: unknown;
  layout: string | null;
  prices: Record<string, string> | null;
}

interface Slot {
  role: string;
  card: FormatCard;
}

/* ------------------------------------------------------------------ section */

export function HomeFormatPicker() {
  const [active, setActive] = useState(FORMATS[0].key);
  const [slots, setSlots] = useState<Record<string, Slot[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});

  const format = FORMATS.find(f => f.key === active) ?? FORMATS[0];
  const loaded = slots[active];
  const count = counts[active];

  useEffect(() => {
    if (slots[active]) return;

    let alive = true;
    const def = FORMATS.find(f => f.key === active);
    if (!def) return;

    /* The two requests are deliberately NOT awaited together. An exact count
       over a 30k-row legal pool is far slower than six primary-key lookups, and
       a Promise.all would hold the cards behind it — the section then paints as
       six skeletons for as long as the count takes. */
    (async () => {
      const rows = await selectCardsWhere(COLUMNS)
        .eq(`legalities->>${def.key}`, 'legal')
        .in(
          'id',
          def.picks.map(p => p.id)
        )
        .limit(def.picks.length);

      if (!alive) return;

      const byId = new Map(((rows.data ?? []) as unknown as FormatCard[]).map(c => [c.id, c]));
      /* Keep the authored role order, and drop any pick the legality filter did
         not return — a banning removes the card rather than mislabelling it. */
      const resolved = def.picks
        .map(p => {
          const card = byId.get(p.id);
          return card ? { role: p.role, card } : null;
        })
        .filter((s): s is Slot => s !== null);

      setSlots(prev => ({ ...prev, [def.key]: resolved }));
    })();

    (async () => {
      const total = await countCardsWhere().eq(`legalities->>${def.key}`, 'legal');
      if (!alive || typeof total.count !== 'number') return;
      setCounts(prev => ({ ...prev, [def.key]: total.count as number }));
    })();

    return () => {
      alive = false;
    };
  }, [active, slots]);

  return (
    <Section tint>
      <SectionHeading
        eyebrow="Pick your format"
        title={`What can you build in ${format.label}?`}
        lead="What is legal comes from the cards themselves, not from a list someone updates by hand, so a new ban shows up here the day it happens. Pick a format and the cards below change with it."
      />

      {/* Format tabs */}
      <div className="mt-12 flex flex-wrap justify-center gap-2">
        {FORMATS.map(f => {
          const on = f.key === active;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(f.key)}
              aria-pressed={on}
              className={cn(
                'rounded-full px-5 py-2.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                on
                  ? 'bg-foreground font-medium text-background'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* The format's real rules, plus the live size of its pool */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{format.rules}</span>
        <span aria-hidden="true" className="hidden text-muted-foreground/40 sm:inline">
          ·
        </span>
        <span className="tabular-nums">
          {typeof count === 'number' ? (
            <>
              <span className="font-medium text-foreground">{count.toLocaleString()}</span> cards
              legal today
            </>
          ) : (
            'counting the legal pool…'
          )}
        </span>
      </div>

      {/* The skeleton of a deck in this format, as whole cards */}
      <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
        {((loaded ?? format.picks) as (Slot | Pick)[]).map((entry, i) => {
          const slot: Slot | null = 'card' in entry ? entry : null;
          return (
            <figure key={slot?.card.id ?? `slot-${i}`}>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {entry.role}
              </p>

              {slot ? (
                <CardImage card={slot.card} fill size="md" hideFlip />
              ) : (
                <CardImageSkeleton fill size="md" />
              )}

              <figcaption className="mt-3">
                <p className="truncate text-sm font-medium">{slot ? slot.card.name : ' '}</p>
                <div className="mt-1.5 flex min-h-[1.125rem] items-center gap-2">
                  {slot && <ManaCost cost={slot.card.mana_cost} size="xs" />}
                  {slot?.card.prices?.usd && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      ${Number(slot.card.prices.usd).toFixed(2)}
                    </span>
                  )}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <Button asChild size="lg" variant="outline">
          <Link to="/cards">
            Search the {format.label} pool
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export default HomeFormatPicker;
