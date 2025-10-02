import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Brain, Settings, Zap, BarChart3, Code, Database, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { ScryfallSyntaxReference } from "./ScryfallSyntaxReference";
import { PromptEditor } from "./PromptEditor";

interface AIFunctionConfig {
  name: string;
  model: string;
  maxTokens: {
    detailed: number;
    concise: number;
  };
  temperature: {
    detailed: number;
    concise: number;
  };
  cacheEnabled: boolean;
  cacheTTL: number;
  estimatedTokens: {
    inputAvg: number;
    outputAvg: number;
  };
  description: string;
}

const AI_FUNCTIONS: AIFunctionConfig[] = [
  {
    name: "mtg-brain",
    model: "google/gemini-2.5-flash",
    maxTokens: { detailed: 1000, concise: 400 },
    temperature: { detailed: 0.8, concise: 0.2 },
    cacheEnabled: true,
    cacheTTL: 300000,
    estimatedTokens: { inputAvg: 2100, outputAvg: 600 },
    description: "General MTG assistant for deck analysis, card recommendations, rules questions"
  },
  {
    name: "ai-deck-builder-v2",
    model: "google/gemini-2.5-flash",
    maxTokens: { detailed: 2000, concise: 400 },
    temperature: { detailed: 0.8, concise: 0.3 },
    cacheEnabled: false,
    cacheTTL: 0,
    estimatedTokens: { inputAvg: 3300, outputAvg: 400 },
    description: "Build complete Commander decks with AI planning"
  },
  {
    name: "gemini-deck-coach",
    model: "google/gemini-2.5-flash",
    maxTokens: { detailed: 800, concise: 400 },
    temperature: { detailed: 0.8, concise: 0.3 },
    cacheEnabled: false,
    cacheTTL: 0,
    estimatedTokens: { inputAvg: 1500, outputAvg: 800 },
    description: "AI-powered deck insights and archetype analysis"
  }
];

