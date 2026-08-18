import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Copy,
  Crown,
  Download,
  Edit,
  Layers,
  MoreVertical,
  Package,
  Play,
  Plus,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { DeckAPI, type DeckSummary } from '@/lib/api/deckAPI';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { LegalityBadge } from '@/components/deck-builder/LegalityBadge';
import { CATEGORY_BG_CLASS, CATEGORY_LABEL, type DeckCategory } from '@/lib/deck/cardCategories';
import { formatLabel, usesPowerLevel } from '@/lib/deck/formats';
import { averageManaValue } from '@/lib/deck/curve';

/**
 * The single deck tile.
 *
 * Five competing tile components existed — four of them dead — each with its
 * own format-colour map, so the same deck was styled differently depending on
 * which file happened to render it. This is the only one, and it takes a
 * `variant` instead of being forked.
 */

export type DeckTileVariant = 'grid' | 'list';

interface DeckTileProps {
  deckSummary: DeckSummary;
  variant?: DeckTileVariant;
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

const COMPOSITION_KEYS: Array<{ category: DeckCategory; countKey: keyof DeckSummary['counts'] }> = [
  { category: 'creatures', countKey: 'creatures' },
  { category: 'instants', countKey: 'instants' },
  { category: 'sorceries', countKey: 'sorceries' },
  { category: 'artifacts', countKey: 'artifacts' },
  { category: 'enchantments', countKey: 'enchantments' },
  { category: 'planeswalkers', countKey: 'planeswalkers' },
  { category: 'battles', countKey: 'battles' },
  { category: 'lands', countKey: 'lands' },
];

export function DeckTile({
  deckSummary,
  variant = 'grid',
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
  const avgMv = averageManaValue(deckSummary.curve?.bins, counts.lands ?? 0);
  const showPower = usesPowerLevel(deckSummary.format);
  const commanderImage = deckSummary.commander
    ? (deckSummary.commander as any)?.image_uris?.normal ||
      (deckSummary.commander as any)?.image_uris?.large ||
      deckSummary.commander.image
    : null;

  const composition = COMPOSITION_KEYS.map(({ category, countKey }) => ({
    category,
    label: CATEGORY_LABEL[category],
    count: Number(counts[countKey] ?? 0),
  })).filter(entry => entry.count > 0);

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
          className="h-8 w-8 flex-shrink-0"
          aria-label={`Actions for ${deckSummary.name}`}
          onClick={e => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onOpen}>
          <Layers className="h-4 w-4 mr-2" /> View Deck
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Edit className="h-4 w-4 mr-2" /> Edit Deck
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePlaytest}>
          <Play className="h-4 w-4 mr-2" /> Playtest
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAnalysis}>
          <BarChart3 className="h-4 w-4 mr-2" /> Full Analysis
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMissingCards}>
          <Package className="h-4 w-4 mr-2" /> Missing Cards
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onShare}>
          <Share2 className="h-4 w-4 mr-2" /> Share Deck
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="h-4 w-4 mr-2" /> Export
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const badges = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide font-semibold">
        {formatLabel(deckSummary.format)}
      </Badge>
      {showPower && (
        <Badge variant="outline" className="text-[10px] font-semibold">
          Power {deckSummary.power?.score ?? 0}/10
        </Badge>
      )}
      <LegalityBadge
        isLegal={deckSummary.legality?.ok ?? true}
        issues={deckSummary.legality?.issues || []}
        format={formatLabel(deckSummary.format)}
      />
    </div>
  );

  const favoriteButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleFavoriteToggle}
      disabled={favoriteLoading}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFavorite}
      className="h-8 w-8 flex-shrink-0"
    >
      {favoriteLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Star className={cn('h-4 w-4', isFavorite && 'fill-current')} />
      )}
    </Button>
  );

  /* ---------------------------------------------------------------- list */
  if (variant === 'list') {
    return (
      <Card className={cn('overflow-hidden transition-colors hover:border-foreground/25', className)}>
        <CardContent className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={onOpen}
            className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-muted"
            aria-label={`Open ${deckSummary.name}`}
          >
            {commanderImage ? (
              <img
                src={commanderImage}
                alt=""
                className="h-full w-full object-cover object-top"
                loading="lazy"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Crown className="h-4 w-4 text-muted-foreground" />
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-left font-semibold hover:underline"
            >
              {deckSummary.name}
            </button>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatLabel(deckSummary.format)}
              </span>
              <ColorIdentity colors={deckSummary.identity?.length ? deckSummary.identity : deckSummary.colors} size="xs" />
            </div>
          </div>

          <dl className="hidden items-center gap-6 text-sm md:flex">
            <div className="text-right">
              <dt className="text-[10px] uppercase text-muted-foreground">Cards</dt>
              <dd className="font-semibold tabular-nums">{counts.total}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] uppercase text-muted-foreground">Avg MV</dt>
              <dd className="font-semibold tabular-nums">{avgMv.toFixed(2)}</dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] uppercase text-muted-foreground">Value</dt>
              <dd className="font-semibold tabular-nums">
                ${Math.round(deckSummary.economy?.priceUSD || 0).toLocaleString()}
              </dd>
            </div>
            <div className="text-right">
              <dt className="text-[10px] uppercase text-muted-foreground">Owned</dt>
              <dd className="font-semibold tabular-nums">{ownershipPct}%</dd>
            </div>
          </dl>

          <div className="flex items-center gap-1">
            {favoriteButton}
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {actionsMenu}
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- grid */
  return (
    <Card className={cn('flex flex-col overflow-hidden transition-colors hover:border-foreground/25', className)}>
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="relative flex gap-4 p-4">
          {/* The commander's own art, bled behind the header, so a tile reads as
              that specific deck before a word is read. */}
          {commanderImage && (
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
              <img src={commanderImage} alt="" className="h-full w-full scale-110 object-cover blur-2xl saturate-150 opacity-25" />
              <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/60" />
            </div>
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${deckSummary.name}`}
            className="group/cmd relative aspect-[5/7] w-[150px] flex-shrink-0 overflow-hidden rounded-xl bg-muted shadow-xl shadow-black/40 transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none sm:w-[190px]"
          >
            {commanderImage ? (
              <img
                src={commanderImage}
                alt={deckSummary.commander?.name ?? ''}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <Crown className="h-5 w-5" />
                <span className="text-[9px] uppercase tracking-wide">No commander</span>
              </span>
            )}
          </button>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start gap-1">
              <button
                type="button"
                onClick={onOpen}
                className="min-w-0 flex-1 truncate text-left text-base font-bold hover:underline"
              >
                {deckSummary.name}
              </button>
              {favoriteButton}
              {actionsMenu}
            </div>

            {deckSummary.commander?.name && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {deckSummary.commander.name}
              </p>
            )}

            <div className="mt-2">{badges}</div>

            <div className="mt-2">
              <ColorIdentity
                colors={deckSummary.identity?.length ? deckSummary.identity : deckSummary.colors}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Key numbers */}
        <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onAnalysis}
                  className="p-2 text-center transition-colors hover:bg-muted"
                >
                  <span className="block text-base font-bold tabular-nums">{counts.total}</span>
                  <span className="block text-[10px] text-muted-foreground">Cards</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{counts.unique} unique cards</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 text-center">
                  <span className="block text-base font-bold tabular-nums">
                    ${Math.round(deckSummary.economy?.priceUSD || 0).toLocaleString()}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">Value</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Sum of USD market prices for every card</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-2 text-center">
                  <span className="block text-base font-bold tabular-nums">{avgMv.toFixed(2)}</span>
                  <span className="block text-[10px] text-muted-foreground">Avg MV</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Average mana value, lands excluded</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onMissingCards}
                  className="p-2 text-center transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      'flex items-center justify-center text-base font-bold tabular-nums',
                      !isComplete && 'text-destructive'
                    )}
                  >
                    {isComplete ? <CheckCircle2 className="h-4 w-4" /> : missingCount}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {isComplete ? 'Complete' : 'Missing'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isComplete ? 'You own every card in this deck' : `${missingCount} cards needed`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="space-y-3 p-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Collection progress</span>
              <span className="font-medium tabular-nums">{ownershipPct}%</span>
            </div>
            <Progress value={ownershipPct} className="h-1.5" />
          </div>

        </div>

        <div className="mt-auto flex items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(deckSummary.updatedAt).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {counts.lands} lands
            </span>
          </div>

          <div className="flex items-center gap-1">
            {missingCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddMissingToWishlist}
                disabled={addingToWishlist}
                className="h-7 px-2 text-xs"
              >
                {addingToWishlist ? (
                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  <>
                    <Plus className="mr-1 h-3 w-3" />
                    Wishlist
                  </>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onAnalysis} className="h-7 px-2 text-xs">
              <BarChart3 className="mr-1 h-3 w-3" />
              Stats
            </Button>
            <Button size="sm" onClick={onEdit} className="h-7 px-3 text-xs">
              <Edit className="mr-1 h-3 w-3" />
              Edit
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DeckTile;
