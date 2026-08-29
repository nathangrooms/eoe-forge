import { useState, useRef, useEffect, useCallback } from 'react';
import { FIELD } from '@/components/listing';
import {
  Send,
  Zap,
  BookOpen,
  Target,
  TrendingUp,
  MessageSquare,
  Lightbulb,
  Library,
  User,
  Crown,
  Loader2,
  Copy,
  Check,
  Scale,
  Sparkles,
  History,
  Plus,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ManaCost } from '@/components/ui/mana-cost';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { supabase } from '@/integrations/supabase/client';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';
import { useOpenCard } from '@/components/cards';
import { CardImage } from '@/components/cards';
import { CardRecommendationDisplay, type CardData as SharedCardData } from '@/components/shared/CardRecommendationDisplay';
import { AIVisualDisplay, type VisualData } from '@/components/shared/AIVisualDisplay';
import { AddCardPanel, type AddableCard } from '@/components/tutor/AddCardPanel';
import { CardContextPanel } from '@/components/tutor/CardContextPanel';
import {
  TUTOR_CARD_COLUMNS,
  ContextPicker,
  type TutorCard,
} from '@/components/tutor/ContextPicker';
import { DeckContextPanel, type TutorDeckCard } from '@/components/tutor/DeckContextPanel';
import { ConversationList } from '@/components/tutor/ConversationList';
import {
  appendMessage,
  createConversation,
  deleteConversation,
  listConversations,
  loadMessages,
  titleFrom,
  type TutorConversation,
} from '@/components/tutor/conversations';
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

// Quick actions for when a single CARD is in focus
const CARD_QUICK_ACTIONS = [
  {
    id: 'card-explain',
    label: 'Explain this card',
    description: 'What it does and why it matters',
    icon: BookOpen,
    prompt: 'Explain this card in plain terms: what it actually does, and when it is good.',
  },
  {
    id: 'card-rules',
    label: 'Rules interactions',
    description: 'Timing, the stack, edge cases',
    icon: Scale,
    prompt:
      'What are the rules interactions and common misplays with this card? Cover timing, the stack and any edge cases.',
  },
  {
    id: 'card-synergies',
    label: 'Best synergies',
    description: 'Cards that want to be alongside it',
    icon: Sparkles,
    prompt: 'Which cards synergise best with this one, and what combos does it enable?',
  },
  {
    id: 'card-commanders',
    label: 'Where it belongs',
    description: 'Commanders and archetypes',
    icon: Crown,
    prompt: 'Which commanders and Commander archetypes want this card, and why?',
  },
  {
    id: 'card-alternatives',
    label: 'Alternatives',
    description: 'Cheaper and stronger options',
    icon: Zap,
    prompt:
      'What cards do a similar job to this one? Give me both budget alternatives and straight upgrades.',
  },
  {
    id: 'card-verdict',
    label: 'Is it worth a slot?',
    description: 'Honest evaluation',
    icon: Target,
    prompt:
      'Is this card worth a slot in a typical Commander deck? Be honest about its weaknesses.',
  },
];

