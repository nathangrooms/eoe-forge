import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Zap,
  Target,
  Sparkles,
  Mountain,
  Eye,
  AlertTriangle,
  RefreshCw,
  Settings,
  Layers,
  Users,
  DollarSign,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { FIELD } from '@/components/listing';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { askEdgeFunctionRaw } from '@/lib/tutor/edgeInvoke';
import { Card as DeckCard } from '@/stores/deckStore';
import { useOpenCard } from '@/components/cards';
import { CardRecommendationDisplay, type CardData } from '@/components/shared/CardRecommendationDisplay';
import { AIVisualDisplay, type VisualData } from '@/components/shared/AIVisualDisplay';
import { resolveParsedLines } from '@/lib/decklist';
import type { DeckPower } from '@/lib/deck/power';

/**
 * THE deck's chat. One surface, one edge function, one brief.
 *
 * The Analysis tab used to draw two of these. `AIAnalysisPanel` sat inside
 * `EnhancedDeckAnalysis`'s `ai` sub-tab and this one sat directly below it, so
 * the same tab offered two boxes asking the same `mtg-brain` function about the
 * same deck, with two different briefs and two different answers. That panel is
 * deleted and everything it could do that this could not is here:
 *
 *   the free-text box   this file promised "ask me anything" in its own welcome
 *                       message and shipped nine buttons and no input
 *   referenced cards    a card the model names comes back as a card you can
 *                       click through to, not as a name in a paragraph
 *   charts and tables   `AIVisualDisplay`, when the function returns one
 *   the local fallback  when the function is rate limited or out of credit,
 *                       the deck's own figures are printed rather than an error
 *
 * Two things that panel did are deliberately not here.
 *
 * **Its power line was wrong.** `EnhancedDeckAnalysis` handed it
 * `deckSummary: { power: { score: 0 } }`, and its header printed
 * `deckSummary.power.score` with `band` and `bracket` straight off that object,
 * so every deck on the Analysis tab read `POWER: 0.0/10 (undefined, bracket
 * undefined)`. This file takes the canonical {@link DeckPower} as a required
 * prop and cannot print a score the deck does not have.
 *
 * **Its card lookup was a loop.** When the function returned prose without a
 * Referenced Cards block it read up to twelve names out of the text and called
 * Scryfall once per name, sequentially. That is the per-card loop this project
 * has been taken down by twice. The same fallback is here and it is one
 * `resolve_card_names` call for the whole set of names, against our own
 * catalogue — the same query the decklist importer uses for a 99-card paste.
 */

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  analysisType?: string;
  cards?: CardData[];
  visualData?: VisualData;
}

interface BrainAnalysisProps {
  deck: DeckCard[];
  commander?: DeckCard;
  /**
   * The canonical score. Every panel that briefs the model now sends this same
   * object — previously this one sent the engine result while AIAnalysisPanel
   * sent the scraped summary score and AIOptimizerPanel sent the stale integer,
   * so the coaching contradicted itself between tabs.
   */
  powerScore: DeckPower;
  deckId?: string;
  format: string;
}

