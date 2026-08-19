/**
 * The printing chooser — the part of the scanner that exists because image
 * recognition cannot finish the job.
 *
 * When several printings of the identified card match closely, this is what the
 * user sees. It shows each one at real size with its own art, set name,
 * collector number and price, because those are the things that let a person
 * glance at the card in their hand and pick correctly in about two seconds.
 * A list of set codes would not.
 *
 * Design law observed here: no borders (depth comes from surface tint), no
 * colour outside MTG semantics, art everywhere a card is referenced, and a
 * click on the card art itself goes to `/cards/:id` rather than trapping the
 * user in the scanner.
 */

import { Link } from 'react-router-dom';
import { Check, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CardImage, cardDetailPath } from '@/components/cards';
import { cn } from '@/lib/utils';
import type { PrintingDetail } from './printingLookup';

export interface ScanCandidateListProps {
  candidates: PrintingDetail[];
  /** Hamming distance per candidate, for the "how close" hint. */
  distances?: Record<string, number>;
  /** Card id the engine settled on, if any. */
  resolvedCardId?: string | null;
  onChoose: (printing: PrintingDetail) => void;
  /** Width of each card image in px. */
  width?: number;
  heading?: string;
  subheading?: string;
}

function priceLabel(usd: number | null): string {
  if (usd == null) return 'no price';
  return usd >= 100 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`;
}

export function ScanCandidateList({
  candidates,
  distances,
  resolvedCardId,
  onChoose,
  width = 168,
  heading,
  subheading,
}: ScanCandidateListProps) {
  if (candidates.length === 0) return null;

  // Price spread is the reason this screen matters. When the options differ
  // wildly in value, say so — that is exactly when picking the wrong one costs
  // the user something real.
  const prices = candidates.map((c) => c.priceUsd).filter((p): p is number => p != null);
  const spread =
    prices.length > 1 ? Math.max(...prices) / Math.max(0.01, Math.min(...prices)) : 1;

  return (
    <section className="space-y-3">
      {heading ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">{heading}</h3>
          {subheading ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{subheading}</p>
          ) : null}
          {spread >= 3 ? (
            <p className="text-xs text-muted-foreground">
              These printings differ in value by about {spread.toFixed(0)}x, so the choice matters.
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-3">
        {candidates.map((c) => {
          const href = cardDetailPath({ id: c.cardId });
          const isResolved = resolvedCardId === c.cardId;
          const distance = distances?.[c.cardId];
          return (
            <li key={c.cardId} className="space-y-2" style={{ width }}>
              <div
                className={cn(
                  'relative overflow-hidden rounded-xl bg-muted/30 transition-shadow',
                  isResolved && 'shadow-lg shadow-black/40 ring-2 ring-foreground/25',
                )}
              >
                {/* The art itself is the link out — the button below is the
                    action that keeps you in the scan flow. */}
                {href ? (
                  <Link to={href} aria-label={`Open ${c.name} (${c.setName}) card page`}>
                    <CardImage
                      card={{ name: c.name, image_uris: c.imageUris }}
                      width={width}
                      fill
                    />
                  </Link>
                ) : (
                  <CardImage card={{ name: c.name, image_uris: c.imageUris }} width={width} fill />
                )}
              </div>

              <div className="space-y-0.5">
                <p className="truncate text-xs font-medium text-foreground" title={c.setName}>
                  {c.setName}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {c.setCode.toUpperCase()} · #{c.collectorNumber} · {priceLabel(c.priceUsd)}
                  {distance != null ? ` · ${distance} bits` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={isResolved ? 'default' : 'secondary'}
                  className="h-8 flex-1 text-xs"
                  onClick={() => onChoose(c)}
                >
                  {isResolved ? <Check className="mr-1 h-3 w-3" /> : null}
                  This one
                </Button>
                {href ? (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    aria-label={`Open ${c.name} card page`}
                  >
                    <Link to={href}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
