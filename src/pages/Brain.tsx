import { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Zap, 
  BookOpen, 
  Target, 
  TrendingUp, 
  MessageSquare, 
  Sparkles, 
  Lightbulb, 
  RefreshCw, 
  Trash2,
  Bot,
  User,
  Layers,
  Swords,
  Shield,
  Crown,
  ChevronRight,
  AlertCircle,
  Brain as BrainIcon,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useDeckStore } from '@/stores/deckStore';
import { supabase } from '@/integrations/supabase/client';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';
import { UniversalCardModal as UniversalCardViewModal } from '@/components/universal/UniversalCardModal';
import { CardRecommendationDisplay, type CardData as SharedCardData } from '@/components/shared/CardRecommendationDisplay';
import { AIVisualDisplay, type VisualData } from '@/components/shared/AIVisualDisplay';
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
    label: 'Analyze Deck',
    description: 'Power level & strategy analysis',
    icon: TrendingUp,
    prompt: 'Please analyze my deck\'s power level, strategy, and provide optimization suggestions.',
    gradient: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'upgrades',
    label: 'Suggest Upgrades',
    description: 'Find powerful improvements',
    icon: Zap,
    prompt: 'What are the best upgrade cards for my deck? Consider both budget and high-end options.',
    gradient: 'from-amber-500 to-orange-500'
  },
  {
    id: 'combos',
    label: 'Find Combos',
    description: 'Discover synergies & win conditions',
    icon: Target,
    prompt: 'What are the key combos and synergies in my deck? How can I improve consistency?',
    gradient: 'from-red-500 to-pink-500'
  },
  {
    id: 'meta',
    label: 'Meta Analysis',
    description: 'Format positioning & matchups',
    icon: BookOpen,
    prompt: 'How does my deck perform in the current meta? What are its strengths and weaknesses?',
    gradient: 'from-emerald-500 to-green-500'
  },
  {
    id: 'cuts',
    label: 'What to Cut',
    description: 'Identify weak cards',
    icon: Lightbulb,
    prompt: 'What cards should I consider cutting from my deck and why?',
    gradient: 'from-purple-500 to-violet-500'
  },
  {
    id: 'strategy',
    label: 'Strategy Guide',
    description: 'Learn optimal play patterns',
    icon: MessageSquare,
    prompt: 'How should I pilot this deck? What\'s my game plan and key decision points?',
    gradient: 'from-indigo-500 to-blue-500'
  }
];

// Quick actions for general MTG questions (no deck)
const GENERAL_QUICK_ACTIONS = [
  {
    id: 'rules',
    label: 'Rules Question',
    description: 'Ask about MTG rules & mechanics',
    icon: BookOpen,
    prompt: 'Explain how the stack works and priority in Magic.',
    gradient: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'commander',
    label: 'Commander Advice',
    description: 'EDH strategy & deck building',
    icon: Crown,
    prompt: 'What makes a good Commander deck? Explain the key components and ratios.',
    gradient: 'from-amber-500 to-orange-500'
  },
  {
    id: 'staples',
    label: 'Format Staples',
    description: 'Must-have cards by format',
    icon: Zap,
    prompt: 'What are the must-have staple cards for Commander in each color?',
    gradient: 'from-red-500 to-pink-500'
  },
  {
    id: 'archetypes',
    label: 'Archetypes',
    description: 'Learn deck archetypes',
    icon: Target,
    prompt: 'Explain the main Commander archetypes like Voltron, Aristocrats, and Spellslinger.',
    gradient: 'from-emerald-500 to-green-500'
  },
  {
    id: 'budget',
    label: 'Budget Building',
    description: 'Build on a budget',
    icon: Lightbulb,
    prompt: 'How can I build a competitive Commander deck on a $50-100 budget?',
    gradient: 'from-purple-500 to-violet-500'
  },
  {
    id: 'meta',
    label: 'Meta Analysis',
    description: 'Current format trends',
    icon: TrendingUp,
    prompt: 'What are the current top strategies and commanders in Commander?',
    gradient: 'from-indigo-500 to-blue-500'
  }
];

