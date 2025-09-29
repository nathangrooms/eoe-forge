import { useState, useRef, useEffect } from 'react';
import { Send, Zap, BookOpen, Target, TrendingUp, MessageSquare, Sparkles, ChevronUp, Lightbulb, RefreshCw, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useDeckStore } from '@/stores/deckStore';
import { supabase } from '@/integrations/supabase/client';
import { DeckAPI, DeckSummary } from '@/lib/api/deckAPI';
import { CardAddModal } from '@/components/brain/CardAddModal';

interface CardData {
  name: string;
  image_uri?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  cmc?: number;
  colors?: string[];
  rarity?: string;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cards?: CardData[];
}

const QUICK_ACTIONS = [
  {
    id: 'analyze',
    label: 'Analyze My Deck',
    description: 'Get a comprehensive power level and strategy analysis',
    icon: TrendingUp,
    prompt: 'Please analyze my deck\'s power level, strategy, and provide optimization suggestions.',
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-800'
  },
  {
    id: 'upgrades',
    label: 'Suggest Upgrades',
    description: 'Find powerful cards to improve your deck',
    icon: Zap,
    prompt: 'What are the best upgrade cards for my deck? Consider both budget and high-end options.',
    color: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950 dark:border-yellow-800'
  },
  {
    id: 'combos',
    label: 'Find Combos',
    description: 'Discover synergies and win conditions',
    icon: Target,
    prompt: 'What are the key combos and synergies in my deck? How can I improve consistency?',
    color: 'bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:border-red-800'
  },
  {
    id: 'meta',
    label: 'Meta Analysis',
    description: 'How your deck performs in the current meta',
    icon: BookOpen,
    prompt: 'How does my deck perform in the current meta? What are its strengths and weaknesses?',
    color: 'bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:border-green-800'
  },
  {
    id: 'cuts',
    label: 'What to Cut',
    description: 'Identify weak cards to remove',
    icon: Lightbulb,
    prompt: 'What cards should I consider cutting from my deck and why?',
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100 dark:bg-purple-950 dark:border-purple-800'
  },
  {
    id: 'strategy',
    label: 'Strategy Guide',
    description: 'Learn how to pilot your deck effectively',
    icon: MessageSquare,
    prompt: 'How should I pilot this deck? What\'s my game plan and key decision points?',
    color: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950 dark:border-indigo-800'
  }
];