const CARD_EXAMPLE_PROMPTS = [
  'What is the best way to abuse this?',
  'How do I answer it across the table?',
  'Is there a strictly better card?',
  'Which formats is it legal in?',
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

export default function Tutor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableDecks, setAvailableDecks] = useState<DeckSummary[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  /**
   * The other thing the Tutor can be pointed at. A deck and a card are two
   * different questions, so exactly one of these is ever set.
   */
  const [selectedCard, setSelectedCard] = useState<TutorCard | null>(null);
  const [deckCards, setDeckCards] = useState<TutorDeckCard[]>([]);
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

  /* Saved chats. The thread used to live only in the state above, so a reload
     erased it and there was no way back to anything said yesterday. */
  const [conversations, setConversations] = useState<TutorConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    /* Only once there is a thread to follow. The empty state is now tall enough
       to overflow — a card's full art and oracle text, or a whole decklist — and
       scrolling it on mount hid the heading that says what is attached. */
    if (messages.length === 0) return;
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadDecks();
    refreshConversations();
  }, []);

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true);
    try {
      setConversations(await listConversations());
    } catch (error) {
      console.error('Error loading saved chats:', error);
    } finally {
      setConversationsLoading(false);
    }
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
      /* The error is read, not dropped. Without this the catalogue join could
         fail and the page would carry on with art missing and no explanation,
         which is indistinguishable from cards that simply have no art. */
      const { data: cardRows, error: cardsError } = ids.length
        ? await supabase
            .from('cards')
            .select(TUTOR_CARD_COLUMNS)
            .in('id', ids)
        : { data: [] as any[], error: null };
      if (cardsError) console.error('Could not read the cards in this deck:', cardsError.message);

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

  /* Changing what is attached starts a new thread: the answers above it were
     given about something else, and leaving them under a new context is the
     one way this page could lie about what it read. The old thread is not lost,
     it is a saved chat and it is in the list. */
  const selectDeck = (deck: DeckSummary) => {
    setSelectedCard(null);
    setSelectedDeck(deck);
    loadDeckCards(deck.id);
    setMessages([]);
    setActiveConversationId(null);
  };

  const selectCard = (card: TutorCard) => {
    setSelectedDeck(null);
    setDeckCards([]);
    setSelectedCard(card);
    setMessages([]);
    setActiveConversationId(null);
  };

  const clearContext = () => {
    setSelectedDeck(null);
    setSelectedCard(null);
    setDeckCards([]);
    setMessages([]);
    setActiveConversationId(null);
  };

  /** Put the thread down and start a fresh one. Nothing is deleted. */
  const startNewChat = () => {
    setMessages([]);
    setActiveConversationId(null);
  };

  /**
   * Reopen a saved chat, with whatever it was about back on screen.
   *
   * The deck is re-attached from the id on the row, so the answers in the thread
   * still sit under the list they were given about. If the deck has since been
   * deleted the chat still opens; it just opens with nothing attached, which is
   * the truth rather than a stale claim.
   */
  const openConversation = async (conversation: TutorConversation) => {
    setActiveConversationId(conversation.id);
    setIsLoading(true);
    try {
      const restored = await loadMessages(conversation.id);

      const deck = conversation.deck_id
        ? availableDecks.find(d => d.id === conversation.deck_id) ?? null
        : null;
      setSelectedCard(null);
      setSelectedDeck(deck);
      setDeckCards([]);
      if (deck) loadDeckCards(deck.id);

      setMessages(restored);
    } catch (error) {
      console.error('Error opening chat:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const removeConversation = async (conversation: TutorConversation) => {
    try {
      await deleteConversation(conversation.id);
      if (conversation.id === activeConversationId) startNewChat();
      await refreshConversations();
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  useEffect(() => {
    if (selectedDeck) {
      loadDeckCards(selectedDeck.id);
    }
  }, [selectedDeck]);

  /**
   * The card in focus, written out as the facts the model should reason from.
   *
   * Every line is read off the `cards` row the picker selected — the same
   * catalogue the rest of the app renders from — so the answer argues
   * about the printing on screen rather than its own recollection of the oracle
   * text. It rides on the message because `mtg-brain` takes a deck context and
   * a message, and nothing else; the user's own bubble stays as they typed it.
   */
  const cardBrief = (card: TutorCard): string => {
    const lines: string[] = [
      'CARD IN FOCUS. Exact catalogue data for the card the user is asking about.',
      'Treat these fields as authoritative and answer about this card specifically.',
      `Name: ${card.name}`,
    ];
    if (card.mana_cost) lines.push(`Mana cost: ${card.mana_cost}`);
    if (card.cmc !== null && card.cmc !== undefined) lines.push(`Mana value: ${card.cmc}`);
    if (card.type_line) lines.push(`Type line: ${card.type_line}`);
    if (card.power || card.toughness) lines.push(`Power/Toughness: ${card.power}/${card.toughness}`);
    if (card.oracle_text) lines.push(`Oracle text: ${card.oracle_text}`);
    if (Array.isArray(card.color_identity) && card.color_identity.length)
      lines.push(`Colour identity: ${card.color_identity.join('')}`);
    if (card.set_code)
      lines.push(
        `Printing: ${String(card.set_code).toUpperCase()} #${card.collector_number ?? '?'}${
          card.rarity ? ` (${card.rarity})` : ''
        }`
      );
    return lines.join('\n');
  };

  const generateResponse = async (
    message: string
  ): Promise<{ message: string; cards: CardData[]; visualData?: VisualData }> => {
    try {
      const enrichedDeckContext = selectedDeck
        ? {
            ...selectedDeck,
            /* Exactly the list the page renders under the deck receipt — same rows, same order, sideboard flagged rather than
               silently folded in.
               `produced_mana` and the rules text ride along because a land's
               colour is what it taps for, and a list of bare names cannot
               answer a question about a mana base. */
            cards: deckCards.map(dc => ({
              name: dc.card_name,
              quantity: dc.quantity || 1,
              is_commander: dc.is_commander,
              is_sideboard: dc.is_sideboard,
              type_line: dc.card?.type_line ?? undefined,
              mana_cost: dc.card?.mana_cost ?? undefined,
              cmc: dc.card?.cmc ?? undefined,
              oracle_text: dc.card?.oracle_text ?? undefined,
              produced_mana: dc.card?.produced_mana ?? undefined,
              card_data: dc.card
                ? {
                    type_line: dc.card.type_line ?? undefined,
                    mana_cost: dc.card.mana_cost ?? undefined,
                    oracle_text: dc.card.oracle_text ?? undefined,
                    cmc: dc.card.cmc ?? undefined,
                    produced_mana: dc.card.produced_mana ?? undefined,
                    prices: dc.card.prices ?? undefined,
                    edhrec_rank: dc.card.edhrec_rank ?? undefined,
                  }
                : undefined,
            })),
          }
        : null;

      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: selectedCard ? `${message}

${cardBrief(selectedCard)}` : message,
          deckContext: enrichedDeckContext,
          /* The whole thread. It used to be `slice(-6)`, so the seventh turn
             back was invisible and a conversation could not refer to its own
             beginning. The function trims by size on the far end, which is a
             real limit rather than a guessed one. */
          conversationHistory: messages,
          responseStyle: detailedResponses ? 'detailed' : 'concise',
          conversationId: activeConversationId,
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
      console.error('Tutor request failed:', error);

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
      const fallbackText = `That question could not be answered just now. Here is what your deck holds, counted from the list itself:\n\n${
        counts
          ? `**What is in the deck**\n- Total: ${counts.total} cards\n- Lands: ${counts.lands}\n- Creatures: ${counts.creatures}\n- Instants: ${counts.instants}\n- Sorceries: ${counts.sorceries}`
          : ''
      }${power ? `\n\n**Power level:** ${power}/10` : ''}\n\nPlease try again in a moment.`;

      return {
        message: fallbackText,
        cards: [],
        visualData: visualData.charts && (visualData.charts as any).length ? visualData : undefined,
      };
    }
  };

  /* A deck is attached but its list is still being read. Asking now would send a
     deck with no cards in it, and the answer would be about a hundred cards it
     never saw. Observed live: the deck attached, the catalogue join was slow,
     and the question went out with an empty list behind a heading that said
     "This is the complete list." */
  const contextStillLoading = Boolean(selectedDeck) && loadingDeckCards;

  const handleSendMessage = async (customMessage?: string) => {
    const messageText = customMessage || input.trim();
    if (!messageText || isLoading || contextStillLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    /* The thread is written to the database as it happens, so closing the tab
       mid-answer still leaves the question saved. Persistence failing must not
       take the answer down with it, so every write is caught and logged. */
    let conversationId = activeConversationId;
    try {
      if (!conversationId) {
        const created = await createConversation({
          title: titleFrom(messageText),
          deckId: selectedDeck?.id ?? null,
          deckName: selectedDeck?.name ?? null,
          cardId: selectedCard?.id ?? null,
          cardName: selectedCard?.name ?? null,
        });
        conversationId = created.id;
        setActiveConversationId(created.id);
      }
      await appendMessage(conversationId, userMessage);
    } catch (error) {
      console.error('Could not save your message:', error);
    }

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

      if (conversationId) {
        try {
          await appendMessage(conversationId, assistantMessage);
        } catch (error) {
          console.error('Could not save the answer:', error);
        }
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Something went wrong answering that. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      refreshConversations();
    }
  };

  const handleQuickAction = (action: { prompt: string }) => {
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

  /** The commander's real `cards` row, for the strip above the composer. */
  const commanderCard = deckCards.find(c => c.is_commander)?.card ?? null;

  /** Exactly what goes in the request: maindeck entries, summed by quantity. */
  const contextCardCount = deckCards
    .filter(c => !c.is_sideboard)
    .reduce((sum, c) => sum + (c.quantity ?? 1), 0);

  /* One list of starters per kind of context — a card, a deck, or neither. */
  const quickActions = selectedCard
    ? CARD_QUICK_ACTIONS
    : selectedDeck
      ? DECK_QUICK_ACTIONS
      : GENERAL_QUICK_ACTIONS;

  const examplePrompts = selectedCard
    ? CARD_EXAMPLE_PROMPTS
    : selectedDeck
      ? DECK_EXAMPLE_PROMPTS
      : GENERAL_EXAMPLE_PROMPTS;

  const openAddDialog = (card: CardData) => {
    setAddCard(card as AddableCard);
    setAddOpen(true);
  };

  return (
    <StandardPageLayout
      title="Tutor"
      description="Rules, strategy and card advice. Attach one of your decks or any card, and every answer is about it."
    >
    {/* 13.5rem is the page chrome above and below this block — top bar, the
        StandardPageLayout header and its padding — so the chat fills the
        viewport exactly and the document itself never scrolls. */}
    <div className="flex h-[calc(100vh-13.5rem)] min-h-[34rem] w-full flex-col gap-3 overflow-hidden">
      {/*
        The top line.

        What used to be here was a 320px column down the left holding a deck
        picker, two settings and a grid of commander art squeezed to 140px —
        permanent furniture for a decision you make once, paid for out of the
        conversation's width every second of the session. Owner: "left hand deck
        context menu is awful - i told you to add a top line dropdown/search for
        your deck or a specific card."

        So: one line. One control that searches both your decks and the whole
        card catalogue, the two settings beside it, and everything below is the
        answer. `ContextPicker` still leads with card art, because a deck is
        still identified by its commander — it just does it in a popover instead
        of a permanent column.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <ContextPicker
          decks={availableDecks}
          decksLoading={loadingDecks}
          selectedDeck={selectedDeck}
          selectedCard={selectedCard}
          onSelectDeck={selectDeck}
          onSelectCard={selectCard}
          onClear={clearContext}
          /* Below `lg` the picker owns the whole first row and the two settings
             wrap under it. Sharing the row squeezed the trigger to about 200px,
             which truncated the deck name — the one thing it exists to show. */
          className="min-w-0 basis-full lg:max-w-[34rem] lg:flex-1 lg:basis-auto"
        />

        {/* This group has to wrap.

            It was `flex items-center gap-4` with no wrap, holding the detailed
            answers switch, New chat and Your chats. At 390 that needs more
            width than the phone has, and the page shell clips its overflow, so
            "Your chats" was drawn 63px past the right edge and sliced to the
            letter Y. Measured on the built bundle: clipped by
            `overflow-x: hidden`, so it could not be scrolled to or tapped, and
            saved chats were unreachable on a phone. */}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="detailed-toggle" className="whitespace-nowrap text-sm font-normal text-muted-foreground">
              Detailed answers
            </Label>
            <Switch
              id="detailed-toggle"
              checked={detailedResponses}
              onCheckedChange={setDetailedResponses}
            />
          </div>

          {/* "Clear conversation" used to throw the thread away, because there
              was nowhere for it to go. Chats are saved now, so the same control
              simply puts one down and starts another. */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={startNewChat}
            disabled={messages.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            New chat
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="mr-2 h-4 w-4" />
            Your chats
            {conversations.length > 0 && (
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                {conversations.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      <ConversationList
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        conversations={conversations}
        activeId={activeConversationId}
        loading={conversationsLoading}
        onOpenConversation={openConversation}
        onNewChat={startNewChat}
        onDelete={removeConversation}
      />

      {/* The conversation, now the whole width of the page. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card/40 shadow-lg shadow-black/20">
        <ScrollArea className="flex-1 p-4 lg:p-6">
          {/* Prose stays readable rather than running to 1400px, but the deck
              receipt and the card recommendations under it are walls of card
              art and take the whole column. */}
          <div className="mx-auto w-full max-w-6xl space-y-6">
            {messages.length === 0 ? (
              /* Empty state with quick actions */
              <div className="space-y-6 py-4">
                <div className="space-y-3 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {selectedCard
                      ? `Reading ${selectedCard.name}`
                      : selectedDeck
                        ? `Analysing ${selectedDeck.name}`
                        : 'Ask anything about Magic'}
                  </h2>
                  <p className="mx-auto max-w-xl text-sm text-muted-foreground">
                    {selectedCard
                      ? 'Every question below is answered about this exact printing. Its oracle text, cost and type line are sent with the question, not recalled.'
                      : selectedDeck
                        ? 'Every question below is answered with this list attached. The cards it holds are shown, not asserted.'
                        : 'Rules, deck building, card recommendations and strategy. Attach a deck or a card above to make every answer about it.'}
                  </p>
                </div>

                {/* The context that travels with the question, whichever it is. */}
                {selectedCard && (
                  <CardContextPanel card={selectedCard} onCardClick={openCard} />
                )}

                {selectedDeck && (
                  <DeckContextPanel
                    deckName={selectedDeck.name}
                    cards={deckCards}
                    loading={loadingDeckCards}
                    onCardClick={openCard}
                  />
                )}

                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {quickActions.map(action => (
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
                    {examplePrompts.map(
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
                        <Library className="h-4 w-4 text-muted-foreground" />
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
                      <Library className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="rounded-lg bg-card px-4 py-3 shadow-md shadow-black/20">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Looking it up...</span>
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
          <div className="mx-auto w-full max-w-6xl">
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
                  attached. {contextCardCount} maindeck card{contextCardCount === 1 ? '' : 's'} sent
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

            {/* Same promise for a card: the printing stays on screen for as long
                as it is riding along with the questions. */}
            {selectedCard && messages.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-card/70 px-3 py-2">
                <button
                  type="button"
                  onClick={() => openCard(selectedCard)}
                  className="w-9 shrink-0"
                  title={selectedCard.name}
                >
                  <CardImage card={selectedCard} size="xs" fill />
                </button>
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  Answering about{' '}
                  <span className="font-medium text-foreground">{selectedCard.name}</span>. Its
                  oracle text and cost go with every question.
                </p>
                {selectedCard.mana_cost && (
                  <ManaCost cost={selectedCard.mana_cost} size="sm" className="shrink-0" />
                )}
              </div>
            )}
            <div className="relative">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedCard
                    ? `Ask about ${selectedCard.name}…`
                    : selectedDeck
                      ? 'Ask about your deck…'
                      : 'Ask anything about Magic…'
                }
                /* The one hairline left on this page. `Textarea` ships
                   `border border-input` and this mount never opted out. */
                className={cn(FIELD, 'max-h-32 min-h-[52px] resize-none pr-12 text-base')}
                disabled={isLoading}
                rows={1}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={isLoading || contextStillLoading || !input.trim()}
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
              {contextStillLoading
                ? `Reading ${selectedDeck?.name ?? 'your deck'} before answering...`
                : 'Enter to send, Shift+Enter for a new line'}
            </p>
          </div>
        </div>
      </div>

    </div>
    </StandardPageLayout>
  );
}
