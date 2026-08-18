import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Zap,
  BookOpen,
  Target,
  TrendingUp,
  MessageSquare,
  Lightbulb,
  Trash2,
  Bot,
  User,
  Crown,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { PowerScoreBadge } from '@/components/deck/PowerScore';
import { CommanderHero } from '@/components/deck/CommanderHero';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { supabase } from '@/integrations/supabase/client';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';
import { useOpenCard } from '@/components/cards';
import { CardImage } from '@/components/cards';
import { CardRecommendationDisplay, type CardData as SharedCardData } from '@/components/shared/CardRecommendationDisplay';
import { AIVisualDisplay, type VisualData } from '@/components/shared/AIVisualDisplay';
import { AddCardPanel, type AddableCard } from '@/components/brain/AddCardPanel';
import { DeckContextPanel, type BrainDeckCard } from '@/components/brain/DeckContextPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CardData extends SharedCardData {}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cards?: CardData[];
  visualData?: VisualData;
}

// Quick actions for when a deck IS selected
const DECK_QUICK_ACTIONS = [
  {
    id: 'analyze',
    label: 'Analyze deck',
    description: 'Power level and strategy',
    icon: TrendingUp,
    prompt: "Please analyze my deck's power level, strategy, and provide optimization suggestions.",
  },
  {
    id: 'upgrades',
    label: 'Suggest upgrades',
    description: 'Budget and high-end options',
    icon: Zap,
    prompt: 'What are the best upgrade cards for my deck? Consider both budget and high-end options.',
  },
  {
    id: 'combos',
    label: 'Find combos',
    description: 'Synergies and win conditions',
    icon: Target,
    prompt: 'What are the key combos and synergies in my deck? How can I improve consistency?',
  },
  {
    id: 'meta',
    label: 'Meta analysis',
    description: 'Format positioning',
    icon: BookOpen,
    prompt: 'How does my deck perform in the current meta? What are its strengths and weaknesses?',
  },
  {
    id: 'cuts',
    label: 'What to cut',
    description: 'Identify the weakest slots',
    icon: Lightbulb,
    prompt: 'What cards should I consider cutting from my deck and why?',
  },
  {
    id: 'strategy',
    label: 'Strategy guide',
    description: 'How to pilot the deck',
    icon: MessageSquare,
    prompt: "How should I pilot this deck? What's my game plan and key decision points?",
  },
];

// Quick actions for general MTG questions (no deck)
const GENERAL_QUICK_ACTIONS = [
  {
    id: 'rules',
    label: 'Rules question',
    description: 'Mechanics and interactions',
    icon: BookOpen,
    prompt: 'Explain how the stack works and priority in Magic.',
  },
  {
    id: 'commander',
    label: 'Commander advice',
    description: 'EDH deck building',
    icon: Crown,
    prompt: 'What makes a good Commander deck? Explain the key components and ratios.',
  },
  {
    id: 'staples',
    label: 'Format staples',
    description: 'Must-have cards by colour',
    icon: Zap,
    prompt: 'What are the must-have staple cards for Commander in each color?',
  },
  {
    id: 'archetypes',
    label: 'Archetypes',
    description: 'Voltron, Aristocrats, and more',
    icon: Target,
    prompt: 'Explain the main Commander archetypes like Voltron, Aristocrats, and Spellslinger.',
  },
  {
    id: 'budget',
    label: 'Budget building',
    description: 'Competitive on a budget',
    icon: Lightbulb,
    prompt: 'How can I build a competitive Commander deck on a $50-100 budget?',
  },
  {
    id: 'meta',
    label: 'Meta analysis',
    description: 'Current format trends',
    icon: TrendingUp,
    prompt: 'What are the current top strategies and commanders in Commander?',
  },
];

const GENERAL_EXAMPLE_PROMPTS = [
  "What's the best removal in black?",
  'Explain combat damage steps',
  'Budget alternatives to Rhystic Study?',
  'How does EDH power level work?',
];