const GENERAL_EXAMPLE_PROMPTS = [
  "What's the best removal in black?",
  "Explain combat damage steps",
  "Budget alternatives to Rhystic Study?",
  "How does EDH power level work?",
];

const DECK_EXAMPLE_PROMPTS = [
  "What ramp cards would work best?",
  "How do I deal with aggro decks?",
  "Is my mana base optimal?",
  "What's my win condition?",
];

export default function Brain() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableDecks, setAvailableDecks] = useState<DeckSummary[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [deckCards, setDeckCards] = useState<any[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true); // Start true to prevent layout shift
  const [detailedResponses, setDetailedResponses] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCard, setModalCard] = useState<any>(null);

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

  const loadDeckCards = async (deckId: string) => {
    try {
      const { data: cards, error } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity, is_commander, is_sideboard')
        .eq('deck_id', deckId);

      if (error) throw error;
      setDeckCards(cards || []);
    } catch (error) {
      console.error('Error loading deck cards:', error);
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

  const generateResponse = async (message: string): Promise<{ message: string; cards: CardData[]; visualData?: VisualData }> => {
    try {
      const enrichedDeckContext = selectedDeck ? {
        ...selectedDeck,
        cards: deckCards.map(dc => ({
          name: dc.card_name,
          quantity: dc.quantity || 1,
          is_commander: dc.is_commander
        }))
      } : null;
      
      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message,
          deckContext: enrichedDeckContext,
          conversationHistory: messages.slice(-6),
          responseStyle: detailedResponses ? 'detailed' : 'concise'
        },
      });

      const { data, error } = response;
      
      if (error) throw new Error(error.message || 'Failed to get response');
      if (data?.error) throw new Error(data.error);

      return { 
        message: data.message || 'No response received', 
        cards: data.cards || [],
        visualData: data.visualData || null
      };
    } catch (error) {
      console.error('Error calling MTG Brain:', error);

      // Fallback local analysis
      const visualData: VisualData = { charts: [], tables: [] } as any;
      try {
        const curveBins = (selectedDeck as any)?.curve?.bins || (selectedDeck as any)?.curve;
        if (curveBins && typeof curveBins === 'object') {
          const chartData = Object.entries(curveBins).map(([name, value]) => ({ name: String(name), value: Number(value || 0) }));
          (visualData.charts as any).push({ type: 'bar', title: 'CMC Distribution', data: chartData });
        }
      } catch {}

      const counts = (selectedDeck as any)?.counts;
      const power = (selectedDeck as any)?.power?.score;
      const fallbackText = `I'm currently unable to connect to the AI service. Here's what I can tell you from local data:\n\n${
        counts ? `**Deck Composition:**\n- Total: ${counts.total} cards\n- Lands: ${counts.lands}\n- Creatures: ${counts.creatures}\n- Instants: ${counts.instants}\n- Sorceries: ${counts.sorceries}` : ''
      }${power ? `\n\n**Power Level:** ${power}/10` : ''}\n\nPlease try again in a moment.`;

      return { message: fallbackText, cards: [], visualData: (visualData.charts && (visualData.charts as any).length) ? visualData : undefined };
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const messageText = customMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: messageText,
      timestamp: new Date()
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
        visualData: visualData || undefined
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'I encountered an error processing your request. Please try again.',
        timestamp: new Date()
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

  const formatColors = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-amber-100 text-amber-800 border-amber-300',
      U: 'bg-blue-100 text-blue-800 border-blue-300',
      B: 'bg-gray-800 text-gray-100 border-gray-600',
      R: 'bg-red-100 text-red-800 border-red-300',
      G: 'bg-green-100 text-green-800 border-green-300',
    };
    return colors.map(c => colorMap[c] || 'bg-gray-100');
  };

  return (
    <div className="h-[calc(100vh-7rem)] md:h-[calc(100vh-5rem)] bg-background overflow-hidden">
      <div className="w-full h-full">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Sidebar - Deck Context */}
          <div className="w-full lg:w-80 lg:h-full border-b lg:border-b-0 lg:border-r bg-muted/30 p-4 lg:p-6 shrink-0 lg:overflow-y-auto">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-spacecraft to-celestial flex items-center justify-center shadow-lg">
                  <BrainIcon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="font-bold text-lg">MTG Brain</h1>
                  <p className="text-xs text-muted-foreground">AI Magic Assistant</p>
                </div>
              </div>

              <Separator />

              {/* Deck Selector */}
              <div className="space-y-3">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Deck Context (Optional)
                </Label>
                <Select value={selectedDeck?.id || 'none'} onValueChange={handleDeckChange}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue placeholder={loadingDecks ? "Loading..." : "No deck selected"} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50 max-w-[280px]">
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No deck - General questions</span>
                    </SelectItem>
                    {availableDecks.map((deck) => (
                      <SelectItem key={deck.id} value={deck.id}>
                        <div className="flex items-center gap-2 max-w-[240px]">
                          <span className="truncate flex-1">{deck.name}</span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {deck.format}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select a deck for specific analysis or ask general MTG questions
                </p>
              </div>

              {/* Deck Stats */}
              {selectedDeck && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-background border space-y-3">
                    {getCommanderInfo() && (
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium truncate">{getCommanderInfo()}</span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <div className="text-lg font-bold">{selectedDeck.counts?.total || 0}</div>
                        <div className="text-xs text-muted-foreground">Cards</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <div className="text-lg font-bold">{selectedDeck.power?.score || 0}</div>
                        <div className="text-xs text-muted-foreground">Power</div>
                      </div>
                    </div>

                    {selectedDeck.colors && selectedDeck.colors.length > 0 && (
                      <div className="flex gap-1">
                        {selectedDeck.colors.map((color, i) => (
                          <div
                            key={i}
                            className={cn(
                              "w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold",
                              formatColors([color])[0]
                            )}
                          >
                            {color}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Settings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="detailed-toggle" className="text-sm">
                        Detailed Responses
                      </Label>
                      <Switch
                        id="detailed-toggle"
                        checked={detailedResponses}
                        onCheckedChange={setDetailedResponses}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleClearConversation}
                    disabled={messages.length === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Conversation
                  </Button>
                </div>
              )}

            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Chat Messages */}
            <ScrollArea className="flex-1 p-4 lg:p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.length === 0 ? (
                  /* Empty State with Quick Actions */
                  <div className="space-y-8 py-8">
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-spacecraft to-celestial flex items-center justify-center mx-auto shadow-lg">
                        <Sparkles className="h-8 w-8 text-primary-foreground" />
                      </div>
                      <h2 className="text-2xl font-bold">
                        {selectedDeck ? `Analyzing ${selectedDeck.name}` : 'Ask Me Anything About Magic'}
                      </h2>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        {selectedDeck 
                          ? 'Ask me anything about your deck\'s strategy, card choices, or optimization opportunities.'
                          : 'I can help with rules, deck building, card recommendations, strategy, and more. Select a deck for specific analysis.'}
                      </p>
                    </div>

                    {/* Quick Actions Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {(selectedDeck ? DECK_QUICK_ACTIONS : GENERAL_QUICK_ACTIONS).map((action) => (
                        <button
                          key={action.id}
                          onClick={() => handleQuickAction(action)}
                          className="group p-4 rounded-xl border bg-card hover:shadow-md transition-all text-left hover:border-primary/50"
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3",
                            action.gradient
                          )}>
                            <action.icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="font-medium text-sm group-hover:text-primary transition-colors">
                            {action.label}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {action.description}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Example Prompts */}
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground text-center">
                        Or try asking:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {(selectedDeck ? DECK_EXAMPLE_PROMPTS : GENERAL_EXAMPLE_PROMPTS).map((prompt, i) => (
                          <button
                            key={i}
                            onClick={() => handleSendMessage(prompt)}
                            className="px-3 py-1.5 text-sm rounded-full border bg-muted/50 hover:bg-muted transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                      /* Message Thread */
                      <AnimatePresence mode="popLayout">
                        {messages.map((message) => (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className={cn(
                              "flex gap-3",
                              message.type === 'user' ? 'justify-end' : 'justify-start'
                            )}
                          >
                            {message.type === 'assistant' && (
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-spacecraft to-celestial flex items-center justify-center shrink-0 mt-1">
                                <Bot className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                            
                            <div className={cn(
                              "max-w-[85%] rounded-2xl",
                              message.type === 'user' 
                                ? 'bg-primary text-primary-foreground px-4 py-3'
                                : 'bg-muted/50 border px-4 py-3'
                            )}>
                              {message.type === 'assistant' ? (
                            <div className="space-y-4">
                              <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-3 prose-p:leading-relaxed prose-headings:mt-6 prose-headings:mb-3 prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-ul:my-3 prose-ul:space-y-1 prose-ol:my-3 prose-ol:space-y-1 prose-li:my-1 prose-strong:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:rounded-lg prose-blockquote:border-l-primary prose-blockquote:pl-4 prose-blockquote:italic">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                                  </div>
                                  
                                  {/* Visual Data */}
                                  {message.visualData && (
                                    <AIVisualDisplay data={message.visualData} />
                                  )}
                                  
                                  {/* Card Recommendations */}
                                  {message.cards && message.cards.length > 0 && (
                                    <CardRecommendationDisplay
                                      cards={message.cards}
                                      onCardClick={(card) => {
                                        const normalized = {
                                          ...card,
                                          image_uris: (card as any).image_uris || (card.image_uri ? { normal: card.image_uri } : undefined)
                                        };
                                        setModalCard(normalized);
                                        setModalOpen(true);
                                      }}
                                      compact={false}
                                    />
                                  )}
                                  
                                  {/* Message Actions */}
                                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => copyMessage(message.id, message.content)}
                                    >
                                      {copiedMessageId === message.id ? (
                                        <>
                                          <Check className="h-3 w-3 mr-1" />
                                          Copied
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3 mr-1" />
                                          Copy
                                        </>
                                      )}
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                  <span className="text-xs opacity-70 mt-1 block">
                                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              )}
                            </div>

                            {message.type === 'user' && (
                              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-1">
                                <User className="h-4 w-4 text-primary-foreground" />
                              </div>
                            )}
                          </motion.div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-spacecraft to-celestial flex items-center justify-center shrink-0">
                              <Bot className="h-4 w-4 text-primary-foreground" />
                            </div>
                            <div className="bg-muted/50 border rounded-2xl px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex gap-1">
                                  <span className="w-2 h-2 bg-spacecraft rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-2 h-2 bg-spacecraft rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-2 h-2 bg-spacecraft rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-sm text-muted-foreground">Analyzing...</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="border-t bg-background/95 backdrop-blur-sm p-4">
                  <div className="max-w-4xl mx-auto">
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <Textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={selectedDeck ? "Ask about your deck..." : "Ask anything about Magic..."}
                          className="min-h-[52px] max-h-32 resize-none pr-12 text-base"
                          disabled={isLoading}
                          rows={1}
                        />
                        <Button
                          onClick={() => handleSendMessage()}
                          disabled={isLoading || !input.trim()}
                          size="icon"
                          className="absolute right-2 bottom-2 h-8 w-8"
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Press Enter to send, Shift+Enter for new line
                    </p>
                  </div>
                </div>
          </div>
        </div>

        {/* Card Modal */}
        {modalOpen && (
          <UniversalCardViewModal 
            card={modalCard}
            open={modalOpen}
            onOpenChange={setModalOpen}
            showAddButton={false}
            showWishlistButton={false}
          />
        )}
      </div>
    </div>
  );
}
