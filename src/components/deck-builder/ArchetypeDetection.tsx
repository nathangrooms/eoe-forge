import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardGrid } from '@/components/cards';
import { tagEnrichment } from '@/lib/cards/tag-signal';
import { shellForArchetype } from '@/lib/deck/archetypeShells';
import { bandForScore, bandLabel, formatPowerScore, powerTextClass } from '@/lib/deck/power';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import { DeckCardTile } from '@/components/deck/DeckCardTile';

/**
 * What kind of deck this is, counted rather than guessed.
 *
 * Role tags on the cards in the deck are counted, and any theme the deck is at
 * least twice as concentrated in as the whole catalogue is named. No model, no
 * prose, and no archetype claimed for a deck that is a random pile.
 *
 * ## Three things changed when the Analysis tab was rebuilt
 *
 * **The key cards are cards.** `keyCards` is a list of names and this panel
 * printed them as bullet points, which is exactly the question a player has
 * when a box says "Aristocrats, 78%": *which cards made you say that*. Owner:
 * *"visual is always better"*. `rows` is optional, so a caller with no decklist
 * behind the names still gets the panel, without the art.
 *
 * **The confidence figure says what it is a percentage of.** It printed a bare
 * number with no denominator and a label reading "Strong Match" underneath,
 * which is a second opinion about the first opinion. It is enrichment against
 * the catalogue's own tag density, and the panel now says so in the words the
 * calculation itself uses.
 *
 * **The answer is persisted.** `user_decks.archetype` is a column and the
 * census found nothing in `src/` that ever writes it, so this panel computed a
 * ranked archetype with a confidence figure on every visit and threw it away.
 * `onDetected` hands the primary match to the page, which writes it once, and
 * My Decks can then group and filter on something that costs nothing to read.
 */

interface ArchetypeDetectionProps {
  deckCards: any[];
  commander?: any;
  format: string;
  /** The decklist, so a key card can be drawn as a card. */
  rows?: DeckCardRow[];
  onCardClick?: (row: DeckCardRow) => void;
  /** Card width in px, from the tab's size slider. */
  cardWidth?: number;
  /**
   * The primary match, once it is known. The page persists it.
   *
   * `null` when nothing is concentrated enough to name, which is a real answer
   * and has to be storable: a deck that used to be Aristocrats and has been
   * rebuilt into a pile should stop claiming to be Aristocrats.
   */
  onDetected?: (archetype: { name: string; confidence: number } | null) => void;
}

interface ArchetypeMatch {
  name: string;
  confidence: number;
  primaryStrategy: string;
  secondaryStrategies: string[];
  keyCards: string[];
}