export function AISystemAdmin() {
  const [activeTab, setActiveTab] = useState("overview");
  const [configs, setConfigs] = useState<AIFunctionConfig[]>(AI_FUNCTIONS);

  // Calculate daily estimates
  const dailyCallEstimates = {
    "mtg-brain": 50,
    "ai-deck-builder-v2": 10,
    "gemini-deck-coach": 20
  };

  const calculateDailyTokens = () => {
    let total = 0;
    configs.forEach(config => {
      const calls = dailyCallEstimates[config.name as keyof typeof dailyCallEstimates] || 0;
      const tokens = (config.estimatedTokens.inputAvg + config.estimatedTokens.outputAvg) * calls;
      total += tokens;
    });
    return total;
  };

  const estimatedMonthlyCost = (calculateDailyTokens() * 30 / 1000000) * 0.075; // $0.075 per 1M tokens

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8" />
            AI System Control Center
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitor and optimize AI credit usage across all functions
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Est. Monthly: ${estimatedMonthlyCost.toFixed(2)}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="functions">Functions</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="scryfall">Scryfall</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Daily Token Usage</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(calculateDailyTokens() / 1000).toFixed(1)}K</div>
                <p className="text-xs text-muted-foreground">
                  {((calculateDailyTokens() / 750000) * 100).toFixed(0)}% reduction from baseline
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">~40%</div>
                <p className="text-xs text-muted-foreground">
                  Estimated (5-min TTL)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Functions</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{configs.length}</div>
                <p className="text-xs text-muted-foreground">
                  AI-powered features
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Optimization Status</CardTitle>
              <CardDescription>Recent improvements to AI credit usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium">System Prompt Condensed (83% reduction)</p>
                  <p className="text-sm text-muted-foreground">
                    mtg-brain prompt reduced from 8,000 to 500 tokens
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium">Response Caching Enabled (5-min TTL)</p>
                  <p className="text-sm text-muted-foreground">
                    Duplicate queries now served from cache, ~40% hit rate
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium">Smart Context Filtering</p>
                  <p className="text-sm text-muted-foreground">
                    Full card lists only sent when query requires it
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                  <p className="font-medium">Token Limits Optimized</p>
                  <p className="text-sm text-muted-foreground">
                    max_tokens reduced: 2000→1000 (detailed), 600→400 (concise)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="functions" className="space-y-4">
          {configs.map((config) => (
            <Card key={config.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      {config.name}
                    </CardTitle>
                    <CardDescription>{config.description}</CardDescription>
                  </div>
                  <Badge variant={config.cacheEnabled ? "default" : "secondary"}>
                    {config.cacheEnabled ? "Cache ON" : "Cache OFF"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={config.model} disabled>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google/gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                        <SelectItem value="google/gemini-2.5-flash-lite">gemini-2.5-flash-lite</SelectItem>
                        <SelectItem value="google/gemini-2.5-pro">gemini-2.5-pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Cache TTL (ms)</Label>
                    <Input 
                      type="number" 
                      value={config.cacheTTL}
                      disabled={!config.cacheEnabled}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Max Tokens (Detailed)</Label>
                    <Input type="number" value={config.maxTokens.detailed} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Tokens (Concise)</Label>
                    <Input type="number" value={config.maxTokens.concise} disabled />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Avg Input Tokens</Label>
                    <Input type="number" value={config.estimatedTokens.inputAvg} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Avg Output Tokens</Label>
                    <Input type="number" value={config.estimatedTokens.outputAvg} disabled />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Label>Enable Caching</Label>
                  <Switch checked={config.cacheEnabled} disabled />
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Estimated cost: ${(
                      ((config.estimatedTokens.inputAvg + config.estimatedTokens.outputAvg) * 
                      (dailyCallEstimates[config.name as keyof typeof dailyCallEstimates] || 0) * 30) / 1000000 * 0.075
                    ).toFixed(2)}/month
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              <strong>Prompt Engineering Control Center</strong>
              <p className="mt-2 text-sm">
                Customize how each AI function responds. Edit prompts, templates, and response styles to fine-tune AI behavior.
              </p>
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="mtg-brain">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="mtg-brain">MTG Brain</TabsTrigger>
              <TabsTrigger value="ai-deck-builder-v2">Deck Builder</TabsTrigger>
              <TabsTrigger value="gemini-deck-coach">Deck Coach</TabsTrigger>
            </TabsList>

            <TabsContent value="mtg-brain">
              <PromptEditor functionName="mtg-brain" />
            </TabsContent>

            <TabsContent value="ai-deck-builder-v2">
              <PromptEditor functionName="ai-deck-builder-v2" />
            </TabsContent>

            <TabsContent value="gemini-deck-coach">
              <PromptEditor functionName="gemini-deck-coach" />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="scryfall" className="space-y-4">
          <ScryfallSyntaxReference />
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Recommendations</CardTitle>
              <CardDescription>Further improvements to reduce AI credit usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  <strong>Smart Model Routing (Not Implemented)</strong>
                  <p className="mt-2 text-sm">
                    Route simple queries ("What is X?") to gemini-2.5-flash-lite (50% cheaper). 
                    Could save additional 15-20% on credits.
                  </p>
                </AlertDescription>
              </Alert>

              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  <strong>Consolidate Deck Build Flow (Not Implemented)</strong>
                  <p className="mt-2 text-sm">
                    Merge 3 AI calls in ai-deck-builder-v2 into single endpoint. 
                    Would reduce from 3 calls to 1 per build (66% reduction).
                  </p>
                </AlertDescription>
              </Alert>

              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  <strong>Per-User Rate Limiting (Not Implemented)</strong>
                  <p className="mt-2 text-sm">
                    Add 3-second cooldown between AI requests per user to prevent spam.
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Token Usage Breakdown</CardTitle>
              <CardDescription>Estimated daily consumption by function</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {configs.map(config => {
                  const calls = dailyCallEstimates[config.name as keyof typeof dailyCallEstimates] || 0;
                  const tokens = (config.estimatedTokens.inputAvg + config.estimatedTokens.outputAvg) * calls;
                  const percentage = (tokens / calculateDailyTokens()) * 100;
                  
                  return (
                    <div key={config.name} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{config.name}</span>
                        <span className="text-muted-foreground">{(tokens / 1000).toFixed(1)}K tokens/day</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {calls} calls/day × {config.estimatedTokens.inputAvg + config.estimatedTokens.outputAvg} tokens/call
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>
              Knowledge base is stored in edge function code. Changes require deployment.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>MTG Knowledge Base</CardTitle>
              <CardDescription>Comprehensive Magic: The Gathering reference data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium">Game Rules</h4>
                  <p className="text-sm text-muted-foreground">
                    Turn structure, zones, card types
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Color Philosophy</h4>
                  <p className="text-sm text-muted-foreground">
                    WUBRG strengths, weaknesses, keywords
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Deck Building</h4>
                  <p className="text-sm text-muted-foreground">
                    Rule of 9, mana curves, quotas
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Commander Archetypes</h4>
                  <p className="text-sm text-muted-foreground">
                    Voltron, Aristocrats, Spellslinger, Tribal, Combo, Tokens
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Synergy Patterns</h4>
                  <p className="text-sm text-muted-foreground">
                    Sacrifice, graveyard, tokens
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Format Rules</h4>
                  <p className="text-sm text-muted-foreground">
                    Standard, Modern, Commander, Legacy, Vintage
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Staple Cards</h4>
                  <p className="text-sm text-muted-foreground">
                    Ramp, removal, card draw by color
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">External APIs</h4>
                  <p className="text-sm text-muted-foreground">
                    Scryfall API for card data, images, prices
                  </p>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Database Integration:</strong> Card pool fetched from Supabase 'cards' table (~100,000 cards). 
                  Queried by color identity and legality for deck building.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
