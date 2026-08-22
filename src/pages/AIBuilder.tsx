import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, ChevronRight } from 'lucide-react';

import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { AIGeneratedDeckList } from '@/components/deck-builder/AIGeneratedDeckList';
import { CommanderStage, type CommanderSource } from '@/components/ai-builder/CommanderStage';
import { ConfigureStage, type BuildConfig } from '@/components/ai-builder/ConfigureStage';
import { BuildStage, type BuildPhase } from '@/components/ai-builder/BuildStage';
import { useCommanderBrowse } from '@/components/ai-builder/useCommanderBrowse';
import {
  EMPTY_COMMANDER_FILTERS,
  buildCommanderQuery,
  commanderSearchUrl,
  type CommanderFilters,
} from '@/components/ai-builder/commander-query';

import { supabase } from '@/integrations/supabase/client';
import { uniqueCards } from '@/lib/cards/cardQuery';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { useAuth } from '@/components/AuthProvider';
import { CommanderIntelligence } from '@/lib/deckbuilder/commander-intelligence';
import { scoreDeckById, computeDeckPower, entriesFromStoreCards } from '@/lib/deck/power';
import { comparePower, logDivergence } from '@/lib/deck/powerCalibration';
import { cn } from '@/lib/utils';

/**
 * The Deck Generator.
 *
 * Three screens, full width the whole way: pick a commander from a wall of
 * commanders, set the constraints with that commander on screen, then watch the
 * deck assemble card by card into the finished list and its analysis.
 *
 * This page used to strand all of that in a stack of bordered boxes about
 * two-thirds of a laptop screen wide — twelve commander thumbnails inside a
 * card, a 64px crop of art standing in for the commander during configuration,
 * and a centred spinner over a `max-w-2xl` checklist for the build itself. The
 * state machine underneath is unchanged; the flow it drives is not.
 *
 * What deliberately did *not* change: `AIGeneratedDeckList` and everything it
 * mounts — the EDH analysis panel, compatibility checker, validation panel,
 * archetype detection, budget tracker and enhanced analysis. Those are the best
 * part of this feature. They are restyled, not replaced.
 */

/**
 * The phases this page actually performs, in the order it performs them.
 *
 * The old list had nine entries including "Iterative Refinement — Replacing
 * weak cards with better options" and "Budget Optimization — Finding cheaper
 * alternatives if needed". Neither happens anywhere in this file; they were
 * captions over `await new Promise(r => setTimeout(r, 600))`. Every row below
 * corresponds to real work in `handleBuild`.
 */
const BUILD_PHASES: BuildPhase[] = [
  { id: 'analyzing', label: 'Reading the commander', description: 'Colour identity and rules text' },
  { id: 'planning', label: 'Choosing the pool', description: 'Card search and AI planning' },
  { id: 'assembling', label: 'Placing cards', description: 'Staples, roles, curve and manabase' },
  { id: 'colors', label: 'Colour identity', description: 'Every card legal in the command zone' },
  { id: 'edh', label: 'EDH power check', description: 'Scored against edhpowerlevel.com' },
  { id: 'budget', label: 'Totalling prices', description: 'Live Scryfall prices per card' },
  { id: 'complete', label: 'Ready', description: 'Deck list ready to review' },
];

const POPULAR_URL = commanderSearchUrl('is:commander legal:commander', 'edhrec');

const DEFAULT_CONFIG: BuildConfig = {
  archetype: '',
  targetPower: 6,
  maxBudget: 500,
  customPrompt: '',
  includeLands: true,
  prioritizeSynergy: true,
  includeBasics: true,
};

type Stage = 'commander' | 'configure' | 'result';
const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'commander', label: 'Commander' },
  { id: 'configure', label: 'Configure' },
  { id: 'result', label: 'Deck' },
];

