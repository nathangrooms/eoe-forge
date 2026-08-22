import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { comparePower, logDivergence } from '@/lib/deck/powerCalibration';
import { EdhAnalysisPanel, type EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import type { DeckCardRow } from '@/lib/deck/deckCards';
import type { DeckPower } from '@/lib/deck/power';

/**
 * The edhpowerlevel.com second opinion, and the control that runs it.
 *
 * ## Why this is a component now
 *
 * It was 180 lines of state and request handling inside the builder, and the
 * deck page had a read-only copy of the panel whose Refresh button *navigated
 * to the builder* — the exact fork the merge exists to remove. One place, one
 * cache, and the check runs where the deck is.
 *
 * ## It is never the score
 *
 * The canonical figure is `PowerScore`, computed from the decklist and the mana
 * base in front of you. This is a screen-scrape through a third-party renderer
 * that can fail, on a different scale, and it is drawn as a labelled second
 * opinion with its own sub-metrics on its own scales. When the two disagree by
 * enough to act on, the divergence note says so and says which way. It never
 * quietly replaces ours.
 *
 * ## Where it sits
 *
 * On the EDH tab, not above the metric strip. It answers one question for one
 * format and it used to cost a whole band at the top of the build surface.
 */

interface EdhPowerCheckProps {
  deckId: string;
  /** The deck as it stands, so the hash notices when the list has moved on. */
  rows: DeckCardRow[];
  commanderName?: string;
  power: DeckPower | null;
  /** The cache this page already loaded, so mounting costs no request. */
  cached: EdhAnalysisData | null;
  cachedHash: string | null;
  onCached: (analysis: Record<string, unknown> | null, hash: string) => void;
}

/** Stable across runs, so "the list has changed" is a fact and not a guess. */
function cardsHash(names: string[]): string {
  const joined = [...names].sort().join('|');
  let hash = 0;
  for (let i = 0; i < joined.length; i += 1) {
    hash = ((hash << 5) - hash + joined.charCodeAt(i)) | 0;
  }
  return hash.toString();
}

const METRIC_ROWS: Array<[string, keyof NonNullable<EdhAnalysisData['metrics']>, (v: number) => string]> = [
  ['Tipping point', 'tippingPoint', v => String(v)],
  ['Efficiency', 'efficiency', v => `${v.toFixed(1)}/10`],
  ['Impact', 'impact', v => v.toFixed(0)],
  ['Score', 'score', v => `${v}/1000`],
  ['Playability', 'playability', v => `${v}%`],
];

export function EdhPowerCheck({
  deckId,
  rows,
  commanderName,
  power,
  cached,
  cachedHash,
  onCached,
}: EdhPowerCheckProps) {
  const [analysis, setAnalysis] = useState<EdhAnalysisData | null>(cached);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(cached?.url ?? null);

  useEffect(() => {
    setAnalysis(cached);
    setUrl(cached?.url ?? null);
  }, [cached]);

  const names = rows.filter(row => !row.is_sideboard).map(row => row.card?.name || row.card_name);
  const hash = cardsHash(names);
  const needsRefresh = !cached || (Boolean(cachedHash) && cachedHash !== hash);

  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);

    try {
      const clean = (name: string) => name.replace(/\s*\(commander\)\s*$/i, '').trim();
      const encode = (name: string) => encodeURIComponent(clean(name)).replace(/%20/g, '+');

      const commanderClean = commanderName ? clean(commanderName) : null;
      const seen = new Map<string, { name: string; qty: number }>();
      for (const row of rows) {
        if (row.is_sideboard || row.is_commander) continue;
        const name = clean(row.card?.name || row.card_name);
        if (!name) continue;
        if (commanderClean && name.toLowerCase() === commanderClean.toLowerCase()) continue;
        const key = name.toLowerCase();
        const existing = seen.get(key);
        if (existing) existing.qty += row.quantity;
        else seen.set(key, { name, qty: row.quantity });
      }

      const header = commanderName ? `1x+${encode(commanderName)}~~` : '';
      const sentinel = '~Z~';
      const MAX_ITEMS = 100;
      const MAX_LEN = 7000;

      let parts = [...seen.values()].slice(0, MAX_ITEMS).map(c => `${c.qty}x+${encode(c.name)}`);
      let body = parts.join('~');
      while (header.length + body.length + sentinel.length > MAX_LEN && parts.length > 0) {
        parts = parts.slice(0, -1);
        body = parts.join('~');
      }

      const target = `https://edhpowerlevel.com/?d=${header}${body}${sentinel}`;
      setUrl(target);

      const { data, error } = await supabase.functions.invoke('edh-power-check', {
        body: {
          url: target,
          cards: [...seen.values()].map(c => c.name),
          commander: commanderName ?? null,
        },
      });

      const level =
        !error && data?.success && data?.powerLevel != null
          ? typeof data.powerLevel === 'number'
            ? data.powerLevel
            : parseFloat(data.powerLevel)
          : NaN;

      if (Number.isNaN(level)) {
        showError('EDH power', 'Could not read a level. Open Details to check it by hand.');
        return;
      }

      // Logged whether or not they agree: a calibration check nobody records
      // says nothing about whether the two models track each other.
      logDivergence(commanderName ?? 'deck', comparePower(power?.score ?? 0, level));

      const full: EdhAnalysisData = {
        metrics: {
          powerLevel: level,
          tippingPoint: data.tippingPoint ?? null,
          efficiency: data.efficiency ?? null,
          impact: data.impact ?? null,
          score: data.score ?? null,
          playability: data.playability ?? null,
        },
        bracket: data.bracket || null,
        cardAnalysis: data.cardAnalysis || [],
        landAnalysis: data.landAnalysis || null,
        url: data.url || target,
      };

      setAnalysis(full);
      await supabase
        .from('user_decks')
        .update({
          edh_analysis: full as never,
          edh_cards_hash: hash,
          edh_analysis_updated_at: new Date().toISOString(),
        })
        .eq('id', deckId);
      onCached(full as unknown as Record<string, unknown>, hash);

      showSuccess('Power level', `edhpowerlevel.com says ${level.toFixed(2)}/10`);
    } catch (error) {
      console.error('EDH power check failed:', error);
      showError('EDH power', 'The check could not be run.');
    } finally {
      setLoading(false);
      running.current = false;
    }
  }, [deckId, rows, commanderName, power, hash, onCached]);

  const level = analysis?.metrics?.powerLevel ?? null;
  const comparison = power && level !== null ? comparePower(power.score, level) : null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-muted/30 p-3 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <p className="whitespace-nowrap text-sm font-medium">edhpowerlevel.com says</p>
            {loading ? (
              <p className="text-lg font-semibold text-muted-foreground">…</p>
            ) : level !== null ? (
              <p className="text-lg font-semibold tabular-nums">{level.toFixed(1)}/10</p>
            ) : (
              <p className="text-xs text-muted-foreground">Not checked</p>
            )}
            {needsRefresh && level !== null && (
              <Badge variant="secondary" className="text-[10px]">
                Cards changed since this check
              </Badge>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button
              variant={needsRefresh ? 'default' : 'secondary'}
              size="sm"
              onClick={run}
              disabled={loading}
            >
              <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
              {level === null ? 'Calculate' : 'Refresh'}
            </Button>
            {url && (
              <Button variant="secondary" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  <span className="ml-1 hidden xs:inline">Details</span>
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* The calibration reading. Ours is computed from your actual decklist
            and mana base; theirs is parsed out of their rendered page. When they
            disagree by enough to act on, say so, and say which way. */}
        {comparison?.worthShowing && comparison.note && (
          <p className="mt-2 text-xs leading-snug text-muted-foreground">{comparison.note}</p>
        )}

        {analysis?.metrics && (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            {METRIC_ROWS.map(([label, key, fmt]) => {
              const value = analysis.metrics?.[key] as number | null | undefined;
              return (
                <div key={label}>
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums">
                    {value !== null && value !== undefined ? fmt(value) : '—'}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>

      <EdhAnalysisPanel
        data={analysis}
        isLoading={loading}
        needsRefresh={needsRefresh}
        onRefresh={run}
      />
    </div>
  );
}

export default EdhPowerCheck;
