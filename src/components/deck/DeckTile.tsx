import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Check,
  Copy,
  Crown,
  Download,
  Edit,
  Layers,
  Loader2,
  MoreVertical,
  Package,
  Play,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { oracleIndexFor } from '@/lib/cards/cardQuery';
import { ownedByCardId, spendOwned } from '@/lib/cards/ownership';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { CommanderHero } from './CommanderHero';
import { PowerScore } from './PowerScore';

/**
 * The single deck tile.
 *
 * Rebuilt around one idea the owner was explicit about: **the commander card is
 * the tile**. It is the largest element by a wide margin, drawn at `large`
 * resolution through the shared `CardImage`, and everything else is set beside
 * it as flat type.
 *
 * Deliberately *not* here any more:
 *
 * - the mana curve and the composition bar — both removed at the owner's
 *   request, along with the "Avg MV" readout the curve fed;
 * - hairline borders. Depth is surface tint (`bg-muted/40`) plus shadow, and
 *   the four-up stat strip that used `divide-x` is now spaced panels.
 *
 * What is promoted instead: card count, deck value, missing count, collection
 * progress and — the one the owner called out as important — power level and
 * Commander bracket, which get a block of their own.
 */

export type DeckTileVariant = 'grid' | 'list';

/**
 * Geometry of the hero column, exported so the page's loading skeleton lands on
 * exactly the same footprint and the grid does not jump on first paint.
 *
 * Percentage-first with a generous cap: the card grows with the tile instead of
 * being pinned to one size, and `max-w` only bites on very wide screens where
 * 46% would start to look absurd rather than heroic.
 *
 * `self-center` rather than the default stretch. A Magic card has a fixed
 * aspect ratio, so it can never be as tall as the stack of readouts beside it;
 * top-aligning it left a wedge of dead space under the art. Centred, the
 * leftover height reads as deliberate padding.
 */
export const DECK_HERO_COLUMN =
  'mx-auto w-[64%] min-w-0 max-w-[280px] shrink-0 sm:mx-0 sm:w-[46%] sm:max-w-[340px] sm:self-center';

interface DeckTileProps {
  deckSummary: DeckSummary;
  variant?: DeckTileVariant;
  /** Load the commander art eagerly — for the first row of tiles only. */
  priority?: boolean;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onAnalysis?: () => void;
  onMissingCards?: () => void;
  onExport?: () => void;
  onFavoriteChange?: () => void;
  onShare?: () => void;
  /** Recompute this deck's power score from its current decklist. */
  onRescore?: () => void;
  rescoring?: boolean;
  className?: string;
}

/** Tightened from the default `sm` button so "Favourited" survives a 115px cell. */
const CTA_CLASS = 'min-w-0 gap-1.5 px-2 text-xs';

