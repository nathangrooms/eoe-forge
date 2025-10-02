import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Network, Zap, AlertCircle } from "lucide-react";

interface AIFunction {
  name: string;
  purpose: string;
  usageLocations: string[];
  model: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  callsPerSession: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

const AI_FUNCTIONS: AIFunction[] = [
  {
    name: "mtg-brain",
    purpose: "Primary AI assistant for deck analysis, card recommendations, strategy advice, rules questions",
    usageLocations: [
      "Brain.tsx (main chat interface)",
      "AIAnalysisPanel.tsx (deck insights)",
      "BrainAnalysis.tsx (deep deck analysis)",
      "EnhancedDeckAnalysis.tsx (mana/archetype)",
      "AIReplacementsPanel.tsx (card suggestions)",
      "AIBuilder.tsx (commander analysis)",
      "DeckInterface.tsx (inline queries)",
      "Builder.tsx (deck building help)"
    ],
    model: "google/gemini-2.5-flash",
    avgInputTokens: 2100,
    avgOutputTokens: 600,
    callsPerSession: 50,
    priority: 'critical'
  },
  {
    name: "ai-deck-builder-v2",
    purpose: "AI-powered deck construction with strategic planning, card selection, and optimization",
    usageLocations: [
      "AIBuilder.tsx (main deck builder with MTG Brain planning)"
    ],
    model: "google/gemini-2.5-flash",
    avgInputTokens: 3300,
    avgOutputTokens: 400,
    callsPerSession: 10,
    priority: 'critical'
  },
  {
    name: "ai-deck-builder (legacy)",
    purpose: "Original AI deck builder (being phased out in favor of v2)",
    usageLocations: [
      "AIBuilder.tsx (fallback)",
      "DeterministicAIBuilder.tsx (old builder)"
    ],
    model: "google/gemini-2.5-flash",
    avgInputTokens: 3000,
    avgOutputTokens: 500,
    callsPerSession: 5,
    priority: 'low'
  },
  {
    name: "gemini-deck-coach",
    purpose: "Deck analytics: power breakdown, mana analysis, archetype identification, upgrade recommendations",
    usageLocations: [
      "EnhancedDeckAnalysis.tsx (power/mana/archetype insights)"
    ],
    model: "google/gemini-2.5-flash",
    avgInputTokens: 1500,
    avgOutputTokens: 800,
    callsPerSession: 20,
    priority: 'high'
  },
  {
    name: "scan-match",
    purpose: "OCR card recognition from camera/images for collection management",
    usageLocations: [
      "ScanDrawer.tsx (card scanning)"
    ],
    model: "N/A (OCR only)",
    avgInputTokens: 0,
    avgOutputTokens: 0,
    callsPerSession: 30,
    priority: 'medium'
  },
  {
    name: "scryfall-sync",
    purpose: "Sync card database from Scryfall API (admin only)",
    usageLocations: [
      "AdminPanel.tsx (card sync)",
      "SyncDashboard.tsx (sync management)"
    ],
    model: "N/A (data sync)",
    avgInputTokens: 0,
    avgOutputTokens: 0,
    callsPerSession: 0.1,
    priority: 'low'
  }
];

export function AIFunctionMapper() {
  const totalDailyTokens = AI_FUNCTIONS.reduce((sum, fn) => 
    sum + (fn.avgInputTokens + fn.avgOutputTokens) * fn.callsPerSession, 
    0
  );
  const estimatedMonthlyCost = (totalDailyTokens * 30 / 1000000) * 0.075;

  const criticalFunctions = AI_FUNCTIONS.filter(f => f.priority === 'critical');
  const totalLocations = AI_FUNCTIONS.reduce((sum, fn) => sum + fn.usageLocations.length, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total AI Functions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{AI_FUNCTIONS.length}</div>
            <p className="text-xs text-muted-foreground">
              {criticalFunctions.length} critical, {totalLocations} usage points
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Est. Daily Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalDailyTokens / 1000).toFixed(1)}K tokens</div>
            <p className="text-xs text-muted-foreground">
              ~{(totalDailyTokens / 2700).toFixed(0)} calls/day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Est. Monthly Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${estimatedMonthlyCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              At current usage rates
            </p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Network className="h-4 w-4" />
        <AlertDescription>
          <strong>AI Function Architecture Map</strong>
          <p className="mt-2 text-sm">
            This shows ALL AI integration points across the app. Each function is called from multiple components.
            Critical functions (mtg-brain, ai-deck-builder-v2, gemini-deck-coach) account for 90%+ of AI credit usage.
          </p>
        </AlertDescription>
      </Alert>

      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {AI_FUNCTIONS.map(fn => {
            const dailyTokens = (fn.avgInputTokens + fn.avgOutputTokens) * fn.callsPerSession;
            const monthlyCost = (dailyTokens * 30 / 1000000) * 0.075;
            const priorityColors = {
              critical: 'bg-red-500',
              high: 'bg-orange-500',
              medium: 'bg-yellow-500',
              low: 'bg-gray-500'
            };

            return (
              <Card key={fn.name}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${priorityColors[fn.priority]}`} />
                      <div>
                        <CardTitle className="text-lg">{fn.name}</CardTitle>
                        <CardDescription>{fn.purpose}</CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline">{fn.priority.toUpperCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium">Model</p>
                      <p className="text-sm text-muted-foreground">{fn.model}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Tokens/Call</p>
                      <p className="text-sm text-muted-foreground">
                        {fn.avgInputTokens + fn.avgOutputTokens > 0 
                          ? `~${fn.avgInputTokens + fn.avgOutputTokens}` 
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Calls/Session</p>
                      <p className="text-sm text-muted-foreground">~{fn.callsPerSession}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Est. Cost/Month</p>
                      <p className="text-sm text-muted-foreground">${monthlyCost.toFixed(2)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-2">Usage Locations ({fn.usageLocations.length}):</p>
                    <div className="space-y-1">
                      {fn.usageLocations.map(loc => (
                        <div key={loc} className="flex items-center gap-2 text-xs">
                          <Zap className="h-3 w-3 text-primary" />
                          <code className="bg-muted px-2 py-0.5 rounded">{loc}</code>
                        </div>
                      ))}
                    </div>
                  </div>

                  {fn.priority === 'low' && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Legacy Function:</strong> Consider migrating to newer version or deprecating
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
