import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CardImage } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { OracleText } from '@/components/cards/OracleText';
import { VisualDeckView } from '@/components/deck-builder/VisualDeckView';
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { EdhAnalysisPanel, EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import { DeckValidationPanel } from '@/components/deck-builder/DeckValidationPanel';
import { DeckCompatibilityChecker } from '@/components/deck-builder/DeckCompatibilityChecker';
import { CommanderPowerDisplay } from '@/components/deck-builder/CommanderPowerDisplay';
import { PowerScore } from '@/components/deck/PowerScore';
import { computeDeckPower, entriesFromStoreCards } from '@/lib/deck/power';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { deriveCardTags } from '@/lib/cards/tagger';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import {
  Crown,
  Save,
  RotateCcw,
  ExternalLink,
  Copy,
  List,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { showSuccess } from '@/components/ui/toast-helpers';
import { categorizeCard, type CardCategory } from '@/components/deck-builder/deck-categories';

/**
 * The finished deck.
 *
 * This is the surface the owner singled out as worth keeping — the EDH analysis
 * panel, compatibility checker, validation panel, archetype detection, budget
 * tracker and enhanced analysis all still mount here, unchanged in behaviour.
 * What changed is the frame around them: the commander is a whole card instead
 * of a 48px crop, the canonical power score is the first thing on the page
 * rather than the fifth item in a tab, and nothing is boxed in a border.
 */

interface AIGeneratedDeckListProps {
  deckName: string;
  cards: any[];
  commander?: any;
  power?: number;
  edhPowerLevel?: number | null;
  edhPowerUrl?: string | null;
  totalValue?: number;
  analysis?: any;
  edhAnalysisData?: EdhAnalysisData | null;
  changelog?: any[];
  onSaveDeck: () => void;
  onStartOver: () => void;
  onRefreshEdhAnalysis?: () => void;
  isLoadingEdhAnalysis?: boolean;
  isSaving?: boolean;
}

export function AIGeneratedDeckList({
  deckName,
  cards,
  commander,
  power,
  edhPowerLevel,
  edhPowerUrl,
  totalValue,
  analysis,
  edhAnalysisData,
  changelog,
  onSaveDeck,
  onStartOver,
  onRefreshEdhAnalysis,
  isLoadingEdhAnalysis = false,
  isSaving = false,
}: AIGeneratedDeckListProps) {
  const [activeTab, setActiveTab] = useState('cards');

  // Transform cards for VisualDeckView format
  const transformedCards = useMemo(() => {
    return cards.map(card => ({
      id: card.id || `card-${Math.random()}`,
      name: card.name,
      quantity: card.quantity || 1,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      mana_cost: card.mana_cost,
      image_uris: card.image_uris,
      prices: card.prices,
      oracle_text: card.oracle_text,
      // `ArchetypeDetection` below counts role tags. Generated cards arrive
      // without them, so they are derived from the same rules the database
      // uses; dropping the field made every tag-keyed detector report zero.
      tags: card.tags?.length ? card.tags : deriveCardTags(card),
    }));
  }, [cards]);

  /** The generated list, scored by the canonical engine. */
  const generatedPower = useMemo(
    () =>
      computeDeckPower(
        entriesFromStoreCards(transformedCards as any, commander as any),
        { format: 'commander' }
      ),
    [transformedCards, commander]
  );

  // Stats use the shared classifier and count copies, not distinct entries.
  const stats = useMemo(() => {
    const typeCounts: Partial<Record<CardCategory, number>> = {};
    let totalCards = 0;
    let cmcSum = 0;
    let nonLandCopies = 0;

    for (const card of cards) {
      const qty = card.quantity || 1;
      totalCards += qty;
      const category = categorizeCard(card);
      typeCounts[category] = (typeCounts[category] ?? 0) + qty;
      if (category !== 'lands') {
        cmcSum += (card.cmc || 0) * qty;
        nonLandCopies += qty;
      }
    }

    const value =
      totalValue ||
      cards.reduce((sum, card) => {
        const price = parseFloat(card.prices?.usd || '0');
        return sum + price * (card.quantity || 1);
      }, 0);

    return {
      totalCards,
      typeCounts,
      avgCmc: nonLandCopies > 0 ? cmcSum / nonLandCopies : 0,
      totalValue: value,
    };
  }, [cards, totalValue]);

  // Generate decklist text
  const generateDecklistText = () => {
    let text = '';
    if (commander) text += `1 ${commander.name} *CMDR*\n\n`;

    const grouped = cards.reduce((acc, card) => {
      const type = card.type_line?.split('—')[0].trim() || 'Other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(card);
      return acc;
    }, {} as Record<string, any[]>);

    for (const [type, typeCards] of Object.entries(grouped)) {
      text += `// ${type}\n`;
      for (const card of typeCards as any[]) {
        text += `${card.quantity || 1} ${card.name}\n`;
      }
      text += '\n';
    }
    return text;
  };

  const copyDecklist = () => {
    navigator.clipboard.writeText(generateDecklistText());
    showSuccess('Decklist Copied', 'Decklist has been copied to clipboard');
  };

  const edhUrl =
    edhPowerUrl ||
    (() => {
      let decklistParam = '';
      if (commander) decklistParam += `1x+${encodeURIComponent(commander.name)}~`;
      cards.forEach(card => {
        decklistParam += `${card.quantity || 1}x+${encodeURIComponent(card.name)}~`;
      });
      if (decklistParam.endsWith('~')) decklistParam = decklistParam.slice(0, -1);
      return `https://edhpowerlevel.com/?d=${decklistParam}`;
    })();

  /*
   * `stats.totalCards` sums quantities, and this is the same array the save
   * path folds into deck_cards rows — so this badge and the database now agree
   * by construction. It used to read "100 cards / Legal count" over a deck that
   * persisted 93, because the save path filtered rows out of this array on its
   * way to Postgres.
   */
  const totalWithCommander = stats.totalCards + (commander ? 1 : 0);
  const isValidCount = totalWithCommander === 100 && !!commander;

  const commanderColors = commander?.color_identity || commander?.colors || [];

  return (
    <div className="space-y-4">
      {/* The deck, its commander and the canonical score, on one screen. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          {commander && (
            <div className="flex justify-center">
              <CardImage card={commander} size="xl" eager className="max-w-full" />
            </div>
          )}

          <div className="space-y-1.5">
            <h2 className="text-lg font-bold leading-tight">{deckName}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <ColorIdentity colors={commanderColors} size="sm" />
              <span className="text-xs tabular-nums text-muted-foreground">
                {totalWithCommander} cards
              </span>
              {isValidCount ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Legal count
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {totalWithCommander}/100
                </Badge>
              )}
            </div>
            {commander && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Crown className="h-3.5 w-3.5 text-type-commander" />
                {commander.name}
              </p>
            )}
          </div>

          {commander?.oracle_text && (
            <div className="rounded-lg bg-muted/40 p-3">
              <OracleText
                text={commander.oracle_text}
                size="xs"
                className="text-xs leading-relaxed"
              />
            </div>
          )}

          <div className="grid gap-2 pt-1">
            <Button onClick={onSaveDeck} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving…' : 'Save to my decks'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={copyDecklist} variant="secondary" size="sm">
                <Copy className="mr-2 h-4 w-4" />
                Copy list
              </Button>
              {edhUrl ? (
                <Button variant="secondary" size="sm" asChild>
                  <a href={edhUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    EDH power
                  </a>
                </Button>
              ) : (
                <span />
              )}
            </div>
            <Button onClick={onStartOver} variant="ghost" size="sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Start over
            </Button>
          </div>
        </aside>

        {/* The one power score, from the one engine, above everything else. */}
        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5">
          <PowerScore power={generatedPower} variant="expanded" />
        </div>
      </div>

      {/* edhpowerlevel.com — attributed, on its own line, never inside the
          deck's own stat strip and never in the canonical power colour. */}
      {edhPowerLevel !== null && edhPowerLevel !== undefined && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/30 p-3 text-sm shadow-sm">
          <span className="font-medium">edhpowerlevel.com says</span>
          <span className="text-lg font-semibold tabular-nums">
            {edhPowerLevel.toFixed(1)}/10
          </span>
          <span className="text-xs text-muted-foreground">
            a second opinion — the score above is DeckMatrix&apos;s own
          </span>
        </div>
      )}

      <DeckQuickStats
        totalCards={stats.totalCards}
        typeCounts={stats.typeCounts}
        avgCmc={stats.avgCmc}
        totalValue={stats.totalValue}
        format="commander"
        commanderName={commander?.name}
        colors={commanderColors}
        ownedPct={null}
        missingCards={null}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="inline-flex h-auto w-full justify-start gap-1 bg-muted/40 p-1">
          {(
            [
              ['cards', 'Cards', Layers, stats.totalCards],
              ['analysis', 'Analysis', BarChart3, null],
              ['log', 'Build log', List, changelog?.length || null],
            ] as const
          ).map(([value, label, Icon, count]) => (
            <TabsTrigger key={value} value={value} className="gap-2 px-4">
              <Icon className="h-4 w-4" />
              {label}
              {count ? (
                <span
                  className={cn(
                    'rounded bg-foreground/10 px-1.5 py-0.5 text-[0.7rem] tabular-nums'
                  )}
                >
                  {count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="cards" className="mt-4">
          {/* Real cards, at size, grouped by category — the same view the deck
              builder uses, so the list looks identical before and after saving. */}
          <VisualDeckView
            cards={transformedCards}
            commander={commander}
            format="commander"
            // The commander is already the hero of this screen, and this view's
            // own commander block links to the deck builder's picker — a route
            // for a deck that does not exist yet.
            showCommander={false}
          />
        </TabsContent>

        <TabsContent value="analysis" className="mt-4 space-y-4">
          <EdhAnalysisPanel
            data={edhAnalysisData || null}
            isLoading={isLoadingEdhAnalysis}
            needsRefresh={!edhAnalysisData}
            onRefresh={onRefreshEdhAnalysis || (() => {})}
          />

          {commander && (
            <DeckCompatibilityChecker
              cards={transformedCards as any}
              commander={commander}
              format="commander"
              onRemoveCard={() => {}}
            />
          )}

          <DeckValidationPanel
            cards={transformedCards as any}
            format="commander"
            commander={commander}
          />

          <CommanderPowerDisplay power={generatedPower} commanderName={commander?.name} />

          <ArchetypeDetection
            deckCards={transformedCards as any}
            commander={commander}
            format="commander"
          />

          <DeckBudgetTracker
            deckCards={transformedCards as any}
            targetBudget={totalValue || 200}
          />

          <EnhancedDeckAnalysisPanel
            deck={transformedCards as any}
            format="commander"
            commander={commander}
            deckName={deckName}
          />

          {analysis?.strategy && (
            <section className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5">
              <h3 className="mb-2 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Crown className="h-4 w-4 text-type-commander" />
                Deck strategy
              </h3>
              <p className="text-sm text-muted-foreground">{analysis.strategy}</p>
            </section>
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <section className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5">
            <h3 className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Build log
            </h3>
            {changelog && changelog.length > 0 ? (
              <ol className="space-y-1.5">
                {changelog.map((entry, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 text-sm"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground/10 text-[0.65rem] font-semibold tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      {typeof entry === 'string' ? entry : JSON.stringify(entry)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                The builder did not return a step-by-step log for this deck.
              </p>
            )}

            {analysis?.aiFeedback && (
              <div className="mt-5 rounded-lg bg-muted/40 p-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Crown className="h-4 w-4 text-type-commander" />
                  Builder notes
                </h4>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {analysis.aiFeedback}
                </p>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
