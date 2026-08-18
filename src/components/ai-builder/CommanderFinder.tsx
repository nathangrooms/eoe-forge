import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManaPip, ManaCost } from '@/components/ui/mana-cost';
import {
  Search,
  Loader2,
  Target,
  Users,
  Zap,
  Shield,
  Scroll,
  Crown,
  Heart,
  Skull,
  Leaf,
  Droplet,
  Sparkles,
} from 'lucide-react';

const MANA_COLORS = [
  { color: 'W', name: 'White' },
  { color: 'U', name: 'Blue' },
  { color: 'B', name: 'Black' },
  { color: 'R', name: 'Red' },
  { color: 'G', name: 'Green' },
  { color: 'C', name: 'Colorless' },
];

/**
 * Oracle-text heuristics. Several of the originals matched almost nothing or
 * almost everything — `o:infinite` (no card prints the word), `o:counter`
 * (matches +1/+1 counters far more often than counterspells) and `o:wheels`
 * (not a term any card uses) have been replaced with phrases that appear in
 * real rules text.
 */
const PLAYSTYLES = [
  { value: 'aggro', label: 'Aggro', icon: Zap, description: 'Fast, attack-focused', keywords: '(o:haste OR o:"first strike" OR o:"double strike" OR o:"whenever ~ attacks")' },
  { value: 'voltron', label: 'Voltron', icon: Shield, description: 'Commander damage', keywords: '(o:equipment OR o:aura OR o:"attach" OR o:"equipped creature")' },
  { value: 'control', label: 'Control', icon: Target, description: 'Answers and disruption', keywords: '(o:"counter target spell" OR o:"destroy target" OR o:"exile target")' },
  { value: 'combo', label: 'Combo', icon: Sparkles, description: 'Engine and loop pieces', keywords: '(o:"untap target" OR o:"whenever you cast" OR o:"you may cast")' },
  { value: 'tokens', label: 'Tokens', icon: Users, description: 'Go wide with tokens', keywords: '(o:"create a token" OR o:"create x" OR o:"token creature")' },
  { value: 'aristocrats', label: 'Aristocrats', icon: Skull, description: 'Sacrifice for value', keywords: '(o:sacrifice OR o:"whenever a creature dies" OR o:"when this creature dies")' },
  { value: 'spellslinger', label: 'Spellslinger', icon: Scroll, description: 'Instants and sorceries', keywords: '(o:"instant or sorcery" OR o:prowess OR o:magecraft)' },
  { value: 'tribal', label: 'Tribal', icon: Crown, description: 'Creature-type synergy', keywords: '(o:"creature type" OR o:"creatures you control get")' },
  { value: 'lifegain', label: 'Lifegain', icon: Heart, description: 'Gain and drain', keywords: '(o:"gain life" OR o:lifelink OR o:"you gained life")' },
  { value: 'graveyard', label: 'Graveyard', icon: Skull, description: 'Recursion and reanimation', keywords: '(o:"from your graveyard" OR o:flashback OR o:"return target creature card")' },
  { value: 'ramp', label: 'Ramp / Lands', icon: Leaf, description: 'Mana and land matters', keywords: '(o:landfall OR o:"search your library for a" OR o:"add one mana")' },
  { value: 'draw', label: 'Card Draw', icon: Droplet, description: 'Refill your hand', keywords: '(o:"draw a card" OR o:"draw two cards" OR o:"draws a card")' },
];

/**
 * Magic creature types are singular — 'Creature — Elf Druid'. The previous
 * list used plurals ('Elves', 'Goblins'), and Scryfall's `t:` does substring
 * matching without lemmatisation, so 23 of these 24 buttons matched nothing.
 */
const TRIBAL_TYPES = [
  'Elf', 'Goblin', 'Zombie', 'Vampire', 'Dragon', 'Angel', 'Demon', 'Wizard',
  'Human', 'Merfolk', 'Soldier', 'Knight', 'Beast', 'Dinosaur', 'Sliver', 'Spirit',
  'Cat', 'Dog', 'Rat', 'Bird', 'Rogue', 'Warrior', 'Cleric', 'Shaman',
];

const CMC_RANGES = [
  { value: 'low', label: '1-3 MV', description: 'Early-game commander', min: 0, max: 3 },
  { value: 'mid', label: '4-5 MV', description: 'Mid-game value engine', min: 4, max: 5 },
  { value: 'high', label: '6+ MV', description: 'Late-game payoff', min: 6, max: 20 },
];

