import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Eye, Users, Crown, Mountain, Sparkles, Shield, Gem, Swords } from "lucide-react";

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
        const Icon = TYPE_ICONS[group.title] || Users;

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
                    <div
                      key={`${card.id}-${idx}`}
                      className="relative group cursor-pointer"
                      onClick={() => onCardClick?.(card)}
                    >
                      <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-all duration-200 shadow-sm group-hover:shadow-lg">
                        {card.image_uris?.normal ? (
                          <img
                            src={card.image_uris.normal}
                            alt={card.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Icon className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}

                        {card.quantity && card.quantity > 1 && (
                          <div className="absolute top-2 left-2">
                            <Badge className="bg-background/90 text-foreground border font-bold">
                              {card.quantity}x
                            </Badge>
                          </div>
                        )}

                        {card.prices?.usd && (
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-background/90 text-foreground border text-xs">
                              ${parseFloat(card.prices.usd).toFixed(2)}
                            </Badge>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="text-white text-sm font-medium flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            View Details
                          </div>
                        </div>
                      </div>

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