const ANALYSIS_OPTIONS = [
  {
    id: 'power-breakdown',
    label: 'Power',
    description: 'The score, and which part of it moved',
    icon: Zap,
    prompt: (data: any) => `Analyze this deck's power level breakdown in detail:

Power Level: ${data.power}/10 (${data.band})

**Subscores:**
${Object.entries(data.subscores || {}).map(([k, v]) => `- ${k}: ${v}/100`).join('\n')}

**Strengths:**
${(data.drivers || []).map((d: string) => `- ${d}`).join('\n')}

**Weaknesses:**
${(data.drags || []).map((d: string) => `- ${d}`).join('\n')}

Explain what each part of the score means at a table, how to improve the weak ones, and name 2-3 specific cards.`
  },
  {
    id: 'mana-curve',
    label: 'Mana',
    description: 'The curve and the mana base, in words',
    icon: Mountain,
    prompt: (data: any) => `Analyze this deck's mana curve and base:

Total Cards: ${data.totalCards}
Lands: ${data.lands}
Average CMC: ${data.avgCMC}
Mana Score: ${data.subscores?.mana || 0}/100

**Playability Metrics:**
- Keepable 7-card hands: ${data.playability?.keepable7Pct ?? 0}%
- T1 color hit: ${data.playability?.t1ColorPct ?? 0}%
- Untapped lands: ${data.playability?.untappedLandPct ?? 0}%

Is my curve optimized? Should I adjust land count? Suggest 2-3 mana rocks or lands to improve consistency.`
  },
  {
    id: 'archetype',
    label: 'Archetype',
    description: 'What this deck is trying to do',
    icon: Target,
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
    label: 'Cards to add',
    description: 'Named cards, with a reason each',
    icon: Sparkles,
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
    label: 'What to cut',
    description: 'The cards doing the least work',
    icon: AlertTriangle,
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
    label: 'How to play it',
    description: 'Lines to look for, turn by turn',
    icon: Eye,
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
    label: 'Synergies',
    description: 'Which cards work with which',
    icon: Layers,
    prompt: (data: any) => `Map out the key synergies and combos in this deck:

**Top Cards:** ${data.topCards?.join(', ') || 'N/A'}

What are the main synergy packages? Are there any infinite combos? Which card interactions create the most value? How can I improve synergy consistency?`
  },
  {
    id: 'budget',
    label: 'Budget swaps',
    description: 'Cheaper cards that do the same job',
    icon: DollarSign,
    prompt: (data: any) => `Suggest budget-friendly improvements for this deck:

Power Level: ${data.power}/10
Colors: ${data.commander?.colors?.join('/') || 'Colorless'}

Recommend 5-8 cards under $5 each that would improve the deck. Focus on solid staples and efficient synergy pieces that won't break the bank.`
  },
  {
    id: 'meta',
    label: 'The meta',
    description: 'What this deck runs into and how it does',
    icon: Users,
    prompt: (data: any) => `Analyze how this deck performs in the current Commander meta:

Commander: ${data.commander?.name || 'Unknown'}
Power Level: ${data.power}/10 (${data.band})
Strategy: ${data.archetype || 'Unknown'}

What are this deck's best matchups? What strategies does it struggle against? How does it fit into the current meta? What sideboard/meta adjustments could improve its position?`
  }
];

/**
 * Card names out of a paragraph, for the case where the function answered in
 * prose without its Referenced Cards block.
 *
 * Carried over from `AIAnalysisPanel` unchanged. What changed is what happens
 * to the result: see the note on the loop at the top of this file.
 */
