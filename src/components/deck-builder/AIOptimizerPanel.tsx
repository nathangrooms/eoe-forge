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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Check,
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
import { ConfirmBar } from './optimizer/ConfirmBar';
import {
  LandRecommendationsSection,
  LandRecommendation,
  type BasicFiller,
} from './optimizer/LandRecommendationsSection';
import { landFactsLine } from './optimizer/landFacts';
import { castabilityOnDeck, measureManaImpact } from './optimizer/manaImpact';
import { AutoOptimiseSection, type AutoReceipt } from './optimizer/AutoOptimiseSection';
import {
  diffDecks,
  displayNames,
  missedByPlan,
  planAutoOptimise,
  tallyDeck,
  type AutoPriority,
} from '@/lib/deckbuilder/optimizer-autopilot';

/**
 * How many of the deck's empty slots are lands, counted by the edge function.
 *
 * `null` when the deck is not short of cards. The panel never derives this: it
 * would need the land target, and the one place that number is decided is the
 * function that also decides the shortfall, the basics split and the land
 * candidates. Two derivations of one split is how a screen ends up telling a
 * player two different things about the same deck.
 */
interface FillPlan {
  emptySlots: number;
  landShortfall: number;
  landSlots: number;
  spellSlots: number;
  /** The sentence, composed server-side so nothing here restates it. */
  note: string;
}

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
  /**
   * Flush a deferred write, for a caller that still has one.
   *
   * Optional, and separate from `saveState` on purpose: a caller whose every
   * apply already writes its own row has nothing for this to send, and drawing
   * it anyway would be a button that can only ever say "already saved".
   */
  onSaveDeck?: () => void;
  /**
   * What the deck's save is doing right now.
   *
   * Pass it whether or not you pass `onSaveDeck`. It is what puts the save on
   * screen at the bottom of a five-step pass, where the page header that
   * normally carries it has been scrolled away.
   */
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  /*
   * All three may return a promise, and the auto pass awaits it.
   *
   * They were typed `=> void` while both callers were already async, so the
   * panel could fire a write and had no way to know when it had landed. That
   * was survivable while every apply was one button press by a person; it is
   * not survivable for a pass that runs five steps back to back and then reads
   * the decklist to report what changed. Widening the type is backwards
   * compatible: a handler returning nothing still satisfies it.
   */
  onApplyReplacements: (
    replacements: Array<{
      remove: string;
      add: string;
      addCardId?: string | null;
      addCard?: any;
    }>
  ) => void | Promise<void>;
  onAddCard?: (cardName: string) => void | Promise<void>;
  onRemoveCard?: (cardName: string) => void | Promise<void>;
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

/**
 * A swap's identity: the pair of cards it moves.
 *
 * Used to drop applied rows from a list. The same key the swap rows are
 * rendered under, so a row that leaves the list is the row that was applied.
 */
