/**
 * Turn the names in an answer into real cards.
 *
 * The old function only attached cards when a literal "Referenced Cards:" line
 * was appended. When it was not, nothing was attached, which is what the owner
 * saw: "didnt attach any reference cards". Making the answer depend on a
 * formatting ritual is not a feature, it is a failure mode with a nice name.
 *
 * So the names are pulled out of the prose itself and checked against the `cards`
 * table, which is the same catalogue every other screen renders from. Two things
 * follow. A card the answer mentions gets its art whether or not the ritual was
 * performed, and a card that does not exist resolves to nothing and is quietly
 * not shown.
 */

export interface ResolvedCard {
  id: string;
  name: string;
  set: string | null;
  collector_number: string | null;
  image_uri: string | null;
  image_uris: Record<string, string> | null;
  mana_cost: string | null;
  type_line: string | null;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  cmc: number | null;
  colors: string[] | null;
  rarity: string | null;
  prices: Record<string, string | null> | null;
}

/**
 * Words that look like card names because they are bold or lead a bullet, but
 * are section furniture. Every one of these is also a real Magic card name or
 * close to one, which is exactly why they have to be listed rather than guessed.
 */
const NOT_A_CARD = new Set([
  'ramp', 'removal', 'card draw', 'draw', 'lands', 'land', 'creatures', 'creature',
  'artifacts', 'enchantments', 'instants', 'sorceries', 'planeswalkers',
  'why', 'what', 'how', 'cut', 'cuts', 'add', 'swap', 'swaps', 'upgrade', 'upgrades',
  'budget', 'verdict', 'summary', 'strategy', 'synergy', 'combo', 'combos',
  'win condition', 'win conditions', 'mana base', 'manabase', 'curve', 'mana curve',
  'strengths', 'weaknesses', 'notes', 'result', 'commander', 'total', 'name', 'cost',
  'keep', 'replace', 'replacement', 'replacements', 'target', 'targets', 'reason',
  'the deck', 'your deck', 'this deck', 'colour', 'color', 'colours', 'colors',
  'tapped', 'untapped', 'price', 'sources', 'fixing', 'utility', 'basics',
]);

/** Every place a card name plausibly appears in a markdown answer. */
const PATTERNS: RegExp[] = [
  /\[\[([^\]\n]{2,60})\]\]/g,               // [[Card Name]]
  /\*\*([^*\n]{2,60})\*\*/g,                // **Card Name**
  /(?:^|\n)\s*[-*•]\s*([^:\n(]{2,60}?)\s*(?=[:(\n]|$)/g,   // - Card Name: reason
  /(?:^|\n)\s*\d+[.)]\s*([^:\n(]{2,60}?)\s*(?=[:(\n]|$)/g, // 1. Card Name: reason
  /(?:^|\n)\|\s*([^|\n]{2,60}?)\s*\|/g,     // | Card Name | ... |
  /"([^"\n]{2,60})"/g,                       // "Card Name"
];

const REFERENCED = /Referenced Cards?:\s*([^\n]*(?:\n(?!\n)[^\n]*)*)/i;

/**
 * Card names in running prose.
 *
 * The markdown patterns above only find a name when it was decorated. Most of
 * the time it is not: "Shock lands like Steam Vents, Breeding Pool and Sacred
 * Foundry" has three real cards in it and no formatting at all.
 *
 * So every run of capitalised words is treated as a possible name and every
 * contiguous phrase inside it is offered up. Almost all of them are nonsense.
 * That is fine, because the catalogue is the judge: a phrase that is not a card
 * matches no row and disappears. Longest phrases go first so "Ajani, Sleeper
 * Agent" is preferred over "Ajani".
 */
const CONNECTORS = new Set(['of', 'the', 'and', 'to', 'in', 'a', 'an', 'from', 'for', 'with', 'on']);
const MAX_WORDS = 6;