function extractCardNames(text: string): string[] {
  const names = new Set<string>();
  const bracket = text.match(/\[\[([^\]]+)\]\]/g);
  bracket?.forEach(m => names.add(m.slice(2, -2).trim()));
  const quoted = text.match(/"([^"]+)"/g);
  quoted?.forEach(m => names.add(m.slice(1, -1).trim()));
  for (const line of text.split(/\n+/)) {
    const match = line.match(/^\s*[-*•]\s*([A-Za-z0-9'’:,\- ]{3,})/);
    if (match) names.add(match[1].trim());
  }
  return Array.from(names);
}

/** One query for the whole set of names. Never one per name. */
async function lookupReferencedCards(names: string[]): Promise<CardData[]> {
  if (names.length === 0) return [];
  try {
    const entries = await resolveParsedLines(
      names.map((name, index) => ({
        line: index + 1,
        raw: name,
        name,
        quantity: 1,
        section: 'main' as const,
      }))
    );
    return entries
      .filter(entry => entry.card && (entry.status === 'exact' || entry.status === 'face'))
      .map(entry => {
        const card = entry.card;
        const images = card.image_uris ?? card.faces?.[0]?.image_uris ?? null;
        return {
          name: card.name,
          image_uri: images?.normal ?? images?.large ?? undefined,
          mana_cost: card.mana_cost ?? undefined,
          type_line: card.type_line ?? undefined,
          cmc: card.cmc ?? undefined,
          colors: card.colors ?? undefined,
          rarity: card.rarity ?? undefined,
        } satisfies CardData;
      });
  } catch (error) {
    console.error('Referenced card lookup failed:', error);
    return [];
  }
}

export function BrainAnalysis({ deck, commander, powerScore, deckId, format }: BrainAnalysisProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [detailedResponses, setDetailedResponses] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* Clicking a referenced card goes to `/cards/:id`, the same as everywhere
     else in the product. The panel this display came from took an
     `onCardClick` prop that neither of its two callers ever passed, so its
     card grid was inert. */
  const openCard = useOpenCard();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /* One brief, built once. It was written out twice, field for field, in the
     two places that send a message, which is how a prompt gains a field on one
     path and not the other. */
  const deckData = useMemo(
    () => ({
      totalCards: deck.length,
      commander: commander
        ? { name: commander.name, colors: commander.colors || [] }
        : undefined,
      lands: deck.filter(c => c.type_line?.includes('Land')).length,
      creatures: deck.filter(c => c.type_line?.includes('Creature')).length,
      instants: deck.filter(c => c.type_line?.includes('Instant')).length,
      sorceries: deck.filter(c => c.type_line?.includes('Sorcery')).length,
      artifacts: deck.filter(c => c.type_line?.includes('Artifact')).length,
      enchantments: deck.filter(c => c.type_line?.includes('Enchantment')).length,
      avgCMC: powerScore.castability.avgManaValue,
      colors: commander?.colors || [],
      topCards: deck.slice(0, 20).map(c => c.name),
      power: powerScore.score,
      band: powerScore.band,
      bracket: powerScore.bracket,
      subscores: powerScore.subscores,
      castability: powerScore.castability,
      evidence: powerScore.evidence,
      drivers: powerScore.drivers,
      drags: powerScore.drags,
      archetype: 'Unknown',
    }),
    [deck, commander, powerScore]
  );

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: '1',
        type: 'assistant',
        /* No score in this line. The tab's own metric row, the page header
           and the EDH tab all print it, and a chat opening by reading a figure
           back to you is a fourth. `ANALYZING` was also the one US spelling on
           a page that says Optimise, Colour and Analyse. */
        content: `## Deck analysis

Reading ${commander?.name || 'this deck'}. Pick a question below, or ask your own about the deck's strategy, card choices or what to change.`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  const generateAnalysis = async (
    userPrompt: string
  ): Promise<{ message: string; cards: CardData[]; visualData?: VisualData }> => {
    try {
      const contextMessage = `You are Tutor, a Magic: The Gathering deck analyst who knows Commander inside out.

**Your Tone**: Professional yet conversational - like a seasoned player coaching a friend. Be enthusiastic about strong plays, honest about weaknesses, and always solution-oriented.

**Response Style**: ${detailedResponses ? 'Provide detailed, comprehensive analysis with examples and explanations' : 'Be concise and actionable - focus on the most important 3-5 points'}.

**Current Deck Context**:
- Commander: ${deckData.commander?.name || 'Unknown'}
- Format: ${format}
- Power Level: ${deckData.power}/10 (${deckData.band})
- Total Cards: ${deckData.totalCards}

**User Question**: ${userPrompt}`;

      const response = await askEdgeFunctionRaw('mtg-brain', {
        body: {
          message: contextMessage,
          deckContext: { id: deckId, ...deckData },
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

      return {
        message: data.message || 'No response received',
        cards: (data.cards as CardData[]) || [],
        visualData: (data.visualData as VisualData) || undefined,
      };
    } catch (error) {
      console.error('Error calling MTG Brain:', error);

      const message = error instanceof Error ? error.message : String(error || '');
      const lower = message.toLowerCase();
      if (lower.includes('rate') || lower.includes('429')) {
        toast.error('Rate limits exceeded. Please wait before asking another question.');
      } else if (lower.includes('payment') || lower.includes('credit') || lower.includes('402')) {
        toast.error('Deck analysis is switched off right now. The figures on this page are unaffected.');
      } else {
        toast.error('Deck analysis is unavailable. Showing this deck’s own figures instead.');
      }

      /* The fallback is the deck's real numbers, not an apology. Every figure
         below is already computed on this page, so an outage costs the wording
         and not the answer. */
      return {
        message: `### Deck analysis is unavailable

Here is what this deck's own scoring says, with no model involved:

- Power ${powerScore.score.toFixed(1)}/10 (${powerScore.band}, bracket ${powerScore.bracket})
- ${deckData.lands} lands, ${deckData.creatures} creatures, average mana value ${deckData.avgCMC.toFixed(2)}
${(powerScore.drivers ?? []).slice(0, 3).map(d => `- ${d}`).join('\n')}
${(powerScore.drags ?? []).slice(0, 3).map(d => `- ${d}`).join('\n')}

Try again in a moment.`,
        cards: [],
      };
    }
  };

  const send = async (text: string, analysisType?: string) => {
    const prompt = text.trim();
    if (!prompt || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: analysisType
        ? ANALYSIS_OPTIONS.find(o => o.id === analysisType)?.label ?? prompt
        : prompt,
      timestamp: new Date(),
      analysisType,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setShowOptions(false);

    try {
      const { message, cards, visualData } = await generateAnalysis(prompt);

      const referenced =
        cards.length > 0 ? cards : await lookupReferencedCards(extractCardNames(message).slice(0, 12));

      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: message,
          timestamp: new Date(),
          analysisType,
          cards: referenced,
          visualData,
        },
      ]);
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
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="detailed-mode" className="text-sm font-medium">
              Answer length
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${!detailedResponses ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              Concise
            </span>
            <Switch
              id="detailed-mode"
              checked={detailedResponses}
              onCheckedChange={setDetailedResponses}
            />
            <span className={`text-xs ${detailedResponses ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              Detailed
            </span>
          </div>
        </div>

        {messages.length > 1 && (
          <Button onClick={handleNewAnalysis} variant="secondary" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            New Analysis
          </Button>
        )}
      </div>

      {/* Messages */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px] p-6">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Recessed ground, no hairline. Both bubbles drew
                      `border border-border` on top of a fill. */}
                  <div
                    className={`max-w-[85%] rounded-lg p-4 ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/40'
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

                    {message.type === 'assistant' && (
                      <>
                        {message.visualData && (
                          <AIVisualDisplay data={message.visualData} compact />
                        )}
                        {/* A card the model names is drawn as a card, through
                            `CardImage`, and clicking it opens the card page. */}
                        {message.cards && message.cards.length > 0 && (
                          <CardRecommendationDisplay
                            cards={message.cards}
                            onCardClick={openCard}
                            compact
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted/40 p-4">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 ring-2 ring-primary ring-offset-0 border-t-transparent rounded-full motion-reduce:animate-none" />
                      <span className="text-sm text-muted-foreground">Reading your deck...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Ask anything. The welcome message has offered this since the file
              was written; the box was in the other panel. */}
          <div className="flex gap-2 p-4 pt-0">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) void send(input);
              }}
              placeholder="Ask about your deck strategy, card choices, upgrades…"
              disabled={isLoading}
              className={cn(FIELD, 'flex-1')}
              aria-label="Ask about this deck"
            />
            <Button
              onClick={() => void send(input)}
              disabled={isLoading || !input.trim()}
              size="icon"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Options */}
      {showOptions && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ANALYSIS_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => void send(option.prompt(deckData), option.id)}
                className="rounded-xl bg-muted/40 p-4 text-left transition-transform hover:scale-[1.02] motion-reduce:transform-none"
              >
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