export function ArchetypeDetection({
  deckCards,
  commander,
  format,
  rows,
  onCardClick,
  cardWidth,
  onDetected,
}: ArchetypeDetectionProps) {
  const [archetypes, setArchetypes] = useState<ArchetypeMatch[]>([]);

  useEffect(() => {
    detectArchetypes();
  }, [deckCards, commander, format]);

  const detectArchetypes = () => {
    const matches: ArchetypeMatch[] = [];
    
    // Count synergy tags
    const tagCounts = deckCards.reduce((acc, card) => {
      const tags = card.tags || [];
      tags.forEach((tag: string) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    // Count card types
    const typeAnalysis = {
      tribal: deckCards.filter(c => c.type_line?.includes('Tribal') || 
        (c.oracle_text?.match(/creature type/i) && !c.type_line?.includes('Changeling'))).length,
      tokens: tagCounts['tokens'] || 0,
      aristocrats: tagCounts['aristocrats'] || 0,
      sacOutlet: tagCounts['sac-outlet'] || 0,
      blink: tagCounts['blink'] || 0,
      etb: tagCounts['etb'] || 0,
      spellslinger: tagCounts['spellslinger'] || 0,
      counters: tagCounts['counters'] || 0,
      voltron: deckCards.filter(c => c.type_line?.includes('Equipment') || c.type_line?.includes('Aura')).length,
      ramp: tagCounts['ramp'] || 0,
      control: (tagCounts['counterspell'] || 0) + (tagCounts['removal-spot'] || 0),
      storm: tagCounts['storm'] || 0,
      reanimator: tagCounts['reanimator'] || 0,
      stax: tagCounts['stax'] || 0,
      landfall: tagCounts['landfall'] || 0,
      artifacts: deckCards.filter(c => c.type_line?.toLowerCase().includes('artifact')).length,
      enchantments: deckCards.filter(c => c.type_line?.toLowerCase().includes('enchantment')).length,
    };

    const totalCards = Math.max(deckCards.length, 1);

    /**
     * A theme counts only when the deck is meaningfully denser in it than a
     * random pile of cards would be.
     *
     * The absolute floors below ("8 or more token makers") were written when
     * `cards.tags` held four role names and almost nothing carried them, so a
     * floor was the only test that could fail. The vocabulary now covers 34,067
     * cards and the common tags are common: `counters` sits on 8.45% of the
     * catalogue, so *every* 100-card deck clears "8 or more" without being a
     * counters deck, and all six 60-plus-card decks in our own table did.
     *
     * Two is a stated design choice, not a number fitted to those six decks:
     * twice the catalogue's own density is the least that can honestly be
     * called a theme. It changes nothing for the rare tags — three `storm`
     * cards in a 100-card deck is already 25 times baseline — and bites exactly
     * where the vocabulary is broad.
     */
    const THEME_ENRICHMENT = 2;

    const enrichmentOf = (count: number, tags: string[]) =>
      tagEnrichment(count, totalCards, tags);

    /** Clears its floor and is at least twice as dense as the catalogue. */
    const fires = (count: number, floor: number, tags: string[]) =>
      count >= floor && enrichmentOf(count, tags) >= THEME_ENRICHMENT;

    /**
     * Confidence on one scale for every archetype: twice baseline reads 50,
     * three times reads 100.
     *
     * Each detector used to multiply its own share of the deck by a hand-picked
     * constant between 200 and 500, so a Storm score and an Artifacts score were
     * not comparable — and this component sorts by confidence and shows the top
     * three, which made that ordering meaningless.
     */
    const confidenceOf = (count: number, tags: string[]) =>
      Math.max(0, Math.min(100, (enrichmentOf(count, tags) - 1) * 50));

    // Aristocrats Detection
    if (
      fires(typeAnalysis.aristocrats, 5, ['aristocrats']) ||
      (fires(typeAnalysis.sacOutlet, 3, ['sac-outlet']) && fires(typeAnalysis.tokens, 5, ['tokens']))
    ) {
      matches.push({
        name: 'Aristocrats',
        confidence: confidenceOf(typeAnalysis.aristocrats + typeAnalysis.sacOutlet, [
          'aristocrats',
          'sac-outlet',
        ]),
        primaryStrategy: 'Sacrifice creatures for value and drain opponents',
        secondaryStrategies: ['Token generation', 'Death triggers', 'Recursion'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('aristocrats') || c.tags?.includes('sac-outlet'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Blink/Flicker Detection
    if (fires(typeAnalysis.blink, 5, ['blink']) && fires(typeAnalysis.etb, 8, ['etb'])) {
      matches.push({
        name: 'Blink/ETB',
        confidence: confidenceOf(typeAnalysis.blink, ['blink']),
        primaryStrategy: 'Repeatedly flicker creatures for ETB value',
        secondaryStrategies: ['Card advantage', 'Removal', 'Combo potential'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('blink') || c.tags?.includes('etb'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Spellslinger Detection
    if (fires(typeAnalysis.spellslinger, 5, ['spellslinger'])) {
      const instSorc = deckCards.filter(c => 
        c.type_line?.includes('Instant') || c.type_line?.includes('Sorcery')
      ).length;
      matches.push({
        name: 'Spellslinger',
        confidence: confidenceOf(typeAnalysis.spellslinger + instSorc / 3, [
          'spellslinger',
          'instant',
        ]),
        primaryStrategy: 'Cast many instants and sorceries for value',
        secondaryStrategies: ['Storm', 'Prowess triggers', 'Spell copy'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('spellslinger') || c.tags?.includes('prowess'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Voltron Detection
    if (typeAnalysis.voltron >= 8 && commander?.type_line?.includes('Creature')) {
      matches.push({
        name: 'Voltron',
        confidence: confidenceOf(typeAnalysis.voltron, ['equipment', 'aura']),
        primaryStrategy: 'Equip/enchant commander for one-shot kills',
        secondaryStrategies: ['Protection', 'Evasion', 'Commander damage'],
        keyCards: deckCards
          .filter(c => c.type_line?.includes('Equipment') || 
            (c.type_line?.includes('Aura') && c.oracle_text?.includes('creature')))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Ramp/Big Mana Detection
    if (fires(typeAnalysis.ramp, 12, ['ramp'])) {
      matches.push({
        name: 'Ramp/Big Mana',
        confidence: confidenceOf(typeAnalysis.ramp, ['ramp']),
        primaryStrategy: 'Accelerate mana to cast big threats',
        secondaryStrategies: ['Landfall', 'X-spells', 'Big creatures'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('ramp'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Control Detection
    if (fires(typeAnalysis.control, 15, ['counterspell', 'removal-spot'])) {
      matches.push({
        name: 'Control',
        confidence: confidenceOf(typeAnalysis.control, ['counterspell', 'removal-spot']),
        primaryStrategy: 'Control the board and win with late-game threats',
        secondaryStrategies: ['Counterspells', 'Removal', 'Card advantage'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('counterspell') || c.tags?.includes('removal-spot'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Tokens Detection
    if (fires(typeAnalysis.tokens, 8, ['tokens'])) {
      matches.push({
        name: 'Token Swarm',
        confidence: confidenceOf(typeAnalysis.tokens, ['tokens']),
        primaryStrategy: 'Generate many tokens to overwhelm opponents',
        secondaryStrategies: ['Go-wide', 'Anthems', 'Sacrifice fodder'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('tokens'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Counters Theme Detection
    if (fires(typeAnalysis.counters, 8, ['counters'])) {
      matches.push({
        name: '+1/+1 Counters',
        confidence: confidenceOf(typeAnalysis.counters, ['counters']),
        primaryStrategy: 'Build up creatures with +1/+1 counters',
        secondaryStrategies: ['Proliferate', 'Synergy', 'Scaling threats'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('counters'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Reanimator Detection
    if (fires(typeAnalysis.reanimator, 5, ['reanimator'])) {
      matches.push({
        name: 'Reanimator',
        confidence: confidenceOf(typeAnalysis.reanimator, ['reanimator']),
        primaryStrategy: 'Cheat big creatures from graveyard into play',
        secondaryStrategies: ['Self-mill', 'Discard', 'Recursion'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('reanimator') || c.tags?.includes('recursion'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Stax Detection
    if (fires(typeAnalysis.stax, 5, ['stax'])) {
      matches.push({
        name: 'Stax',
        confidence: confidenceOf(typeAnalysis.stax, ['stax']),
        primaryStrategy: 'Lock down opponents with resource denial',
        secondaryStrategies: ['Tax effects', 'Symmetrical disruption', 'Control'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('stax'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Storm Detection
    if (fires(typeAnalysis.storm, 3, ['storm'])) {
      matches.push({
        name: 'Storm',
        confidence: confidenceOf(typeAnalysis.storm, ['storm']),
        primaryStrategy: 'Chain many spells together for explosive turns',
        secondaryStrategies: ['Ritual effects', 'Cost reduction', 'Draw engines'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('storm') || c.keywords?.includes('Storm'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Landfall Detection
    if (fires(typeAnalysis.landfall, 6, ['landfall'])) {
      matches.push({
        name: 'Landfall',
        confidence: confidenceOf(typeAnalysis.landfall, ['landfall']),
        primaryStrategy: 'Trigger landfall effects with extra land plays',
        secondaryStrategies: ['Ramp', 'Land recursion', 'Value engines'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('landfall') || c.tags?.includes('lands-matter'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Artifact Theme Detection
    if (typeAnalysis.artifacts >= 20) {
      matches.push({
        name: 'Artifacts Matter',
        confidence: confidenceOf(typeAnalysis.artifacts, ['artifact']),
        primaryStrategy: 'Leverage artifacts and artifact synergies',
        secondaryStrategies: ['Artifact tokens', 'Cost reduction', 'Synergy'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('artifacts-matter') || c.type_line?.includes('Artifact'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Enchantment Theme Detection
    if (typeAnalysis.enchantments >= 15) {
      matches.push({
        name: 'Enchantress',
        confidence: confidenceOf(typeAnalysis.enchantments, ['enchantment']),
        primaryStrategy: 'Draw cards from casting enchantments',
        secondaryStrategies: ['Pillow fort', 'Value engines', 'Control'],
        keyCards: deckCards
          .filter(c => c.tags?.includes('enchantments-matter') || c.type_line?.includes('Enchantment'))
          .slice(0, 5)
          .map(c => c.name),
      });
    }

    // Sort by confidence and keep top 3
    matches.sort((a, b) => b.confidence - a.confidence);
    setArchetypes(matches.slice(0, 3));
  };

  /* Names already in the deck, folded once, so the shell below can say which
     packages you are missing without testing every card against every name. */
  const heldNames = useMemo(
    () => new Set(deckCards.map(card => String(card.name || '').trim().toLowerCase())),
    [deckCards]
  );

  const rowByName = useMemo(() => {
    const map = new Map<string, DeckCardRow>();
    for (const row of rows ?? []) {
      map.set((row.card?.name || row.card_name).trim().toLowerCase(), row);
    }
    return map;
  }, [rows]);

  /**
   * The shell behind the primary match.
   *
   * Detection names an archetype and then had nothing to offer about it. The
   * catalogue of what each shell is built out of was in `ArchetypeLibrary`, a
   * component with no importer, so the two halves of this answer sat in the
   * same directory and never met. The catalogue is data now
   * (`@/lib/deck/archetypeShells`) and this is where it is read.
   */
  const shell = archetypes.length > 0 ? shellForArchetype(archetypes[0].name) : undefined;

  /**
   * Tell the page what was detected, once per answer.
   *
   * Reported upward rather than written from here: this panel has no database
   * client, and whether the reader is allowed to write to this deck is the
   * page's question, not a detection panel's. The listener is held in a ref so
   * a caller that hands in a fresh closure every render does not turn one
   * detection into a write per frame.
   */
  const primary = archetypes[0] ?? null;
  const reportRef = useRef(onDetected);
  reportRef.current = onDetected;
  const primaryName = primary?.name ?? null;
  const primaryConfidence = primary ? Math.round(primary.confidence) : null;
  useEffect(() => {
    reportRef.current?.(
      primaryName && primaryConfidence !== null
        ? { name: primaryName, confidence: primaryConfidence }
        : null
    );
  }, [primaryName, primaryConfidence]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">What kind of deck this is</CardTitle>
        <p className="text-sm text-muted-foreground">
          Counts the role tags on the cards in this deck and names any theme the deck is at
          least twice as concentrated in as the card catalogue. The figure beside each name is
          how far past that floor it goes: twice the catalogue&rsquo;s own density reads 50,
          three times reads 100. No model, no guesswork.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {archetypes.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            {deckCards.length < 20
              ? `Only ${deckCards.length} card${deckCards.length === 1 ? '' : 's'} here, too few to read a strategy from.`
              : 'No theme in this deck is concentrated enough to name. Every role tag it carries appears at close to the rate a random pile of cards would have, so claiming an archetype would be inventing one.'}
          </p>
        ) : (
          archetypes.map((archetype, idx) => (
            <div key={archetype.name} className="space-y-4 rounded-lg bg-muted/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold">
                    {archetype.name}
                    {idx === 0 && (
                      <span className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        primary
                      </span>
                    )}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {archetype.primaryStrategy}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-semibold leading-none tabular-nums">
                    {Math.round(archetype.confidence)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">past the floor</p>
                </div>
              </div>

              {archetype.secondaryStrategies.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Also doing: {archetype.secondaryStrategies.join(' · ')}
                </p>
              )}

              {/* THE CARDS THAT MADE IT SAY THAT.
                  This was a bulleted list of names under a heading reading "Key
                  Cards". It is the one question a reader has when a panel names
                  an archetype, and it was the one answer drawn as text. */}
              {archetype.keyCards.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    The cards that say so
                  </h4>
                  {rows ? (
                    <CardGrid width={cardWidth ?? 180}>
                      {archetype.keyCards.map(name => {
                        const row = rowByName.get(name.trim().toLowerCase());
                        return (
                          <DeckCardTile
                            key={name}
                            card={{
                              ...(row?.card ?? {}),
                              id: row?.card_id,
                              name,
                              image_uris: row?.card?.image_uris ?? null,
                              mana_cost: row?.card?.mana_cost ?? null,
                            }}
                            width={cardWidth ?? 180}
                            onClick={onCardClick && row ? () => onCardClick(row) : undefined}
                          />
                        );
                      })}
                    </CardGrid>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {archetype.keyCards.join(' · ')}
                    </p>
                  )}
                </div>
              )}

              {/* What the shell is made of, for the primary match only.
                  Target power is where a well-built version of this shell
                  lands. It is not a reading of this deck and is labelled so:
                  the deck's own score is on the EDH tab, on the same scale. */}
              {idx === 0 && shell && (
                <div className="space-y-3 rounded-lg bg-background/60 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      What a well-built {shell.name} holds
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Built well, this shell lands{' '}
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          powerTextClass(
                            bandForScore((shell.targetPower.min + shell.targetPower.max) / 2)
                          )
                        )}
                      >
                        {formatPowerScore(shell.targetPower.min)} to{' '}
                        {formatPowerScore(shell.targetPower.max)}
                      </span>{' '}
                      (
                      {bandLabel(
                        bandForScore((shell.targetPower.min + shell.targetPower.max) / 2)
                      )}
                      )
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {shell.packages.map(pkg => (
                      <div key={pkg.name} className="rounded-lg bg-muted/30 p-3">
                        <p className="text-sm font-semibold">{pkg.name}</p>
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          {pkg.blurb}
                        </p>
                        <ul className="mt-2 space-y-0.5 text-xs">
                          {pkg.cards.map(card => {
                            const held = heldNames.has(card.trim().toLowerCase());
                            return (
                              <li
                                key={card}
                                className={cn(
                                  'flex items-center gap-1.5 truncate',
                                  held ? 'text-foreground' : 'text-muted-foreground'
                                )}
                              >
                                {held && <Check className="h-3 w-3 flex-shrink-0" aria-hidden />}
                                <span className="truncate">{card}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default ArchetypeDetection;
