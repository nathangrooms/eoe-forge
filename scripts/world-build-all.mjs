/**
 * Build every commander under review against ONE deployed build.
 *
 * `ai-deck-builder-v2` was redeployed at 2026-08-29T22:11:28Z carrying the
 * three-colour and plan-fallback fixes, which means every deck measured before
 * that came out of a build a player can no longer reach. Mixing the two sets
 * would produce a table where each row answers a different question, so this
 * rebuilds all of them and stamps the function version on the run.
 *
 *   node scripts/world-build-all.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
/* The publishable (anon) key. Client-visible by design, same value as
 * `src/integrations/supabase/client.ts`. */
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-deck-builder-v2`;
const OUT = path.resolve('.shots/world');

const { ROSTER, YURIKO_CURLY } = await import('./generator-roster.mjs');
const { MINE } = await import('./decks-against-the-world.mjs');

/** Two three-plus-colour commanders nobody in the earlier passes touched. */
const EXTRA = [
  {
    key: 'muldrotha',
    name: 'Muldrotha, the Gravetide',
    id: '705b4d97-2f50-47f7-9053-d748f4337553',
    type_line: 'Legendary Creature — Elemental Avatar',
    color_identity: ['B', 'G', 'U'],
    colors: ['B', 'G', 'U'],
    archetype: 'value',
    style: 'balanced',
  },
  {
    key: 'alela',
    name: 'Alela, Artful Provocateur',
    id: '43d28c05-0ba1-4afa-a784-b71741375507',
    type_line: 'Legendary Creature — Faerie Warlock',
    color_identity: ['B', 'U', 'W'],
    colors: ['B', 'U', 'W'],
    archetype: 'tokens',
    style: 'balanced',
  },
  {
    key: 'najeela',
    name: 'Najeela, the Blade-Blossom',
    id: '08eb1bef-b00d-490b-a631-2849e0d1fd8e',
    type_line: 'Legendary Creature — Human Warrior',
    color_identity: ['B', 'G', 'R', 'U', 'W'],
    colors: ['R'],
    archetype: 'aggro',
    style: 'creatures',
  },
];

const LIST = [...ROSTER, YURIKO_CURLY, ...MINE.slice(0, 2), ...EXTRA];

async function buildOne(entry, tries = 3) {
  const body = {
    commander: {
      id: entry.id,
      name: entry.name,
      type_line: entry.type_line,
      color_identity: entry.color_identity,
      colors: entry.colors,
    },
    archetype: entry.archetype,
    style: entry.style,
    powerLevel: 7,
    useAIPlanning: true,
    includeLands: true,
  };
  const attempts = [];
  let kept = null;
  for (let i = 1; i <= tries; i++) {
    const started = Date.now();
    let res, text;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (err) {
      attempts.push({ i, status: 'transport', ms: Date.now() - started, error: String(err) });
      continue;
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* a non-JSON body is itself the finding */
    }
    attempts.push({
      i,
      status: res.status,
      ms: Date.now() - started,
      ver: res.headers.get('x-engine-version'),
      error: res.ok ? null : (json?.error?.code ?? json?.error ?? text.slice(0, 80)),
    });
    if (res.ok && !kept) kept = json;
    if (kept) break; // one good deck per commander is all the audit needs
  }
  return { attempts, kept };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const index = [];
  for (const entry of LIST) {
    process.stderr.write(`${entry.key.padEnd(12)} `);
    const { attempts, kept } = await buildOne(entry);
    if (kept) fs.writeFileSync(path.join(OUT, `${entry.key}.deck.json`), JSON.stringify(kept, null, 2));
    const ok = attempts.filter(a => a.status === 200).length;
    process.stderr.write(
      `${ok}/${attempts.length}  ${attempts.map(a => `${a.status}/${a.ms}ms`).join(' ')}  ${attempts.find(a => a.error)?.error ?? ''}\n`
    );
    index.push({
      key: entry.key,
      name: entry.name,
      colours: entry.color_identity.length,
      archetype: entry.archetype,
      ok,
      of: attempts.length,
      ver: attempts.find(a => a.ver)?.ver ?? null,
      attempts,
      haveDeck: !!kept,
    });
  }
  fs.writeFileSync(path.join(OUT, 'build-index.json'), JSON.stringify(index, null, 2));
  console.log(
    index.map(r => `${r.key.padEnd(12)} c=${r.colours} ${r.ok}/${r.of} ${r.haveDeck ? 'deck' : 'NO DECK'}`).join('\n')
  );
}

main();