const SORT_OPTIONS = [
  { value: 'edhrec', label: 'EDHREC popularity' },
  { value: 'name', label: 'Name' },
  { value: 'cmc', label: 'Mana value' },
  { value: 'released', label: 'Newest' },
];

interface CommanderFinderProps {
  onSelectCommander: (commander: any) => void;
}

export function CommanderFinder({ onSelectCommander }: CommanderFinderProps) {
  const [finderColors, setFinderColors] = useState<string[]>([]);
  const [selectedPlaystyles, setSelectedPlaystyles] = useState<string[]>([]);
  const [selectedCmcRange, setSelectedCmcRange] = useState<string | null>(null);
  const [selectedTribal, setSelectedTribal] = useState<string | null>(null);
  const [partnerSearch, setPartnerSearch] = useState(false);
  const [sortOrder, setSortOrder] = useState('edhrec');

  const [finderResults, setFinderResults] = useState<any[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleColor = (color: string) => {
    setFinderColors(prev =>
      prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
    );
  };

  const togglePlaystyle = (value: string) => {
    setSelectedPlaystyles(prev =>
      prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value]
    );
  };

  const buildQuery = () => {
    // `is:commander` is Scryfall's own predicate for "can be your commander".
    // The old `t:legendary t:creature` missed every planeswalker commander,
    // every Background, and every legendary non-creature commander.
    let query = 'is:commander';

    if (finderColors.length > 0) {
      if (finderColors.includes('C') && finderColors.length === 1) {
        query += ' id:c';
      } else {
        const colorString = finderColors.filter(c => c !== 'C').sort().join('');
        if (colorString) query += ` id<=${colorString}`;
      }
    }

    if (selectedCmcRange) {
      const range = CMC_RANGES.find(r => r.value === selectedCmcRange);
      if (range) query += ` cmc>=${range.min} cmc<=${range.max}`;
    }

    if (selectedTribal) {
      query += ` t:${selectedTribal}`;
    }

    if (partnerSearch) {
      // Covers Partner, Partner with, Friends forever, Doctor's companion and
      // Background pairings — `o:partner` alone missed three of the five.
      query += ' (o:partner OR o:"friends forever" OR o:"doctor\'s companion" OR o:"choose a background")';
    }

    if (selectedPlaystyles.length > 0) {
      const groups = selectedPlaystyles
        .map(style => PLAYSTYLES.find(p => p.value === style)?.keywords || '')
        .filter(Boolean);

      if (groups.length === 1) query += ` ${groups[0]}`;
      else if (groups.length > 1) query += ` (${groups.join(' OR ')})`;
    }

    return query;
  };

  const runSearch = async (url: string, append: boolean) => {
    try {
      const response = await fetch(url);

      if (response.status === 404) {
        // Scryfall returns 404 for a valid query with zero matches.
        if (!append) {
          setFinderResults([]);
          setTotalResults(0);
          setNextPage(null);
        }
        return;
      }

      if (!response.ok) throw new Error(`Scryfall returned ${response.status}`);

      const data = await response.json();
      const cards = data.data || [];

      setFinderResults(prev => (append ? [...prev, ...cards] : cards));
      setTotalResults(data.total_cards ?? cards.length);
      setNextPage(data.has_more ? data.next_page : null);
    } catch (error: any) {
      console.error('Commander finder search error:', error);
      setSearchError(error?.message || 'Search failed. Please try again.');
      if (!append) {
        setFinderResults([]);
        setTotalResults(0);
        setNextPage(null);
      }
    }
  };

  const searchCommanders = async () => {
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
      buildQuery()
    )}&unique=cards&order=${sortOrder}`;

    await runSearch(url, false);
    setSearching(false);
  };

  const loadMore = async () => {
    if (!nextPage) return;
    setLoadingMore(true);
    await runSearch(nextPage, true);
    setLoadingMore(false);
  };

  const clearAll = () => {
    setFinderColors([]);
    setSelectedPlaystyles([]);
    setSelectedCmcRange(null);
    setSelectedTribal(null);
    setPartnerSearch(false);
    setFinderResults([]);
    setTotalResults(0);
    setNextPage(null);
    setHasSearched(false);
    setSearchError(null);
  };

  const activeFiltersCount =
    finderColors.length +
    selectedPlaystyles.length +
    (selectedCmcRange ? 1 : 0) +
    (selectedTribal ? 1 : 0) +
    (partnerSearch ? 1 : 0);

  return (
    <Card className="mt-8">
      <CardContent className="p-6">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h4 className="text-base font-semibold tracking-tight">Not sure which commander?</h4>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary">
              {activeFiltersCount} filter{activeFiltersCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Filter by colour identity, playstyle and mana value to find a legal commander.
        </p>

        <div className="space-y-6">
          {/* Colour identity */}
          <div>
            <Label className="mb-3 block text-sm font-medium">Colour identity</Label>
            <div className="flex flex-wrap gap-2">
              {MANA_COLORS.map(({ color, name }) => {
                const active = finderColors.includes(color);
                return (
                  <Button
                    key={color}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleColor(color)}
                    aria-pressed={active}
                  >
                    <ManaPip symbol={color} size="xs" className="mr-1.5" />
                    {name}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Playstyle */}
          <div>
            <Label className="mb-3 block text-sm font-medium">Playstyle</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {PLAYSTYLES.map(({ value, label, icon: Icon, description }) => {
                const active = selectedPlaystyles.includes(value);
                return (
                  <Button
                    key={value}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => togglePlaystyle(value)}
                    aria-pressed={active}
                    className="h-auto flex-col items-center px-2 py-3"
                    title={description}
                  >
                    <Icon className="mb-1 h-4 w-4" />
                    <span className="text-xs">{label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Advanced */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? 'Hide advanced filters' : 'Show advanced filters'}
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-6 rounded-lg border border-border p-4">
              <div>
                <Label className="mb-3 block text-sm font-medium">Commander mana value</Label>
                <div className="flex flex-wrap gap-2">
                  {CMC_RANGES.map(({ value, label, description }) => (
                    <Button
                      key={value}
                      variant={selectedCmcRange === value ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={selectedCmcRange === value}
                      onClick={() => setSelectedCmcRange(selectedCmcRange === value ? null : value)}
                      title={description}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 block text-sm font-medium">Creature type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TRIBAL_TYPES.map(tribe => (
                    <Button
                      key={tribe}
                      variant={selectedTribal === tribe ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={selectedTribal === tribe}
                      onClick={() => setSelectedTribal(selectedTribal === tribe ? null : tribe)}
                      className="h-7 text-xs"
                    >
                      {tribe}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={partnerSearch ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={partnerSearch}
                  onClick={() => setPartnerSearch(!partnerSearch)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Pairable commanders only
                </Button>
                <span className="text-xs text-muted-foreground">
                  Partner, Friends forever, Doctor's companion and Backgrounds
                </span>
              </div>
            </div>
          )}

          {/* Search row */}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={searchCommanders} disabled={searching}>
              {searching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Find commanders
                </>
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Label htmlFor="commander-sort" className="text-xs text-muted-foreground">
                Sort
              </Label>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger id="commander-sort" className="h-9 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>

          {/* Results */}
          {searchError && (
            <p className="rounded-lg border border-border p-4 text-sm text-destructive">
              {searchError}
            </p>
          )}

          {finderResults.length > 0 && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {finderResults.length} of {totalResults.toLocaleString()} commanders
              </p>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {finderResults.map((card: any) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onSelectCommander(card)}
                    className="group space-y-2 text-left"
                  >
                    <div className="overflow-hidden rounded-lg border border-border transition-colors group-hover:border-foreground">
                      <img
                        src={
                          card.image_uris?.normal ||
                          card.card_faces?.[0]?.image_uris?.normal ||
                          '/placeholder.svg'
                        }
                        alt={card.name}
                        className="aspect-[488/680] w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <ManaCost cost={card.mana_cost} size="xs" />
                        {typeof card.edhrec_rank === 'number' && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            #{card.edhrec_rank.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {nextPage && (
                <div className="flex justify-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      'Load more'
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Empty states — 'not searched yet' and 'no matches' are different. */}
          {!searching && !searchError && finderResults.length === 0 && (
            <div className="border-t border-border py-8 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 h-6 w-6 opacity-50" />
              {hasSearched
                ? 'No commanders match those filters. Try removing one.'
                : 'Choose your filters, then run the search.'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
