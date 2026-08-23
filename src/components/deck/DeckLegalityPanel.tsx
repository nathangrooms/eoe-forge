import { useCallback, useMemo, useState } from 'react';
import { Grid3X3, Gavel, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FacetChip,
  FilterBar,
  ListingFrame,
  ListingSearch,
  MetricRow,
  matchedLabel,
  resultSentence,
  type ListingMode,
} from '@/components/listing';
/* `useListingView` from its own module rather than through the folder's
   barrel, and this is not style. `@/components/listing/index.ts` re-exports the
   hook, the hook imports `@/components/cards`, and `CardDetail` in there imports
   the listing barrel back: two barrels in a cycle. Rollup reports it as
   "will end up in different chunks ... will likely lead to broken execution
   order", and this file is a lazily loaded chunk, which is exactly the case it
   is warning about. Everything else still comes from the barrel. */
import { useListingView } from '@/components/listing/useListingView';
import { cn } from '@/lib/utils';
import { DeckValidator, type ValidationWarning } from '@/lib/deckbuilder/validation-warnings';
import type { Card as StoreCard } from '@/stores/deckStore';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import { formatLabel } from '@/lib/deck/formats';
import {
  cardFaults,
  deckFormatVerdicts,
  deckRules,
  FAULT_LABEL,
  formatKeyLabel,
  type LegalityFault,
} from '@/lib/deck/deckLegality';
import { DeckCardTile, TileBadge } from './DeckCardTile';

/**
 * The Legality tab.
 *
 * ## What was here
 *
 * `DeckValidationPanel` and `DeckCompatibilityChecker`, side by side. Between
 * them: twenty border classes, four `Alert` variants, three collapsible
 * sections, a hand-rolled severity badge, six-pixel colour circles standing in
 * for mana symbols, and — counted by the census — **not one import from
 * `@/components/listing`**. It was the only tab of the eight importing nothing
 * from the house vocabulary, and the two panels disagreed about how to draw the
 * same verdict: one said `Legal` in a badge, the other said `Compatible`.
 *
 * The deeper problem was that neither of them drew a card. `DeckValidationPanel`
 * would tell you `"Sol Ring appears 2 times (violates singleton rule)"` and
 * offer nothing to press. `DeckCompatibilityChecker`, six inches below, listed
 * its violations with a working Remove button. Same page, same kind of problem,
 * one actionable and one not.
 *
 * ## What is here now
 *
 * One panel, three questions, in the order a player asks them.
 *
 * 1. **Is it legal in the format I built it for?** The metric row, and the
 *    rules underneath it stated as rules — "Exactly 100 cards, commander
 *    included · this deck has 97" — so a passing deck reads as passing rather
 *    than as an absence of complaints.
 * 2. **Where else could I play it?** Every format the catalogue reports, not
 *    the one you picked. `cards.legalities` has carried all twenty-three keys
 *    down with every deck load since `CARD_COLUMNS` was written and the tab
 *    printed one. This is Moxfield's headline legality feature and the data for
 *    it was already on the page.
 * 3. **Which cards, and what do I do about them?** The offenders as cards,
 *    large and uncropped, at the size slider's width, each carrying Remove and
 *    Replace. Naming a problem and being able to fix it belong together; that
 *    is the founding argument of this page and this tab was the one place it
 *    was not honoured.
 *
 * ## The deck-building warnings are still here, and they are not legality
 *
 * `DeckValidator` produces advice — land counts, how much removal, whether
 * there is a win condition. None of it is a rule and none of it makes a deck
 * illegal, and the old panel filed it under a shield icon beside the banned
 * cards, which is how "only 33 lands" ended up looking like a rules violation.
 * It is below the fold now, under its own heading, worded as what it is.
 * Nothing was dropped: `DECK-PAGE-AUDIT.md` is the nothing-lost contract and
 * every warning the old panel could raise still renders here.
 */

const OFFENDER_MODES: ListingMode[] = [
  { id: 'grid', label: 'Cards', icon: Grid3X3, layout: 'grid' },
];

/**
 * Card width on a first visit.
 *
 * The same 230 the decklist settled on, for the same reason: five across the
 * content band, at a size you can read a name and a mana cost off at arm's
 * length. A reader who has moved the slider keeps their width.
 */
const DEFAULT_CARD_SIZE = 230;

/** Which reasons a player can narrow the offender list to. */
const FAULT_ORDER: LegalityFault[] = [
  'banned',
  'not-legal',
  'restricted',
  'copy-limit',
  'colour-identity',
  'no-data',
];

