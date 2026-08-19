import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Activity, FileText, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ScryfallSyntaxReference } from './ScryfallSyntaxReference';
import { PromptEditor } from './PromptEditor';

/**
 * The AI tab.
 *
 * What used to be here was a costing dashboard built entirely out of constants
 * typed into this file: `dailyCallEstimates = { "mtg-brain": 50, ... }`, an
 * `avgInputTokens` per function, a `$0.075 / 1M` rate, and a headline
 * "Est. Monthly: $x.xx" derived from all three. None of it was measured — the
 * product records no token counts anywhere — so the figure moved only when
 * somebody edited this file, while reading exactly like telemetry. Beneath it
 * the "Config" tab was worse: eight `<Input>`s and a `<Switch>` per function,
 * every one of them `disabled`, bound to a `useState` whose setter was never
 * called. A "Cache Hit Rate" tile showed `~40%` in 2xl type with the word
 * "Estimated" in 10px grey underneath.
 *
 * This tab now shows only what is read back from the database on load: which
 * AI features are switched on, what each tier is allowed, and what usage has
 * actually been recorded. Where the answer is "nothing has been recorded" it
 * says so, rather than substituting a plausible number.
 */

/**
 * `feature_flags.key` values that gate an AI-backed feature, and the
 * `subscription_limits.feature_key` / `feature_usage.feature_key` values that
 * meter them. Both sets are seeded by migration `20251206160025_e396130f…`.
 * They are listed rather than pattern-matched so a new non-AI key cannot
 * silently start appearing under an AI heading.
 */
const AI_FLAG_KEYS = ['ai_deck_builder', 'ai_deck_coach', 'ai_card_scanner', 'tutor'];

const AI_METER_KEYS = ['ai_deck_builds', 'ai_coach_queries', 'card_scans'];

const TIERS = ['free', 'pro', 'unlimited'] as const;
type Tier = (typeof TIERS)[number];

interface FlagRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  requires_tier: Tier | null;
}

interface LimitRow {
  feature_key: string;
  tier: Tier;
  limit_value: number;
  limit_type: string;
  description: string | null;
}

interface UsageRow {
  feature_key: string;
  user_id: string;
  usage_count: number | null;
  period_end: string;
}

interface UsageTotals {
  featureKey: string;
  currentPeriod: number;
  allTime: number;
  users: number;
}

function formatLimit(value: number | undefined): string {
  if (value === undefined) return '—';
  return value < 0 ? 'Unlimited' : value.toLocaleString();
}