const DECK_EXAMPLE_PROMPTS = [
  'What ramp cards would work best?',
  'How do I deal with aggro decks?',
  'Is my mana base optimal?',
  "What's my win condition?",
];

export default function Brain() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableDecks, setAvailableDecks] = useState<DeckSummary[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [deckCards, setDeckCards] = useState<BrainDeckCard[]>([]);
  const [loadingDeckCards, setLoadingDeckCards] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(true); // Start true to prevent layout shift
  const [detailedResponses, setDetailedResponses] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /* Clicking a recommended card goes to the card page. The third column that
     used to dock a `CardDetailPane` beside the thread is gone: outside play
     mode, a click on a card is a trip to `/cards/:id`, everywhere. */
  const openCard = useOpenCard();
  const [addCard, setAddCard] = useState<AddableCard | null>(null);
  /** Mid-conversation: whether the full decklist receipt is expanded. */
  const [contextOpen, setContextOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    setLoadingDecks(true);
    try {
      const decks = await DeckAPI.getDeckSummaries();
      setAvailableDecks(decks);
      // Don't auto-select a deck - let user choose or ask general questions
    } catch (error) {
      console.error('Error loading decks:', error);
    } finally {
      setLoadingDecks(false);
    }
  };

  /**
   * The decklist that is sent as context — joined back to `cards` so the page can
   * *show* it. The entries alone carry a name and a quantity and nothing visual,
   * which is why the page used to assert it was reading your deck without ever
   * proving it.
   */
  const loadDeckCards = async (deckId: string) => {
    setLoadingDeckCards(true);
    try {
      const { data: entries, error } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity, is_commander, is_sideboard')
        .eq('deck_id', deckId);

      if (error) throw error;

      const ids = [...new Set((entries ?? []).map(e => e.card_id).filter(Boolean))];
      const { data: cardRows } = ids.length
        ? await supabase
            .from('cards')
            .select(
              'id, name, set_code, collector_number, type_line, mana_cost, cmc, colors, color_identity, rarity, layout, image_uris, faces, oracle_text, prices, power, toughness, keywords, legalities'
            )
            .in('id', ids)
        : { data: [] as any[] };

      const byId = new Map((cardRows ?? []).map(row => [row.id, row]));

      setDeckCards(
        (entries ?? []).map(entry => ({
          card_id: entry.card_id,
          card_name: entry.card_name,
          quantity: entry.quantity ?? 1,
          is_commander: Boolean(entry.is_commander),
          is_sideboard: Boolean(entry.is_sideboard),
          card: byId.get(entry.card_id) ?? null,
        }))
      );
    } catch (error) {
      console.error('Error loading deck cards:', error);
    } finally {
      setLoadingDeckCards(false);
    }
  };

  const handleDeckChange = (deckId: string) => {
    if (deckId === 'none') {
      setSelectedDeck(null);
      setDeckCards([]);
      setMessages([]);
      return;
    }
    const deck = availableDecks.find(d => d.id === deckId);
    if (deck) {
      setSelectedDeck(deck);
      loadDeckCards(deck.id);
      setMessages([]);
    }
  };

  const handleClearConversation = () => {
    setMessages([]);
  };

  useEffect(() => {
    if (selectedDeck) {
      loadDeckCards(selectedDeck.id);
    }
  }, [selectedDeck]);

  const generateResponse = async (
    message: string
  ): Promise<{ message: string; cards: CardData[]; visualData?: VisualData }> => {
    try {
      const enrichedDeckContext = selectedDeck
        ? {
            ...selectedDeck,
            /* Exactly the list the page renders under "What the assistant is
               reading" — same rows, same order, sideboard flagged rather than
               silently folded in. */
            cards: deckCards.map(dc => ({
              name: dc.card_name,
              quantity: dc.quantity || 1,
              is_commander: dc.is_commander,
              is_sideboard: dc.is_sideboard,
              type_line: dc.card?.type_line ?? undefined,
              mana_cost: dc.card?.mana_cost ?? undefined,
              cmc: dc.card?.cmc ?? undefined,
            })),
          }
        : null;

      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message,
          deckContext: enrichedDeckContext,
          conversationHistory: messages.slice(-6),
          responseStyle: detailedResponses ? 'detailed' : 'concise',
        },
      });

      const { data, error } = response;

      if (error) throw new Error(error.message || 'Failed to get response');
      if (data?.error) throw new Error(data.error);

      return {
        message: data.message || 'No response received',
        cards: data.cards || [],
        visualData: data.visualData || null,
      };
    } catch (error) {
      console.error('Error calling MTG Brain:', error);

      // Fallback local analysis
      const visualData: VisualData = { charts: [], tables: [] } as any;
      try {
        const curveBins = (selectedDeck as any)?.curve?.bins || (selectedDeck as any)?.curve;
        if (curveBins && typeof curveBins === 'object') {
          const chartData = Object.entries(curveBins).map(([name, value]) => ({
            name: String(name),
            value: Number(value || 0),
          }));
          (visualData.charts as any).push({ type: 'bar', title: 'CMC Distribution', data: chartData });
        }
      } catch {}

      const counts = (selectedDeck as any)?.counts;
      const power = selectedDeck?.power && !selectedDeck.power.stale
        ? selectedDeck.power.score
        : null;
      const fallbackText = `I'm currently unable to connect to the AI service. Here's what I can tell you from local data:\n\n${
        counts
          ? `**Deck Composition:**\n- Total: ${counts.total} cards\n- Lands: ${counts.lands}\n- Creatures: ${counts.creatures}\n- Instants: ${counts.instants}\n- Sorceries: ${counts.sorceries}`
          : ''
      }${power ? `\n\n**Power Level:** ${power}/10` : ''}\n\nPlease try again in a moment.`;

      return {
        message: fallbackText,
        cards: [],
        visualData: visualData.charts && (visualData.charts as any).length ? visualData : undefined,
      };
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const messageText = customMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { message: responseText, cards, visualData } = await generateResponse(messageText);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
        timestamp: new Date(),
        cards,
        visualData: visualData || undefined,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: typeof DECK_QUICK_ACTIONS[0]) => {
    handleSendMessage(action.prompt);
  };

  const copyMessage = (messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getCommanderInfo = () => {
    if (!selectedDeck) return null;
    const commander = deckCards.find(c => c.is_commander);
    return commander?.card_name;
  };

  /** The commander's real `cards` row, for the strip above the composer. */
  const commanderCard = deckCards.find(c => c.is_commander)?.card ?? null;

  /** Exactly what goes in the request: maindeck entries, summed by quantity. */
  const contextCardCount = deckCards
    .filter(c => !c.is_sideboard)
    .reduce((sum, c) => sum + (c.quantity ?? 1), 0);

  const openAddDialog = (card: CardData) => {
    setAddCard(card as AddableCard);
    setAddOpen(true);
  };

  return (
    <StandardPageLayout
      title="MTG Brain"
      description="Rules, strategy and deck analysis, with any of your decks as context"
    >
    {/* 13.5rem is the page chrome above and below this block — top bar, the
        StandardPageLayout header and its padding — so the chat fills the
        viewport exactly and the document itself never scrolls. */}
    <div className="flex h-[calc(100vh-13.5rem)] min-h-[32rem] flex-col gap-4 overflow-hidden lg:flex-row">
      {/*
        Deck context rail.

        This was a 320px column holding four controls and then ~490px of nothing,
        on a page about Magic cards that rendered no card images at all. The
        `Select` is gone: a deck is identified by its commander, so the picker IS
        the commander art. Every image here is the deck's real commander, read
        through `compute_deck_summary` and drawn by the shared `CommanderHero`
        (uncropped, `normal` resolution at this thumbnail size).
      */}
      <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl bg-card p-4 shadow-lg shadow-black/20 lg:h-full lg:w-80">
        {/* Only the deck list scrolls; the two settings stay reachable. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <div className="space-y-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Deck context
          </h2>

          {selectedDeck ? (
            <div className="space-y-3">
              <CommanderHero
                commander={(selectedDeck as any).commander}
                deckName={selectedDeck.name}
                format={selectedDeck.format}
                identity={selectedDeck.identity ?? selectedDeck.colors ?? []}
                cardCount={selectedDeck.counts?.total ?? 0}
                size="md"
              />
              <div>
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedDeck.name}
                </p>
                {getCommanderInfo() && (
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Crown className="h-3 w-3 shrink-0 text-type-commander" aria-hidden="true" />
                    {getCommanderInfo()}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {selectedDeck.counts?.total ?? 0} cards
                </span>
                {/* The same score object the tile and the deck page render. */}
                <PowerScoreBadge power={selectedDeck.power} />
              </div>

              {selectedDeck.colors && selectedDeck.colors.length > 0 && (
                <ColorIdentity colors={selectedDeck.colors} size="md" />
              )}

              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => handleDeckChange('none')}
              >
                Ask general questions instead
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {loadingDecks
                ? 'Loading your decks…'
                : availableDecks.length === 0
                  ? 'You have no decks yet — general questions still work.'
                  : 'Pick a deck and every answer is about that list. Or just ask.'}
            </p>
          )}
        </div>

        {availableDecks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {selectedDeck ? 'Switch deck' : `Your decks (${availableDecks.length})`}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {availableDecks
                .filter(deck => deck.id !== selectedDeck?.id)
                .map(deck => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => handleDeckChange(deck.id)}
                    className="group rounded-lg p-1 text-left transition-colors hover:bg-accent"
                    title={`Use ${deck.name} as context`}
                  >
                    <CommanderHero
                      commander={(deck as any).commander}
                      deckName={deck.name}
                      format={deck.format}
                      identity={deck.identity ?? deck.colors ?? []}
                      cardCount={deck.counts?.total ?? 0}
                      size="sm"
                    />
                    <span className="mt-1 block truncate text-[0.7rem] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                      {deck.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
        </div>

        {/* Chat settings — pinned, so they survive a long deck list. */}
        <div className="shrink-0 space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="detailed-toggle" className="text-sm font-normal">
              Detailed responses
            </Label>
            <Switch
              id="detailed-toggle"
              checked={detailedResponses}
              onCheckedChange={setDetailedResponses}
            />
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleClearConversation}
            disabled={messages.length === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear conversation
          </Button>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card/40 shadow-lg shadow-black/20">
        <ScrollArea className="flex-1 p-4 lg:p-6">
          {/* The conversation is centred, but the deck receipt below is not: it is
              a wall of cards and wants the whole column. */}
          <div className="mx-auto w-full max-w-5xl space-y-6">
            {messages.length === 0 ? (
              /* Empty state with quick actions */
              <div className="space-y-6 py-4">
                <div className="space-y-3 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {selectedDeck ? `Analysing ${selectedDeck.name}` : 'Ask anything about Magic'}
                  </h2>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    {selectedDeck
                      ? "Every question below is answered with this list attached — the cards it holds are shown, not asserted."
                      : 'Rules, deck building, card recommendations and strategy. Select a deck for analysis of your own list.'}
                  </p>
                </div>

                {/* The decklist that travels with the question. */}
                {selectedDeck && (
                  <DeckContextPanel
                    deckName={selectedDeck.name}
                    cards={deckCards}
                    loading={loadingDeckCards}
                    onCardClick={openCard}
                  />
                )}

                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {(selectedDeck ? DECK_QUICK_ACTIONS : GENERAL_QUICK_ACTIONS).map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action)}
                      className="group rounded-lg bg-muted/40 p-4 text-left shadow-md shadow-black/20 transition-colors hover:bg-accent"
                    >
                      <action.icon className="mb-3 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                      <div className="text-sm font-medium">{action.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{action.description}</div>
                    </button>
                  ))}
                </div>

                {/* Example prompts */}
                <div className="space-y-3">
                  <p className="text-center text-sm text-muted-foreground">Or try asking:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {(selectedDeck ? DECK_EXAMPLE_PROMPTS : GENERAL_EXAMPLE_PROMPTS).map(
                      (prompt, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendMessage(prompt)}
                          className="rounded-full bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {prompt}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Message thread */
              <AnimatePresence mode="popLayout">
                {messages.map(message => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className={cn(
                      'flex gap-3',
                      message.type === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.type === 'assistant' && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}

                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-4 py-3',
                        message.type === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card shadow-md shadow-black/20'
                      )}
                    >
                      {message.type === 'assistant' ? (
                        <div className="space-y-4">
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-3 prose-p:leading-relaxed prose-headings:mt-6 prose-headings:mb-3 prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-strong:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:rounded-lg prose-blockquote:border-0 prose-blockquote:bg-muted/40 prose-blockquote:rounded-lg prose-blockquote:py-2 prose-blockquote:pl-4">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>

                          {message.visualData && <AIVisualDisplay data={message.visualData} />}

                          {message.cards && message.cards.length > 0 && (
                            <CardRecommendationDisplay
                              cards={message.cards}
                              onCardClick={openCard}
                              onAddCard={openAddDialog}
                              compact={false}
                            />
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => copyMessage(message.id, message.content)}
                            >
                              {copiedMessageId === message.id ? (
                                <>
                                  <Check className="mr-1 h-3 w-3" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-1 h-3 w-3" />
                                  Copy
                                </>
                              )}
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {message.timestamp.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                          <span className="mt-1 block text-xs opacity-70">
                            {message.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      )}
                    </div>

                    {message.type === 'user' && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="rounded-lg bg-card px-4 py-3 shadow-md shadow-black/20">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Thinking…</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Add-to-destination flow for a recommended card — an inline panel in
            the results column, directly above the composer. */}
        {addOpen && addCard && (
          <div className="px-4 pt-4">
            <div className="mx-auto max-w-4xl">
              <AddCardPanel
                card={addCard}
                decks={availableDecks}
                onClose={() => {
                  setAddOpen(false);
                  setAddCard(null);
                }}
                defaultDeckId={selectedDeck?.id ?? null}
              />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="bg-muted/20 p-4">
          <div className="mx-auto w-full max-w-5xl">
            {/* Once the conversation has started the full receipt would push the
                thread off screen, so it shrinks to the commander, the count and a
                way back to the list. It never disappears: the context is always
                attached, so it is always visible. */}
            {selectedDeck && messages.length > 0 && contextOpen && (
              <div className="mb-3 max-h-[26rem] overflow-y-auto">
                <DeckContextPanel
                  deckName={selectedDeck.name}
                  cards={deckCards}
                  loading={loadingDeckCards}
                  onCardClick={openCard}
                />
              </div>
            )}
            {selectedDeck && messages.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-card/70 px-3 py-2">
                {commanderCard ? (
                  <button
                    type="button"
                    onClick={() => openCard(commanderCard)}
                    className="w-9 shrink-0"
                    title={commanderCard.name}
                  >
                    <CardImage card={commanderCard} size="xs" fill />
                  </button>
                ) : (
                  <Crown className="h-4 w-4 shrink-0 text-type-commander" aria-hidden="true" />
                )}
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  Answering with <span className="font-medium text-foreground">{selectedDeck.name}</span>{' '}
                  attached — {contextCardCount} maindeck card{contextCardCount === 1 ? '' : 's'} sent
                  with every question.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => setContextOpen(open => !open)}
                  aria-expanded={contextOpen}
                >
                  {contextOpen ? 'Hide the list' : 'See the list'}
                </Button>
              </div>
            )}
            <div className="relative">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedDeck ? 'Ask about your deck…' : 'Ask anything about Magic…'}
                className="max-h-32 min-h-[52px] resize-none pr-12 text-base"
                disabled={isLoading}
                rows={1}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !input.trim()}
                size="icon"
                className="absolute bottom-2 right-2 h-8 w-8"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="sr-only">Send message</span>
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Enter to send, Shift+Enter for a new line
            </p>
          </div>
        </div>
      </div>

    </div>
    </StandardPageLayout>
  );
}
