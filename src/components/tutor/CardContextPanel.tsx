/**
 * DeckMatrix, Tutor: the receipt for a single card.
 *
 * The sibling of `DeckContextPanel`. When the top line is pointed at one card
 * rather than a deck, this is what Tutor was handed: the printing
 * itself at full size — never cropped — and the exact fields that ride along
 * with every question. If a line is on screen here it is in the payload, and
 * nothing is on screen that is not read off the `cards` row.
 */

import { Crown } from 'lucide-react';
import { CardImage } from '@/components/cards';
import { ManaCost } from '@/components/ui/mana-cost';
import type { TutorCard } from './ContextPicker';

interface CardContextPanelProps {
  card: TutorCard;
  onCardClick?: (card: any) => void;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export function CardContextPanel({ card, onCardClick }: CardContextPanelProps) {
  const identity: string[] = Array.isArray(card.color_identity) ? card.color_identity : [];
  const legalFormats = Object.entries((card.legalities ?? {}) as Record<string, string>)
    .filter(([, status]) => status === 'legal')
    .map(([format]) => format);

  return (
    <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          What Tutor is reading
        </h3>
        <p className="text-xs text-muted-foreground">
          The full oracle text, cost and type line of this printing go with every question
        </p>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="w-full max-w-[15rem]">
          <CardImage
            card={card}
            size="lg"
            fill
            eager
            onClick={onCardClick ? () => onCardClick(card) : undefined}
          />
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Fact label="Card">
            <span className="font-semibold">{card.name}</span>
          </Fact>

          {card.mana_cost && (
            <Fact label="Mana cost">
              <span className="flex items-center gap-2">
                <ManaCost cost={card.mana_cost} size="md" />
                {card.cmc !== null && card.cmc !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    mana value {Number(card.cmc)}
                  </span>
                )}
              </span>
            </Fact>
          )}

          {card.type_line && <Fact label="Type">{card.type_line}</Fact>}

          {(card.power || card.toughness) && (
            <Fact label="Power / toughness">
              <span className="tabular-nums">
                {card.power}/{card.toughness}
              </span>
            </Fact>
          )}

          {identity.length > 0 && (
            <Fact label="Colour identity">
              <span className="flex items-center gap-1.5">
                <ManaCost cost={identity.map(c => `{${c}}`).join('')} size="md" />
                {card.type_line?.includes('Legendary Creature') && (
                  <Crown className="h-3.5 w-3.5 text-type-commander" aria-hidden="true" />
                )}
              </span>
            </Fact>
          )}

          {card.set_code && (
            <Fact label="Printing">
              <span className="text-sm">
                {String(card.set_code).toUpperCase()} #{card.collector_number ?? '?'}
                {card.rarity && (
                  <span className="text-muted-foreground"> · {card.rarity}</span>
                )}
              </span>
            </Fact>
          )}

          {card.oracle_text && (
            <div className="sm:col-span-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Oracle text
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {card.oracle_text}
              </p>
            </div>
          )}

          {legalFormats.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Legal in
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {legalFormats.map(format => (
                  <span
                    key={format}
                    className="rounded-md bg-muted/40 px-2 py-0.5 text-xs capitalize text-muted-foreground"
                  >
                    {format}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