export function AISystemAdmin() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [usage, setUsage] = useState<UsageTotals[]>([]);
  const [usageReadable, setUsageReadable] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [flagResult, limitResult, usageResult] = await Promise.all([
      supabase
        .from('feature_flags')
        .select('id, key, name, description, enabled, requires_tier')
        .in('key', AI_FLAG_KEYS)
        .order('name'),
      supabase
        .from('subscription_limits')
        .select('feature_key, tier, limit_value, limit_type, description')
        .in('feature_key', AI_METER_KEYS),
      supabase
        .from('feature_usage')
        .select('feature_key, user_id, usage_count, period_end')
        .in('feature_key', AI_METER_KEYS),
    ]);

    setFlags((flagResult.data ?? []) as FlagRow[]);
    setLimits((limitResult.data ?? []) as LimitRow[]);

    // `feature_usage` is admin-readable, but if the read fails say so rather
    // than rendering an empty table, which would read as "zero usage".
    setUsageReadable(!usageResult.error);

    const rows = (usageResult.data ?? []) as UsageRow[];
    const now = Date.now();
    setUsage(
      AI_METER_KEYS.map(featureKey => {
        const mine = rows.filter(row => row.feature_key === featureKey);
        return {
          featureKey,
          currentPeriod: mine
            .filter(row => new Date(row.period_end).getTime() > now)
            .reduce((sum, row) => sum + (row.usage_count ?? 0), 0),
          allTime: mine.reduce((sum, row) => sum + (row.usage_count ?? 0), 0),
          users: new Set(mine.map(row => row.user_id)).size,
        };
      })
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const limitFor = (featureKey: string, tier: Tier) =>
    limits.find(row => row.feature_key === featureKey && row.tier === tier)?.limit_value;

  const describe = (featureKey: string) =>
    limits.find(row => row.feature_key === featureKey)?.description ??
    featureKey.replace(/_/g, ' ');

  const recordedTotal = usage.reduce((sum, row) => sum + row.allTime, 0);

  return (
    <Tabs defaultValue="usage" className="space-y-4">
      <div className="-mx-3 overflow-x-auto px-3 scrollbar-none sm:mx-0 sm:px-0">
        <TabsList className="inline-flex h-auto w-max sm:grid sm:w-full sm:grid-cols-4">
          <TabsTrigger value="usage" className="gap-2 whitespace-nowrap px-3 py-2">
            <Activity className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="gating" className="gap-2 whitespace-nowrap px-3 py-2">
            <SlidersHorizontal className="h-4 w-4" />
            Gating
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-2 whitespace-nowrap px-3 py-2">
            <FileText className="h-4 w-4" />
            Prompts
          </TabsTrigger>
          <TabsTrigger value="scryfall" className="gap-2 whitespace-nowrap px-3 py-2">
            <Search className="h-4 w-4" />
            Scryfall
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="usage" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recorded AI usage
                </CardTitle>
                <CardDescription className="max-w-3xl">
                  Every row in <code className="font-mono">feature_usage</code> for the metered AI
                  features. Counts are calls, not tokens — nothing in the product records token
                  counts, so no cost figure can honestly be shown here.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading}
                className="w-full shrink-0 sm:w-auto"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            ) : !usageReadable ? (
              <div
                role="alert"
                className="rounded-lg bg-destructive/15 px-4 py-3 text-sm text-destructive"
              >
                Usage rows could not be read. Nothing is shown rather than an empty table, which
                would read as zero usage.
              </div>
            ) : (
              <>
                {/* Bleed the scroll region out to the card edge. Inset inside
                    the padding, a clipped fourth column just looked broken;
                    running to the edge reads as "this scrolls". */}
                <div className="-mx-6 overflow-x-auto px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metered feature</TableHead>
                        <TableHead className="text-right">Current period</TableHead>
                        <TableHead className="text-right">All time</TableHead>
                        {/* Four numeric columns do not fit a 375px screen. The
                            account count moves under the feature name there
                            rather than being scrolled out of sight. */}
                        <TableHead className="hidden text-right sm:table-cell">Accounts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.map(row => (
                        <TableRow key={row.featureKey}>
                          <TableCell className="font-medium">
                            <span className="block">{describe(row.featureKey)}</span>
                            {/* Stacked, not trailing: inline it doubled the
                                width of the widest column and pushed the two
                                right-hand numbers off a 375px screen. */}
                            <span className="block font-mono text-xs font-normal text-muted-foreground">
                              {row.featureKey}
                            </span>
                            <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                              {row.users.toLocaleString()} account
                              {row.users === 1 ? '' : 's'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.currentPeriod.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.allTime.toLocaleString()}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {row.users.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {recordedTotal === 0 && (
                  <p className="mt-4 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    No usage has been recorded yet. These counters are written by the
                    <code className="mx-1 font-mono">increment_feature_usage</code>
                    RPC, and nothing in the app calls it today — so these zeroes mean
                    &ldquo;not instrumented&rdquo;, not &ldquo;unused&rdquo;.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="gating" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>AI feature flags</CardTitle>
            <CardDescription>
              Live state of the flags that gate AI features. They are edited on the Features tab —
              this view is read-only so exactly one surface writes them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : flags.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No AI feature flags are configured.
              </p>
            ) : (
              flags.map(flag => (
                <div
                  key={flag.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/30 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{flag.name}</p>
                    <p className="text-sm text-muted-foreground">{flag.description}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{flag.key}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {flag.requires_tier ?? 'free'}
                    </Badge>
                    <Badge variant={flag.enabled ? 'default' : 'outline'}>
                      {flag.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI allowances by tier</CardTitle>
            <CardDescription>
              Read from <code className="font-mono">subscription_limits</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="-mx-6 overflow-x-auto px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metered feature</TableHead>
                  {TIERS.map(tier => (
                    <TableHead key={tier} className="text-right capitalize">
                      {tier}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {AI_METER_KEYS.map(featureKey => (
                  <TableRow key={featureKey}>
                    <TableCell className="font-medium">{describe(featureKey)}</TableCell>
                    {TIERS.map(tier => (
                      <TableCell key={tier} className="text-right tabular-nums">
                        {formatLimit(limitFor(featureKey, tier))}
                      </TableCell>
                    ))}
                    <TableCell className="text-right text-muted-foreground">
                      {limits.find(row => row.feature_key === featureKey)?.limit_type ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="prompts" className="space-y-4">
        <Tabs defaultValue="mtg-brain" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            {/* The tab value is the deployed function id, which is still
                `mtg-brain` on purpose. See the header of
                supabase/functions/mtg-brain/index.ts. The label is the feature's
                real name. */}
            <TabsTrigger value="mtg-brain">Tutor</TabsTrigger>
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

      <TabsContent value="scryfall">
        <ScryfallSyntaxReference />
      </TabsContent>
    </Tabs>
  );
}
