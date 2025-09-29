import { useState, useRef, useEffect } from 'react';
import { Send, Zap, BookOpen, Target, TrendingUp, MessageSquare, Sparkles, ChevronUp, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useDeckStore } from '@/stores/deckStore';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import MTGKnowledgeBase from '@/lib/magic/knowledge-base';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface QuickAction {
  id: string;
  label: string;
  icon: any;
  prompt: string;
  description: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'analyze-deck',
    label: 'Analyze My Deck',
    icon: Target,
    prompt: 'Analyze my current deck and provide strategic insights',
    description: 'Get comprehensive analysis of your deck\'s strengths and weaknesses',
    color: 'bg-blue-500/10 text-blue-600 border-blue-200'
  },
  {
    id: 'card-comparison',
    label: 'Compare Cards',
    icon: TrendingUp,
    prompt: 'Help me compare cards for my deck',
    description: 'Compare multiple cards to find the best fit for your strategy',
    color: 'bg-green-500/10 text-green-600 border-green-200'
  },
  {
    id: 'meta-insights',
    label: 'Meta Analysis',
    icon: Sparkles,
    prompt: 'What are the current meta trends in my format?',
    description: 'Discover current meta trends and competitive insights',
    color: 'bg-purple-500/10 text-purple-600 border-purple-200'
  },
  {
    id: 'build-strategy',
    label: 'Build Strategy',
    icon: BookOpen,
    prompt: 'Help me develop a deck building strategy',
    description: 'Get expert guidance on deck construction and optimization',
    color: 'bg-orange-500/10 text-orange-600 border-orange-200'
  },
  {
    id: 'synergy-discovery',
    label: 'Find Synergies',
    icon: Zap,
    prompt: 'Find synergies for my commander or theme',
    description: 'Discover powerful card combinations and synergy patterns',
    color: 'bg-red-500/10 text-red-600 border-red-200'
  }
];

export default function Brain() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { name: deckName, format, totalCards, powerLevel } = useDeckStore();

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
        content: `# Welcome to the MTG Super Brain! 🧠✨

I'm your comprehensive Magic: The Gathering assistant, powered by deep game knowledge and strategic analysis.

**What I can help you with:**
• **Deck Analysis** - Power level assessment and optimization
• **Card Discovery** - Find perfect cards for your strategy
• **Strategic Guidance** - Build winning game plans
• **Meta Intelligence** - Current trends and competitive insights
• **Synergy Detection** - Discover powerful card combinations

${deckName ? `\n**Current Deck:** ${deckName} (${format}, ${totalCards} cards, Power Level ${powerLevel})` : '\n**Ready to analyze any deck you\'re building!**'}

Choose a quick action below or ask me anything about Magic!`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, [deckName, format, totalCards, powerLevel]);

  const generateResponse = async (userMessage: string): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    return `# Response to: "${userMessage}"

This is a placeholder response. In a full implementation, this would analyze your question using the MTG knowledge base and provide detailed strategic insights.

**Key points:**
• Comprehensive analysis based on your question
• Strategic recommendations
• Format-specific guidance
• Actionable next steps

Ask me more specific questions about deck building, card analysis, or MTG strategy!`;
  };

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowQuickActions(false);

    try {
      const response = await generateResponse(text);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: '# Error 🚨\n\nI apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    handleSendMessage(action.prompt);
  };

  return (
    <StandardPageLayout title="MTG Super Brain" description="Your comprehensive Magic: The Gathering assistant">
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        {/* Header */}
        <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-primary/60 flex items-center justify-center shadow-lg">
                  <span className="text-lg">🧠</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold">MTG Super Brain</h1>
                  <p className="text-sm text-muted-foreground">Your strategic Magic assistant</p>
                </div>
              </div>
              {deckName && (
                <Badge variant="secondary" className="hidden sm:flex">
                  Analyzing: {deckName}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-4xl">
          {/* Chat Container */}
          <Card className="bg-background/60 backdrop-blur-sm border-border/50 shadow-xl">
            <CardContent className="p-0">
              {/* Messages Area */}
              <ScrollArea className="h-[500px] p-6">
                <div className="space-y-6">
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
                        <div className="text-sm whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert">
                          {message.content}
                        </div>
                        <div className="text-xs opacity-60 mt-2">
                          {message.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  
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

              {/* Quick Actions */}
              {showQuickActions && messages.length <= 1 && (
                <div className="p-6 pt-0">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground">Quick Actions</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowQuickActions(false)}
                      className="h-6 w-6 p-0"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action)}
                        className={`p-3 rounded-xl border text-left transition-all hover:shadow-md hover:scale-[1.02] ${action.color}`}
                      >
                        <div className="flex items-start gap-3">
                          <action.icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{action.label}</h4>
                            <p className="text-xs opacity-80 mt-1">{action.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="p-6 pt-4 border-t bg-background/40 backdrop-blur-sm">
                <div className="flex gap-3">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about deck strategy, card analysis, meta trends, or any MTG question..."
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    disabled={isLoading}
                    className="bg-background/80 border-border/50 focus:bg-background"
                  />
                  <Button 
                    onClick={() => handleSendMessage()} 
                    disabled={isLoading || !input.trim()}
                    className="shadow-md"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                
                {!showQuickActions && messages.length > 1 && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowQuickActions(true)}
                      className="text-xs text-muted-foreground"
                    >
                      <Lightbulb className="h-3 w-3 mr-1" />
                      Show Quick Actions
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Context Info */}
          {deckName && (
            <Card className="mt-4 bg-background/40 backdrop-blur-sm border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span><strong>Deck:</strong> {deckName}</span>
                    <span><strong>Format:</strong> {format}</span>
                    <span><strong>Cards:</strong> {totalCards}</span>
                    <span><strong>Power:</strong> {powerLevel}/10</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Context Active
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </StandardPageLayout>
  );
}