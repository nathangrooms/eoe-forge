/**
 * The Scryfall query the commander finder builds.
 *
 * This used to live inside `CommanderFinder.tsx` alongside its markup, which
 * meant the page could not run a filtered search on its own — the results grid
 * was trapped inside the filter card. The filters are now a right-hand panel
 * (design law item 3) and the results render full width on the page, so the
 * query has to be shared. Every heuristic below is carried over verbatim from
 * the original component; nothing was dropped in the move.
 */

export interface CommanderFilters {
  colors: string[];
  playstyles: string[];
  cmcRange: string | null;
  tribal: string | null;
  /** Partner / Friends forever / Doctor's companion / Backgrounds. */
  pairable: boolean;
}

export const EMPTY_COMMANDER_FILTERS: CommanderFilters = {
  colors: [],
  playstyles: [],
  cmcRange: null,
  tribal: null,
  pairable: false,
};

export const MANA_COLORS = [
  { color: 'W', name: 'White' },
  { color: 'U', name: 'Blue' },
  { color: 'B', name: 'Black' },
  { color: 'R', name: 'Red' },
  { color: 'G', name: 'Green' },
  { color: 'C', name: 'Colorless' },
] as const;

/**
 * Oracle-text heuristics. Several of the originals matched almost nothing or
 * almost everything — `o:infinite` (no card prints the word), `o:counter`
 * (matches +1/+1 counters far more often than counterspells) and `o:wheels`
 * (not a term any card uses) have been replaced with phrases that appear in
 * real rules text.
 */
export const PLAYSTYLES = [
  { value: 'aggro', label: 'Aggro', description: 'Fast, attack-focused', keywords: '(o:haste OR o:"first strike" OR o:"double strike" OR o:"whenever ~ attacks")' },
  { value: 'voltron', label: 'Voltron', description: 'Commander damage', keywords: '(o:equipment OR o:aura OR o:"attach" OR o:"equipped creature")' },
  { value: 'control', label: 'Control', description: 'Answers and disruption', keywords: '(o:"counter target spell" OR o:"destroy target" OR o:"exile target")' },
  { value: 'combo', label: 'Combo', description: 'Engine and loop pieces', keywords: '(o:"untap target" OR o:"whenever you cast" OR o:"you may cast")' },
  { value: 'tokens', label: 'Tokens', description: 'Go wide with tokens', keywords: '(o:"create a token" OR o:"create x" OR o:"token creature")' },
  { value: 'aristocrats', label: 'Aristocrats', description: 'Sacrifice for value', keywords: '(o:sacrifice OR o:"whenever a creature dies" OR o:"when this creature dies")' },
  { value: 'spellslinger', label: 'Spellslinger', description: 'Instants and sorceries', keywords: '(o:"instant or sorcery" OR o:prowess OR o:magecraft)' },
  { value: 'tribal', label: 'Tribal', description: 'Creature-type synergy', keywords: '(o:"creature type" OR o:"creatures you control get")' },
  { value: 'lifegain', label: 'Lifegain', description: 'Gain and drain', keywords: '(o:"gain life" OR o:lifelink OR o:"you gained life")' },
  { value: 'graveyard', label: 'Graveyard', description: 'Recursion and reanimation', keywords: '(o:"from your graveyard" OR o:flashback OR o:"return target creature card")' },
  { value: 'ramp', label: 'Ramp / Lands', description: 'Mana and land matters', keywords: '(o:landfall OR o:"search your library for a" OR o:"add one mana")' },
  { value: 'draw', label: 'Card Draw', description: 'Refill your hand', keywords: '(o:"draw a card" OR o:"draw two cards" OR o:"draws a card")' },
] as const;

/**
 * Magic creature types are singular — 'Creature — Elf Druid'. The previous
 * list used plurals ('Elves', 'Goblins'), and Scryfall's `t:` does substring
 * matching without lemmatisation, so 23 of these 24 buttons matched nothing.
 */
export const TRIBAL_TYPES = [
  'Elf', 'Goblin', 'Zombie', 'Vampire', 'Dragon', 'Angel', 'Demon', 'Wizard',
  'Human', 'Merfolk', 'Soldier', 'Knight', 'Beast', 'Dinosaur', 'Sliver', 'Spirit',
  'Cat', 'Dog', 'Rat', 'Bird', 'Rogue', 'Warrior', 'Cleric', 'Shaman',
] as const;

export const CMC_RANGES = [
  { value: 'low', label: '1-3 MV', description: 'Early-game commander', min: 0, max: 3 },
  { value: 'mid', label: '4-5 MV', description: 'Mid-game value engine', min: 4, max: 5 },
  { value: 'high', label: '6+ MV', description: 'Late-game payoff', min: 6, max: 20 },
] as const;

export const SORT_OPTIONS = [
  { value: 'edhrec', label: 'EDHREC popularity' },
  { value: 'name', label: 'Name' },
  { value: 'cmc', label: 'Mana value' },
  { value: 'released', label: 'Newest' },
] as const;

export function countActiveFilters(f: CommanderFilters): number {
  return (
    f.colors.length +
    f.playstyles.length +
    (f.cmcRange ? 1 : 0) +
    (f.tribal ? 1 : 0) +
    (f.pairable ? 1 : 0)
  );
}

/**
 * `is:commander` is Scryfall's own predicate for "can be your commander". The
 * old `t:legendary t:creature` missed every planeswalker commander, every
 * Background, and every legendary non-creature commander.
 */
export function buildCommanderQuery(f: CommanderFilters): string {
  let query = 'is:commander';

  if (f.colors.length > 0) {
    if (f.colors.includes('C') && f.colors.length === 1) {
      query += ' id:c';
    } else {
      const colorString = f.colors.filter(c => c !== 'C').sort().join('');
      if (colorString) query += ` id<=${colorString}`;
    }
  }

  if (f.cmcRange) {
    const range = CMC_RANGES.find(r => r.value === f.cmcRange);
    if (range) query += ` cmc>=${range.min} cmc<=${range.max}`;
  }

  if (f.tribal) query += ` t:${f.tribal}`;

  if (f.pairable) {
    // Covers Partner, Partner with, Friends forever, Doctor's companion and
    // Background pairings — `o:partner` alone missed three of the five.
    query += ' (o:partner OR o:"friends forever" OR o:"doctor\'s companion" OR o:"choose a background")';
  }

  if (f.playstyles.length > 0) {
    const groups = f.playstyles
      .map(style => PLAYSTYLES.find(p => p.value === style)?.keywords || '')
      .filter(Boolean);

    if (groups.length === 1) query += ` ${groups[0]}`;
    else if (groups.length > 1) query += ` (${groups.join(' OR ')})`;
  }

  return query;
}

/** Human-readable summary of what the grid is currently showing. */
export function describeFilters(f: CommanderFilters): string {
  const parts: string[] = [];
  if (f.colors.length) {
    parts.push(f.colors.join(''));
  }
  if (f.tribal) parts.push(f.tribal);
  for (const p of f.playstyles) {
    const style = PLAYSTYLES.find(s => s.value === p);
    if (style) parts.push(style.label);
  }
  if (f.cmcRange) {
    const range = CMC_RANGES.find(r => r.value === f.cmcRange);
    if (range) parts.push(range.label);
  }
  if (f.pairable) parts.push('Pairable');
  return parts.join(' · ');
}

export function commanderSearchUrl(query: string, order: string): string {
  return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=${order}`;
}
