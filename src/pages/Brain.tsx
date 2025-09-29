import { useState, useRef, useEffect } from 'react';
import { Send, Zap, BookOpen, Target, TrendingUp, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDeckStore } from '@/stores/deckStore';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import MTGKnowledgeBase from '@/lib/magic/knowledge-base';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  category?: 'discovery' | 'comparison' | 'strategy' | 'analysis' | 'general';
  data?: any;
}

interface QuickAction {
  id: string;
  label: string;
  icon: any;
  category: string;
  prompt: string;
  description: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'analyze-deck',
    label: 'Analyze My Deck',
    icon: Target,
    category: 'analysis',
    prompt: 'Analyze my current deck and provide strategic insights',
    description: 'Get comprehensive analysis of your deck\'s strengths and weaknesses'
  },
  {
    id: 'card-comparison',
    label: 'Compare Cards',
    icon: TrendingUp,
    category: 'comparison',
    prompt: 'Help me compare cards for my deck',
    description: 'Compare multiple cards to find the best fit for your strategy'
  },
  {
    id: 'meta-insights',
    label: 'Meta Analysis',
    icon: Sparkles,
    category: 'discovery',
    prompt: 'What are the current meta trends in my format?',
    description: 'Discover current meta trends and competitive insights'
  },
  {
    id: 'build-strategy',
    label: 'Build Strategy',
    icon: BookOpen,
    category: 'strategy',
    prompt: 'Help me develop a deck building strategy',
    description: 'Get expert guidance on deck construction and optimization'
  },
  {
    id: 'synergy-discovery',
    label: 'Find Synergies',
    icon: Zap,
    category: 'discovery',
    prompt: 'Find synergies for my commander or theme',
    description: 'Discover powerful card combinations and synergy patterns'
  },
  {
    id: 'format-guide',
    label: 'Format Guide',
    icon: MessageSquare,
    category: 'general',
    prompt: 'Explain the rules and strategy for my format',
    description: 'Learn format-specific rules, strategies, and best practices'
  }
];

