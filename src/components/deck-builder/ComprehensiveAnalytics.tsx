import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain } from 'lucide-react';
import type { Card as DeckCard } from '@/stores/deckStore';
import { BrainAnalysis } from './BrainAnalysis';
import { PowerScore } from '@/components/deck/PowerScore';
import { PowerSliderCoaching } from './PowerSliderCoaching';
import { LandEnhancerUX } from './LandEnhancerUX';
import { usesPowerLevel } from '@/lib/deck/formats';
import {
  computeDeckPower,
  entriesFromStoreCards,
  persistDeckPower,
  type DeckPower,
} from '@/lib/deck/power';

/**
 * The deck page's analysis view.
 *
 * Every number here comes from one call to {@link computeDeckPower}. It used to
 * call `EDHPowerCalculator` directly with its own card conversion, its own band
 * colour ladder and its own rescaling of the 0–100 subscores — which is how the
 * same deck could read 6.6 on this tab and 5/10 in the stat tile 300px above it.
 */

interface ComprehensiveAnalyticsProps {
  deck: DeckCard[];
  format: string;
  commander?: DeckCard;
  deckId?: string;
  /**
   * Write the score back so the tiles, dashboard and builder converge on it.
   * Off for read-only surfaces (the public deck page cannot write anyway).
   */
  persist?: boolean;
}

export function ComprehensiveAnalytics({
  deck,
  format,
  commander,
  deckId,
  persist = true,
}: ComprehensiveAnalyticsProps) {
  const [activeTab, setActiveTab] = useState('power');

  const entries = useMemo(
    () => entriesFromStoreCards(deck ?? [], commander),
    [deck, commander]
  );

  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(entries, { format }),
    [entries, format]
  );

  useEffect(() => {
    if (persist && power && deckId) void persistDeckPower(deckId, power);
  }, [persist, power, deckId]);

  const showPower = usesPowerLevel(format);

  if (!power) {
    return (
      <div className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground shadow-sm">
        Add cards to this deck to see its analysis.
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="power">Power</TabsTrigger>
        <TabsTrigger value="coaching">Coaching</TabsTrigger>
        <TabsTrigger value="mana">Mana base</TabsTrigger>
        <TabsTrigger value="ai-analysis">
          <Brain className="mr-2 h-4 w-4" />
          AI analysis
        </TabsTrigger>
      </TabsList>

      <TabsContent value="power" className="space-y-4">
        {showPower ? (
          <PowerScore power={power} variant="expanded" />
        ) : (
          <div className="rounded-xl bg-muted/40 p-8 text-center text-sm text-muted-foreground shadow-sm">
            Power level is a Commander concept, so it is not scored for this format. The mana base
            and AI tabs still apply.
          </div>
        )}
      </TabsContent>

      <TabsContent value="coaching" className="space-y-4">
        <PowerSliderCoaching power={power} entries={entries} format={format} />
      </TabsContent>

      <TabsContent value="mana" className="space-y-4">
        <LandEnhancerUX
          entries={entries}
          power={power}
          identity={commander?.color_identity ?? commander?.colors}
        />
      </TabsContent>

      <TabsContent value="ai-analysis" className="space-y-4">
        <BrainAnalysis
          deck={deck}
          commander={commander}
          powerScore={power}
          deckId={deckId}
          format={format}
        />
      </TabsContent>
    </Tabs>
  );
}

export default ComprehensiveAnalytics;
