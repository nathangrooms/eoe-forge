/**
 * The deck optimiser.
 *
 * Rebuilt around card art. The brief was "cannot see anything, all so small",
 * and the honest diagnosis was that a tool whose entire job is proposing card
 * swaps was rendering those swaps as text rows with 64px thumbnails. A swap is
 * two cards; it now looks like two cards.
 *
 * Data flow is unchanged — the `deck-optimizer` edge function is still the only
 * source of suggestions, and every field read here is one it actually returns
 * (checked against `supabase/functions/deck-optimizer/index.ts`, not assumed).
 * Three things about how those fields are *handled* did change:
 *
 *   - Prices are `number | null`. `Number(prices.usd) || 0` turned "Scryfall has
 *     no USD price for this printing" into "$0.00", and a swap total built from
 *     those zeroes understated the bill.
 *   - `edhImpact` is `number | null` and is only rendered when the model
 *     actually returned one. It used to be defaulted to 0.2 / 0.1 / -0.1 on the
 *     way in, so a model that skipped the field produced a confident badge made
 *     of nothing.
 *   - Castability comes from `@/lib/deck/playability` — the exact, tested
 *     engine — for everything the panel displays, so the number beside a card
 *     and the mana-impact delta underneath it are the same measurement.
 */

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Plus,
  Library,
  Trash2,
  Mountain,
  Target,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { scryfallAPI } from '@/lib/api/scryfall';
import { EdhAnalysisData } from './EdhAnalysisPanel';
import type { DeckPower } from '@/lib/deck/power';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  createPlayabilityEngine,
  type DeckPlayability,
  type PlayabilityCardInput,
} from '@/lib/deck/playability';
import { hardestToCast, playabilityBand } from '@/lib/deck/playabilityView';
import { OptimizerProgress } from './optimizer/OptimizerProgress';
import { OptimizerOverview, type HardToCastCard } from './optimizer/OptimizerOverview';
import { AdditionsSection, AdditionSuggestion } from './optimizer/AdditionsSection';
import { RemovalsSection, RemovalSuggestion } from './optimizer/RemovalsSection';
import { SwapsSection, SwapSuggestion } from './optimizer/SwapsSection';
import {
  LandRecommendationsSection,
  LandRecommendation,
} from './optimizer/LandRecommendationsSection';
import { castabilityOnDeck, measureManaImpact } from './optimizer/manaImpact';

interface AnalysisResult {
  issues: Array<{ card: string; reason: string; severity: 'high' | 'medium' | 'low'; category?: string }>;
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  summary: string;
  /**
   * `null` when the response carried no category scores. Never substituted
   * here — the overview renders the section only when this is present.
   */
  categories: {
    synergy: number;
    consistency: number;
    power: number;
    interaction: number;
    manabase: number;
  } | null;
  /**
   * Whether the model scored those categories or the edge function derived them
   * from role and land counts. The function reports this because it substitutes
   * a derived set of its own; passing the flag on is what lets the overview
   * label the two differently instead of presenting both as the model's read.
   */
  categoriesSource: 'model' | 'measured' | null;
}

/**
 * The shape the panel needs from a deck row.
 *
 * Wider than it was: `oracle_text` and `color_identity` are what let the
 * castability engine tell a Mountain from a red creature and a Sol Ring from a
 * Llanowar Elves, and `image_uris` is what lets a card in the deck be drawn as
 * a card without a second Scryfall round trip.
 */
export interface OptimizerDeckCard {
  id: string;
  name: string;
  quantity?: number;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  oracle_text?: string;
  color_identity?: string[];
  image_uris?: Record<string, string>;
  card_faces?: any[];
  prices?: { usd?: string };
}

interface AIOptimizerPanelProps {
  deckId: string;
  deckName: string;
  deckCards: OptimizerDeckCard[];
  format?: string;
  commander?: OptimizerDeckCard & { name: string };
  /**
   * The canonical score. This used to be `edhPowerLevel ?? deck.powerLevel` —
   * a third-party scrape or, failing that, a stale integer — so the model was
   * briefed with a different power level here than in the Brain panel one tab
   * across, and the coaching contradicted itself.
   */
  power?: DeckPower | null;
  edhAnalysis?: EdhAnalysisData | null;
  /**
   * Apply swaps. `remove` and `add` are card names, as they always were.
   *
   * `addCardId` and `addCard` are additive and may be ignored: a caller that
   * writes to the database resolves the name itself, but a caller holding a
   * deck that has not been saved yet needs the card in hand. See
   * `toReplacement`.
   */
  onApplyReplacements: (
    replacements: Array<{
      remove: string;
      add: string;
      addCardId?: string | null;
      addCard?: any;
    }>
  ) => void;
  onAddCard?: (cardName: string) => void;
  onRemoveCard?: (cardName: string) => void;
}