const swapKey = (s: SwapSuggestion) => `${s.currentCard.name}→${s.newCard.name}`;

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
  onSaveDeck,
  saveState,
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
  /**
   * Land-for-land trades. Same type as the card swaps, on purpose.
   *
   * The edge function returns them in the same row shape as `replacements`, so
   * they are built by the same function here and rendered by the same
   * component in the lands tab. One swap implementation, two tabs.
   */
  const [landSwapSuggestions, setLandSwapSuggestions] = useState<SwapSuggestion[]>([]);
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
  /**
   * The basics still needed, counted by the edge function.
   *
   * `null` means the deck is not short, and renders as nothing. It is never
   * computed here: the split comes from the deck's own coloured pip demand and
   * its own source counts, both measured server-side, and a second calculation
   * in the client is how two numbers on one screen start disagreeing.
   */
  const [basicFiller, setBasicFiller] = useState<BasicFiller | null>(null);
  /**
   * How the empty slots split between lands and spells, counted server-side.
   *
   * `null` when the deck is not short of cards, and then nothing about fill
   * order renders. This is what makes "lands come first" a stated, checkable
   * count rather than a rearrangement the user is left to notice.
   */
  const [fillPlan, setFillPlan] = useState<FillPlan | null>(null);
  const [error, setError] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingMoreSwaps, setIsLoadingMoreSwaps] = useState(false);
  /*
   * Two confirmations, one per swap list, and neither is an overlay.
   *
   * The scroll that brings a confirmation to the reader lives inside
   * `<ConfirmBar>` rather than here. It used to be an effect in this file on
   * `showConfirmSwaps`, which worked, and would have had to be remembered a
   * second time the moment lands got their own multi-apply. See that file.
   */
  const [showConfirmSwaps, setShowConfirmSwaps] = useState(false);
  const [showConfirmLandSwaps, setShowConfirmLandSwaps] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  /** Which steps the reader has actually opened, so the tabs can show progress. */
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['overview']));
  const openTab = useCallback((value: string) => {
    setActiveTab(value);
    setVisitedTabs(prev => (prev.has(value) ? prev : new Set(prev).add(value)));
  }, []);
  const [useCollection, setUseCollection] = useState(false);

  /*
   * The auto pass: one control that applies the whole set.
   *
   * `autoPhase` is the heading of the step running right now, or null. The
   * receipt is what the DECKLIST did, measured after the fact; see
   * `AutoOptimiseSection` for why that is not the same object as the plan.
   */
  const [autoPhase, setAutoPhase] = useState<string | null>(null);
  const [autoReceipt, setAutoReceipt] = useState<AutoReceipt | null>(null);

  /**
   * The decklist as it stands after the last commit, for the before-and-after.
   *
   * A ref rather than the `deckCards` prop because the pass reads it from
   * inside an async handler, and the prop there is whatever it was when that
   * handler was created. Written in an effect so it holds a committed list
   * rather than one React is still working on.
   */
  const deckCardsRef = useRef(deckCards);
  useEffect(() => {
    deckCardsRef.current = deckCards;
  });

  /** The tally the diff runs on, commander included so it counts whole decks. */
  const tallyNow = useCallback(
    () => tallyDeck(commander ? [...deckCardsRef.current, commander] : deckCardsRef.current),
    [commander]
  );

  /** The decklist before the pass ran, kept so undo can be measured too. */
  const autoBeforeRef = useRef<ReturnType<typeof tallyDeck> | null>(null);
  /**
   * The real capitalisation of every name the pass could touch, captured BEFORE
   * it ran.
   *
   * `receiptNames()` reads the deck and the suggestion lists as they stand now,
   * and by the time undo runs both have moved: the cards the pass cut are out
   * of the deck, and a finished pass clears the suggestion lists. Nothing on
   * screen then holds the real spelling of a card the pass removed, so
   * `diffDecks` falls back to its own lower-cased key. Measured on a real deck
   * on 2026-08-20, the undo receipt listed fourteen cards as "aang, airbending
   * master", "counterspell", "zoetic cavern".
   */
  const autoNamesRef = useRef<Map<string, string> | null>(null);
  /** The suggestion lists before the pass ran, so undo can put them back. */
  const autoListsRef = useRef<{
    additions: AdditionSuggestion[];
    removals: RemovalSuggestion[];
    swaps: SwapSuggestion[];
    lands: LandRecommendation[];
    landSwaps: SwapSuggestion[];
  } | null>(null);

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
    landRecommendations.length > 0 ||
    landSwapSuggestions.length > 0;

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

      const [additions, removals, swaps, lands, landSwaps] = await Promise.all([
        buildAdditions(parsed.additions || [], collectionCards),
        buildRemovals(parsed.removals || []),
        buildSwaps(parsed.replacements || [], collectionCards),
        buildLands(parsed.landRecommendations || []),
        // Same builder as the card swaps. The rows arrive in the same shape.
        buildSwaps(parsed.landReplacements || [], collectionCards),
      ]);

      setAdditionSuggestions(additions);
      setRemovalSuggestions(removals);
      setSwapSuggestions(swaps);
      setLandRecommendations(lands);
      setLandSwapSuggestions(landSwaps);
      setShowConfirmSwaps(false);
      setShowConfirmLandSwaps(false);
      // A receipt belongs to the pass that produced it. A fresh analysis is a
      // fresh set of suggestions against a deck that has already moved, so the
      // old undo would be putting back cards from a run nobody is looking at.
      setAutoReceipt(null);
      setAutoPhase(null);
      autoBeforeRef.current = null;
      autoListsRef.current = null;

      if (parsed.landCount !== undefined) setLandCount(parsed.landCount);
      if (parsed.idealLandCount !== undefined) setIdealLandCount(parsed.idealLandCount);
      // Absent or null both mean "this deck is not short of lands", which
      // renders as nothing rather than as a filler line saying zero.
      setBasicFiller(
        parsed.basicFiller && Number(parsed.basicFiller.shortfall) > 0
          ? (parsed.basicFiller as BasicFiller)
          : null
      );
      // Absent means the deck is not short of cards, and then nothing about
      // fill order renders at all. Never derived here: see `FillPlan`.
      setFillPlan(
        parsed.fillPlan && Number(parsed.fillPlan.emptySlots) > 0
          ? (parsed.fillPlan as FillPlan)
          : null
      );

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

  /**
   * Swaps, from a replacement row.
   *
   * Used for BOTH `replacements` and `landReplacements`, because the edge
   * function returns them in the same shape and a land trade is a card trade.
   * The two extra fields a land row carries — `addGrounds` and `removeGrounds`
   * — are read here and turn into the same one-line measured fact the land
   * tiles print. A spell row has neither, and then nothing is printed, which is
   * what an unmeasured fact must look like.
   */
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

      // Counted from `user_collections`, never the floor of 1 stamped on a name
      // the client merely listed. Same rule the land tiles follow: "you already
      // own this, it is free" is a claim that has to be true.
      const addOwnedQuantity =
        rep.addOwnedQuantitySource === 'collection' ? Number(rep.addOwnedQuantity) || 0 : 0;

      results.push({
        currentCard: {
          name: rep.remove,
          card: outCard,
          price: usdPrice((outCard as any).prices),
          reason: rep.removeReason || '',
          playability: deckCardPlayability(rep.remove),
          facts: landFactsLine(rep.removeGrounds),
        },
        newCard: {
          name: rep.add,
          card: inCard,
          price: usdPrice(inCard.prices),
          reason: rep.addBenefit || '',
          type: rep.addType || inCard.type_line,
          inCollection:
            addOwnedQuantity > 0 ||
            collectionCards.some(c => c.toLowerCase() === String(rep.add).toLowerCase()),
          ownedQuantity: addOwnedQuantity,
          synergy: rep.synergy || undefined,
          // The id from OUR table, not Scryfall's. See `SwapSuggestion.newCard.cardId`.
          cardId: typeof rep.addCardId === 'string' ? rep.addCardId : null,
          facts: landFactsLine(rep.addGrounds),
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

  /**
   * Land recommendations, using what the edge function already measured.
   *
   * It returns `priceUsd`, `owned`, `ownedQuantity` and `grounds` on every land
   * row — checked against a live response, not assumed — and this function used
   * to read none of them. It re-derived the price from Scryfall, sometimes with
   * a second request for the same card, and threw ownership away entirely. So a
   * land the user already had in a box looked exactly like one they would have
   * to go and buy, on the one tab where cost is the whole question.
   *
   * Scryfall is still called for the ART, because `<CardImage>` wants the card
   * object to pick a resolution and to flip a double-faced land, and the pool
   * query deliberately does not carry `image_uris`.
   */
  const buildLands = async (lands: any[]): Promise<LandRecommendation[]> => {
    const results: LandRecommendation[] = [];

    for (const land of lands.slice(0, 12)) {
      const local = findDeckCard(land.name);
      const card = local?.image_uris ? local : await fetchCard(land.name);

      // The function's price is the cheapest printing in our own catalogue,
      // which is the figure the rest of the app costs a deck with. Scryfall is
      // the fallback for a name it could not resolve, never the first answer.
      const price =
        typeof land.priceUsd === 'number' ? land.priceUsd : usdPrice((card as any)?.prices);

      results.push({
        type: land.type === 'add' ? 'add' : 'remove',
        name: land.name,
        card: card ?? null,
        price,
        reason: land.reason || '',
        priority: land.priority || 'medium',
        category: land.category || undefined,
        // `ownedQuantitySource` is what separates a counted figure from the
        // floor of 1 stamped on a name the client merely listed. A land is only
        // called owned here when the count came from the collection itself.
        ownedQuantity:
          land.ownedQuantitySource === 'collection' ? Number(land.ownedQuantity) || 0 : 0,
        grounds: land.grounds ?? null,
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

  /**
   * Applying swaps, once, for both lists.
   *
   * Cards and lands go through the SAME function rather than two copies of it.
   * A land trade is `onApplyReplacements` with two land names in it; nothing
   * about the write differs, so nothing about the code should. The list to
   * remove the applied rows from is the only parameter that changes.
   *
   * Rows are dropped by the pair of names rather than by index: the caller may
   * pass a selection rather than a position, and an index into a list that has
   * already had a row removed is the classic way to delete the wrong one.
   */
  const applySwaps = async (
    picked: SwapSuggestion[],
    setList: React.Dispatch<React.SetStateAction<SwapSuggestion[]>>
  ) => {
    if (picked.length === 0) {
      toast.error('No swaps selected');
      return;
    }
    const keys = new Set(picked.map(swapKey));
    setIsApplying(true);
    try {
      await onApplyReplacements(picked.map(toReplacement));
      toast.success(
        picked.length === 1
          ? `Replaced ${picked[0].currentCard.name} with ${picked[0].newCard.name}`
          : `Applied ${picked.length} replacements`
      );
      setList(prev => prev.filter(s => !keys.has(swapKey(s))));
    } catch (e) {
      console.error('Error applying swaps:', e);
      toast.error(picked.length === 1 ? 'Failed to apply swap' : 'Failed to apply swaps');
    } finally {
      setIsApplying(false);
    }
  };

  const applySingleSwap = (index: number) => {
    const swap = swapSuggestions[index];
    if (swap) void applySwaps([swap], setSwapSuggestions);
  };

  const applySelectedSwaps = async () => {
    await applySwaps(
      swapSuggestions.filter(s => s.selected),
      setSwapSuggestions
    );
    setShowConfirmSwaps(false);
  };

  const toggleLandSwap = (index: number) => {
    setLandSwapSuggestions(prev =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  };

  const applySingleLandSwap = (index: number) => {
    const swap = landSwapSuggestions[index];
    if (swap) void applySwaps([swap], setLandSwapSuggestions);
  };

  const applySelectedLandSwaps = async () => {
    await applySwaps(
      landSwapSuggestions.filter(s => s.selected),
      setLandSwapSuggestions
    );
    setShowConfirmLandSwaps(false);
  };

  /* ------------------------------------------------------------------ *
   * The auto pass
   * ------------------------------------------------------------------ */

  /**
   * Whether this screen can carry out a whole pass.
   *
   * `onAddCard` is the evidence, and it is evidence rather than the mechanism:
   * the pass itself goes through `onApplyReplacements`, for the batching reason
   * written on `toBatchRow`. A caller that offers no way to add a single card
   * is a caller whose deck cannot take a card that is not already in it, and
   * the Deck Generator's result screen is exactly that. Its list is held in
   * memory and its apply handler replaces a row it can find by name, so a row
   * with nothing to replace is skipped. "Apply the whole set, spells and mana
   * base together" is not something it can do, and a button that quietly does a
   * third of what it says is worse than no button. That screen keeps the manual
   * tabs, which is what they are for.
   */
  const canRunAuto = Boolean(onAddCard);

  const priorityOf = (value: unknown): AutoPriority =>
    value === 'high' || value === 'low' ? value : 'medium';

  /**
   * The whole pass, counted.
   *
   * Every number the button puts on screen comes from here, so the sentence a
   * player agrees to and the work that runs are the same object. The counting
   * itself is in `@/lib/deckbuilder/optimizer-autopilot`, tested, and knows
   * nothing about React.
   *
   * Deliberately built from the FULL lists rather than from what is ticked.
   * The ask was "no need to manually select", and running two selection models
   * at once is how a preview and a result end up disagreeing. Nothing is
   * hidden by that: the preview names every card before anything moves.
   */
  const autoPlan = useMemo(
    () =>
      planAutoOptimise({
        landSwaps: landSwapSuggestions.map(s => ({
          out: s.currentCard.name,
          in: s.newCard.name,
          priority: priorityOf(s.priority),
        })),
        cardSwaps: swapSuggestions.map(s => ({
          out: s.currentCard.name,
          in: s.newCard.name,
          priority: priorityOf(s.priority),
        })),
        cuts: [
          ...removalSuggestions.map(r => ({
            name: r.name,
            priority: priorityOf(r.priority),
            isLand: false,
          })),
          ...landRecommendations
            .filter(l => l.type === 'remove')
            .map(l => ({ name: l.name, priority: priorityOf(l.priority), isLand: true })),
        ],
        landAdds: landRecommendations
          .filter(l => l.type === 'add')
          .map(l => ({ name: l.name, priority: priorityOf(l.priority) })),
        spellAdds: additionSuggestions.map(a => ({
          name: a.name,
          priority: priorityOf(a.priority),
        })),
        sizeBefore: totalCardsWithCommander,
        requiredSize: requiredCards,
        landSlots: fillPlan?.landSlots ?? null,
        spellSlots: fillPlan?.spellSlots ?? null,
        hasBasicFiller: basicFiller !== null,
      }),
    [
      landSwapSuggestions,
      swapSuggestions,
      removalSuggestions,
      landRecommendations,
      additionSuggestions,
      totalCardsWithCommander,
      requiredCards,
      fillPlan,
      basicFiller,
    ]
  );

  /**
   * Wait for the decklist to stop moving, then read it.
   *
   * The pass awaits every handler it calls, so the writes are done. What is not
   * done is React committing them, and `deckCardsRef` is only true after a
   * commit. Polling until the list is the same twice in a row is a measurement
   * of that rather than a guess at how long it takes, which matters because the
   * whole receipt is built on the reading that comes next.
   */
  const settleDeck = useCallback(async () => {
    let previous = '';
    let stable = 0;
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 40));
      const now = JSON.stringify([...tallyNow().entries()].sort());
      if (now === previous) {
        stable += 1;
        if (stable >= 2) return;
      } else {
        stable = 0;
        previous = now;
      }
    }
  }, [tallyNow]);

  /**
   * Every name the receipt might have to print, with its real capitalisation.
   *
   * The diff keys on lower case because the store, Scryfall and the edge
   * function do not agree on capitalisation, and a receipt that reads "Sol Ring
   * out, sol ring in" is worse than none.
   */
  const receiptNames = () =>
    displayNames(
      deckCardsRef.current,
      commander ? [commander] : [],
      additionSuggestions,
      removalSuggestions,
      landRecommendations,
      swapSuggestions.flatMap(s => [{ name: s.currentCard.name }, { name: s.newCard.name }]),
      landSwapSuggestions.flatMap(s => [{ name: s.currentCard.name }, { name: s.newCard.name }])
    );

  /**
   * ONE CALL FOR THE WHOLE PASS, AND WHY IT HAS TO BE.
   *
   * `onApplyReplacements` is the only handler that takes a list. `onAddCard`
   * and `onRemoveCard` take one card, and the deck page schedules its debounced
   * save inside each of them, so a pass that added twelve cards through
   * `onAddCard` would schedule twelve saves. The 400ms debounce does not save
   * you: every add waits on a Scryfall lookup first, which is longer than that,
   * so the timer fires between cards and each one really is written. That is
   * the one thing a bulk apply must not do.
   *
   * So the pass builds a single list, in the order the plan settled on, and
   * hands it over once. The deck page loops it and saves at the end: one write.
   *
   * TWO SENTINELS, ONE OF THEM ALREADY IN USE.
   *   `add: ''`    take a card out and put nothing in. Already how
   *                `handleRemoveCard` removes a card on a caller with no
   *                `onRemoveCard`, so this is not a new convention.
   *   `remove: ''` put a card in and take nothing out. The mirror of it. Both
   *                callers already behave correctly: the deck page guards its
   *                removal with `if (cardToRemove)`, and the Deck Generator
   *                skips any row whose outgoing card it cannot find, which is
   *                also why that screen is not offered this button at all.
   */
  const toBatchRow = (out: string | null, into: string | null) => ({
    remove: out ?? '',
    add: into ?? '',
    addCardId: null,
    addCard: null,
  });

  /** Drop the suggestion rows whose cards actually moved. */
  const pruneByDiff = (gained: Set<string>, lost: Set<string>) => {
    setSwapSuggestions(prev => prev.filter(s => !gained.has(s.newCard.name.toLowerCase())));
    setLandSwapSuggestions(prev => prev.filter(s => !gained.has(s.newCard.name.toLowerCase())));
    setAdditionSuggestions(prev => prev.filter(a => !gained.has(a.name.toLowerCase())));
    setRemovalSuggestions(prev => prev.filter(r => !lost.has(r.name.toLowerCase())));
    setLandRecommendations(prev =>
      prev.filter(l =>
        l.type === 'add' ? !gained.has(l.name.toLowerCase()) : !lost.has(l.name.toLowerCase())
      )
    );
  };

  /**
   * The plan flattened into the one list that gets handed over.
   *
   * The order is the plan's order and nothing here reorders it: lands traded,
   * cards traded, cuts, lands in, cards in. The deck page walks the list in
   * sequence, so the order in this array is the order the deck changes.
   */
  const autoBatch = () =>
    autoPlan.phases.flatMap(phase =>
      phase.items.map(item => {
        if (phase.kind === 'landSwaps') return toReplacement(landSwapSuggestions[item.index]);
        if (phase.kind === 'cardSwaps') return toReplacement(swapSuggestions[item.index]);
        return toBatchRow(item.out, item.in);
      })
    );

  /**
   * Run the whole pass.
   *
   * One handover, then one reading of the deck, then the receipt. The explicit
   * `onSaveDeck` at the end is not a second save: the deck page's save is
   * debounced on a ref, so it reschedules the one already pending and turns the
   * save state on screen instead of leaving the reader to trust a timer.
   */
  const runAutoOptimise = async () => {
    if (autoPlan.moves === 0 || isApplying) return;

    const before = tallyNow();
    autoBeforeRef.current = before;
    autoListsRef.current = {
      additions: additionSuggestions,
      removals: removalSuggestions,
      swaps: swapSuggestions,
      lands: landRecommendations,
      landSwaps: landSwapSuggestions,
    };
    const names = receiptNames();
    autoNamesRef.current = names;

    setIsApplying(true);
    setAutoPhase(
      `Working through ${autoPlan.moves} change${autoPlan.moves === 1 ? '' : 's'}, in the order above.`
    );

    try {
      await onApplyReplacements(autoBatch());
    } catch (e) {
      console.error('Auto optimise failed part way through', e);
      toast.error('Something went wrong part way through. The list below is what did change.');
    }

    setAutoPhase('Reading the deck back.');
    await settleDeck();

    const diff = diffDecks(before, tallyNow(), names);
    setAutoReceipt({ plan: autoPlan, diff, missed: missedByPlan(autoPlan, diff), residual: null });
    pruneByDiff(
      new Set(diff.gained.map(c => c.name.toLowerCase())),
      new Set(diff.lost.map(c => c.name.toLowerCase()))
    );

    setAutoPhase(null);
    setIsApplying(false);
    onSaveDeck?.();
  };

  /**
   * Put it all back.
   *
   * A real undo, not a description of one: it runs off the MEASURED diff, so it
   * reverses what the deck actually did rather than what the pass asked for.
   * Removals go first, because putting a card back needs a slot and taking one
   * out is what frees it.
   *
   * What comes back is the card by NAME. A player who had a particular printing
   * of a card gets the default printing of it back, and the receipt says so
   * rather than leaving it to be discovered.
   */
  const undoAutoOptimise = async () => {
    const receipt = autoReceipt;
    const before = autoBeforeRef.current;
    if (!receipt || receipt.residual !== null || before === null || isApplying) return;

    // The pre-pass spellings first, then whatever is on screen now. A card the
    // pass removed exists in neither the deck nor the suggestion lists by this
    // point, and without the captured map its name prints in lower case.
    const names = new Map([...(autoNamesRef.current ?? []), ...receiptNames()]);
    setIsApplying(true);
    setAutoPhase('Putting the deck back.');

    try {
      // One list again, and in this order for a reason: taking a card out
      // frees the slot the card going back in needs. A copy at a time, so a
      // card that arrived twice leaves twice.
      const rows: Array<{ remove: string; add: string }> = [];
      for (const change of receipt.diff.gained) {
        for (let i = 0; i < change.delta; i++) rows.push({ remove: change.name, add: '' });
      }
      for (const change of receipt.diff.lost) {
        for (let i = 0; i < -change.delta; i++) rows.push({ remove: '', add: change.name });
      }
      await onApplyReplacements(rows);
    } catch (e) {
      console.error('Undo failed part way through', e);
      toast.error('The undo did not finish. What is still different is listed below.');
    }

    setAutoPhase('Reading the deck back.');
    await settleDeck();

    // Measured against the list as it was BEFORE the pass, so "put back" is a
    // reading of the deck rather than a claim about the buttons that were
    // pressed. Anything still different is what gets reported.
    const residual = diffDecks(before, tallyNow(), names);
    setAutoReceipt({ ...receipt, residual });

    const lists = autoListsRef.current;
    if (lists) {
      setAdditionSuggestions(lists.additions);
      setRemovalSuggestions(lists.removals);
      setSwapSuggestions(lists.swaps);
      setLandRecommendations(lists.lands);
      setLandSwapSuggestions(lists.landSwaps);
    }

    setAutoPhase(null);
    setIsApplying(false);
    onSaveDeck?.();
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
  const selectedLandSwapCount = landSwapSuggestions.filter(s => s.selected).length;

  /**
   * Lands before spells, when the deck is short of both.
   *
   * The owner's rule: "lands page should probably overwrite need for new cards
   * if missing." A spell you cannot cast is worth less than the land that
   * casts it, so when there are twelve empty slots and nine of them are lands,
   * the mana base is the work and the ideas tab is what is left over.
   *
   * The condition is the server's count, not a local guess, and the reordering
   * is never silent: `fillPlan.note` prints under the strip that moved.
   */
  const landsFirst = fillPlan !== null && fillPlan.landSlots > 0;
  const steps = landsFirst ? LANDS_FIRST_STEPS : STEPS;

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

          {/* THE VISIBLE SAVE.

              This panel carried the only visible save in the product, because
              it was the only surface whose writes went through a silent timer.
              The reason it had to be visible has not changed and neither has
              the reason it has to be HERE: the five steps are long, the deck
              page's own save state sits in the header, and after scrolling
              through Cut and Swaps that header is off screen. A reader who has
              just applied eleven changes should not have to scroll up to find
              out whether they landed.

              What did change is what a button could do about it. Every apply
              now writes its own row and reports the result, so there is no
              pending timer to flush and nothing for a press to send. A caller
              that still owns a deferred write passes `onSaveDeck` and gets the
              button; a caller whose writes are already immediate passes
              `saveState` alone and gets the state without a control whose only
              possible outcome is "already saved".

              Surface and spacing, not a rule: the divider that used to be here
              was a hairline. */}
          {(onSaveDeck || saveState) && (
            <div
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm text-muted-foreground">
                {saveState === 'saving'
                  ? 'Saving changes to the deck.'
                  : saveState === 'error'
                    ? onSaveDeck
                      ? 'That did not save. Press save to try again.'
                      : 'That did not save. The deck was left as it was.'
                    : saveState === 'saved'
                      ? 'All changes saved to the deck.'
                      : 'Anything you apply is written to the deck straight away.'}
              </p>
              {onSaveDeck && (
                <Button
                  variant="secondary"
                  onClick={onSaveDeck}
                  disabled={saveState === 'saving'}
                  className="shrink-0"
                >
                  {saveState === 'saving' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : saveState === 'saved' ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    'Save deck'
                  )}
                </Button>
              )}
            </div>
          )}
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

      {/* THE ONE BUTTON.

          Above the tabs, because it is the default route through them rather
          than a sixth destination inside them, and because a control that
          rewrites the deck should not be something you have to go and find.

          Rendered outside the tabs block on purpose: applying everything can
          empty every suggestion list, which takes the tabs away, and the
          receipt is the one thing that must survive that. It also stays put
          after the suggestions are gone, so the record of what changed does not
          vanish with the thing that changed it. */}
      {canRunAuto && !loading && (hasResults || autoReceipt) && (
        <AutoOptimiseSection
          plan={autoPlan}
          runningPhase={autoPhase}
          receipt={autoReceipt}
          onRun={runAutoOptimise}
          onUndo={undoAutoOptimise}
          onDismiss={() => setAutoReceipt(null)}
          busy={isApplying}
          saving={saveState === 'saving'}
        />
      )}

      {!hasResults && !loading && !error && !autoReceipt && (
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
          <Tabs value={activeTab} onValueChange={openTab} className="w-full">
            {/* These read as one pass to work through, not five places you
                might go. They are numbered, they carry their own counts, and a
                tab you have already opened is ticked, because the complaint was
                that nothing said they all needed visiting.

                Cut used to appear ONLY when the deck was over its limit, and Add
                only when it was not, so the two were mutually exclusive. A legal
                sized deck could never see a single cut suggestion, which is
                exactly backwards: a 100 card deck is the case where you most
                want to know which card is the weakest. Both are always
                available now. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              {/* `justify-start`, because `TabsList` centres by default and a numbered
                    sequence that starts in the middle of the band does not read as
                    one. Every other tab strip in the product begins at the left
                    edge, and step 1 should be where the eye already is. */}
                <TabsList className="inline-flex h-auto w-auto min-w-full justify-start gap-1 p-1">
                {steps.map((step, i) => {
                  const count =
                    step.value === 'additions'
                      ? additionSuggestions.length
                      : step.value === 'removals'
                      ? removalSuggestions.length
                      : step.value === 'swaps'
                      ? swapSuggestions.length
                      : step.value === 'lands'
                      ? landRecommendations.length + landSwapSuggestions.length
                      : 0;
                  const Icon = step.icon;
                  const seen = visitedTabs.has(step.value);
                  const label =
                    step.value === 'additions' && deckStatus === 'incomplete' ? 'Add' : step.label;
                  return (
                    <TabsTrigger
                      key={step.value}
                      value={step.value}
                      className={cn(
                        'gap-2 px-4 py-2.5 text-sm',
                        step.value === 'lands' && hasLandIssues && 'font-semibold'
                      )}
                    >
                      <StepMark index={i + 1} seen={seen} />
                      <Icon className="h-4 w-4" />
                      {label}
                      {count > 0 && <TabCount>{count}</TabCount>}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              {visitedTabs.size >= steps.length
                ? 'You have been through all five. Anything you applied is already in the deck.'
                : `Work through all five. ${steps.length - visitedTabs.size} still to look at.`}
            </p>

            {/* The reordering, said out loud.
                Moving Lands up the strip without explaining it is a change the
                reader has to guess at, and the whole reason it moved is a
                counted fact about their deck. The sentence is the edge
                function's, composed beside the numbers it quotes, so the tab
                strip and the lands tab cannot phrase the same split two ways. */}
            {landsFirst && (
              <p className="mt-2 rounded-xl bg-muted p-4 text-sm leading-relaxed">
                {fillPlan!.note}
              </p>
            )}

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
                      : 'This deck is complete. Check Swaps for upgrade ideas.'
                  }
                />
              ) : (
                <AdditionsSection
                  suggestions={additionSuggestions}
                  missingCards={missingCards}
                  /* The slots that are actually spells. A deck twelve cards
                     short and nine lands short has three, and "Select best 12"
                     on a tab that can only take three is an instruction to
                     overfill the deck. Null when nothing counted the split. */
                  spellSlots={fillPlan?.spellSlots ?? null}
                  landSlots={fillPlan?.landSlots ?? null}
                  onOpenLands={() => openTab('lands')}
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
                      ? 'Finish the deck first. Swaps are suggested for complete lists.'
                      : 'Cut down to the deck limit first, then swaps will be suggested.'
                  }
                />
              ) : (
                /**
                 * Confirmation in the panel's own flow, not over it.
                 *
                 * An AlertDialog here hid the very thing you need to check
                 * before saying yes — the ticked swaps sitting above it. It
                 * renders after the list and brings itself to the reader; the
                 * scroll is inside `ConfirmBar` so the land list below cannot
                 * end up with a confirmation that reads as inert.
                 */
                <SwapsSection
                  suggestions={swapSuggestions}
                  onToggle={toggleSwapSuggestion}
                  onApplySingle={applySingleSwap}
                  onApplySelected={() => setShowConfirmSwaps(true)}
                  onFindMoreSwaps={findMoreSwaps}
                  isApplying={isApplying}
                  isLoadingMore={isLoadingMoreSwaps}
                  useCollection={useCollection}
                  footer={
                    showConfirmSwaps ? (
                      <ConfirmBar
                        question={`Apply ${selectedSwapCount} swap${
                          selectedSwapCount === 1 ? '' : 's'
                        } to the deck? The cards above are replaced.`}
                        confirmLabel="Confirm swaps"
                        busyLabel="Applying…"
                        onConfirm={applySelectedSwaps}
                        onCancel={() => setShowConfirmSwaps(false)}
                        busy={isApplying}
                      />
                    ) : null
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="lands" className="mt-6">
              <LandRecommendationsSection
                currentLandCount={landCount}
                idealLandCount={idealLandCount}
                recommendations={landRecommendations}
                manaProfile={engine?.profile ?? null}
                basicFiller={basicFiller}
                swaps={landSwapSuggestions}
                onToggleSwap={toggleLandSwap}
                onApplySingleSwap={applySingleLandSwap}
                onApplySelectedSwaps={() => setShowConfirmLandSwaps(true)}
                swapConfirm={
                  showConfirmLandSwaps ? (
                    <ConfirmBar
                      question={`Apply ${selectedLandSwapCount} land swap${
                        selectedLandSwapCount === 1 ? '' : 's'
                      } to the deck? The lands above are replaced, and the land count stays where it is.`}
                      confirmLabel="Confirm land swaps"
                      busyLabel="Applying…"
                      onConfirm={applySelectedLandSwaps}
                      onCancel={() => setShowConfirmLandSwaps(false)}
                      busy={isApplying}
                    />
                  ) : null
                }
                landSlots={fillPlan?.landSlots ?? null}
                emptySlots={fillPlan?.emptySlots ?? null}
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

/**
 * The optimiser is one pass in five parts, in the order they are worth doing:
 * see the shape of the deck, find what is missing, find what is weakest, trade
 * one for the other, then fix the mana that has to cast all of it.
 *
 * Every one of these is always present. Add and Cut used to be mutually
 * exclusive on deck size, which meant a legal sized deck was never shown a
 * single card worth cutting.
 */
const STEPS = [
  { value: 'overview', label: 'Overview', icon: Target },
  { value: 'additions', label: 'Ideas', icon: Plus },
  { value: 'removals', label: 'Cut', icon: Trash2 },
  { value: 'swaps', label: 'Swaps', icon: ArrowRight },
  { value: 'lands', label: 'Lands', icon: Mountain },
] as const;

/**
 * The same five, reordered for a deck that is short of lands.
 *
 * "Mana last" is the right order for a deck whose mana base is fine and the
 * wrong one for a deck that cannot cast what it already plays. When the edge
 * function counts land slots among the empty ones, Lands becomes step two and
 * the strip says why: a spell you cannot cast is worth less than the land that
 * casts it.
 *
 * Written out rather than sorted, because there are five of them and a list
 * you can read is worth more than a rule you have to run.
 */
const LANDS_FIRST_STEPS = [
  { value: 'overview', label: 'Overview', icon: Target },
  { value: 'lands', label: 'Lands', icon: Mountain },
  { value: 'additions', label: 'Ideas', icon: Plus },
  { value: 'removals', label: 'Cut', icon: Trash2 },
  { value: 'swaps', label: 'Swaps', icon: ArrowRight },
] as const;

/** The step number, ticked once the reader has actually opened that tab. */
function StepMark({ index, seen }: { index: number; seen: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold tabular-nums',
        seen ? 'bg-foreground/85 text-background' : 'bg-background/60 text-muted-foreground'
      )}
    >
      {seen ? <Check className="h-3 w-3" /> : index}
    </span>
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
