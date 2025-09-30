import React, { useState, useRef, useEffect } from 'react';
import { Send, Zap, Target, Shield, Sparkles, TrendingUp, Mountain, Eye, AlertTriangle, Lightbulb, RefreshCw, Settings, Layers, Users, DollarSign } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card as DeckCard } from '@/stores/deckStore';
import { EDHPowerScore } from '@/lib/deckbuilder/score/edh-power-calculator';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  analysisType?: string;
}

interface BrainAnalysisProps {
  deck: DeckCard[];
  commander?: DeckCard;
  powerScore: EDHPowerScore;
  deckId?: string;
  format: string;
}

const ANALYSIS_OPTIONS = [
  {
    id: 'power-breakdown',
    label: 'Power Analysis',
    description: 'Deep dive into your deck\'s power level and subscores',
    icon: Zap,
    color: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950 dark:border-yellow-800',
    prompt: (data: any) => `Analyze this deck's power level breakdown in detail:

Power Level: ${data.power}/10 (${data.band})

**Subscores:**
${Object.entries(data.subscores || {}).map(([k, v]) => `- ${k}: ${v}/100`).join('\n')}

**Strengths:**
${(data.drivers || []).map((d: string) => `- ${d}`).join('\n')}

**Weaknesses:**
${(data.drags || []).map((d: string) => `- ${d}`).join('\n')}

Explain what each subscore means in practical gameplay, how to improve weak areas, and provide 2-3 specific card recommendations.`
  },
  {
    id: 'mana-curve',
    label: 'Mana Curve',
    description: 'Optimize your curve and mana base',
    icon: Mountain,
    color: 'bg-orange-50 border-orange-200 hover:bg-orange-100 dark:bg-orange-950 dark:border-orange-800',
    prompt: (data: any) => `Analyze this deck's mana curve and base:

Total Cards: ${data.totalCards}
Lands: ${data.lands}
Average CMC: ${data.avgCMC}
Mana Score: ${data.subscores?.mana || 0}/100

**Playability Metrics:**
- Keepable 7-card hands: ${data.playability?.keepable7_pct || 0}%
- T1 color hit: ${data.playability?.t1_color_hit_pct || 0}%
- Untapped lands: ${data.playability?.untapped_land_ratio || 0}%

Is my curve optimized? Should I adjust land count? Suggest 2-3 mana rocks or lands to improve consistency.`
  },
  {
    id: 'archetype',
    label: 'Deck Archetype',
    description: 'Identify your strategy and gameplan',
    icon: Target,
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100 dark:bg-purple-950 dark:border-purple-800',
    prompt: (data: any) => `Identify this deck's archetype and strategy:

Commander: ${data.commander?.name || 'Unknown'}
Colors: ${data.commander?.colors?.join('/') || 'Colorless'}

**Deck Composition:**
- Creatures: ${data.creatures}
- Instants: ${data.instants}
- Sorceries: ${data.sorceries}
- Artifacts: ${data.artifacts}
- Enchantments: ${data.enchantments}
- Lands: ${data.lands}

**Top Cards:** ${data.topCards?.slice(0, 10).join(', ') || 'N/A'}

What archetype is this (combo, stax, midrange, aggro, control)? What's the primary gameplan and win conditions?`
  },
  {
    id: 'upgrades',
    label: 'Card Recommendations',
    description: 'Specific cards to add to your deck',
    icon: Sparkles,
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:border-blue-800',
    prompt: (data: any) => `Provide 5-8 specific card recommendations for this deck:

Commander: ${data.commander?.name || 'Unknown'}
Colors: ${data.commander?.colors?.join('/') || 'Colorless'}
Power Level: ${data.power}/10 (${data.band})
Average CMC: ${data.avgCMC}

**Weakest Subscores:**
${Object.entries(data.subscores || {})
  .sort(([,a], [,b]) => (a as number) - (b as number))
  .slice(0, 3)
  .map(([k, v]) => `- ${k}: ${v}/100`)
  .join('\n')}

**Current Composition:**
- Creatures: ${data.creatures}
- Instants: ${data.instants}
- Sorceries: ${data.sorceries}
- Artifacts: ${data.artifacts}
- Enchantments: ${data.enchantments}

List cards by name with brief explanations of why each fits the strategy and addresses weaknesses.`
  },
  {
    id: 'cuts',
    label: 'What to Cut',
    description: 'Identify weak or underperforming cards',
    icon: AlertTriangle,
    color: 'bg-red-50 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:border-red-800',
    prompt: (data: any) => `Identify 5-8 cards I should consider cutting from this deck:

Commander: ${data.commander?.name || 'Unknown'}
Power Target: ${data.power}/10
Current Issues: ${(data.drags || []).join(', ')}

**Top Cards:** ${data.topCards?.slice(0, 15).join(', ') || 'N/A'}

Focus on cards that are:
- Too slow for the power level
- Don't synergize with the strategy
- Have better alternatives
- Underperform in practice

Provide specific card names and brief explanations.`
  },
  {
    id: 'strategy',
    label: 'Strategy Guide',
    description: 'Learn how to pilot your deck',
    icon: Eye,
    color: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950 dark:border-indigo-800',
    prompt: (data: any) => `Provide a strategy guide for piloting this deck:

Commander: ${data.commander?.name || 'Unknown'}
Archetype: ${data.archetype || 'Unknown'}
Power Level: ${data.power}/10

What's my gameplan in:
- **Early game** (turns 1-3)
- **Mid game** (turns 4-7)
- **Late game** (turn 8+)

What are my win conditions? When should I hold up interaction vs. developing my board? What are key decision points?`
  },
  {
    id: 'synergies',
    label: 'Synergy Map',
    description: 'Discover card interactions and combos',
    icon: Layers,
    color: 'bg-green-50 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:border-green-800',
    prompt: (data: any) => `Map out the key synergies and combos in this deck:

**Top Cards:** ${data.topCards?.join(', ') || 'N/A'}

What are the main synergy packages? Are there any infinite combos? Which card interactions create the most value? How can I improve synergy consistency?`
  },
  {
    id: 'budget',
    label: 'Budget Options',
    description: 'Cost-effective alternatives and upgrades',
    icon: DollarSign,
    color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:border-emerald-800',
    prompt: (data: any) => `Suggest budget-friendly improvements for this deck:

Power Level: ${data.power}/10
Colors: ${data.commander?.colors?.join('/') || 'Colorless'}

Recommend 5-8 cards under $5 each that would improve the deck. Focus on solid staples and efficient synergy pieces that won't break the bank.`
  },
  {
    id: 'meta',
    label: 'Meta Analysis',
    description: 'How your deck performs in the meta',
    icon: Users,
    color: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100 dark:bg-cyan-950 dark:border-cyan-800',
    prompt: (data: any) => `Analyze how this deck performs in the current Commander meta:

Commander: ${data.commander?.name || 'Unknown'}
Power Level: ${data.power}/10 (${data.band})
Strategy: ${data.archetype || 'Unknown'}

What are this deck's best matchups? What strategies does it struggle against? How does it fit into the current meta? What sideboard/meta adjustments could improve its position?`
  }
];