/** Scryfall prices are strings and are frequently absent. Absent is not zero. */
function usdPrice(prices: any): number | null {
  const raw = prices?.usd;
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The model's estimate, or nothing. Never a stand-in constant. */
function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Normalise either a deck row or a Scryfall card into the engine's input. */
function toPlayabilityInput(card: any, isCommander = false): PlayabilityCardInput | null {
  if (!card?.name) return null;
  return {
    name: card.name,
    type_line: card.type_line ?? '',
    mana_cost: card.mana_cost ?? null,
    cmc: typeof card.cmc === 'number' ? card.cmc : null,
    oracle_text: card.oracle_text ?? null,
    color_identity: card.color_identity ?? null,
    quantity: isCommander ? 1 : card.quantity ?? 1,
    isCommander,
  };
}

export function AIOptimizerPanel({
  deckId,
  deckName,
  deckCards = [],
  format,
  commander,
  power,
  edhAnalysis,
  onApplyReplacements,
  onAddCard,
  onRemoveCard,
}: AIOptimizerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [additionSuggestions, setAdditionSuggestions] = useState<AdditionSuggestion[]>([]);
  const [removalSuggestions, setRemovalSuggestions] = useState<RemovalSuggestion[]>([]);
  const [swapSuggestions, setSwapSuggestions] = useState<SwapSuggestion[]>([]);
  const [landRecommendations, setLandRecommendations] = useState<LandRecommendation[]>([]);
  /*
   * Both `null` until the edge function reports them, and both stay `null` if
   * it does not. They used to initialise to 0 and 37, which meant a response
   * that omitted the fields rendered "0 / 37 lands · 37 short of the target" as
   * the largest number on the tab — a headline made entirely of two constants
   * chosen here. The 37 is a real Commander convention, but a convention that
   * nothing measured is still not this deck's target.
   */
  const [landCount, setLandCount] = useState<number | null>(null);
  const [idealLandCount, setIdealLandCount] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingMoreSwaps, setIsLoadingMoreSwaps] = useState(false);
  const [showConfirmSwaps, setShowConfirmSwaps] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [useCollection, setUseCollection] = useState(false);

  const isCommander = format?.toLowerCase() === 'commander' || format?.toLowerCase() === 'edh';
  const requiredCards = isCommander ? 100 : 60;

  const cardQuantityTotal = deckCards.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const totalCardsWithCommander =
    isCommander && commander ? cardQuantityTotal + 1 : cardQuantityTotal;
  const missingCards = Math.max(0, requiredCards - totalCardsWithCommander);
  const excessCards = Math.max(0, totalCardsWithCommander - requiredCards);
  const isDeckComplete = totalCardsWithCommander === requiredCards;

  const deckStatus =
    missingCards > 0 ? 'incomplete' : excessCards > 0 ? 'overloaded' : 'complete';

  /**
   * The decklist in the castability engine's terms, commander included and
   * flagged so it is kept out of the library count.
   */
  const playabilityDeck = useMemo<PlayabilityCardInput[]>(() => {
    const cards = deckCards
      .map(card => toPlayabilityInput(card))
      .filter((c): c is PlayabilityCardInput => c !== null);
    const commanderInput = commander ? toPlayabilityInput(commander, true) : null;
    if (commanderInput) cards.push(commanderInput);
    return cards;
  }, [deckCards, commander]);

  /**
   * Memoised on the decklist. Constructing the engine only reads the mana base;
   * the roll-up behind `engine.deck()` is lazy and memoised inside the engine,
   * so it is solved at most once per decklist however many callers ask.
   *
   * It is not, however, deferred until an analysis exists — `lowPlayabilityPreview`
   * below runs it as soon as there are cards, because the pre-analysis preview
   * is the whole point of that block. Saying otherwise here would be a comment
   * describing code twenty lines further down that does the opposite.
   */
  const engine = useMemo(
    () => (playabilityDeck.length > 0 ? createPlayabilityEngine(playabilityDeck) : null),
    [playabilityDeck]
  );

  const hasResults =
    Boolean(analysis) ||
    additionSuggestions.length > 0 ||
    removalSuggestions.length > 0 ||
    swapSuggestions.length > 0 ||
    landRecommendations.length > 0;

  /** Deck-wide castability. Only solved once there is an analysis to sit beside. */
  const deckPlayabilityResult = useMemo<DeckPlayability | null>(() => {
    if (!engine || !hasResults) return null;
    try {
      return engine.deck();
    } catch (e) {
      // A castability failure must never take the analysis down with it.
      console.error('Playability roll-up failed', e);
      return null;
    }
  }, [engine, hasResults]);

  /**
   * The worst offenders, with their art, for the overview.
   *
   * `hardestToCast` is the deck page's own selection rule, reused rather than
   * re-derived — otherwise the optimiser and the deck page would each pick
   * their own ceiling and disagree about which cards are the problem.
   */
  const hardToCast = useMemo<HardToCastCard[]>(() => {
    if (!deckPlayabilityResult) return [];
    const byName = new Map(deckCards.map(c => [c.name.toLowerCase(), c]));
    return hardestToCast(deckPlayabilityResult, 6)
      .map(c => {
        const source = byName.get(c.name.toLowerCase());
        return source ? { name: c.name, card: source, pct: c.pct as number, turn: c.turn } : null;
      })
      .filter((c): c is HardToCastCard => c !== null);
  }, [deckPlayabilityResult, deckCards]);

  /** Cards the panel previews as hard to cast before an analysis has been run. */
  const lowPlayabilityPreview = useMemo(() => {
    if (!engine || deckCards.length === 0) return [];
    try {
      return engine
        .deck()
        .cards.filter(c => c.pct !== null && !c.isCommander && c.pct < 40)
        .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))
        .slice(0, 10);
    } catch {
      return [];
    }
  }, [engine, deckCards.length]);

  /**
   * What the edge function is told about weak cards.
   *
   * Deliberately still sourced from `edhAnalysis`, unchanged: the prompt shape
   * the deployed function parses is `edhAnalysis.cardAnalysis[].playability`,
   * and swapping the *input* to the model is a behavioural change that belongs
   * in its own commit, not in a visual overhaul.
   */
  const edhLowPlayabilityCards = useMemo(
    () =>
      (edhAnalysis?.cardAnalysis || [])
        .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
        .sort((a, b) => (a.playability || 0) - (b.playability || 0))
        .slice(0, 10),
    [edhAnalysis]
  );

  // No counts reported means no known land problem, not a problem of size 37.
  const hasLandIssues =
    landCount !== null && idealLandCount !== null && Math.abs(landCount - idealLandCount) > 2;

  const deckContextPayload = () => ({
    id: deckId,
    name: deckName,
    format,
    commander,
    cards: deckCards.map(c => ({
      name: c.name,
      type_line: c.type_line,
      mana_cost: c.mana_cost,
      cmc: c.cmc,
      quantity: c.quantity || 1,
    })),
    power: power
      ? {
          score: power.score,
          band: power.band,
          bracket: power.bracket,
          subscores: power.subscores,
        }
      : null,
  });

  const edhAnalysisPayload = () =>
    edhAnalysis
      ? {
          metrics: edhAnalysis.metrics,
          cardAnalysis: edhLowPlayabilityCards.map(c => ({
            name: c.name,
            playability: c.playability,
            isCommander: false,
          })),
          tippingPoint: edhAnalysis.metrics?.tippingPoint,
          efficiency: edhAnalysis.metrics?.efficiency,
          impact: edhAnalysis.metrics?.impact,
        }
      : null;

  const generateOptimizations = async (fromCollection = false) => {
    setLoading(true);
    setLoadingStep(0);
    setError('');
    setUseCollection(fromCollection);

    try {
      let collectionCards: string[] = [];
      if (fromCollection) {
        setLoadingCollection(true);
        setLoadingStep(0);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_collections')
            .select('card_name')
            .eq('user_id', user.id);
          collectionCards = (data || []).map(c => c.card_name);
        }
        setLoadingCollection(false);
      }

      setLoadingStep(1);

      const { data, error: fnError } = await supabase.functions.invoke('deck-optimizer', {
        body: {
          deckContext: deckContextPayload(),
          edhAnalysis: edhAnalysisPayload(),
          useCollection: fromCollection,
          collectionCards: collectionCards.slice(0, 200),
        },
      });

      if (fnError) {
        const errMsg = String(fnError?.message || fnError);
        if (/429|rate/i.test(errMsg)) throw new Error('RATE_LIMIT');
        if (/402|payment|credit/i.test(errMsg)) throw new Error('PAYMENT_REQUIRED');
        throw fnError;
      }

      if (data?.error) {
        if (data.type === 'rate_limit' || /rate/i.test(data.error)) throw new Error('RATE_LIMIT');
        if (data.type === 'payment_required' || /credit|payment/i.test(data.error)) {
          throw new Error('PAYMENT_REQUIRED');
        }
        throw new Error(data.error);
      }

      setLoadingStep(2);

      if (!data?.analysis) throw new Error('No analysis returned');

      const parsed = data.analysis;
      setAnalysis({
        summary: parsed.summary || '',
        issues: parsed.issues || [],
        strengths: parsed.strengths || [],
        strategy: parsed.strategy || [],
        manabase: parsed.manabase || [],
        // Absent categories render nothing rather than five invented bars.
        categories: parsed.categories ?? null,
        categoriesSource:
          parsed.categoriesSource === 'model' || parsed.categoriesSource === 'measured'
            ? parsed.categoriesSource
            : null,
      });

      setLoadingStep(3);

      const [additions, removals, swaps, lands] = await Promise.all([
        buildAdditions(parsed.additions || [], collectionCards),
        buildRemovals(parsed.removals || []),
        buildSwaps(parsed.replacements || [], collectionCards),
        buildLands(parsed.landRecommendations || []),
      ]);

      setAdditionSuggestions(additions);
      setRemovalSuggestions(removals);
      setSwapSuggestions(swaps);
      setLandRecommendations(lands);

      if (parsed.landCount !== undefined) setLandCount(parsed.landCount);
      if (parsed.idealLandCount !== undefined) setIdealLandCount(parsed.idealLandCount);

      setActiveTab('overview');
      toast.success('Analysis complete');
    } catch (err: any) {
      console.error('Optimizer error:', err);
      const msg = String(err?.message || err);
      if (msg === 'RATE_LIMIT' || /429|rate/i.test(msg)) {
        setError('Rate limit exceeded. Please wait 30-60 seconds and try again.');
      } else if (msg === 'PAYMENT_REQUIRED' || /402|credit|payment/i.test(msg)) {
        setError('AI credits required. Please add credits in Settings → Workspace → Usage.');
      } else {
        setError('Failed to generate analysis. Please try again.');
      }
    } finally {
      setLoading(false);
      setLoadingCollection(false);
    }
  };

  /**
   * The whole Scryfall card is kept, not just an image URL.
   *
   * `<CardImage>` needs the card object to pick a resolution and to flip a
   * double-faced card; the old code threw everything but `image_uris.normal`
   * away, which is why every MDFC in the optimiser showed only its front and
   * why the art was soft at any size above a thumbnail.
   */
  const fetchCard = async (cardName: string): Promise<any | null> => {
    try {
      return await scryfallAPI.getCardByName(cardName);
    } catch (e) {
      console.error(`Failed to fetch card: ${cardName}`, e);
      return null;
    }
  };

  const findDeckCard = (name: string): OptimizerDeckCard | undefined =>
    deckCards.find(c => c.name.toLowerCase() === name.toLowerCase());

  /** Castability of a card that is already in the deck, from the local engine. */
  const deckCardPlayability = (name: string): number | null => {
    const source = findDeckCard(name);
    if (!engine || !source) return null;
    const input = toPlayabilityInput(source);
    if (!input) return null;
    try {
      return engine.card(input).pct;
    } catch {
      return null;
    }
  };

  const buildAdditions = async (
    additions: any[],
    collectionCards: string[]
  ): Promise<AdditionSuggestion[]> => {
    const results: AdditionSuggestion[] = [];
    const batchSize = 5;

    for (let i = 0; i < additions.length; i += batchSize) {
      const batch = additions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async add => {
          const card = await fetchCard(add.name);
          if (!card) return null;
          return {
            name: add.name,
            card,
            price: usdPrice(card.prices),
            reason: add.reason || '',
            type: add.type || card.type_line,
            priority: add.priority || 'medium',
            category: add.category || 'Other',
            inCollection: collectionCards.some(
              c => c.toLowerCase() === String(add.name).toLowerCase()
            ),
            edhImpact: optionalNumber(add.edhImpact),
            // How castable this would be on the mana base the deck already has.
            castability: engine ? castabilityOnDeck(engine.profile, toPlayabilityInput(card)) : null,
            selected: false,
          } as AdditionSuggestion;
        })
      );
      results.push(...(batchResults.filter(Boolean) as AdditionSuggestion[]));
    }
    return results;
  };

  const buildRemovals = async (removals: any[]): Promise<RemovalSuggestion[]> => {
    const results: RemovalSuggestion[] = [];

    for (const removal of removals.slice(0, 15)) {
      // The card is already in the deck, so its art is already local — no
      // Scryfall round trip unless the row is missing images.
      const local = findDeckCard(removal.name);
      const card = local?.image_uris || local?.card_faces ? local : await fetchCard(removal.name);
      if (!card) continue;

      results.push({
        name: removal.name,
        card,
        price: usdPrice((card as any).prices),
        reason: removal.reason || '',
        type: (card as any).type_line,
        priority: removal.priority || 'medium',
        playability: deckCardPlayability(removal.name),
        edhImpact: optionalNumber(removal.edhImpact),
        selected: false,
      });
    }
    return results;
  };

  const buildSwaps = async (
    replacements: any[],
    collectionCards: string[]
  ): Promise<SwapSuggestion[]> => {
    const results: SwapSuggestion[] = [];

    for (const rep of replacements.slice(0, 15)) {
      const localOut = findDeckCard(rep.remove);
      const [outCard, inCard] = await Promise.all([
        localOut?.image_uris || localOut?.card_faces ? Promise.resolve(localOut) : fetchCard(rep.remove),
        fetchCard(rep.add),
      ]);

      if (!outCard || !inCard) continue;

      /*
       * The mana consequence, measured rather than guessed.
       *
       * `measureManaImpact` returns null for any swap that leaves the mana base
       * untouched — which is most of them — and only then does it pay for the
       * per-card solve. That gate is what keeps fifteen swaps from costing
       * fifteen full deck roll-ups, and it is also the reason a percentage does
       * not appear on rows where it would mean nothing.
       */
      let manaImpact = null;
      try {
        manaImpact = measureManaImpact(
          playabilityDeck,
          toPlayabilityInput(outCard),
          toPlayabilityInput(inCard)
        );
      } catch (e) {
        console.error('Mana impact failed for swap', rep.remove, rep.add, e);
      }

      results.push({
        currentCard: {
          name: rep.remove,
          card: outCard,
          price: usdPrice((outCard as any).prices),
          reason: rep.removeReason || '',
          playability: deckCardPlayability(rep.remove),
        },
        newCard: {
          name: rep.add,
          card: inCard,
          price: usdPrice(inCard.prices),
          reason: rep.addBenefit || '',
          type: rep.addType || inCard.type_line,
          inCollection: collectionCards.some(
            c => c.toLowerCase() === String(rep.add).toLowerCase()
          ),
          synergy: rep.synergy || undefined,
          // The id from OUR table, not Scryfall's. See `SwapSuggestion.newCard.cardId`.
          cardId: typeof rep.addCardId === 'string' ? rep.addCardId : null,
        },
        priority: rep.priority || 'medium',
        category: rep.category || undefined,
        edhImpact: optionalNumber(rep.edhImpact),
        manaImpact,
        /*
         * Scored against the base the card would actually arrive on.
         *
         * `engine.profile` is the deck as it stands. For a spell-for-spell swap
         * that is the right base and the two are identical. For a swap that
         * moves the mana base it is the wrong one, and wrong in the direction
         * that flatters the suggestion: the row above says "cutting this land
         * costs you three points" and the line below quoted the newcomer's odds
         * on a base that still had the land in it.
         */
        addCastability: castabilityOnDeck(
          manaImpact?.profileAfter ?? engine?.profile ?? null,
          toPlayabilityInput(inCard)
        ),
        addCastabilityAfterSwap: manaImpact !== null,
        selected: true,
      });
    }
    return results;
  };

  const buildLands = async (lands: any[]): Promise<LandRecommendation[]> => {
    const results: LandRecommendation[] = [];

    for (const land of lands.slice(0, 12)) {
      const local = findDeckCard(land.name);
      const card = local?.image_uris ? local : await fetchCard(land.name);
      results.push({
        type: land.type === 'add' ? 'add' : 'remove',
        name: land.name,
        card: card ?? null,
        reason: land.reason || '',
        priority: land.priority || 'medium',
        category: land.category || undefined,
      });
    }
    return results;
  };

  const handleAddCard = (cardName: string) => {
    if (!onAddCard) return;
    onAddCard(cardName);
    setAdditionSuggestions(prev => prev.filter(c => c.name !== cardName));
    setLandRecommendations(prev =>
      prev.filter(c => !(c.type === 'add' && c.name === cardName))
    );
    toast.success(`Added ${cardName}`);
  };

  const handleAddMultipleCards = (cardNames: string[]) => {
    if (!onAddCard) return;
    setIsApplying(true);
    cardNames.forEach(name => onAddCard(name));
    setAdditionSuggestions(prev => prev.filter(c => !cardNames.includes(c.name)));
    setLandRecommendations(prev =>
      prev.filter(c => !(c.type === 'add' && cardNames.includes(c.name)))
    );
    toast.success(`Added ${cardNames.length} cards`);
    setIsApplying(false);
  };

  /*
   * Removal had a real bug, not just a style one: the fallback branch was
   * `else if (onApplyReplacements) { onRemoveCard(cardName) }`, which called
   * the very handler the branch had just established was missing. It was also
   * written twice, so the second copy — the one that actually used
   * `onApplyReplacements` — was unreachable.
   */
  const handleRemoveCard = (cardName: string) => {
    if (onRemoveCard) {
      onRemoveCard(cardName);
    } else if (onApplyReplacements) {
      onApplyReplacements([{ remove: cardName, add: '' }]);
    } else {
      return;
    }
    setRemovalSuggestions(prev => prev.filter(c => c.name !== cardName));
    setLandRecommendations(prev =>
      prev.filter(c => !(c.type === 'remove' && c.name === cardName))
    );
    toast.success(`Removed ${cardName}`);
  };

  const handleRemoveMultipleCards = (cardNames: string[]) => {
    setIsApplying(true);
    cardNames.forEach(name => handleRemoveCard(name));
    setIsApplying(false);
  };

  const toggleSwapSuggestion = (index: number) => {
    setSwapSuggestions(prev =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  };

  /**
   * One swap, in the shape a caller needs to actually perform it.
   *
   * `remove` and `add` are unchanged, so every existing handler keeps working
   * untouched. `addCardId` and `addCard` are additive, and they are what let a
   * caller holding an UNSAVED deck — the Deck Generator's result screen —
   * substitute the card in memory instead of re-resolving the name against the
   * database. `addCardId` is the id from our own `cards` table rather than the
   * Scryfall printing on `newCard.card`, because that is the one
   * `deck_cards.card_id` will accept.
   */
  const toReplacement = (swap: SwapSuggestion) => ({
    remove: swap.currentCard.name,
    add: swap.newCard.name,
    addCardId: swap.newCard.cardId ?? null,
    addCard: swap.newCard.card ?? null,
  });

  const applySingleSwap = async (index: number) => {
    const swap = swapSuggestions[index];
    if (!swap) return;
    setIsApplying(true);
    try {
      await onApplyReplacements([toReplacement(swap)]);
      toast.success(`Replaced ${swap.currentCard.name} with ${swap.newCard.name}`);
      setSwapSuggestions(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      console.error('Error applying swap:', e);
      toast.error('Failed to apply swap');
    } finally {
      setIsApplying(false);
    }
  };

  const applySelectedSwaps = async () => {
    const selected = swapSuggestions.filter(s => s.selected);
    if (selected.length === 0) {
      toast.error('No swaps selected');
      return;
    }

    setIsApplying(true);
    try {
      await onApplyReplacements(selected.map(toReplacement));
      toast.success(`Applied ${selected.length} replacement${selected.length > 1 ? 's' : ''}`);
      setSwapSuggestions(prev => prev.filter(s => !s.selected));
    } catch (e) {
      console.error('Error applying swaps:', e);
      toast.error('Failed to apply swaps');
    } finally {
      setIsApplying(false);
      setShowConfirmSwaps(false);
    }
  };

  const findMoreSwaps = async () => {
    setIsLoadingMoreSwaps(true);
    try {
      const existingSwapCards = swapSuggestions.flatMap(s => [
        s.currentCard.name.toLowerCase(),
        s.newCard.name.toLowerCase(),
      ]);

      const { data, error: fnError } = await supabase.functions.invoke('deck-optimizer', {
        body: {
          deckContext: deckContextPayload(),
          edhAnalysis: edhAnalysisPayload(),
          useCollection,
          excludeSwaps: existingSwapCards,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const newReplacements = (data?.analysis?.replacements || []).filter(
        (r: any) =>
          !existingSwapCards.includes(String(r.remove || '').toLowerCase()) &&
          !existingSwapCards.includes(String(r.add || '').toLowerCase())
      );

      const newSwaps = await buildSwaps(newReplacements, []);

      if (newSwaps.length > 0) {
        setSwapSuggestions(prev => [...prev, ...newSwaps]);
        toast.success(`Found ${newSwaps.length} more swap suggestions`);
      } else {
        toast.info('No additional swaps found');
      }
    } catch (e) {
      console.error('Error finding more swaps:', e);
      toast.error('Failed to find more swaps');
    } finally {
      setIsLoadingMoreSwaps(false);
    }
  };

  const statusLabel =
    deckStatus === 'incomplete'
      ? `${missingCards} card${missingCards === 1 ? '' : 's'} short`
      : deckStatus === 'overloaded'
      ? `${excessCards} card${excessCards === 1 ? '' : 's'} over`
      : 'Deck complete';

  const selectedSwapCount = swapSuggestions.filter(s => s.selected).length;

  return (
    <div className="w-full space-y-6">
      {/* Header. Full width, readable, and no outline. */}
      <Card className="shadow-lg">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-5 p-5 sm:p-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold">Deck optimiser</h2>
            <p className="mt-1 text-base text-muted-foreground">
              {totalCardsWithCommander} / {requiredCards} cards ·{' '}
              <span className={cn(deckStatus === 'overloaded' && 'text-destructive')}>
                {statusLabel}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => generateOptimizations(true)}
              disabled={loading || deckCards.length === 0}
            >
              {loadingCollection ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Library className="mr-2 h-4 w-4" />
              )}
              Use my collection
            </Button>
            <Button
              size="lg"
              onClick={() => generateOptimizations(false)}
              disabled={loading || deckCards.length === 0}
            >
              {loading && !loadingCollection ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analysing…
                </>
              ) : hasResults ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run again
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Optimise deck
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Hard-to-cast preview, with art, before any analysis has been run.
          Measured locally, so it is available even when the EDH panel has not
          been opened. */}
      {lowPlayabilityPreview.length > 0 && !hasResults && !loading && (
        <Card className="shadow-lg">
          <CardContent className="p-5 sm:p-6">
            <h3 className="text-lg font-bold">
              {lowPlayabilityPreview.length} card
              {lowPlayabilityPreview.length === 1 ? '' : 's'} you often cannot cast on curve
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Castability measured against this deck&rsquo;s mana base.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {lowPlayabilityPreview.map(card => (
                <span
                  key={card.name}
                  className="rounded-lg bg-muted px-3 py-2 text-sm font-medium"
                >
                  {card.name}{' '}
                  <span
                    className={cn(
                      'tabular-nums',
                      card.pct !== null ? playabilityBand(card.pct).textClass : ''
                    )}
                  >
                    {card.pct !== null ? `${card.pct.toFixed(0)}%` : ''}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="bg-destructive/10 shadow-lg">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="text-base font-medium text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <OptimizerProgress currentStep={loadingStep} loadingCollection={loadingCollection} />
      )}

      {!hasResults && !loading && !error && (
        <Card className="shadow-lg">
          <CardContent className="p-10 text-center">
            <h3 className="text-xl font-bold">Ready to optimise</h3>
            <p className="mx-auto mt-2 max-w-2xl text-base text-muted-foreground">
              {deckCards.length === 0
                ? 'Add cards to your deck to get an optimisation pass.'
                : deckStatus === 'incomplete'
                ? `This deck needs ${missingCards} more cards. Run the optimiser for suggestions to fill it out.`
                : deckStatus === 'overloaded'
                ? `This deck is ${excessCards} over the limit. Run the optimiser for cut suggestions.`
                : 'Run the optimiser to see which cards are worth replacing, and why.'}
            </p>
          </CardContent>
        </Card>
      )}

      {hasResults && !loading && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Real labels at real sizes — the old tabs hid their text below
                the `xs` breakpoint and showed four bare icons. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList className="inline-flex h-auto w-auto min-w-full gap-1 p-1">
                <TabsTrigger value="overview" className="gap-2 px-4 py-2.5 text-sm">
                  <Target className="h-4 w-4" />
                  Overview
                </TabsTrigger>

                {deckStatus !== 'overloaded' && (
                  <TabsTrigger value="additions" className="gap-2 px-4 py-2.5 text-sm">
                    <Plus className="h-4 w-4" />
                    {deckStatus === 'incomplete' ? 'Add' : 'Ideas'}
                    {additionSuggestions.length > 0 && (
                      <TabCount>{additionSuggestions.length}</TabCount>
                    )}
                  </TabsTrigger>
                )}

                {deckStatus === 'overloaded' && (
                  <TabsTrigger value="removals" className="gap-2 px-4 py-2.5 text-sm">
                    <Trash2 className="h-4 w-4" />
                    Cut
                    {removalSuggestions.length > 0 && (
                      <TabCount>{removalSuggestions.length}</TabCount>
                    )}
                  </TabsTrigger>
                )}

                <TabsTrigger value="swaps" className="gap-2 px-4 py-2.5 text-sm">
                  <ArrowRight className="h-4 w-4" />
                  Swaps
                  {swapSuggestions.length > 0 && <TabCount>{swapSuggestions.length}</TabCount>}
                </TabsTrigger>

                <TabsTrigger
                  value="lands"
                  className={cn('gap-2 px-4 py-2.5 text-sm', hasLandIssues && 'font-semibold')}
                >
                  <Mountain className="h-4 w-4" />
                  Lands
                  {landRecommendations.length > 0 && (
                    <TabCount>{landRecommendations.length}</TabCount>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-6">
              {analysis ? (
                <OptimizerOverview
                  analysis={analysis}
                  replacementCount={swapSuggestions.length}
                  additionCount={additionSuggestions.length}
                  removalCount={removalSuggestions.length}
                  playability={deckPlayabilityResult}
                  hardToCast={hardToCast}
                />
              ) : (
                <EmptyPanel message="No overview was returned for this run." />
              )}
            </TabsContent>

            <TabsContent value="additions" className="mt-6">
              {additionSuggestions.length === 0 ? (
                <EmptyPanel
                  message={
                    missingCards > 0
                      ? 'Run the optimiser to get card recommendations.'
                      : 'This deck is complete — check Swaps for upgrade ideas.'
                  }
                />
              ) : (
                <AdditionsSection
                  suggestions={additionSuggestions}
                  missingCards={missingCards}
                  deckId={deckId}
                  onAddCard={handleAddCard}
                  onAddMultiple={handleAddMultipleCards}
                  isAdding={isApplying}
                />
              )}
            </TabsContent>

            <TabsContent value="removals" className="mt-6">
              {removalSuggestions.length === 0 ? (
                <EmptyPanel
                  message={
                    excessCards > 0
                      ? 'Run the optimiser to get cut suggestions.'
                      : 'This deck has the right number of cards.'
                  }
                />
              ) : (
                <RemovalsSection
                  suggestions={removalSuggestions}
                  excessCards={excessCards}
                  onRemoveCard={handleRemoveCard}
                  onRemoveMultiple={handleRemoveMultipleCards}
                  isRemoving={isApplying}
                />
              )}
            </TabsContent>

            <TabsContent value="swaps" className="mt-6">
              {swapSuggestions.length === 0 ? (
                <EmptyPanel
                  message={
                    isDeckComplete
                      ? 'Run the optimiser to get swap suggestions.'
                      : deckStatus === 'incomplete'
                      ? 'Finish the deck first — swaps are suggested for complete lists.'
                      : 'Cut down to the deck limit first, then swaps will be suggested.'
                  }
                />
              ) : (
                <>
                  <SwapsSection
                    suggestions={swapSuggestions}
                    onToggle={toggleSwapSuggestion}
                    onApplySingle={applySingleSwap}
                    onApplySelected={() => setShowConfirmSwaps(true)}
                    onFindMoreSwaps={findMoreSwaps}
                    isApplying={isApplying}
                    isLoadingMore={isLoadingMoreSwaps}
                    useCollection={useCollection}
                  />

                  {/**
                   * Confirmation in the panel's own flow, not over it.
                   *
                   * An AlertDialog here hid the very thing you need to check
                   * before saying yes — the ticked swaps sitting above it.
                   */}
                  {showConfirmSwaps && (
                    <div className="mt-6 rounded-2xl bg-muted p-5 shadow-lg">
                      <p className="text-base">
                        Apply {selectedSwapCount} swap{selectedSwapCount === 1 ? '' : 's'} to the
                        deck? The cards above are replaced.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button size="lg" onClick={applySelectedSwaps} disabled={isApplying}>
                          {isApplying ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Applying…
                            </>
                          ) : (
                            'Confirm swaps'
                          )}
                        </Button>
                        <Button
                          size="lg"
                          variant="ghost"
                          onClick={() => setShowConfirmSwaps(false)}
                          disabled={isApplying}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="lands" className="mt-6">
              <LandRecommendationsSection
                currentLandCount={landCount}
                idealLandCount={idealLandCount}
                recommendations={landRecommendations}
                manaProfile={engine?.profile ?? null}
                onAddLand={handleAddCard}
                onRemoveLand={handleRemoveCard}
                isApplying={isApplying}
                deckId={deckId}
              />
            </TabsContent>
          </Tabs>
        </motion.div>
      )}
    </div>
  );
}

function TabCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
      {children}
    </span>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <Card className="shadow-lg">
      <CardContent className="p-10 text-center">
        <p className="text-base text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
