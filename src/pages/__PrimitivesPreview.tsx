import { useEffect, useState } from 'react';
import { CardGrid, CardImage, CardSizeSlider, useCardSize } from '@/components/cards';
import { ActiveFilterChips, CardFilterPanel, useCardFilterState } from '@/components/filters';

/** TEMPORARY verification harness — delete after visual check. */
export default function PrimitivesPreview() {
  const [cardWidth, setCardWidth] = useCardSize('preview');
  const filters = useCardFilterState();
  const [cards, setCards] = useState<any[]>([]);

  useEffect(() => {
    fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
        filters.query === '*' ? 'set:blb' : filters.query
      )}`
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCards(d?.data?.slice(0, 24) ?? []))
      .catch(() => setCards([]));
  }, [filters.query]);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20">
          <CardFilterPanel controller={filters} showChips={false} />
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-lg shadow-black/20">
            <span className="text-sm text-muted-foreground">{cards.length} cards</span>
            <CardSizeSlider
              storageKey="preview"
              value={cardWidth}
              onValueChange={setCardWidth}
            />
          </div>
          <ActiveFilterChips controller={filters} />
          <CardGrid width={cardWidth}>
            {cards.map(c => (
              <CardImage key={c.id} card={c} width={cardWidth} fill onClick={() => {}} />
            ))}
          </CardGrid>
        </div>
      </div>
    </div>
  );
}
