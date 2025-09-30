// AI Analysis Panel for Deck Builder
// Matches Brain.tsx styling and functionality

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RefreshCw, MessageSquare, TrendingUp, Zap, Target, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CardRecommendationDisplay, type CardData } from '@/components/shared/CardRecommendationDisplay';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cards?: CardData[];
}

interface AIAnalysisPanelProps {
  deckId: string;
  deckName: string;
  deckFormat: string;
  deckSummary?: any;
  onCardClick?: (card: CardData) => void;
  onAddCard?: (card: CardData) => void;
}

const QUICK_ACTIONS = [
  {
    id: 'analyze',
    label: 'Analyze Deck',
    icon: TrendingUp,
    prompt: "Analyze my deck's power level, strategy, and provide optimization suggestions.",
    className: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-600 dark:text-blue-400'
  },
  {
    id: 'upgrades',
    label: 'Suggest Upgrades',
    icon: Zap,
    prompt: 'What are the best upgrade cards for my deck?',
    className: 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30 text-yellow-600 dark:text-yellow-400'
  },
  {
    id: 'combos',
    label: 'Find Combos',
    icon: Target,
    prompt: 'What are the key combos and synergies in my deck?',
    className: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400'
  },
  {
    id: 'cuts',
    label: 'What to Cut',
    icon: Lightbulb,
    prompt: 'What cards should I consider cutting from my deck?',
    className: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-600 dark:text-purple-400'
  }
];

export function AIAnalysisPanel({
  deckId,
  deckName,
  deckFormat,
  deckSummary,
  onCardClick,
  onAddCard
}: AIAnalysisPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [detailedResponses, setDetailedResponses] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: '1',
        type: 'assistant',
        content: `## 🚀 DeckMatrix AI Analysis Engine Activated

**TARGET DECK**: ${deckName}  
**FORMAT**: ${deckFormat} | **POWER LEVEL**: ${deckSummary?.power?.score || 'TBD'}/10

### Ready for Deep Strategic Analysis
I'm your dedicated DeckMatrix AI analyst. Ask me anything about your deck's strategy, card interactions, or optimization opportunities!`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [deckName, deckFormat]);

  const generateResponse = async (message: string): Promise<{ message: string; cards: CardData[] }> => {
    try {
      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message,
          deckContext: { id: deckId, name: deckName, format: deckFormat, ...deckSummary },
          conversationHistory: messages.slice(-6),
          responseStyle: detailedResponses ? 'detailed' : 'concise'
        },
      });

      const { data, error } = response;
      
      if (error) throw new Error(error.message || 'Failed to get response');
      if (data?.error) throw new Error(data.error);

      return { message: data.message || 'No response received', cards: data.cards || [] };
    } catch (error) {
      console.error('Error calling MTG Brain:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limits exceeded')) {
          toast.error('Rate limits exceeded. Please wait before asking another question.');
        } else if (error.message.includes('Payment required')) {
          toast.error('Credits required. Please add AI credits to continue.');
        }
      }
      
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

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
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    setInput(action.prompt);
    setShowQuickActions(false);
  };

  const handleNewConversation = () => {
    setMessages([]);
    setShowQuickActions(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-spacecraft/10 to-celestial/10 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg bg-gradient-cosmic bg-clip-text text-transparent">DeckMatrix AI</h3>
              <p className="text-xs text-spacecraft">Analyzing: {deckName}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Response Style Toggle */}
            <div className="flex items-center gap-2 border px-3 py-1.5 rounded-lg bg-background/50">
              <Label htmlFor="ai-detailed-toggle" className="text-xs font-medium cursor-pointer">
                {detailedResponses ? "Detailed" : "Quick"}
              </Label>
              <Switch
                id="ai-detailed-toggle"
                checked={detailedResponses}
                onCheckedChange={setDetailedResponses}
              />
            </div>
            
            <Button variant="outline" size="sm" onClick={handleNewConversation}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions - At Top */}
      {showQuickActions && messages.length <= 1 && (
        <div className="p-4 border-b bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                className={`p-3 rounded-lg border-2 transition-all text-left h-full ${action.className}`}
              >
                <action.icon className="h-4 w-4 mb-2" />
                <div className="text-sm font-medium">{action.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 min-h-[400px]">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-muted/80 backdrop-blur-sm text-foreground border border-border/50'
                }`}
              >
                <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
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
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  )}
                </div>

                {/* Card Display */}
                {message.cards && message.cards.length > 0 && (
                  <CardRecommendationDisplay
                    cards={message.cards}
                    onCardClick={onCardClick}
                    onAddCard={onAddCard}
                    compact
                  />
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t bg-background/95 backdrop-blur-sm">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder="Ask about your deck strategy, card choices, upgrades..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