export function BrainAnalysis({ deck, commander, powerScore, deckId, format }: BrainAnalysisProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [detailedResponses, setDetailedResponses] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
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
        content: `## 🧠 DeckMatrix AI Analysis Engine

**ANALYZING**: ${commander?.name || 'Deck'} | **POWER**: ${powerScore.power.toFixed(1)}/10 (${powerScore.band})

I'm your dedicated DeckMatrix AI analyst with comprehensive Magic knowledge. Select an analysis option below or ask me anything about your deck's strategy, optimization, or card choices.

**Response Mode**: ${detailedResponses ? '📖 Detailed' : '⚡ Concise'} (toggle in settings)`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  const generateAnalysis = async (userPrompt: string, analysisType?: string) => {
    try {
      const deckData = {
        totalCards: deck.length,
        commander: commander ? {
          name: commander.name,
          colors: commander.colors || []
        } : undefined,
        lands: deck.filter(c => c.type_line?.includes('Land')).length,
        creatures: deck.filter(c => c.type_line?.includes('Creature')).length,
        instants: deck.filter(c => c.type_line?.includes('Instant')).length,
        sorceries: deck.filter(c => c.type_line?.includes('Sorcery')).length,
        artifacts: deck.filter(c => c.type_line?.includes('Artifact')).length,
        enchantments: deck.filter(c => c.type_line?.includes('Enchantment')).length,
        avgCMC: powerScore.playability.avg_cmc,
        colors: commander?.colors || [],
        topCards: deck.slice(0, 20).map(c => c.name),
        power: powerScore.power,
        band: powerScore.band,
        subscores: powerScore.subscores,
        playability: powerScore.playability,
        drivers: powerScore.drivers,
        drags: powerScore.drags,
        archetype: 'Unknown' // Would be loaded from deck if available
      };

      const contextMessage = `You are DeckMatrix AI, an expert Magic: The Gathering deck analyst specializing in Commander format.

**Your Tone**: Professional yet conversational - like a seasoned player coaching a friend. Be enthusiastic about strong plays, honest about weaknesses, and always solution-oriented.

**Response Style**: ${detailedResponses ? 'Provide detailed, comprehensive analysis with examples and explanations' : 'Be concise and actionable - focus on the most important 3-5 points'}.

**Current Deck Context**:
- Commander: ${deckData.commander?.name || 'Unknown'}
- Format: ${format}
- Power Level: ${deckData.power}/10 (${deckData.band})
- Total Cards: ${deckData.totalCards}

**User Question**: ${userPrompt}`;

      const response = await supabase.functions.invoke('mtg-brain', {
        body: {
          message: contextMessage,
          deckContext: deckData,
          conversationHistory: messages.slice(-4).map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: m.content
          })),
          responseStyle: detailedResponses ? 'detailed' : 'concise'
        },
      });

      const { data, error } = response;
      
      if (error) throw new Error(error.message || 'Failed to get analysis');
      if (data?.error) throw new Error(data.error || 'Analysis returned an error');

      return data.message || 'No response received';
    } catch (error) {
      console.error('Error calling MTG Brain:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limits exceeded')) {
          toast.error('Rate limits exceeded. Please wait before requesting another analysis.');
        } else if (error.message.includes('Payment required')) {
          toast.error('Credits required. Please add AI credits to continue.');
        }
      }
      
      throw error;
    }
  };

  const handleAnalysisOption = async (option: typeof ANALYSIS_OPTIONS[0]) => {
    const deckData = {
      totalCards: deck.length,
      commander: commander ? { name: commander.name, colors: commander.colors || [] } : undefined,
      lands: deck.filter(c => c.type_line?.includes('Land')).length,
      creatures: deck.filter(c => c.type_line?.includes('Creature')).length,
      instants: deck.filter(c => c.type_line?.includes('Instant')).length,
      sorceries: deck.filter(c => c.type_line?.includes('Sorcery')).length,
      artifacts: deck.filter(c => c.type_line?.includes('Artifact')).length,
      enchantments: deck.filter(c => c.type_line?.includes('Enchantment')).length,
      avgCMC: powerScore.playability.avg_cmc,
      topCards: deck.slice(0, 20).map(c => c.name),
      power: powerScore.power,
      band: powerScore.band,
      subscores: powerScore.subscores,
      playability: powerScore.playability,
      drivers: powerScore.drivers,
      drags: powerScore.drags,
      archetype: 'Unknown'
    };

    const userPrompt = option.prompt(deckData);

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: option.label,
      timestamp: new Date(),
      analysisType: option.id
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setShowOptions(false);

    try {
      const responseText = await generateAnalysis(userPrompt, option.id);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
        timestamp: new Date(),
        analysisType: option.id
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to generate analysis. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewAnalysis = () => {
    setMessages([]);
    setShowOptions(true);
  };

  return (
    <div className="space-y-4">
      {/* Settings Bar */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="detailed-mode" className="text-sm font-medium">
              Response Mode
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${!detailedResponses ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              ⚡ Concise
            </span>
            <Switch
              id="detailed-mode"
              checked={detailedResponses}
              onCheckedChange={setDetailedResponses}
            />
            <span className={`text-xs ${detailedResponses ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              📖 Detailed
            </span>
          </div>
        </div>

        {messages.length > 1 && (
          <Button
            onClick={handleNewAnalysis}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            New Analysis
          </Button>
        )}
      </div>

      {/* Messages */}
      <Card className="bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 dark:from-blue-950/20 dark:via-transparent dark:to-purple-950/20 border-blue-200/50 dark:border-blue-800/50">
        <ScrollArea className="h-[600px] p-6">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-4 ${
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background/80 backdrop-blur-sm border border-border'
                  }`}
                >
                  {message.analysisType && message.type === 'user' && (
                    <Badge variant="secondary" className="mb-2">
                      {ANALYSIS_OPTIONS.find(o => o.id === message.analysisType)?.label || message.analysisType}
                    </Badge>
                  )}
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => <h2 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>,
                      ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2">{children}</ol>,
                      p: ({ children }) => <p className="my-2">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-background/80 backdrop-blur-sm border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    <span className="text-sm text-muted-foreground">DeckMatrix AI is analyzing...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </Card>

      {/* Analysis Options */}
      {showOptions && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ANALYSIS_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Card
                key={option.id}
                className={`cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg border-2 ${option.color}`}
                onClick={() => handleAnalysisOption(option)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-background/50">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm mb-1">{option.label}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