function prosePhrases(text: string): string[] {
  const stripped = text.replace(/[*_`#>|]/g, ' ');
  const out: string[] = [];

  for (const sentence of stripped.split(/[\n.;:!?]/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    let run: string[] = [];
    let runStart = -1;

    const flush = () => {
      if (run.length) {
        /* A lone capitalised word at the start of a sentence is usually just a
           sentence. "Shock lands like Steam Vents" would otherwise attach the
           card Shock, which is worse than attaching nothing. Inside a sentence
           a capital is a name. */
        const atSentenceStart = runStart === 0;
        const shortest = run.length === 1 && atSentenceStart ? 2 : 1;

        // Longest first, so a full name beats its own first word.
        for (let len = Math.min(MAX_WORDS, run.length); len >= shortest; len--) {
          for (let start = 0; start + len <= run.length; start++) {
            const phrase = run.slice(start, start + len).join(' ').replace(/,$/, '').trim();
            if (phrase.length >= 3) out.push(phrase);
          }
        }
      }
      run = [];
      runStart = -1;
    };

    words.forEach((word, index) => {
      const bare = word.replace(/^[^\w'’]+/, '').replace(/[^\w'’,]+$/, '');
      if (!bare) { flush(); return; }
      const capitalised = /^[A-Z]/.test(bare);
      const connector = CONNECTORS.has(bare.replace(/,$/, '').toLowerCase());
      if (capitalised || (connector && run.length)) {
        if (!run.length) runStart = index;
        run.push(bare);
      } else {
        flush();
      }
    });
    flush();
  }

  return out;
}

/** Strip the decoration a name picks up in prose. */
function clean(raw: string): string {
  return raw
    .replace(/^\s*\d+\s*[xX]\s+/, '')          // "2x Sol Ring"
    .replace(/^[-*•\s]+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s*\([^)]*\)\s*$/, '')           // trailing "(2 MV)"
    .replace(/\s*\{[^}]*\}\s*/g, ' ')          // mana symbols
    .replace(/[.,;:!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Candidate names, in the order they appear in the answer.
 *
 * `explicitCount` is how many of the leading entries came from markdown written
 * on purpose (bold, brackets, quotes, a table cell, a bullet lead). Those are
 * worth an extra query each when they do not resolve. The rest are scraped out
 * of prose and are cheap guesses.
 */
export function extractCardNames(text: string): { names: string[]; explicitCount: number } {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const name = clean(raw);
    if (name.length < 3 || name.length > 60) return;
    if (NOT_A_CARD.has(name.toLowerCase())) return;
    if (!/[A-Za-z]/.test(name)) return;
    // A sentence, not a name.
    if (name.split(/\s+/).length > 7) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(name);
  };

  // A "Referenced Cards:" line is still honoured when one is written, it is just
  // no longer the only way in.
  const ref = text.match(REFERENCED);
  if (ref) {
    ref[1].split(/[;\n]|\s+•\s+/).forEach(push);
  }

  const body = ref ? text.replace(REFERENCED, '') : text;
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(body)) !== null) push(m[1]);
  }

  const explicitCount = ordered.length;

  // Then the prose. Cheap to generate, and the catalogue throws out the rubbish.
  for (const phrase of prosePhrases(body)) push(phrase);

  return { names: ordered, explicitCount };
}

/** Prefer a printing that actually has art, and a normal one over a promo. */
function scorePrinting(row: any): number {
  let score = 0;
  if (!row.image_uris || !(row.image_uris.normal || row.image_uris.large || row.image_uris.png)) score += 100;
  if (row.promo) score += 10;
  if (row.variation) score += 5;
  if (row.border_color && row.border_color !== 'black') score += 3;
  return score;
}

function shape(row: any): ResolvedCard {
  const uris = row.image_uris ?? null;
  return {
    id: row.id,
    name: row.name,
    set: row.set_code ?? null,
    collector_number: row.collector_number ?? null,
    image_uri: uris?.normal ?? uris?.large ?? uris?.png ?? null,
    image_uris: uris,
    mana_cost: row.mana_cost ?? null,
    type_line: row.type_line ?? null,
    oracle_text: row.oracle_text ?? null,
    power: row.power ?? null,
    toughness: row.toughness ?? null,
    cmc: row.cmc ?? null,
    colors: row.colors ?? null,
    rarity: row.rarity ?? null,
    prices: row.prices ?? null,
  };
}

const COLUMNS =
  'id, name, set_code, collector_number, type_line, mana_cost, cmc, colors, color_identity, ' +
  'rarity, image_uris, oracle_text, power, toughness, prices, promo, variation, border_color';

/**
 * Names in, real cards out. Anything the catalogue does not know is dropped.
 */
export async function resolveCards(
  supabase: any,
  names: string[],
  explicitCount = 0,
  limit = 12
): Promise<ResolvedCard[]> {
  if (!names.length) return [];

  /* Scanning prose produces a lot of candidates, most of them not cards. The
     catalogue is what decides, so they are simply asked about in batches. */
  const wanted = names.slice(0, 600);
  const byName = new Map<string, any>();

  const absorb = (rows: any[] | null) => {
    for (const row of rows ?? []) {
      const key = String(row.name).toLowerCase();
      const current = byName.get(key);
      if (!current || scorePrinting(row) < scorePrinting(current)) byName.set(key, row);
    }
  };

  /* Every batch's error is reported. This used to be `const { data } = ...`,
     which threw the error away, so a catalogue lookup that failed and a set of
     names that are not cards produced exactly the same outcome: no art, no
     message, nothing in the logs to say which had happened. That is how a run
     that resolved 0 of 86 real card names looked identical to a healthy one. */
  let failed = 0;
  for (let i = 0; i < wanted.length; i += 150) {
    const { data, error } = await supabase
      .from('cards')
      .select(COLUMNS)
      .in('name', wanted.slice(i, i + 150));
    if (error) {
      failed++;
      console.error(`card lookup batch ${i / 150} failed:`, error.message);
      continue;
    }
    absorb(data);
  }
  if (failed) console.error(`${failed} card lookup batch(es) failed; some art will be missing`);

  /* A modal or split card is stored under both halves: "Agadeem's Awakening //
     Agadeem, the Undercrypt". Nobody writes that in a sentence. This costs a
     query each, so it is only tried on names that were marked up deliberately,
     never on the scrapings from prose. */
  const halves = new Map<string, string>();
  const explicit = wanted.slice(0, explicitCount).filter(n => !byName.has(n.toLowerCase()));
  for (const name of explicit.slice(0, 6)) {
    const { data, error } = await supabase
      .from('cards')
      .select(COLUMNS)
      .or(`name.ilike.${escapeFilter(name)} // %,name.ilike.% // ${escapeFilter(name)}`)
      .limit(6);
    if (error) console.error(`split-card lookup for "${name}" failed:`, error.message);
    if (data?.length) {
      absorb(data);
      halves.set(name.toLowerCase(), String(data[0].name).toLowerCase());
    }
  }

  const out: ResolvedCard[] = [];
  const emitted = new Set<string>();
  for (const name of wanted) {
    const key = halves.get(name.toLowerCase()) ?? name.toLowerCase();
    const row = byName.get(key);
    if (!row || emitted.has(row.id)) continue;
    /* "Ajani" inside "Ajani, Sleeper Agent" is the same mention twice. Longer
       phrases are offered first, so anything contained in a card already
       attached is a fragment of it. */
    const nameLower = String(row.name).toLowerCase();
    if (out.some(c => c.name.toLowerCase().includes(nameLower))) continue;
    emitted.add(row.id);
    out.push(shape(row));
    if (out.length >= limit) break;
  }
  return out;
}

/** PostgREST splits `or=` on commas, and plenty of card names contain one. */
function escapeFilter(value: string): string {
  return value.replace(/[,()]/g, '_');
}
