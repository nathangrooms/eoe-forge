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
  MoreVertical,
  Package,
  Play,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { CommanderHero } from './CommanderHero';
import { DeckPowerInline, DeckPowerMeter } from './DeckPowerMeter';

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
  className?: string;
}

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
      <span className="flex items-center justify-center gap-1 text-xl font-bold leading-none tabular-nums text-foreground sm:text-2xl">
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
  className,
}: DeckTileProps) {
  const [isFavorite, setIsFavorite] = useState(deckSummary.favorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [addingToWishlist, setAddingToWishlist] = useState(false);
  const navigate = useNavigate();

  const counts = deckSummary.counts;
  const missingCount = deckSummary.economy?.missing ?? 0;
  const isComplete = missingCount === 0;
  const ownedCount = Math.max(counts.total - missingCount, 0);
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

      const cardIds = allDeckCards.map(c => c.card_id);
      const { data: ownedCards } = await supabase
        .from('user_collections')
        .select('card_id')
        .eq('user_id', user.user.id)
        .in('card_id', cardIds);

      const ownedCardIds = new Set(ownedCards?.map(c => c.card_id) || []);
      const actualMissingCards = allDeckCards.filter(card => !ownedCardIds.has(card.card_id));

      if (actualMissingCards.length === 0) {
        showSuccess('Complete Collection', 'You already own all cards in this deck');
        return;
      }

      const { error: insertError } = await supabase.from('wishlist').upsert(
        actualMissingCards.map(card => ({
          user_id: user.user!.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
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

  const handlePlaytest = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(`/simulate?deck=${deckSummary.id}`);
  };

  const actionsMenu = (
    <DropdownMenu>
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
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
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
            >
              {favouriteBadge}
            </CommanderHero>
          </div>

          <div className="min-w-0 flex-1">
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

          {showPower && (
            <DeckPowerInline
              score={deckSummary.power?.score}
              band={deckSummary.power?.band}
              className="hidden w-28 shrink-0 lg:block"
            />
          )}

          <dl className="hidden items-center gap-6 text-sm md:flex">
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
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
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
        <div className="mx-auto w-[64%] min-w-0 max-w-[260px] shrink-0 sm:mx-0 sm:w-[40%] sm:max-w-[230px] lg:w-[42%] lg:max-w-[260px]">
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
            <DeckPowerMeter score={deckSummary.power?.score} band={deckSummary.power?.band} />
          )}

          <div className="grid grid-cols-3 gap-2">
            <Stat
              value={counts.total}
              label="Cards"
              hint={`${counts.unique} unique cards — open the full analysis`}
              onClick={onAnalysis}
            />
            <Stat
              value={currency(deckSummary.economy?.priceUSD)}
              label="Value"
              hint="Sum of USD market prices for every card in the deck"
            />
            <Stat
              value={isComplete ? <Check className="h-5 w-5" /> : missingCount}
              label={isComplete ? 'Complete' : 'Missing'}
              hint={
                isComplete
                  ? 'You own every card in this deck'
                  : `${missingCount} cards you do not own yet`
              }
              onClick={onMissingCards}
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

          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={onEdit} className="min-w-0">
              <Edit className="h-4 w-4" />
              <span className="truncate">Edit</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={onAnalysis} className="min-w-0">
              <BarChart3 className="h-4 w-4" />
              <span className="truncate">Stats</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddMissingToWishlist}
              disabled={addingToWishlist || isComplete}
              title={
                isComplete
                  ? 'You already own every card in this deck'
                  : `Add ${missingCount} missing cards to your wishlist`
              }
              className="min-w-0"
            >
              {addingToWishlist ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
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
              className="min-w-0"
            >
              {favoriteLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
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