export default function Brain() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { name: deckName, format, cards, commander, powerLevel, totalCards } = useDeckStore();

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
        content: `Welcome to the MTG Super Brain! 🧠\n\nI'm your comprehensive Magic: The Gathering assistant, powered by deep game knowledge and strategic analysis. I can help you with:\n\n• **Deck Analysis** - Comprehensive power level, synergy, and optimization analysis\n• **Card Discovery** - Find perfect cards for your strategy and meta\n• **Strategic Guidance** - Build winning game plans and sideboard strategies\n• **Meta Intelligence** - Current trends, matchup analysis, and competitive insights\n• **Synergy Detection** - Discover powerful card combinations and interactions\n\nWhat would you like to explore today?`,
        timestamp: new Date(),
        category: 'general'
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  const generateResponse = async (userMessage: string, category?: string): Promise<string> => {
    // Simulate AI thinking with the knowledge base
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const lowerMessage = userMessage.toLowerCase();

    // Deck Analysis
    if (lowerMessage.includes('analyze') && (lowerMessage.includes('deck') || lowerMessage.includes('my deck'))) {
      if (!deckName || cards.length === 0) {
        return "I'd love to analyze your deck! However, I don't see any cards in your current deck. Please add some cards to your deck first, then ask me to analyze it again.";
      }

      const nonLandCards = cards.filter(card => !card.type_line?.includes('Land'));
      const avgCMC = nonLandCards.reduce((sum, card) => sum + (card.cmc || 0), 0) / Math.max(nonLandCards.length, 1);
      const colors = [...new Set(cards.flatMap(card => card.color_identity || []))];
      
      return `## Deck Analysis: ${deckName}\n\n**Format:** ${format} | **Colors:** ${colors.join('') || 'Colorless'} | **Power Level:** ${powerLevel}/10\n\n### Composition\n• **Total Cards:** ${totalCards}\n• **Average CMC:** ${avgCMC.toFixed(2)}\n• **Color Identity:** ${colors.length === 0 ? 'Colorless' : colors.length === 1 ? 'Mono-color' : colors.length === 2 ? 'Two-color' : 'Multi-color'}\n\n### Strategic Assessment\n**Strengths:**\n${cards.length >= 60 ? '✅ Legal deck size' : '⚠️ Deck size needs attention'}\n${avgCMC <= 3.5 ? '✅ Efficient mana curve' : avgCMC <= 4.5 ? '⚖️ Moderate curve' : '⚠️ High curve - consider more low-cost options'}\n${colors.length <= 3 ? '✅ Focused color identity' : '⚠️ Complex mana base required'}\n\n**Recommendations:**\n• Focus on ${avgCMC > 4 ? 'lowering your curve with more 1-3 CMC spells' : 'maintaining your efficient curve'}\n• Consider adding more ${cards.length < 10 ? 'card draw and ramp' : 'interaction and removal'}\n• ${format === 'commander' ? 'Ensure 36-40 lands for consistent mana' : 'Maintain proper land count for your strategy'}\n\nWould you like me to dive deeper into any specific aspect?`;
    }

    // Card Comparison
    if (lowerMessage.includes('compare') && lowerMessage.includes('card')) {
      return `## Card Comparison Guide\n\nTo help you compare cards effectively, I'll use these criteria:\n\n### Evaluation Framework\n• **Mana Efficiency** - Cost vs. impact ratio\n• **Versatility** - Number of valid use cases\n• **Synergy Potential** - How well it fits your strategy\n• **Meta Relevance** - Current format considerations\n\n### Quick Comparison Categories\n**Removal:** Efficiency, permanence, and cost\n**Creatures:** Power/toughness ratio, abilities, and curve position\n**Card Draw:** Cards per mana, conditions, and reliability\n**Ramp:** Speed, fixing, and opportunity cost\n\nTell me which specific cards you'd like to compare, and I'll provide a detailed analysis with recommendations for your deck!`;
    }

    // Meta Analysis
    if (lowerMessage.includes('meta') || lowerMessage.includes('trend')) {
      const currentFormat = format || 'commander';
      return `## Current ${currentFormat.charAt(0).toUpperCase() + currentFormat.slice(1)} Meta Analysis\n\n### Top Tier Strategies\n${currentFormat === 'commander' ? '• **Simic Value** - Card advantage and ramp dominance\n• **Aristocrats** - Sacrifice synergies with incremental advantage\n• **Fast Combo** - Turn 4-6 wins with protection\n• **Stax/Control** - Resource denial and late-game inevitability' : '• **Aggro** - Fast, efficient threats\n• **Midrange** - Value-oriented creatures and removal\n• **Control** - Counterspells and win conditions\n• **Combo** - Synergistic interactions'}\n\n### Key Meta Shifts\n• Increased interaction and removal\n• Focus on card advantage engines\n• Efficient mana curves becoming standard\n• ${currentFormat === 'commander' ? 'Power level arms race continues' : 'Sideboard strategies more important'}\n\n### Strategic Advice\n• Build with interaction in mind\n• Prepare for popular strategies\n• Consider alternative win conditions\n• ${currentFormat === 'commander' ? 'Respect the social contract' : 'Practice your matchups'}\n\nWhat specific aspect of the meta interests you most?`;
    }

    // Build Strategy
    if (lowerMessage.includes('strategy') || lowerMessage.includes('build')) {
      return `## Deck Building Strategy Framework\n\n### Core Principles\n**1. Identity First** - Define your win condition and strategy\n**2. Rule of 9** - Include 9 effects for each crucial role\n**3. Mana Efficiency** - Optimize your curve for consistent plays\n**4. Interaction Balance** - Include sufficient answers\n\n### Strategic Roles (Rule of 9)\n• **Ramp** - Accelerate your game plan\n• **Draw** - Maintain card advantage\n• **Removal** - Answer threats efficiently\n• **Threats** - Your win conditions\n• **Protection** - Safeguard key pieces\n\n### Format-Specific Guidelines\n**Commander (100 cards)**\n• 36-40 lands + 10-12 ramp\n• Strong synergy theme\n• Political considerations\n\n**60-Card Formats**\n• 20-26 lands based on curve\n• 4-of consistency\n• Sideboard planning\n\n### Power Level Tuning\n• **Casual (1-4):** Theme over optimization\n• **Focused (5-7):** Efficient with some competition\n• **High Power (8-9):** Optimized with fast mana\n• **cEDH (10):** Maximum efficiency\n\nWhat type of strategy are you looking to build?`;
    }

    // Synergy Discovery
    if (lowerMessage.includes('synerg') || lowerMessage.includes('combo')) {
      return `## Synergy Discovery Engine\n\n### Major Synergy Patterns\n\n**Sacrifice Synergies**\n• Outlets: Free sac, mana production, value generation\n• Payoffs: Death triggers, token creation, recursion\n• Enablers: Token makers, indestructible creatures\n\n**Graveyard Synergies**\n• Fillers: Self-mill, discard, sacrifice\n• Payoffs: Reanimation, recursion, threshold\n• Protection: Shuffle effects, instant-speed recursion\n\n**Token Synergies**\n• Generators: One-shot, repeatable, triggered\n• Payoffs: Anthems, sacrifice outlets, tap abilities\n• Multipliers: Doubling effects, cost reduction\n\n**Spellslinger Synergies**\n• Enablers: Cost reduction, ritual effects\n• Payoffs: Copy effects, storm, prowess triggers\n• Support: Recursion, card selection\n\n### Infinite Combo Patterns\n• **Classic Loops:** Mikaeus + Walking Ballista\n• **Value Engines:** Rhystic Study + opponents\n• **Mana Loops:** Dramatic Scepter combos\n• **Drain Effects:** Exquisite Blood + Sanguine Bond\n\nWhat synergy pattern interests you, or do you have specific cards you want to build around?`;
    }

    // Format Guide
    if (lowerMessage.includes('format') || lowerMessage.includes('rule')) {
      const currentFormat = format || 'commander';
      const formatInfo = MTGKnowledgeBase.FORMAT_RULES[format];
      
      if (formatInfo) {
        return `## ${formatInfo.name || format.charAt(0).toUpperCase() + format.slice(1)} Format Guide\n\n### Basic Rules\n• **Deck Size:** ${formatInfo.deck_size || 'Variable'}\n• **Copies:** ${formatInfo.max_copies ? `${formatInfo.max_copies} maximum` : 'Singleton (1 copy)'}\n• **Starting Life:** ${format === 'commander' ? '40' : '20'}\n\n### Key Features\n${format === 'commander' ? '• 100-card singleton format\n• Color identity restrictions\n• Commander damage (21 total)\n• Multiplayer politics\n• Social contract considerations' : `• ${formatInfo.min_deck}-card minimum\n• ${formatInfo.sideboard || 0}-card sideboard\n• Competitive optimization\n• Tournament legality`}\n\n### Strategic Considerations\n• **Power Level:** ${formatInfo.power_level || 'Varies by playgroup'}\n• **Speed:** ${format === 'commander' ? 'Games typically 8-12 turns' : 'Games typically 5-10 turns'}\n• **Interaction:** High interaction expected\n• **Innovation:** ${format === 'commander' ? 'High deck diversity' : 'Meta-dependent optimization'}\n\n### Building Guidelines\n${format === 'commander' ? '• Choose commander first\n• Build around color identity\n• Include politics and removal\n• Balance power level with group' : '• Optimize for consistency\n• Prepare comprehensive sideboard\n• Practice key matchups\n• Understand ban list implications'}\n\nWhat specific aspect of ${format} would you like to explore further?`;
      }
    }

    // General knowledge
    if (lowerMessage.includes('color') || lowerMessage.includes('philosophy')) {
      return `## Color Philosophy Guide\n\n### The Five Colors\n\n**White (W) - Order & Peace**\n• Philosophy: Structure, morality, protection\n• Strengths: Removal, life gain, mass effects\n• Weaknesses: Card draw, ramp\n• Keywords: Vigilance, lifelink, first strike\n\n**Blue (U) - Knowledge & Control**\n• Philosophy: Perfection through information\n• Strengths: Card draw, counterspells, tempo\n• Weaknesses: Creature removal, artifacts\n• Keywords: Flying, flash, scry\n\n**Black (B) - Power & Ambition**\n• Philosophy: Victory at any cost\n• Strengths: Removal, tutors, reanimation\n• Weaknesses: Artifacts, enchantments\n• Keywords: Deathtouch, menace, lifelink\n\n**Red (R) - Freedom & Chaos**\n• Philosophy: Emotion over logic\n• Strengths: Direct damage, haste, artifacts\n• Weaknesses: Card draw, enchantments\n• Keywords: Haste, first strike, trample\n\n**Green (G) - Growth & Nature**\n• Philosophy: Natural order and growth\n• Strengths: Ramp, big creatures, artifact hate\n• Weaknesses: Flying, counterspells\n• Keywords: Trample, reach, hexproof\n\n### Color Combinations\nEach combination creates unique strategic identities with overlapping strengths and covered weaknesses.\n\nWhich colors or combinations interest you most?`;
    }

    // Default response
    return `I understand you're interested in "${userMessage}". Here are some ways I can help:\n\n• **Deck Analysis** - Share your deck for comprehensive review\n• **Card Recommendations** - Tell me your strategy for suggestions\n• **Meta Insights** - Ask about format trends and strategies\n• **Rules Questions** - Clarify game mechanics and interactions\n• **Synergy Discovery** - Find powerful card combinations\n• **Strategic Guidance** - Develop winning game plans\n\nCould you be more specific about what you'd like to explore? I have access to comprehensive MTG knowledge and can provide detailed insights!`;
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
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
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
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat">AI Assistant</TabsTrigger>
            <TabsTrigger value="quick-actions">Quick Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Chat Interface */}
              <Card className="lg:col-span-3 h-[600px] flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                      🧠
                    </div>
                    MTG Super Brain
                    <Badge variant="secondary" className="ml-auto">
                      {deckName ? `Analyzing: ${deckName}` : 'Ready'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col">
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                              message.type === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted/50 text-foreground'
                            }`}
                          >
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            <div className="text-xs opacity-60 mt-1">
                              {message.timestamp.toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex justify-start">
                          <div className="bg-muted/50 rounded-lg px-4 py-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"></div>
                              <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                              <div className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <Separator className="my-4" />

                  <div className="flex gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about deck strategy, card analysis, meta trends, or any MTG question..."
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      disabled={isLoading}
                      className="flex-1"
                    />
                    <Button 
                      onClick={() => handleSendMessage()} 
                      disabled={isLoading || !input.trim()}
                      size="icon"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Context Panel */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-sm">Context</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {deckName && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Current Deck</div>
                      <div className="text-xs space-y-1">
                        <div><strong>Name:</strong> {deckName}</div>
                        <div><strong>Format:</strong> {format}</div>
                        <div><strong>Cards:</strong> {totalCards}</div>
                        <div><strong>Power:</strong> {powerLevel}/10</div>
                      </div>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Capabilities</div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">Analysis</Badge>
                      <Badge variant="outline" className="text-xs">Strategy</Badge>
                      <Badge variant="outline" className="text-xs">Meta</Badge>
                      <Badge variant="outline" className="text-xs">Synergies</Badge>
                      <Badge variant="outline" className="text-xs">Rules</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="quick-actions" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {QUICK_ACTIONS.map((action) => (
                <Card key={action.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleQuickAction(action)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <action.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium mb-1">{action.label}</h3>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                        <Badge variant="outline" className="mt-2 text-xs">{action.category}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Featured Capabilities</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Advanced Analysis</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Power level assessment with detailed scoring</li>
                    <li>• Mana curve optimization recommendations</li>
                    <li>• Synergy detection and combo identification</li>
                    <li>• Format-specific strategic guidance</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Meta Intelligence</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Current competitive trends analysis</li>
                    <li>• Matchup assessment and sideboard advice</li>
                    <li>• Card evaluation in meta context</li>
                    <li>• Tournament preparation strategies</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </StandardPageLayout>
  );
}