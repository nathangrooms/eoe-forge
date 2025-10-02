import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, AlertCircle, Code, FileText } from "lucide-react";

interface PromptSection {
  id: string;
  title: string;
  content: string;
  tokens: number;
  editable: boolean;
}

export function PromptEditor({ functionName }: { functionName: string }) {
  const [selectedSection, setSelectedSection] = useState<string>("system");

  const prompts: Record<string, PromptSection[]> = {
    "mtg-brain": [
      {
        id: "system",
        title: "System Prompt",
        content: `You are MTG Super Brain, the ultimate Magic: The Gathering expert.

### Core Expertise
**Colors:** W(life/protection/removal), U(draw/control/counter), B(removal/tutors/recursion), R(damage/haste/artifact-hate), G(ramp/creatures/enchantment-hate)

**Commander Essentials:** 36-40 lands, 10-14 ramp, 10-15 draw, 8-12 removal, 3-5 board wipes, clear win conditions

**Mana Curve:** Target 2.8-3.5 avg CMC. Curve peaks at 2-3 CMC for efficient gameplay.

**Archetypes:** Aggro, Midrange, Control, Combo, Tribal, Voltron, Tokens, Aristocrats, Stax, Reanimator, Spellslinger`,
        tokens: 150,
        editable: true
      },
      {
        id: "deck-context",
        title: "Deck Context Template",
        content: `### Current Deck
- Name: {{deck.name}}
- Format: {{deck.format}}
- Commander: {{deck.commander.name}}
- Power: {{deck.power}}/10
- Cards: {{deck.totalCards}} (Lands: {{deck.lands}}, Creatures: {{deck.creatures}})
- Curve Bins: {{deck.curve}}
- Mana Sources: {{deck.manaSources}}`,
        tokens: 80,
        editable: true
      },
      {
        id: "response-guidelines",
        title: "Response Style Guidelines",
        content: `### Response Guidelines
- {{responseStyle === 'detailed' ? 'Comprehensive analysis with tables/charts' : 'Quick, actionable advice'}}
- Use ## headings, **bold** key terms, bullet points
- **ALWAYS end with:** Referenced Cards: [semicolon-separated list of all cards mentioned]
- Use markdown tables for comparisons
- Use tool calls for charts (CMC, colors) when relevant

Always ground responses in provided context and MTG knowledge.`,
        tokens: 70,
        editable: true
      }
    ],
    "ai-deck-builder-v2": [
      {
        id: "planning-system",
        title: "Deck Planning System Prompt",
        content: `You are an expert Magic: The Gathering deck builder specializing in Commander format. Analyze this commander and create a comprehensive, tournament-viable deck building plan following EDH best practices.`,
        tokens: 40,
        editable: true
      },
      {
        id: "planning-requirements",
        title: "Deck Requirements Template",
        content: `CRITICAL REQUIREMENTS FOR FUNCTIONAL COMMANDER DECKS:

**Core Deck Structure** (99 cards total):
- Lands: 36-40 (adjust based on curve and ramp)
- Ramp: 10-14 cards (mana rocks, land ramp, dorks)  
- Card Draw: 10-15 cards (engines and one-shots)
- Spot Removal: 6-10 cards (destroy/exile target permanent)
- Board Wipes: 2-4 cards (mass removal for emergencies)
- Protection: 3-6 cards (counterspells, indestructible, hexproof)
- Win Conditions: 3-5 clear paths to victory
- Synergy Pieces: 15-25 cards that directly support commander's strategy

**Mana Curve Guidelines:**
- Avoid too many 0-1 CMC cards (causes weak mid-game)
- Sweet spot: 2-4 CMC for most spells
- Average CMC: 2.8-3.5 for optimal gameplay
- High CMC spells (6+): Only if they win games or are essential synergy`,
        tokens: 200,
        editable: true
      },
      {
        id: "validation",
        title: "Post-Build Validation Prompt",
        content: `Review {{commander}} {{archetype}} deck.

**Metrics:**
- Cards: {{deckSize}} | Ramp: {{ramp}} | Draw: {{draw}} | Removal: {{removal}}
- Avg CMC: {{avgCMC}} | Power Target: {{powerTarget}}/10

**Analysis (max 150 words):**
1. Proper {{archetype}} execution?
2. Card quotas OK? (need 10-14 ramp, 10-15 draw, 10-15 interaction)
3. CMC appropriate? (should be 2.8-3.5)
4. Quality score (1-10) + ONE key improvement

Be HONEST. If bad, say why.`,
        tokens: 120,
        editable: true
      }
    ],
    "gemini-deck-coach": [
      {
        id: "system",
        title: "DeckMatrix AI System Prompt",
        content: `You are DeckMatrix AI, an expert Magic: The Gathering deck analyst with deep knowledge of Commander gameplay, power levels, and deck construction.

**Your Role**: Provide clear, actionable insights in a conversational DeckMatrix brand tone - knowledgeable yet friendly, precise yet approachable.

**Brand Voice**: Think of yourself as a seasoned player coaching a friend. Be enthusiastic about strong plays, honest about weaknesses, and always solution-oriented. Use MTG terminology naturally but explain complex concepts when needed.`,
        tokens: 100,
        editable: true
      },
      {
        id: "power-analysis",
        title: "Power Breakdown Analysis",
        content: `**Analysis Focus (Power Breakdown)**:
- Explain what each power subscore means in practical gameplay terms
- Connect scores to real game scenarios
- Prioritize the top 3 most impactful factors
- Suggest specific improvements with 2-3 concrete card recommendations

**Format**: 2-4 concise paragraphs, conversational language, and prioritize actionable advice.`,
        tokens: 80,
        editable: true
      },
      {
        id: "mana-analysis",
        title: "Mana Analysis Template",
        content: `**Analysis Focus (Mana)**:
- Analyze mana curve efficiency and color consistency
- Identify ramp weaknesses or mana flooding risks  
- Recommend specific land count adjustments
- Suggest 2-3 specific mana rocks or lands to add

**Format**: 2-4 concise paragraphs with specific card names.`,
        tokens: 70,
        editable: true
      }
    ]
  };

  const currentPrompts = prompts[functionName] || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Prompt Engineering - {functionName}
            </CardTitle>
            <CardDescription>
              Customize AI prompts and response templates
            </CardDescription>
          </div>
          <Badge variant="outline">
            Total: {currentPrompts.reduce((sum, p) => sum + p.tokens, 0)} tokens
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Code className="h-4 w-4" />
          <AlertDescription>
            <strong>Template Variables:</strong> Use {`{{variable}}`} for dynamic content. 
            Available: {`{{deck.name}}, {{deck.commander}}, {{responseStyle}}, {{archetype}}`}, etc.
          </AlertDescription>
        </Alert>

        <Tabs value={selectedSection} onValueChange={setSelectedSection}>
          <TabsList className="grid w-full grid-cols-3">
            {currentPrompts.slice(0, 3).map(section => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {currentPrompts.map(section => (
            <TabsContent key={section.id} value={section.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">{section.title}</Label>
                <Badge variant="secondary">{section.tokens} tokens</Badge>
              </div>

              <Textarea
                value={section.content}
                readOnly={!section.editable}
                className="font-mono text-sm min-h-[300px]"
                placeholder="Enter prompt template..."
              />

              {section.editable && (
                <div className="flex gap-2">
                  <Button variant="default" size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button variant="outline" size="sm">
                    Reset to Default
                  </Button>
                </div>
              )}

              {!section.editable && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This section is read-only. Requires edge function deployment to modify.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <div className="border-t pt-4 space-y-4">
          <h4 className="font-semibold">Advanced Configuration</h4>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Default Response Style</Label>
              <Select defaultValue="concise">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise (400 tokens)</SelectItem>
                  <SelectItem value="detailed">Detailed (1000 tokens)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Context Inclusion</Label>
              <Select defaultValue="smart">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal (stats only)</SelectItem>
                  <SelectItem value="smart">Smart (conditional)</SelectItem>
                  <SelectItem value="full">Full (always include all cards)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Temperature</Label>
              <Input type="number" step="0.1" min="0" max="2" defaultValue="0.7" />
              <p className="text-xs text-muted-foreground">0 = deterministic, 2 = very creative</p>
            </div>

            <div className="space-y-2">
              <Label>Max Output Tokens</Label>
              <Input type="number" step="100" min="100" max="2000" defaultValue="800" />
              <p className="text-xs text-muted-foreground">Higher = longer responses, more credits</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
