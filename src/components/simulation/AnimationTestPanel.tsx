import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AnimationManager } from '@/lib/simulation/animations';
import { useState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * Dev panel to manually test card animations
 */
export const AnimationTestPanel = () => {
  const testCardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const runAnimation = async (type: string) => {
    if (!testCardRef.current) return;

    const payload = {
      cardElement: testCardRef.current,
      targetElement: undefined,
      damage: 5,
      counters: 2,
    };

    switch (type) {
      case 'attack':
        await AnimationManager.attackStart(payload);
        break;
      case 'damage':
        await AnimationManager.battleDamage(payload);
        break;
      case 'dies':
        await AnimationManager.creatureDies(payload);
        // Reset opacity after death animation
        setTimeout(() => {
          if (testCardRef.current) testCardRef.current.style.opacity = '1';
        }, 1000);
        break;
      case 'token':
        await AnimationManager.tokenCreated(payload);
        break;
      case 'counter':
        await AnimationManager.counterAdded(payload);
        break;
      case 'tap':
        await AnimationManager.tap(payload);
        break;
      case 'untap':
        await AnimationManager.untap(payload);
        break;
      case 'exile':
        await AnimationManager.exile(payload);
        setTimeout(() => {
          if (testCardRef.current) testCardRef.current.style.opacity = '1';
        }, 1000);
        break;
    }
  };

  if (!isVisible) {
    return (
      <Button
        onClick={() => setIsVisible(true)}
        size="sm"
        variant="outline"
        className="fixed bottom-4 right-4 z-50"
      >
        🎬 Test Animations
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 p-4 w-[320px] bg-background/95 backdrop-blur border-primary/50 shadow-2xl">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-sm">Animation Test Panel</h3>
        <Button onClick={() => setIsVisible(false)} size="sm" variant="ghost">
          ✕
        </Button>
      </div>

      {/* Test card */}
      <div className="flex justify-center mb-4">
        <div
          ref={testCardRef}
          className="relative w-24 h-32 bg-gradient-to-br from-primary/40 to-secondary/40 rounded-md border-2 border-primary flex items-center justify-center shadow-lg"
        >
          <span className="text-4xl">🐉</span>
          <Badge className="absolute bottom-2 right-2 text-[10px]">5/5</Badge>
        </div>
      </div>

      {/* Animation buttons */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Button onClick={() => runAnimation('attack')} size="sm" variant="destructive">
          ⚔️ Attack
        </Button>
        <Button onClick={() => runAnimation('damage')} size="sm" variant="destructive">
          💥 Damage
        </Button>
        <Button onClick={() => runAnimation('dies')} size="sm" variant="destructive">
          💀 Dies
        </Button>
        <Button onClick={() => runAnimation('token')} size="sm" variant="default">
          ✨ Create Token
        </Button>
        <Button onClick={() => runAnimation('counter')} size="sm" variant="secondary">
          ➕ Add Counter
        </Button>
        <Button onClick={() => runAnimation('tap')} size="sm" variant="outline">
          ↻ Tap
        </Button>
        <Button onClick={() => runAnimation('untap')} size="sm" variant="outline">
          ↺ Untap
        </Button>
        <Button onClick={() => runAnimation('exile')} size="sm" variant="outline">
          🚀 Exile
        </Button>
      </div>

      <div className="mt-3 text-[10px] text-muted-foreground text-center">
        Click buttons to test animations on the card above
      </div>
    </Card>
  );
};