export interface DeckLegalityPanelProps {
  /** The mainboard. The commander is passed separately. */
  rows: DeckCardRow[];
  commanderRow?: DeckCardRow | null;
  /** The format the deck is saved as. Decides which verdict is the headline. */
  format: string;
  /** The mainboard as the validator sees it, for the deck-building advice. */
  analyticsCards: StoreCard[];
  analyticsCommander?: StoreCard;
  onCardClick?: (row: DeckCardRow) => void;
  /** Take every copy out. Omit for a deck this reader cannot change. */
  onRemove?: (row: DeckCardRow) => void;
  /** Open the replace slide-over. Omit for a deck this reader cannot change. */
  onReplace?: (row: DeckCardRow) => void;
}

export function DeckLegalityPanel({
  rows,
  commanderRow,
  format,
  analyticsCards,
  analyticsCommander,
  onCardClick,
  onRemove,
  onReplace,
}: DeckLegalityPanelProps) {
  /* Which format's offenders are on screen. The deck's own to start with,
     because that is the question the tab exists to answer; the table below
     switches it, which is what makes "where else could I play this" a tool
     rather than a wall of ticks. */
  const [selected, setSelected] = useState<string>(() => format.toLowerCase());
  const [search, setSearch] = useState('');
  const [faultFilter, setFaultFilter] = useState<LegalityFault[]>([]);

  const view = useListingView({
    surface: 'deckmatrix.deck.legality.view',
    modes: OFFENDER_MODES,
    defaultSize: DEFAULT_CARD_SIZE,
  });

  const input = useMemo(() => ({ rows, commander: commanderRow ?? null }), [rows, commanderRow]);

  const verdicts = useMemo(() => deckFormatVerdicts(input), [input]);

  const ownFormat = format.toLowerCase();
  const ownVerdict = verdicts.find(v => v.format === ownFormat) ?? null;

  const faults = useMemo(() => cardFaults(input, selected), [input, selected]);
  const rules = useMemo(() => deckRules(input, selected), [input, selected]);

  /* Facets over the unfiltered faults, so a chip never disappears as you press
     it. Same rule the decklist's facets follow. */
  const faultCounts = useMemo(() => {
    const counts = new Map<LegalityFault, number>();
    for (const fault of faults) counts.set(fault.fault, (counts.get(fault.fault) ?? 0) + 1);
    return counts;
  }, [faults]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return faults.filter(fault => {
      if (faultFilter.length > 0 && !faultFilter.includes(fault.fault)) return false;
      if (!needle) return true;
      const row = fault.row;
      return (
        (row.card?.name || row.card_name).toLowerCase().includes(needle) ||
        (row.card?.type_line ?? '').toLowerCase().includes(needle)
      );
    });
  }, [faults, faultFilter, search]);

  /**
   * The deck-building advice, which is not legality.
   *
   * Recomputed here rather than lifted onto the page, because it is the only
   * consumer and it is cheap: `DeckValidator.validate` is eight passes over an
   * array the page already holds. It ran on every render inside a `useEffect`
   * with `setState` before, which is the same work plus a second render.
   */
  const warnings = useMemo<ValidationWarning[]>(
    () => DeckValidator.validate(analyticsCards, format, analyticsCommander),
    [analyticsCards, format, analyticsCommander]
  );

  const errors = warnings.filter(w => w.severity === 'error');
  const cautions = warnings.filter(w => w.severity === 'warning');
  const notes = warnings.filter(w => w.severity === 'info');

  const legalCount = verdicts.filter(v => v.legal).length;
  const activeCount = (search.trim() ? 1 : 0) + faultFilter.length;
  const clearEverything = useCallback(() => {
    setSearch('');
    setFaultFilter([]);
  }, []);
  const commitSearch = useCallback((next: string | undefined) => setSearch(next ?? ''), []);

  const toggleFault = (fault: LegalityFault) =>
    setFaultFilter(prev =>
      prev.includes(fault) ? prev.filter(f => f !== fault) : [...prev, fault]
    );

  const sizeRule = ownVerdict?.rules.find(r => r.id === 'size');
  /* Counted here rather than scraped back out of the rule's sentence. The rule
     carries its reading as words on purpose, and a tile wants the figure. */
  const deckSize =
    rows.reduce((sum, row) => sum + Math.max(1, row.quantity), 0) + (commanderRow ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* THE VERDICT, as figures rather than as a badge.
          `MetricRow` on the page ground, the same treatment My Decks
          established and the same one the metric strip above uses. This tab
          previously drew its verdict as a `Badge` reading "No Issues", which is
          the smallest possible rendering of the answer the whole tab is for. */}
      <MetricRow
        columns={4}
        metrics={[
          {
            id: 'to-fix',
            label: `Cards to fix in ${formatLabel(format)}`,
            value: ownVerdict ? String(ownVerdict.offendingRows) : '—',
            raw: ownVerdict?.offendingRows,
            subtext: ownVerdict
              ? ownVerdict.offendingRows === 0
                ? 'every card is allowed'
                : `${ownVerdict.offendingCopies} ${ownVerdict.offendingCopies === 1 ? 'copy' : 'copies'}`
              : 'this format reports no legality',
            emphasis: Boolean(ownVerdict && ownVerdict.offendingRows > 0),
          },
          {
            id: 'rules',
            label: 'Construction rules met',
            value: ownVerdict
              ? `${ownVerdict.rules.filter(r => r.ok).length}`
              : '—',
            raw: ownVerdict?.rules.filter(r => r.ok).length,
            suffix: ownVerdict && ownVerdict.rules.length > 0 ? `/${ownVerdict.rules.length}` : undefined,
            subtext: ownVerdict?.rulesKnown
              ? 'size, copies and the command zone'
              : 'this format’s rules are not modelled',
          },
          {
            id: 'size',
            label: 'Cards in the deck',
            value: String(deckSize),
            raw: deckSize,
            subtext: sizeRule ? sizeRule.label.toLowerCase() : 'commander included',
          },
          {
            id: 'formats',
            label: 'Formats it is legal in',
            value: String(legalCount),
            raw: legalCount,
            suffix: `/${verdicts.length}`,
            subtext: 'of the formats the catalogue tracks',
          },
        ]}
      />

      {/* WHERE ELSE COULD I PLAY THIS.
          Every format on the cards, legal ones first. Each tile is a control:
          pressing it changes which format the offenders below are measured
          against, which turns a table of ticks into the answer to "what would
          I have to change to take this to Modern". */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h3 className="text-lg font-semibold">Where this deck is legal</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Every format the cards in this deck carry a ruling for, read straight off the
              printings. Pick one to see what it would take. Formats it already passes come
              first.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {verdicts.map(verdict => {
              const active = verdict.format === selected;
              return (
                <button
                  key={verdict.format}
                  type="button"
                  onClick={() => setSelected(verdict.format)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/40 hover:bg-muted'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{verdict.label}</span>
                    {verdict.format === ownFormat && (
                      <span
                        className={cn(
                          'shrink-0 text-[0.6rem] uppercase tracking-wide',
                          active ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}
                      >
                        this deck
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block text-xs tabular-nums',
                      active ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    )}
                  >
                    {verdict.legal
                      ? 'Legal'
                      : `${verdict.offendingRows || 'Deck rules'} ${
                          verdict.offendingRows
                            ? verdict.offendingRows === 1
                              ? 'card'
                              : 'cards'
                            : ''
                        }`.trim()}
                  </span>
                </button>
              );
            })}
          </div>

          {verdicts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No card in this deck has synced legality data yet, so there is nothing to rule on.
            </p>
          )}
        </CardContent>
      </Card>

      {/* THE RULES OF THE SELECTED FORMAT, stated as rules.
          "This deck has 97 cards" on its own is a complaint. The rule beside
          the reading is what a player checking a deck before a game wants,
          whether it passes or not. */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">
              {formatKeyLabel(selected)} construction rules
            </h3>
            {selected !== ownFormat && (
              <Button variant="secondary" size="sm" onClick={() => setSelected(ownFormat)}>
                Back to {formatLabel(format)}
              </Button>
            )}
          </div>

          {rules.length === 0 ? (
            <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
              We hold every card’s ruling for {formatKeyLabel(selected)} and not its deck
              construction rules, so the cards below are checked and the deck size, copy limit
              and command zone are not. That is stated rather than assumed: guessing a
              four-of 60-card shape would be wrong for half the formats in this list.
            </p>
          ) : (
            <ul className="space-y-2">
              {rules.map(rule => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-muted/40 p-3"
                >
                  <span
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wide',
                      rule.ok ? 'text-muted-foreground' : 'text-destructive'
                    )}
                  >
                    {rule.ok ? 'Met' : 'Not met'}
                  </span>
                  <span className="text-sm font-medium">{rule.label}</span>
                  <span className="text-sm text-muted-foreground">· {rule.reading}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* THE CARDS. Large, uncropped, and each one carrying the way out. */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">
            {faults.length === 0
              ? `Nothing in this deck is illegal in ${formatKeyLabel(selected)}`
              : `Cards ${formatKeyLabel(selected)} will not accept`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One reason per card, worst first: a card that is banned is not also listed for
            being over the copy limit, because it is one card to take out either way.
          </p>
        </div>

        {faults.length > 0 && (
          <FilterBar
            view={view}
            activeCount={activeCount}
            onClear={clearEverything}
            search={
              <ListingSearch
                value={search}
                onCommit={commitSearch}
                placeholder="Name or type"
                label="Search the cards at fault"
              />
            }
            facets={FAULT_ORDER.filter(fault => faultCounts.has(fault)).map(fault => (
              <FacetChip
                key={fault}
                selected={faultFilter.includes(fault)}
                onClick={() => toggleFault(fault)}
              >
                {FAULT_LABEL[fault]}
                <span className="ml-1 tabular-nums opacity-70">{faultCounts.get(fault)}</span>
              </FacetChip>
            ))}
          />
        )}

        <ListingFrame
          view={view}
          count={filtered.length}
          summary={
            faults.length === 0
              ? undefined
              : resultSentence([matchedLabel(filtered.length, faults.length, 'card')])
          }
          empty={
            faults.length === 0
              ? {
                  icon: ShieldCheck,
                  title: `Every card is allowed in ${formatKeyLabel(selected)}`,
                  description:
                    rules.length > 0 && rules.some(r => !r.ok)
                      ? 'The deck-construction rules above are the only thing standing between this list and a legal deck.'
                      : 'Nothing here is banned, restricted, over the copy limit or outside your commander’s identity.',
                }
              : {
                  icon: Gavel,
                  title: 'No card matches these filters',
                  description: 'Clear a filter above to see the rest.',
                  onClearFilters: clearEverything,
                }
          }
        >
          {filtered.map(fault => (
            <DeckCardTile
              key={fault.row.id}
              card={{
                ...(fault.row.card ?? {}),
                id: fault.row.card_id,
                name: fault.row.card?.name || fault.row.card_name,
                image_uris: fault.row.card?.image_uris ?? null,
                mana_cost: fault.row.card?.mana_cost ?? null,
              }}
              width={view.size}
              onClick={onCardClick ? () => onCardClick(fault.row) : undefined}
              badge={
                fault.row.quantity > 1 ? <TileBadge>{fault.row.quantity}x</TileBadge> : undefined
              }
              caption={
                <span className="font-medium text-destructive">{FAULT_LABEL[fault.fault]}</span>
              }
              detail={fault.detail}
              actions={
                onRemove || onReplace ? (
                  <>
                    {onReplace && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onReplace(fault.row)}
                      >
                        Replace
                      </Button>
                    )}
                    {onRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => onRemove(fault.row)}
                      >
                        Remove
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />
          ))}
        </ListingFrame>
      </div>

      {/* THE ADVICE, WHICH IS NOT LEGALITY.
          Land counts, removal counts and win conditions are opinions about a
          deck, not rules about it. Filed under a shield beside the banned
          cards, "only 33 lands" read as a rules violation. Its own heading,
          its own words, below the thing that actually decides whether you can
          play the deck. */}
      {warnings.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-5 md:p-6">
            <div>
              <h3 className="text-lg font-semibold">What else this deck is short of</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                None of this makes the deck illegal. It is counted off the decklist: lands,
                removal, ramp, card draw and win conditions, against what a deck of this size
                in this format usually carries.
              </p>
            </div>

            {[
              { key: 'errors', title: 'Worth fixing', items: errors },
              { key: 'cautions', title: 'Worth a look', items: cautions },
              { key: 'notes', title: 'Worth knowing', items: notes },
            ]
              .filter(group => group.items.length > 0)
              .map(group => (
                <div key={group.key} className="space-y-2">
                  <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {group.title}
                    <span className="ml-2 tabular-nums opacity-70">{group.items.length}</span>
                  </h4>
                  {group.items.map((warning, index) => (
                    /* `bg-muted/40`, not `Alert` with a coloured left border.
                       Four `Alert` variants and an inline `borderLeftColor`
                       built from raw HSL was where the last raw hues in this
                       directory lived after `ModernDeckTile` went. */
                    <div
                      key={`${warning.category}-${index}`}
                      className="rounded-lg bg-muted/40 p-3"
                    >
                      <p className="text-sm font-medium">{warning.message}</p>
                      {warning.suggestion && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {warning.suggestion}
                        </p>
                      )}
                      {warning.affectedCards && warning.affectedCards.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {warning.affectedCards.join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DeckLegalityPanel;
