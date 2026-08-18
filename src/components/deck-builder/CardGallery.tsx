import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Eye, Users, Crown, Mountain, Sparkles, Shield, Gem, Swords } from "lucide-react";
import { CardImage } from "@/components/cards/CardImage";

export type GalleryCard = {
  id: string;
  name: string;
  image_uris?: { normal?: string };
  cmc?: number;
  quantity?: number;
  prices?: { usd?: string };
  [key: string]: any;
};

export type CardGroup = {
  title: string;
  cards: GalleryCard[];
};

const TYPE_COLORS: Record<string, string> = {
  Commander: "--type-commander",
  Creatures: "--type-creatures",
  "Instants & Sorceries": "--type-instants",
  Artifacts: "--type-artifacts",
  Enchantments: "--type-enchantments",
  Planeswalkers: "--type-planeswalkers",
  Lands: "--type-lands",
};

const TYPE_ICONS: Record<string, any> = {
  Commander: Crown,
  Creatures: Users,
  "Instants & Sorceries": Sparkles,
  Artifacts: Shield,
  Enchantments: Gem,
  Planeswalkers: Swords,
  Lands: Mountain,
};

function GroupHeader({ title, count, expanded, onToggle }: { title: string; count: number; expanded: boolean; onToggle: () => void }) {
  const Icon = TYPE_ICONS[title] || Users;
  const colorVar = TYPE_COLORS[title];

  return (
    <CardHeader
      className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">{title}</CardTitle>
          <Badge variant="secondary">{count}</Badge>
        </div>
      </div>
    </CardHeader>
  );
}

export function CardGallery({ groups, onCardClick, defaultExpanded = ["Commander", "Creatures", "Instants & Sorceries"] }: {
  groups: CardGroup[];
  onCardClick?: (card: GalleryCard) => void;
  defaultExpanded?: string[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(defaultExpanded));

  const totals = useMemo(() =>
    Object.fromEntries(groups.map(g => [g.title, g.cards.reduce((s, c) => s + (c.quantity || 1), 0)])),
  [groups]);

  const toggle = (title: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {groups.filter(g => g.cards.length > 0).map(group => {
        const colorVar = TYPE_COLORS[group.title];
        const borderStyle = colorVar ? { borderLeftColor: `hsl(var(${colorVar}))` } as React.CSSProperties : undefined;
        const isExpanded = expanded.has(group.title);

        return (
          <Card key={group.title} className="border-l-4" style={borderStyle}>
            <GroupHeader
              title={group.title}
              count={totals[group.title] || 0}
              expanded={isExpanded}
              onToggle={() => toggle(group.title)}
            />

            {isExpanded && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {group.cards.map((card, idx) => (
                    <div key={`${card.id}-${idx}`} className="group/tile relative">
                      {/* The shared `CardImage`, not a hand-rolled <img>: it draws
                          the card at the real 488x680 ratio (the `aspect-[3/4]`
                          box this replaced sliced ~5% off every card), asks
                          Scryfall for the resolution the tile actually renders
                          at, and flips double-faced cards via the `faces`
                          column. It also carries no border. */}
                      <CardImage
                        card={card}
                        size="lg"
                        fill
                        onClick={() => onCardClick?.(card)}
                        title={`${card.name} — view details`}
                      >
                        {card.quantity && card.quantity > 1 && (
                          // Sits on card art, so an explicit dark ground rather
                          // than a theme surface token.
                          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-bold tabular-nums text-white">
                            {card.quantity}x
                          </span>
                        )}

                        {card.prices?.usd && (
                          <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/80 px-1.5 py-0.5 text-xs tabular-nums text-white">
                            ${parseFloat(card.prices.usd).toFixed(2)}
                          </span>
                        )}

                        {/* A corner chip on hover instead of the full-bleed
                            scrim that used to blur out the art the user was
                            trying to look at. */}
                        <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/tile:opacity-100">
                          <Eye className="h-3 w-3" />
                          View
                        </span>
                      </CardImage>

                      <div className="mt-2 text-center">
                        <div className="font-medium text-sm line-clamp-1">{card.name}</div>
                        {typeof card.cmc === 'number' && (
                          <div className="text-xs text-muted-foreground">CMC {card.cmc}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default CardGallery;