export default function Brain() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [availableDecks, setAvailableDecks] = useState<DeckSummary[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [deckCards, setDeckCards] = useState<any[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [detailedResponses, setDetailedResponses] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load decks on component mount
  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    setLoadingDecks(true);
    try {
      const decks = await DeckAPI.getDeckSummaries();
      setAvailableDecks(decks);
      if (decks.length > 0 && !selectedDeck) {
        setSelectedDeck(decks[0]);
      }
    } catch (error) {
      console.error('Error loading decks:', error);
      toast.error('Could not load your deck list. Please try again.');
    } finally {
      setLoadingDecks(false);
    }
  };

  // Load deck cards when deck is selected
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
      toast.error('Could not load the selected deck\'s cards.');
    }
  };

  const handleDeckChange = (deckId: string) => {
    const deck = availableDecks.find(d => d.id === deckId);
    if (deck) {
      setSelectedDeck(deck);
      loadDeckCards(deck.id);
      setMessages([]);
      setShowQuickActions(true);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setShowQuickActions(true);
  };


  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0 && selectedDeck) {
      const welcomeMessage: Message = {
        id: '1',
        type: 'assistant',
        content: `## 🚀 DeckMatrix AI Analysis Engine Activated

**TARGET DECK**: ${selectedDeck.name}  
**FORMAT**: ${selectedDeck.format} | **CARDS**: ${selectedDeck.counts.total} | **POWER LEVEL**: ${selectedDeck.power.score}/10

### Ready for Deep Strategic Analysis
I'm your dedicated DeckMatrix AI analyst, equipped with comprehensive Magic knowledge and advanced deck optimization algorithms. I can provide:

- **Power Level Assessment** - Detailed scoring and meta positioning
- **Synergy Analysis** - Card interaction mapping and combo identification  
- **Upgrade Pathways** - Strategic improvement recommendations
- **Meta Positioning** - Current format analysis and matchup data
- **Strategic Guidance** - Optimal play patterns and decision trees

**Ask me anything about your deck's strategy, card interactions, or optimization opportunities!**`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [selectedDeck]);

  // Call MTG Brain API
  const generateResponse = async (message: string): Promise<{ message: string; cards: CardData[] }> => {
    try {
      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message,
          deckContext: selectedDeck,
          conversationHistory: messages.slice(-6),
          responseStyle: detailedResponses ? 'detailed' : 'concise'
        },
      });

      const { data, error } = response;
      
      if (error) {
        throw new Error(error.message || 'Failed to get response from MTG Brain');
      }
      
      if (data?.error) {
        throw new Error(data.error || 'MTG Brain returned an error');
      }

      return { message: data.message || 'No response received from MTG Brain', cards: data.cards || [] };
    } catch (error) {
      console.error('Error calling MTG Brain:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limits exceeded')) {
          toast.error('Rate limits exceeded. Please wait a moment before asking another question.');
        } else if (error.message.includes('Payment required')) {
          toast.error('Credits required. Please add AI credits to your workspace to continue.');
        }
      }
      
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !selectedDeck) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowQuickActions(false);

    try {
      const { message: responseText, cards } = await generateResponse(input.trim());
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
        timestamp: new Date(),
        cards
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error generating response:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: any) => {
    setInput(action.prompt);
    setShowQuickActions(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 py-6 h-full">
        <div className="flex gap-6 h-full">
          {/* Main Chat Area - Full width when cards are displayed */}
          <div className="flex-1 flex flex-col h-full min-h-[600px]">
            <Card className="flex-1 flex flex-col">
              <CardContent className="p-0 flex flex-col h-full">
                {/* Header */}
                <div className="p-4 border-b bg-gradient-to-r from-spacecraft/10 to-celestial/10 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="font-bold text-xl bg-gradient-cosmic bg-clip-text text-transparent">DeckMatrix AI</h2>
                        <p className="text-sm text-spacecraft font-medium">
                          {selectedDeck ? `Analyzing: ${selectedDeck.name}` : 'Select a deck to start analysis'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Response Style Toggle */}
                      <div className="flex items-center gap-2">
                        <Label htmlFor="detailed-toggle" className="text-xs font-medium">
                          {detailedResponses ? "Detailed" : "Quick"}
                        </Label>
                        <Switch
                          id="detailed-toggle"
                          checked={detailedResponses}
                          onCheckedChange={setDetailedResponses}
                        />
                      </div>
                      
                      <Select value={selectedDeck?.id || ''} onValueChange={handleDeckChange}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select a deck" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDecks.map((deck) => (
                            <SelectItem key={deck.id} value={deck.id}>
                              {deck.name} ({deck.format})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Button variant="outline" size="sm" onClick={handleNewConversation}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Messages Area */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                     {messages.map((message, index) => {
                       const hasCards = message.cards && message.cards.length > 0;
                       return (
                         <div
                           key={index}
                           className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                         >
                           <div
                             className={`${hasCards && message.type === 'assistant' ? 'w-full' : 'max-w-[85%]'} rounded-2xl px-4 py-3 ${
                               message.type === 'user'
                                 ? 'bg-primary text-primary-foreground shadow-md'
                                 : 'bg-muted/80 backdrop-blur-sm text-foreground border border-border/50'
                             }`}
                           >
                           <div className="text-sm prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-li:my-0">
                              {message.type === 'assistant' ? (
                                <div className="space-y-4">
                                  <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                                        <span className="text-xs font-bold text-white">DM</span>
                                      </div>
                                      <span className="text-xs font-bold text-spacecraft">DECKMATRIX ANALYSIS</span>
                                    </div>
                                    <ReactMarkdown
                                      components={{
                                        p: ({ children }) => <p className="mb-3 last:mb-0 text-foreground/90">{children}</p>,
                                        h1: ({ children }) => <h1 className="text-lg font-bold text-spacecraft mb-2">{children}</h1>,
                                        h2: ({ children }) => <h2 className="text-base font-semibold text-spacecraft/90 mb-2">{children}</h2>,
                                        h3: ({ children }) => <h3 className="text-sm font-medium text-spacecraft/80 mb-1">{children}</h3>,
                                        strong: ({ children }) => <strong className="font-semibold text-spacecraft">{children}</strong>,
                                        ul: ({ children }) => <ul className="space-y-1 text-foreground/90">{children}</ul>,
                                        li: ({ children }) => <li className="flex items-start gap-2"><span className="text-spacecraft mt-1">•</span><span>{children}</span></li>
                                      }}
                                    >
                                      {message.content}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  components={{
                                    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                              )}
                            </div>
                          
                          {/* Display referenced cards */}
                          {message.cards && message.cards.length > 0 && (
                            <div className="mt-4 space-y-3">
                               <div className="text-xs font-medium text-muted-foreground border-t pt-3">
                                 Referenced Cards:
                               </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                                 {message.cards.map((card, cardIndex) => (
                                  <div
                                    key={cardIndex}
                                    className="bg-background/80 border rounded-lg p-3 text-xs space-y-2 hover:shadow-md transition-shadow"
                                  >
                                    {card.image_uri && (
                                      <img
                                        src={card.image_uri}
                                        alt={card.name}
                                        className="w-full h-auto rounded aspect-[5/7] object-cover"
                                      />
                                    )}
                                    <div className="space-y-1">
                                      <div className="font-semibold text-foreground">{card.name}</div>
                                      <div className="text-muted-foreground">
                                        {card.mana_cost} • CMC {card.cmc}
                                      </div>
                                      <div className="text-muted-foreground">{card.type_line}</div>
                                      {card.power && card.toughness && (
                                        <div className="text-muted-foreground font-mono">
                                          {card.power}/{card.toughness}
                                        </div>
                                      )}
                                       <div className="text-xs text-muted-foreground line-clamp-3">
                                         {card.oracle_text}
                                       </div>
                                        
                                        {/* Card addition modal */}
                                        <div className="pt-2">
                                          <CardAddModal card={card} />
                                        </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="text-xs opacity-60 mt-2">
                            {message.timestamp.toLocaleTimeString()}
                          </div>
                         </div>
                       </div>
                     );
                     })}
                    
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted/80 backdrop-blur-sm rounded-2xl px-4 py-3 border border-border/50">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                            <span className="text-sm text-muted-foreground ml-2">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t bg-background/95 backdrop-blur-sm">
                  <div className="flex gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={selectedDeck ? "Ask about your deck..." : "Select a deck first..."}
                      onKeyPress={(e) => e.key === 'Enter' && !isLoading && input.trim() && handleSendMessage()}
                      className="flex-1"
                      disabled={!selectedDeck || isLoading}
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={!selectedDeck || isLoading || !input.trim()}
                      size="sm"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Floating Quick Actions - Only show when needed */}
          {showQuickActions && messages.length <= 1 && (
            <div className="fixed bottom-20 right-4 w-80 z-50">
              <Card className="shadow-cosmic-glow border-spacecraft/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Zap className="h-4 w-4 text-spacecraft" />
                      DeckMatrix Quick Actions
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowQuickActions(false)}
                      className="h-6 w-6 p-0"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {QUICK_ACTIONS.slice(0, 4).map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action)}
                        className="w-full p-2 rounded-lg border border-spacecraft/20 text-left transition-all hover:bg-spacecraft/10 hover:border-spacecraft/40 text-sm"
                      >
                        <div className="flex items-start gap-2">
                          <action.icon className="h-4 w-4 flex-shrink-0 mt-0.5 text-spacecraft" />
                          <div>
                            <div className="font-medium text-spacecraft">{action.label}</div>
                            <div className="text-xs text-muted-foreground mt-1">{action.description}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}