export default function AIBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [stage, setStage] = useState<Stage>('commander');

  /* ---------------------------------------------------------------- *
   * Commander selection
   * ---------------------------------------------------------------- */

  const [commander, setCommander] = useState<any>(null);
  const [commanderSearch, setCommanderSearch] = useState('');
  const [filters, setFilters] = useState<CommanderFilters>(EMPTY_COMMANDER_FILTERS);
  const [sortOrder, setSortOrder] = useState('edhrec');
  const [finderActive, setFinderActive] = useState(false);

  /* One query at a time, chosen by what the reader last did. Three separate
     browse hooks used to run side by side so that clearing a box did not
     re-fetch the wall; the page cache in `useScryfallPage` covers that now, and
     covers every page already seen rather than only the first.

     The 400ms debounce that used to sit here is gone. `ListingSearch` inside
     the wall holds the draft and commits on the shared 250ms, so what arrives
     at `setCommanderSearch` is already settled text and there is nothing left
     to wait out. The audit counted 250, 300, 400 and 220ms across the product
     with no reason recorded for any of them. */
  const committedSearch = commanderSearch.trim();

  /** The finder's query, frozen when Search was pressed rather than live. */
  const [finderUrl, setFinderUrl] = useState<string | null>(null);

  const source: CommanderSource = committedSearch
    ? 'search'
    : finderActive
      ? 'finder'
      : 'popular';

  const browseUrl = useMemo(() => {
    if (source === 'search') {
      return commanderSearchUrl(`${committedSearch} is:commander legal:commander`, 'edhrec');
    }
    if (source === 'finder') return finderUrl;
    return POPULAR_URL;
  }, [source, committedSearch, finderUrl]);

  const browse = useCommanderBrowse({
    url: browseUrl,
    sizeKey: 'ai-builder-commanders',
  });

  const runFinderSearch = () => {
    setCommanderSearch('');
    setFinderActive(true);
    setFinderUrl(commanderSearchUrl(buildCommanderQuery(filters), sortOrder));
  };

  const clearFinder = () => {
    setFilters(EMPTY_COMMANDER_FILTERS);
    setFinderActive(false);
    setFinderUrl(null);
  };

  /* ---------------------------------------------------------------- *
   * Archetype analysis
   * ---------------------------------------------------------------- */

  const [suggestedArchetypes, setSuggestedArchetypes] = useState<any[]>([]);
  const [analyzingCommander, setAnalyzingCommander] = useState(false);
  const [pendingCommander, setPendingCommander] = useState<any>(null);

  /**
   * `targetPower` is what the player is *aiming for*, not a measurement of
   * anything. It used to be called `powerLevel`, the same identifier the app
   * used for three other things, and the slider's value was written straight
   * into `user_decks.power_level` — so a build target ended up displayed as the
   * finished deck's power level.
   */
  const [config, setConfig] = useState<BuildConfig>(() => {
    const power = Number(searchParams.get('power'));
    return {
      ...DEFAULT_CONFIG,
      targetPower: Number.isFinite(power) && power >= 1 && power <= 10 ? Math.round(power) : 6,
    };
  });

  /**
   * `/decks` links here as `/smart-builder?archetype=…&power=…` from its deck
   * templates. Both were silently ignored, so every template landed on the same
   * default build. The power lands in the initial config above; the archetype
   * waits until the commander's own archetypes come back and is then matched
   * against them.
   */
  const requestedArchetype = searchParams.get('archetype');

  const generateLocalArchetypes = (cmdr: any) => {
    const text = (cmdr.oracle_text || '').toLowerCase();
    const archetypes: any[] = [];

    if (text.includes('token') || text.includes('create')) {
      archetypes.push({ value: 'tokens', label: 'Token Strategy', description: 'Generate creature tokens for wide board presence', synergy: 'Commander creates or benefits from tokens', powerLevel: 6 });
    }
    if (text.includes('sacrifice') || text.includes('dies')) {
      archetypes.push({ value: 'aristocrats', label: 'Aristocrats', description: 'Sacrifice creatures for value and damage', synergy: 'Commander rewards sacrifice effects', powerLevel: 7 });
    }
    if (text.includes('+1/+1') || text.includes('counter')) {
      archetypes.push({ value: 'counters', label: '+1/+1 Counters', description: 'Build and distribute counters for growing threats', synergy: 'Commander interacts with counters', powerLevel: 6 });
    }
    if (text.includes('draw') || text.includes('card')) {
      archetypes.push({ value: 'value', label: 'Value Engine', description: 'Generate card advantage through commander', synergy: 'Commander provides card draw', powerLevel: 7 });
    }

    if (archetypes.length < 4) {
      archetypes.push({ value: 'midrange', label: 'Midrange', description: 'Balanced approach with efficient threats', synergy: 'Versatile strategy for any commander', powerLevel: 6 });
      archetypes.push({ value: 'control', label: 'Control', description: 'Counter threats and control the game', synergy: 'Protect your commander while disrupting opponents', powerLevel: 7 });
      archetypes.push({ value: 'aggro', label: 'Aggro', description: 'Fast, aggressive creature strategy', synergy: 'Pressure opponents early', powerLevel: 5 });
      archetypes.push({ value: 'combo', label: 'Combo', description: 'Build towards game-winning combinations', synergy: 'Commander enables or protects combos', powerLevel: 8 });
    }

    return archetypes.slice(0, 4);
  };

  /** Preselect the archetype `/decks` asked for, when the commander offers one like it. */
  const applyRequestedArchetype = useCallback(
    (archetypes: any[]) => {
      if (!requestedArchetype) return;
      const wanted = requestedArchetype.toLowerCase();
      const match = archetypes.find(
        a =>
          a.value === wanted ||
          String(a.label || '').toLowerCase().replace(/\s+/g, '-') === wanted
      );
      if (match) setConfig(prev => ({ ...prev, archetype: match.value }));
    },
    [requestedArchetype]
  );

  const localArchetypesFor = (selected: any) => {
    // Kept for its side effect on the local intelligence path: the detector is
    // what the fallback list is derived from when the AI response is unusable.
    CommanderIntelligence.detectArchetype({
      name: selected.name,
      oracle_text: selected.oracle_text || '',
      type_line: selected.type_line || '',
      color_identity: selected.color_identity || [],
      colors: selected.colors || [],
    } as any);
    return generateLocalArchetypes(selected);
  };

  const analyzeCommander = async (selectedCommander: any) => {
    if (!selectedCommander) return;

    setAnalyzingCommander(true);
    try {
      const { data, error } = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: `Analyze commander "${selectedCommander.name}" for deck building.
          Color Identity: ${selectedCommander.color_identity?.join('') || 'Colorless'}
          Abilities: ${selectedCommander.oracle_text || 'None'}

          Suggest exactly 4 specific archetypes that synergize with this commander.
          For each archetype, provide:
          1. Name
          2. Brief description (1 sentence)
          3. Why it synergizes with this commander
          4. Recommended power level (1-10)

          Format as JSON array: [{"name": "", "description": "", "synergy": "", "powerLevel": 6}]`,
          cards: [],
        },
      });

      if (!error && data?.message) {
        try {
          const jsonMatch = data.message.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const archetypes = parsed.map((a: any) => ({
              value: a.name.toLowerCase().replace(/\s+/g, '-'),
              label: a.name,
              description: a.description,
              synergy: a.synergy,
              powerLevel: a.powerLevel || 6,
            }));
            setSuggestedArchetypes(archetypes);
            applyRequestedArchetype(archetypes);
            setStage('configure');
            return;
          }
        } catch {
          console.log('Failed to parse AI archetypes, using local analysis');
        }
      }

      const fallback = localArchetypesFor(selectedCommander);
      setSuggestedArchetypes(fallback);
      applyRequestedArchetype(fallback);
      setStage('configure');
    } catch (error) {
      console.error('Commander analysis failed:', error);
      const fallback = localArchetypesFor(selectedCommander);
      setSuggestedArchetypes(fallback);
      applyRequestedArchetype(fallback);
      setStage('configure');
    } finally {
      setAnalyzingCommander(false);
      setPendingCommander(null);
    }
  };

  const selectCommander = async (cmdr: any) => {
    setPendingCommander(cmdr);

    // Entries without an id (legacy shapes) get resolved against Scryfall first.
    if (!cmdr.id) {
      try {
        const response = await fetch(
          `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmdr.name)}`
        );
        if (response.ok) {
          const card = await response.json();
          setCommander(card);
          setPendingCommander(card);
          analyzeCommander(card);
          return;
        }
      } catch (e) {
        console.error('Failed to fetch commander:', e);
      }
    }
    setCommander(cmdr);
    analyzeCommander(cmdr);
  };

  /* ---------------------------------------------------------------- *
   * Build
   * ---------------------------------------------------------------- */

  const [building, setBuilding] = useState(false);
  const [buildPhase, setBuildPhase] = useState(0);
  const [buildCards, setBuildCards] = useState<any[]>([]);
  const [revealDone, setRevealDone] = useState(false);
  const [pendingResult, setPendingResult] = useState<any>(null);
  const [buildResult, setBuildResult] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [loadingEdhAnalysis, setLoadingEdhAnalysis] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * The result screen waits for the deck to finish arriving on screen.
   *
   * Both halves are real: `pendingResult` is the finished build, `revealDone`
   * means every returned card has been drawn. Whichever lands second moves the
   * page on, so the assembly is never cut off mid-flight and never pads the
   * wait once it is over.
   */
  useEffect(() => {
    if (pendingResult && revealDone) {
      setBuildResult(pendingResult);
      setPendingResult(null);
      setBuilding(false);
      setStage('result');
    }
  }, [pendingResult, revealDone]);

  const onRevealComplete = useCallback(() => setRevealDone(true), []);

  /**
   * Edge functions signal refusal with a non-2xx status, and `functions.invoke`
   * surfaces that as an error whose `.message` is only "Edge Function returned a
   * non-2xx status code". The sentence worth reading is in the response body, so
   * read it — otherwise a precise server-side diagnosis ("Plains is not in the
   * card database") reaches the player as "Build failed."
   */
  const readFunctionError = async (error: any, fallback: string): Promise<string> => {
    try {
      const ctx = error?.context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) return String(body.error);
      }
    } catch {
      // body already consumed, or not JSON — fall through to the message
    }
    return error?.message || fallback;
  };

  const handleBuild = async () => {
    if (!commander || !config.archetype) return;

    if (!commander.color_identity) {
      setBuildError(
        `Scryfall returned no colour identity for ${commander.name}. Reselect the commander before building.`
      );
      return;
    }

    setBuilding(true);
    setBuildPhase(0);
    setBuildCards([]);
    setRevealDone(false);
    setPendingResult(null);
    setValidationErrors([]);
    setBuildError(null);
    setSaveError(null);

    const errors: string[] = [];

    try {
      setBuildPhase(1);

      const { data, error } = await supabase.functions.invoke('ai-deck-builder-v2', {
        body: {
          commander: {
            id: commander.id,
            name: commander.name,
            oracle_text: commander.oracle_text,
            type_line: commander.type_line,
            color_identity: commander.color_identity || [],
            colors: commander.colors || [],
          },
          archetype: config.archetype,
          powerLevel: config.targetPower,
          budget: config.maxBudget,
          customPrompt: config.customPrompt,
          useAIPlanning: true,
          prioritizeSynergy: config.prioritizeSynergy,
          includeLands: config.includeLands,
        },
      });

      if (error) {
        throw new Error(
          await readFunctionError(error, 'The deck builder could not complete this build.')
        );
      }
      if (!data) throw new Error('The deck builder returned nothing.');
      if (data.error) throw new Error(String(data.error));

      const deckCards: any[] = data.result?.deck || data.cards || [];

      /*
       * Count COPIES, never rows, and do it before anything reaches the screen.
       *
       * A Commander deck is 100 physical cards held in far fewer array entries,
       * because basics stack. The old page showed `cards.length` styled as a
       * total and then saved a different number: the result screen read
       * "100 cards / Valid" over a deck that persisted 93. This is the same
       * array the save path folds into rows, so the two cannot disagree.
       */
      const generatedCopies = deckCards.reduce(
        (sum: number, card: any) => sum + Math.max(1, Number(card.quantity) || 1),
        0
      );
      const generatedTotal = generatedCopies + 1; // + the commander
      if (generatedTotal !== 100) {
        throw new Error(
          `The builder returned ${generatedTotal} cards, not 100. Nothing was saved — try again.`
        );
      }

      const unsaveable = deckCards.filter(
        (card: any) =>
          !card?.id ||
          typeof card.id !== 'string' ||
          card.id.includes('pad-') ||
          card.id.startsWith('missing-basic-')
      );
      if (unsaveable.length > 0) {
        throw new Error(
          `${unsaveable.length} generated cards have no database id ` +
            `(${unsaveable.slice(0, 3).map((c: any) => c.name).join(', ')}). This deck cannot be saved.`
        );
      }

      // The cards exist now, so they go on screen now.
      setBuildPhase(2);
      setBuildCards(deckCards);
      if (deckCards.length === 0) setRevealDone(true);

      // Colour identity.
      setBuildPhase(3);
      const commanderColors = new Set(commander.color_identity || []);
      const colorViolations = deckCards.filter((card: any) =>
        (card.color_identity || []).some((c: string) => !commanderColors.has(c))
      );
      if (colorViolations.length > 0) {
        errors.push(`${colorViolations.length} cards violate colour identity`);
      }

      // Advisories the builder itself raised (land count, budget). Anything
      // that would make the deck unsaveable came back as a 422, not as an issue.
      errors.push(...((data.result?.validation?.issues as string[]) || []));

      // Power check.
      //
      // This gate used to be decided by the scrape: if edhpowerlevel's number
      // came back below the target it was reported to the user as a build
      // failure. That made a third party's regex-parsed HTML the authority on
      // whether OUR builder had done its job, and it failed open in the worst
      // direction, because `if (edhPowerLevel && ...)` treats a scrape that
      // returned nothing as a pass.
      //
      // Our own engine decides now. The scrape stays, as a labelled second
      // opinion and a calibration reading, and it can neither pass nor fail a
      // build.
      setBuildPhase(4);
      const builtPower = computeDeckPower(
        entriesFromStoreCards(
          deckCards.map((card: any) => ({ ...card, quantity: card.quantity || 1 })),
          commander as any
        ),
        { format: 'commander' }
      );
      if (builtPower && builtPower.score < config.targetPower - 1) {
        errors.push(
          `This deck scores ${builtPower.score.toFixed(1)} out of 10, under the ` +
            `${config.targetPower} you asked for. ${builtPower.drags[0] ?? ''}`.trim()
        );
      }

      // Never blocks: if their site is unreachable the build carries on.
      let edhPowerLevel: number | null = null;
      let calibration: ReturnType<typeof comparePower> | null = null;
      try {
        const { data: powerCheckData } = await supabase.functions.invoke('edh-power-check', {
          body: { decklist: { commander, cards: deckCards } },
        });
        edhPowerLevel = powerCheckData?.powerLevel ?? null;
        if (builtPower) {
          calibration = comparePower(builtPower.score, edhPowerLevel);
          logDivergence(commander?.name ?? 'new deck', calibration);
        }
        if (calibration?.worthShowing && calibration.note) errors.push(calibration.note);
      } catch (error) {
        console.warn('edhpowerlevel check unavailable, continuing:', error);
      }

      // Budget, from live prices on the cards that were actually picked.
      setBuildPhase(5);
      const totalValue = deckCards.reduce((sum: number, card: any) => {
        const price = parseFloat(card.prices?.usd || '0');
        return sum + price * (card.quantity || 1);
      }, 0);
      if (totalValue > config.maxBudget * 1.1) {
        errors.push(`Deck costs $${totalValue.toFixed(0)}, over the $${config.maxBudget} budget`);
      }

      setBuildPhase(6);

      const fallbackEdhUrl = (() => {
        try {
          let decklistParam = '';
          if (commander) decklistParam += `1x+${encodeURIComponent(commander.name)}~`;
          deckCards.forEach((card: any) => {
            decklistParam += `${card.quantity || 1}x+${encodeURIComponent(card.name)}~`;
          });
          if (decklistParam.endsWith('~')) decklistParam = decklistParam.slice(0, -1);
          return `https://edhpowerlevel.com/?d=${decklistParam}`;
        } catch {
          return null;
        }
      })();

      setValidationErrors(errors);
      setPendingResult({
        deckName: `${commander?.name || 'New'} ${config.archetype} Deck`,
        cards: deckCards,
        deckId: data.deckId,
        power: data.result?.analysis?.power || data.power || config.targetPower,
        edhPowerLevel: edhPowerLevel ?? null,
        edhPowerUrl: fallbackEdhUrl,
        totalValue,
        analysis: data.result?.analysis || data.analysis || {},
        changelog: data.result?.changeLog || data.changelog || [],
        aiFeedback: data.result?.aiFeedback,
        // Verified above, by summing quantity over the array that gets saved.
        totalCards: generatedTotal,
        // Computed from this run's findings, not from a state value that has
        // not committed yet — the old check read `validationErrors`, which was
        // always the previous render's empty array.
        validationPassed: errors.length === 0,
      });
    } catch (error: any) {
      console.error('Build error:', error);
      setBuilding(false);
      setBuildCards([]);
      const message = error?.message || 'The deck build failed.';
      setBuildError(message);
      showError('Build failed', message);
    }
  };

  /* ---------------------------------------------------------------- *
   * Save and post-build analysis
   * ---------------------------------------------------------------- */

  /**
   * Resolve the commander to a row that genuinely exists in `cards`.
   *
   * `commander` comes from the Scryfall API, so it always carries an id — which
   * is exactly why the old `if (!commanderId)` name-lookup below it was
   * unreachable. When Scryfall's chosen printing has not been synced locally,
   * `deck_cards_card_id_fkey` rejects the row; the old bare
   * `await ...insert(...)` discarded that error and the deck saved with zero
   * commanders. Confirm the id, fall back to the name, and treat "not in the
   * database" as a failure rather than a console warning.
   */
  const resolveCommanderCardId = async (cmdr: any): Promise<string | null> => {
    if (cmdr?.id) {
      const { data } = await supabase.from('cards').select('id').eq('id', cmdr.id).maybeSingle();
      if (data?.id) return data.id;
    }
    if (cmdr?.name) {
      // By name means by CARD, so read the one-row-per-card source. Against the
      // printings table this would take whichever of a commander's forty rows
      // came back first, and the deck would be saved pointing at a printing
      // nobody chose. cards_unique answers with the cheapest one, every time.
      const { data } = await uniqueCards()
        .select('id')
        .eq('name', cmdr.name)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    return null;
  };

  const saveDeckToDatabase = async () => {
    if (!buildResult || !commander || !user || saving) return;

    setSaving(true);
    setSaveError(null);

    const fail = (message: string) => {
      setSaveError(message);
      showError('Deck not saved', message);
    };

    let createdDeckId: string | null = null;

    try {
      // 1. Resolve the commander BEFORE writing anything, so a commander we
      //    cannot store never leaves an orphaned deck row behind.
      const commanderId = await resolveCommanderCardId(commander);
      if (!commanderId) {
        fail(
          `"${commander.name}" is not in the card database, so it cannot be saved as your ` +
            `commander. Nothing was written. Sync the card data, or pick another commander.`
        );
        return;
      }

      /*
       * 2. Fold the generated list into the exact rows we intend to write,
       *    counting copies rather than entries.
       *
       * This loop used to `continue` past any card whose id started with
       * `missing-basic-`, taking that row's whole `quantity` with it — 10 to 33
       * physical basic lands per row — behind a console.warn nobody ever saw.
       * That one line is where every "why is my deck 79 cards" went. A row that
       * cannot be stored is now a build failure, not a silent deletion.
       */
      const generated: any[] = Array.isArray(buildResult.cards) ? buildResult.cards : [];
      const unusable: string[] = [];
      const cardMap = new Map<string, { id: string; name: string; quantity: number }>();

      for (const card of generated) {
        const id = typeof card?.id === 'string' ? card.id : '';
        if (!id || id.startsWith('missing-basic-') || id.includes('pad-')) {
          unusable.push(card?.name || 'unnamed card');
          continue;
        }
        if (id === commanderId) continue; // written separately, below
        const quantity = Math.max(1, Number(card.quantity) || 1);
        const existing = cardMap.get(id);
        if (existing) existing.quantity += quantity;
        else cardMap.set(id, { id, name: card.name, quantity });
      }

      if (unusable.length > 0) {
        fail(
          `${unusable.length} generated card${unusable.length === 1 ? '' : 's'} ` +
            `(${unusable.slice(0, 3).join(', ')}${unusable.length > 3 ? '…' : ''}) ` +
            `cannot be stored. Nothing was saved — rebuild the deck.`
        );
        return;
      }

      // 3. Hard gate. The number checked here is the number that gets written.
      const deckCopies = Array.from(cardMap.values()).reduce((sum, c) => sum + c.quantity, 0);
      const totalWithCommander = deckCopies + 1;
      if (totalWithCommander !== 100) {
        fail(
          `The generated deck is ${totalWithCommander} cards, not 100. ` +
            `Nothing was saved — rebuild the deck.`
        );
        return;
      }

      // 4. Write.
      const commanderColors = commander?.color_identity || commander?.colors || [];

      const { data: deckRecord, error: deckError } = await supabase
        .from('user_decks')
        .insert({
          user_id: user.id,
          name: buildResult.deckName,
          format: 'commander',
          colors: commanderColors,
          description: `AI-generated ${config.archetype} deck with ${commander.name}.`,
          // power_level is not written here. It used to receive
          // `Math.round(buildResult.power || 6)`, which was the server's own
          // edhpowerlevel.com scrape or — when that failed — the user's target
          // slider, saved as if it were a measurement. The real score is
          // computed from the saved list below.
          is_public: false,
        })
        .select()
        .single();

      if (deckError) throw deckError;
      createdDeckId = deckRecord.id;

      const { error: commanderError } = await supabase.from('deck_cards').insert({
        deck_id: deckRecord.id,
        card_id: commanderId,
        card_name: commander.name,
        quantity: 1,
        is_commander: true,
        is_sideboard: false,
      });
      if (commanderError) {
        throw new Error(`The commander could not be saved: ${commanderError.message}`);
      }

      const cardInserts = Array.from(cardMap.values()).map(card => ({
        deck_id: deckRecord.id,
        card_id: card.id,
        card_name: card.name,
        quantity: card.quantity,
        is_commander: false,
        is_sideboard: false,
      }));

      if (cardInserts.length > 0) {
        /*
         * `deck_cards_deck_id_card_id_unique (deck_id, card_id)` does exist —
         * the comment that used to sit here claimed it did not. The map above
         * already guarantees one row per card_id, so upserting on that
         * constraint changes no behaviour; it just means a single repeated id
         * can no longer void the entire batch and leave a deck with no cards.
         */
        const { error: cardsError } = await supabase
          .from('deck_cards')
          .upsert(cardInserts, { onConflict: 'deck_id,card_id' });
        if (cardsError) {
          throw new Error(`The deck list could not be saved: ${cardsError.message}`);
        }
      }

      // 5. Read the rows back. Not a recount of what we sent — a count of what
      //    Postgres actually holds.
      const { data: written, error: verifyError } = await supabase
        .from('deck_cards')
        .select('quantity, is_commander')
        .eq('deck_id', deckRecord.id);
      if (verifyError) throw verifyError;

      const persisted = (written || []).reduce(
        (sum: number, row: any) => sum + (row.quantity || 1),
        0
      );
      const commanderRows = (written || []).filter((row: any) => row.is_commander).length;

      if (persisted !== 100 || commanderRows !== 1) {
        throw new Error(
          `The database holds ${persisted} cards and ${commanderRows} commander` +
            `${commanderRows === 1 ? '' : 's'} for this deck, not 100 and 1. The deck was rolled back.`
        );
      }

      /*
       * Score the deck the moment it exists, from the rows that were just
       * written. The AI builder used to display 6.28 and save 6 — the /decks
       * tile then showed a third number. All three are now this one.
       */
      await scoreDeckById(deckRecord.id, 'commander');

      showSuccess(
        'Deck saved',
        `${buildResult.deckName} — 100 cards including ${commander.name}.`
      );
      navigate('/decks');
    } catch (error: any) {
      console.error('Error saving deck:', error);
      // Never leave a half-written deck behind. Six empty decks accumulated in
      // the database because this catch used to be a bare console.error.
      if (createdDeckId) {
        await supabase.from('deck_cards').delete().eq('deck_id', createdDeckId);
        await supabase.from('user_decks').delete().eq('id', createdDeckId);
      }
      fail(error?.message || 'Saving the deck failed. Nothing was kept.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Apply the optimiser's swaps to the deck that has not been saved yet.
   *
   * The owner: "you may want to run the optimiser from the generator." This is
   * the write half of that. The panel opens beside the finished deck, and what
   * it changes is this array — the same one the result screen renders, scores
   * and eventually persists — so a swap the player accepts is visible in the
   * grid immediately and is what gets saved.
   *
   * Two rules it will not break:
   *
   * - A card is only removed if it is genuinely in the deck, and the ADDED card
   *   must arrive with a real database id. The optimiser resolves every name it
   *   returns against `cards` before it hands it back, so it has one; a
   *   suggestion that somehow does not is skipped rather than written, because
   *   `deck_cards.card_id` is a foreign key and a deck that cannot be saved is
   *   worse than a deck that ignored one piece of advice.
   * - Copies are preserved. A removed card's quantity moves to the card
   *   replacing it, so the deck stays at 100 and the save gate still passes.
   */
  const applyReplacements = useCallback(
    (
      replacements: Array<{
        remove: string;
        add: string;
        addCardId?: string | null;
        addCard?: any;
      }>
    ) => {
      setBuildResult((prev: any) => {
        if (!prev) return prev;
        const cards: any[] = [...(prev.cards ?? [])];
        let applied = 0;
        let skipped = 0;

        for (const swap of replacements) {
          const index = cards.findIndex(
            c => c.name?.toLowerCase() === swap.remove?.toLowerCase()
          );
          if (index === -1) {
            skipped++;
            continue;
          }
          const incoming = swap.addCard;
          /*
           * The id from OUR `cards` table, which the optimiser resolved, and
           * never the one on the Scryfall object beside it. `deck_cards.card_id`
           * carries a foreign key to `cards.id`, and Scryfall's chosen printing
           * of a card is frequently not the printing we hold — so taking the id
           * off `addCard` would save a deck row that Postgres rejects, or worse,
           * point the deck at a printing nobody selected.
           */
          const id = typeof swap.addCardId === 'string' && swap.addCardId ? swap.addCardId : null;
          if (!id) {
            skipped++;
            continue;
          }
          if (cards.some(c => c.id === id)) {
            // Already in the deck. Adding it again would break singleton and
            // the save gate would then refuse the whole deck.
            skipped++;
            continue;
          }
          cards[index] = {
            ...incoming,
            id,
            name: incoming.name ?? swap.add,
            quantity: cards[index].quantity || 1,
          };
          applied++;
        }

        if (applied === 0) {
          showError(
            'Nothing changed',
            skipped === 1
              ? 'That swap could not be applied to this deck.'
              : `None of those ${skipped} swaps could be applied to this deck.`
          );
          return prev;
        }

        showSuccess(
          applied === 1 ? 'Swap applied' : `${applied} swaps applied`,
          skipped > 0
            ? `${skipped} could not be applied and were left alone. Save the deck to keep the changes.`
            : 'Save the deck to keep the changes.'
        );
        return { ...prev, cards };
      });
    },
    []
  );

  const refreshEdhAnalysis = async () => {
    if (!buildResult || !commander) return;

    setLoadingEdhAnalysis(true);
    try {
      const { data: powerCheckData } = await supabase.functions.invoke('edh-power-check', {
        body: { decklist: { commander, cards: buildResult.cards || [] } },
      });

      if (powerCheckData) {
        // Calibration only. It updates the labelled second-opinion block and
        // never our own score, which is not held in this object.
        logDivergence(
          commander?.name ?? 'deck',
          comparePower(buildResult.power ?? 0, powerCheckData.powerLevel)
        );
        setBuildResult((prev: any) => ({
          ...prev,
          edhPowerLevel: powerCheckData.powerLevel ?? prev.edhPowerLevel,
          edhPowerUrl: powerCheckData.url || prev.edhPowerUrl,
          analysis: {
            ...prev.analysis,
            edhMetrics: powerCheckData.metrics || prev.analysis?.edhMetrics,
            bracket: powerCheckData.bracket || prev.analysis?.bracket,
            cardAnalysis: powerCheckData.cardAnalysis || prev.analysis?.cardAnalysis,
            landAnalysis: powerCheckData.landAnalysis || prev.analysis?.landAnalysis,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to refresh EDH analysis:', error);
    } finally {
      setLoadingEdhAnalysis(false);
    }
  };

  const resetBuilder = () => {
    setStage('commander');
    setBuildResult(null);
    setCommander(null);
    setCommanderSearch('');
    setSuggestedArchetypes([]);
    setValidationErrors([]);
    setBuildError(null);
    setSaveError(null);
    setBuildCards([]);
    setRevealDone(false);
    setPendingResult(null);
    setConfig(DEFAULT_CONFIG);
  };

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  /**
   * The rail is derived from the real state machine. The original mapped
   * `[1, 2, 3]` while `setStep` was only ever called with 1, 2 and 4, so the
   * third dot could never light up.
   */
  const currentStage: Stage = building ? 'result' : stage;
  const stageIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <StandardPageLayout
      title="Deck Generator"
      description="Pick a commander, set your constraints, and watch a 100-card list assemble."
      action={
        <div className="hidden items-center gap-1.5 md:flex">
          {STAGES.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-[0.7rem] font-semibold tabular-nums transition-colors',
                  i < stageIndex
                    ? 'bg-foreground text-background'
                    : i === stageIndex
                      ? 'bg-accent text-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground'
                )}
                aria-current={i === stageIndex ? 'step' : undefined}
              >
                {i < stageIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-xs',
                  i === stageIndex ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
              {i < STAGES.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              )}
            </div>
          ))}
        </div>
      }
    >
      <AnimatePresence mode="wait">
        {stage === 'commander' && !building && (
          <motion.div
            key="commander"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
          >
            <CommanderStage
              cards={browse.cards}
              loading={browse.loading}
              total={browse.total}
              page={browse.page}
              pageCount={browse.pageCount}
              onPageChange={browse.setPage}
              pageSize={browse.pageSize}
              onPageSizeChange={browse.setPageSize}
              error={browse.error}
              source={source}
              searchValue={commanderSearch}
              onSearchChange={setCommanderSearch}
              filters={filters}
              onFiltersChange={setFilters}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
              onRunFinder={runFinderSearch}
              onClearFinder={clearFinder}
              finderSearching={source === 'finder' && browse.loading}
              finderResultCount={source === 'finder' ? browse.total : null}
              onSelect={selectCommander}
              analyzing={analyzingCommander}
              analyzingCard={pendingCommander ?? commander}
            />
          </motion.div>
        )}

        {stage === 'configure' && !building && commander && (
          <motion.div
            key="configure"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
          >
            <ConfigureStage
              commander={commander}
              archetypes={suggestedArchetypes}
              config={config}
              onConfigChange={setConfig}
              onBack={() => {
                setStage('commander');
                setCommander(null);
                setSuggestedArchetypes([]);
              }}
              onBuild={handleBuild}
              building={building}
              error={buildError}
            />
          </motion.div>
        )}

        {building && (
          <motion.div
            key="building"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            <BuildStage
              commander={commander}
              phases={BUILD_PHASES}
              phaseIndex={buildPhase}
              cards={buildCards}
              targetPower={config.targetPower}
              budget={config.maxBudget}
              onRevealComplete={onRevealComplete}
            />
          </motion.div>
        )}

        {stage === 'result' && buildResult && !building && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* A save that failed is the loudest thing on this screen. It used
                to be a console.error nobody saw, under a Save button that
                simply appeared to do nothing. */}
            {saveError && (
              <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-4 shadow-lg shadow-black/20">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <h4 className="text-sm font-semibold text-destructive">Deck not saved</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{saveError}</p>
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <h4 className="text-sm font-semibold text-destructive">
                    {validationErrors.length} thing
                    {validationErrors.length === 1 ? '' : 's'} to look at
                  </h4>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <AIGeneratedDeckList
              deckName={buildResult.deckName}
              cards={buildResult.cards || []}
              commander={commander}
              power={buildResult.power}
              edhPowerLevel={buildResult.edhPowerLevel}
              edhPowerUrl={buildResult.edhPowerUrl}
              totalValue={buildResult.totalValue}
              analysis={buildResult.analysis}
              edhAnalysisData={
                buildResult.analysis?.edhMetrics
                  ? {
                      metrics: buildResult.analysis.edhMetrics,
                      bracket: buildResult.analysis.bracket || null,
                      cardAnalysis: buildResult.analysis.cardAnalysis || [],
                      landAnalysis: buildResult.analysis.landAnalysis || null,
                      url: buildResult.edhPowerUrl,
                    }
                  : null
              }
              changelog={buildResult.changelog}
              onSaveDeck={saveDeckToDatabase}
              onStartOver={resetBuilder}
              onRefreshEdhAnalysis={refreshEdhAnalysis}
              isLoadingEdhAnalysis={loadingEdhAnalysis}
              isSaving={saving}
              onApplyReplacements={applyReplacements}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </StandardPageLayout>
  );
}