function currency(value: number | null | undefined): string {
  return `$${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function updatedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/** One big number on its own muted panel. No dividers, so no border lines. */
function Stat({
  value,
  label,
  hint,
  onClick,
}: {
  value: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      {/* `font-semibold`, not `font-bold`. Measured on `/decks` at 1280 and at
          1920: the summary row above these tiles draws its figures at 24px/600
          and these drew the same 24px at 700, four hundred pixels apart on the
          one page the owner compared the deck page against. Same size, one
          weight off, which is exactly the drift `CONSISTENCY.md` Q3.1 counts:
          it names `text-2xl font-semibold tabular-nums` as the figure and calls
          out the other 24px BOLD row in the product as the odd one. */}
      <span className="flex items-center justify-center gap-1 text-xl font-semibold leading-none tabular-nums text-foreground sm:text-2xl">
        {value}
      </span>
      <span className="mt-1.5 block text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
    </>
  );

  const shell =
    'rounded-lg bg-muted/40 px-2 py-2.5 text-center transition-colors duration-200 motion-reduce:transition-none';

  if (!onClick) {
    return (
      <div className={shell} title={hint}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      title={hint}
      className={cn(
        shell,
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {body}
    </button>
  );
}

export function DeckTile({
  deckSummary,
  variant = 'grid',
  priority = false,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onAnalysis,
  onMissingCards,
  onExport,
  onFavoriteChange,
  onShare,
  onRescore,
  rescoring,
  className,
}: DeckTileProps) {
  const [isFavorite, setIsFavorite] = useState(deckSummary.favorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [addingToWishlist, setAddingToWishlist] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const navigate = useNavigate();

  const counts = deckSummary.counts;
  const missingCount = deckSummary.economy?.missing ?? 0;
  /**
   * A deck with no cards is not complete, it is empty.
   *
   * `missing === 0` alone put a tick and the word COMPLETE on two zero-card
   * shells, next to a 100-card deck reading "100 MISSING" — the two states a
   * player most needs to tell apart wearing the same badge.
   */
  const isEmpty = counts.total === 0;
  const isComplete = !isEmpty && missingCount === 0;
  const nothingToWishlist = missingCount === 0;
  const ownedCount = Math.max(counts.total - missingCount, 0);
  /**
   * The engine scores the ninety-nine, not the command zone: it drops the
   * commander before it shuffles, so a deck holding nothing but its commander
   * computes to `null` exactly like an empty one. Offering "Score deck" there
   * gives you a button that spins and then changes nothing.
   */
  const scoreableCards = counts.total - (deckSummary.commander ? 1 : 0);
  const canScore = scoreableCards > 0;
  const ownershipPct = counts.total > 0 ? Math.round((ownedCount / counts.total) * 100) : 0;
  const showPower = usesPowerLevel(deckSummary.format);
  const identity = deckSummary.identity?.length ? deckSummary.identity : deckSummary.colors;
  const issues = deckSummary.legality?.issues ?? [];
  const legalityOk = (deckSummary.legality?.ok ?? true) && issues.length === 0;

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (favoriteLoading) return;

    setFavoriteLoading(true);
    try {
      const result = await DeckAPI.toggleFavorite(deckSummary.id);
      setIsFavorite(result.favorited);
      onFavoriteChange?.();
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showError('Error', 'Could not update favorite');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleAddMissingToWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setAddingToWishlist(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        showError('Authentication Required', 'Please log in to add cards to wishlist');
        return;
      }

      const { data: allDeckCards, error: deckError } = await supabase
        .from('deck_cards')
        .select('card_id, card_name, quantity')
        .eq('deck_id', deckSummary.id);

      if (deckError) throw deckError;
      if (!allDeckCards || allDeckCards.length === 0) {
        showError('No Cards Found', 'This deck appears to be empty');
        return;
      }

      /*
       * THREE FAULTS, AND THIS BUTTON PUTS CARDS ON A SHOPPING LIST.
       *
       * It asked for collection rows `.in('card_id', cardIds)`, which is the
       * printings THIS DECK lists. Owning the Revised Sol Ring while the deck
       * lists the Commander Legends one found nothing, so the card went on the
       * wishlist and the owner was told to buy a second copy. Measured on the
       * real database: 4 of the 16 deck rows whose card the owner holds.
       *
       * It then ignored quantity on both sides: owning one Forest made all ten
       * a deck asks for "not missing", and any card it did call missing went on
       * the list at the deck's full required quantity rather than the shortfall.
       *
       * The whole collection is fetched rather than a filtered slice, because
       * the filter was the bug: you cannot ask for the printings you own by
       * naming the printings the deck wants. Three narrow columns, one request.
       */
      const cardIds = allDeckCards.map(c => c.card_id);
      const { data: ownedCards } = await supabase
        .from('user_collections')
        .select('card_id, quantity, foil')
        .eq('user_id', user.user.id);

      const oracleOf = await oracleIndexFor([
        ...cardIds,
        ...(ownedCards ?? []).map(r => r.card_id),
      ]);
      const ownedCopies = ownedByCardId(ownedCards ?? [], oracleOf, cardIds);
      const shortfall = spendOwned(allDeckCards, ownedCopies, oracleOf);
      const actualMissingCards = allDeckCards
        .map((card, i) => ({ ...card, missing: shortfall[i].missing }))
        .filter(card => card.missing > 0);

      if (actualMissingCards.length === 0) {
        showSuccess('Complete Collection', 'You already own all cards in this deck');
        return;
      }

      const { error: insertError } = await supabase.from('wishlist').upsert(
        actualMissingCards.map(card => ({
          user_id: user.user!.id,
          card_id: card.card_id,
          card_name: card.card_name,
          /* What you are SHORT, not what the deck asks for. Owning two of the
             four a deck wants is a wishlist entry for two. */
          quantity: card.missing,
          priority: 'medium' as const,
        })),
        { onConflict: 'user_id,card_id', ignoreDuplicates: false }
      );

      if (insertError) throw insertError;
      showSuccess('Added to Wishlist', `Added ${actualMissingCards.length} missing cards`);
    } catch (error) {
      console.error('Error adding missing cards to wishlist:', error);
      showError('Error', 'Failed to add missing cards to wishlist');
    } finally {
      setAddingToWishlist(false);
    }
  };

  const handleOptimise = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(`/deck/${deckSummary.id}/optimise`);
  };

  const handlePlaytest = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(`/simulate?deck=${deckSummary.id}`);
  };

  /**
   * Deleting confirms in place.
   *
   * Design law 3 puts confirmations in the control that started them rather
   * than in a centred dialog that dims the grid — so the Delete row swaps into
   * Confirm/Cancel and the menu stays open while it does.
   */
  const actionsMenu = (
    <DropdownMenu
      onOpenChange={open => {
        if (!open) setConfirmingDelete(false);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={`More actions for ${deckSummary.name}`}
          onClick={e => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 border-0 shadow-xl shadow-black/40">
        <DropdownMenuItem onClick={onOpen}>
          <Layers className="mr-2 h-4 w-4" /> View deck
        </DropdownMenuItem>
        {/* The second door to the optimiser, and the first one that exists
            outside the deck itself. Nothing in the product linked to it at all
            before this: every route into it went through opening a deck first.
            Here it sits beside View deck, because "make this better" is a thing
            you decide about a deck while looking at the shelf. */}
        <DropdownMenuItem onClick={handleOptimise}>
          <Sparkles className="mr-2 h-4 w-4" /> Optimise
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePlaytest}>
          <Play className="mr-2 h-4 w-4" /> Playtest
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMissingCards}>
          <Package className="mr-2 h-4 w-4" /> Missing cards
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onShare}>
          <Share2 className="mr-2 h-4 w-4" /> Share deck
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="mr-2 h-4 w-4" /> Export
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {confirmingDelete ? (
          <>
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Delete “{deckSummary.name}”? This cannot be undone.
            </div>
            <DropdownMenuItem
              onClick={() => {
                setConfirmingDelete(false);
                onDelete?.();
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Confirm delete
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={e => {
                e.preventDefault();
                setConfirmingDelete(false);
              }}
            >
              <X className="mr-2 h-4 w-4" /> Cancel
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onSelect={e => {
              // Keep the menu open — the confirmation replaces this row.
              e.preventDefault();
              setConfirmingDelete(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /**
   * Legality reads as a chip rather than a bordered badge. An illegal deck is
   * flagged by inverting the chip — high contrast rather than colour, since the
   * palette reserves colour for MTG semantics.
   */
  const legalityChip = legalityOk ? (
    <span
      title={`Legal in ${formatLabel(deckSummary.format)}`}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground"
    >
      <ShieldCheck className="h-3 w-3" />
      Legal
    </span>
  ) : (
    <span
      title={issues.length ? issues.slice(0, 5).join('\n') : 'Unable to verify legality'}
      className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-primary-foreground"
    >
      <AlertTriangle className="h-3 w-3" />
      {issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Check needed'}
    </span>
  );

  const favouriteBadge = isFavorite ? (
    <span
      title="Favourite deck"
      className="absolute left-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-background/85 text-foreground shadow-lg shadow-black/40 backdrop-blur"
    >
      <Star className="h-3.5 w-3.5 fill-current" />
      <span className="sr-only">Favourite</span>
    </span>
  ) : null;

  /* ---------------------------------------------------------------- list */
  if (variant === 'list') {
    return (
      <Card
        className={cn(
          'overflow-hidden transition-shadow duration-200 hover:shadow-xl hover:shadow-black/30 motion-reduce:transition-none',
          className
        )}
      >
        <div className="flex items-center gap-3 p-3 sm:gap-4">
          <div className="w-[72px] shrink-0 sm:w-[88px]">
            <CommanderHero
              commander={deckSummary.commander}
              deckName={deckSummary.name}
              format={deckSummary.format}
              identity={identity}
              cardCount={counts.total}
              size="sm"
              onClick={onOpen}
            />
            {/* No favourite badge here — at 72px it would swallow the art, and
                the toggle itself is a few pixels to the right. */}
          </div>

          {/* `basis-0 grow` with a floor: a plain `flex-1 min-w-0` let this
              column collapse to nothing once the stats and buttons were laid
              out, and the name disappeared behind them. */}
          <div className="min-w-[9rem] shrink basis-0 grow overflow-hidden">
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left text-base font-bold underline-offset-4 hover:underline"
            >
              {deckSummary.name}
            </button>
            {deckSummary.commander?.name && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Crown className="h-3 w-3 shrink-0" />
                <span className="truncate">{deckSummary.commander.name}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {formatLabel(deckSummary.format)}
              </span>
              <ColorIdentity colors={identity} size="xs" className="gap-1" />
            </div>
          </div>

          {/* Breakpoints are viewport-wide, but ~280px of that is the nav rail,
              so these secondary columns start two steps later than they look
              like they should. At `md` there is no room for either. */}
          {showPower && (
            <PowerScore
              power={deckSummary.power}
              variant="inline"
              className="hidden w-28 shrink-0 2xl:block"
            />
          )}

          <dl className="hidden items-center gap-5 text-sm xl:flex">
            <div className="text-right">
              <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                Cards
              </dt>
              <dd className="font-bold tabular-nums">{counts.total}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                Value
              </dt>
              <dd className="font-bold tabular-nums">{currency(deckSummary.economy?.priceUSD)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                Missing
              </dt>
              <dd className="font-bold tabular-nums">{missingCount}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                Owned
              </dt>
              <dd className="font-bold tabular-nums">{ownershipPct}%</dd>
            </div>
          </dl>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
              aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={isFavorite}
              className="h-8 w-8"
            >
              {favoriteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Star className={cn('h-4 w-4', isFavorite && 'fill-current')} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onAnalysis}
              aria-label={`Stats for ${deckSummary.name}`}
              className="hidden h-8 w-8 sm:inline-flex"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            {actionsMenu}
          </div>
        </div>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- grid */
  return (
    <Card
      className={cn(
        'group/tile overflow-hidden transition-shadow duration-300 hover:shadow-2xl hover:shadow-black/40 motion-reduce:transition-none',
        className
      )}
    >
      <div className="flex h-full flex-col gap-4 p-4 sm:flex-row sm:gap-5 sm:p-5">
        {/* The hero. Everything else on the tile is sized against this. */}
        <div className={DECK_HERO_COLUMN}>
          <CommanderHero
            commander={deckSummary.commander}
            deckName={deckSummary.name}
            format={deckSummary.format}
            identity={identity}
            cardCount={counts.total}
            size="xl"
            eager={priority}
            onClick={deckSummary.commander ? onOpen : onEdit ?? onOpen}
          >
            {favouriteBadge}
          </CommanderHero>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={onOpen}
                className="block w-full text-left underline-offset-4 hover:underline"
              >
                <h3 className="line-clamp-2 text-lg font-bold leading-tight tracking-tight sm:text-xl">
                  {deckSummary.name}
                </h3>
              </button>
              {deckSummary.commander?.name && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Crown className="h-3 w-3 shrink-0" />
                  <span className="truncate">{deckSummary.commander.name}</span>
                </p>
              )}
            </div>
            {actionsMenu}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {formatLabel(deckSummary.format)}
            </span>
            {legalityChip}
            <ColorIdentity colors={identity} size="sm" className="ml-auto gap-1" />
          </div>

          {showPower && (
            <PowerScore
              power={deckSummary.power}
              variant="compact"
              // A deck the engine cannot score is not offered a button that
              // would fail; it is told what it needs instead.
              onRescore={canScore ? onRescore : undefined}
              rescoring={rescoring}
              unscoredReason={canScore ? 'Not scored yet' : 'Add cards to score'}
            />
          )}

          <div className="grid grid-cols-3 gap-2">
            <Stat
              value={counts.total}
              label="Cards"
              hint={`${counts.unique} unique cards. Open the full analysis`}
              onClick={onAnalysis}
            />
            <Stat
              value={currency(deckSummary.economy?.priceUSD)}
              label="Value"
              hint="Sum of USD market prices for every card in the deck"
            />
            <Stat
              value={isEmpty ? '—' : isComplete ? <Check className="h-5 w-5" /> : missingCount}
              label={isEmpty ? 'Missing' : isComplete ? 'Complete' : 'Missing'}
              hint={
                isEmpty
                  ? 'This deck has no cards yet'
                  : isComplete
                    ? 'You own every card in this deck'
                    : `${missingCount} cards you do not own yet`
              }
              onClick={isEmpty ? undefined : onMissingCards}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Collection progress</span>
              <span className="font-semibold tabular-nums">
                {ownershipPct}%
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {ownedCount}/{counts.total}
                </span>
              </span>
            </div>
            <Progress
              value={ownershipPct}
              className="h-2 bg-muted"
              aria-label={`${ownershipPct}% of this deck is in your collection`}
            />
          </div>

          {/* The four CTAs the owner asked for, on a 2×2 so they stay legible
              in the narrow body column of a two-up tile. */}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={onEdit} className={CTA_CLASS}>
              <Edit className="h-4 w-4" />
              <span className="truncate">Edit</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={onAnalysis} className={CTA_CLASS}>
              <BarChart3 className="h-4 w-4" />
              <span className="truncate">Stats</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddMissingToWishlist}
              disabled={addingToWishlist || nothingToWishlist}
              title={
                isEmpty
                  ? 'This deck has no cards yet'
                  : nothingToWishlist
                    ? 'You already own every card in this deck'
                    : `Add ${missingCount} missing cards to your wishlist`
              }
              className={CTA_CLASS}
            >
              {addingToWishlist ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Package className="h-4 w-4" />
              )}
              <span className="truncate">Wishlist</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
              aria-pressed={isFavorite}
              className={CTA_CLASS}
            >
              {favoriteLoading ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Star className={cn('h-4 w-4', isFavorite && 'fill-current')} />
              )}
              <span className="truncate">{isFavorite ? 'Favourited' : 'Favourite'}</span>
            </Button>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[0.7rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {updatedLabel(deckSummary.updatedAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {counts.lands} lands
            </span>
            <span className="inline-flex items-center gap-1">
              <Package className="h-3 w-3" />
              {counts.unique} unique
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DeckTile;
