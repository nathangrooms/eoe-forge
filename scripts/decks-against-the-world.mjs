/**
 * Two more commanders through the DEPLOYED generator, chosen by a player who
 * did not pick the first ten.
 *
 * Feather is two colours and a razor sharp archetype: cheap instants that
 * target your own creatures, and nothing else. Yawgmoth is mono black, so it
 * is the control on the colour cliff, and he IS the sacrifice outlet, which
 * means the deck has to bring the fodder. Both are decks a Commander player
 * can grade in one read, which is the point.
 *
 *   node scripts/decks-against-the-world.mjs
 *   node scripts/decks-against-the-world.mjs feather 4
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

export const MINE = [
  {
    key: 'feather',
    name: 'Feather, the Redeemed',
    id: 'be4e8bb8-fa07-4858-aafb-7eab7f01ddae',
    type_line: 'Legendary Creature — Angel',
    color_identity: ['R', 'W'],
    colors: ['R', 'W'],
    archetype: 'value',
    style: 'spells',
    why: 'Returns any instant or sorcery you cast targeting your own creature. The deck is cheap tricks and heroic bodies or it is nothing.',
  },
  {
    key: 'yawgmoth',
    name: 'Yawgmoth, Thran Physician',
    id: '6ed83401-0b7e-48c7-b1a4-8e97aec29960',
    type_line: 'Legendary Creature — Human Cleric',
    color_identity: ['B'],
    colors: ['B'],
    archetype: 'aristocrats',
    style: 'creatures',
    why: 'He is the sacrifice outlet, so the deck has to supply bodies that want to die and drains that pay for it. Mono black, so no colour cliff.',
  },
  {
    key: 'tatyova',
    name: 'Tatyova, Benthic Druid',
    id: 'a8953672-b1ae-4f0a-8107-e28322fc16b7',
    type_line: 'Legendary Creature — Merfolk Druid',
    color_identity: ['G', 'U'],
    colors: ['G', 'U'],
    archetype: 'value',
    style: 'balanced',
    why: 'Spare, in case a two colour build keeps hitting the compute wall.',
  },
];

async function buildOne(entry, attempt) {
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

  const started = Date.now();
  let res, text;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ANON}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (err) {
    return { attempt, ok: false, ms: Date.now() - started, transportError: String(err) };
  }
  const ms = Date.now() - started;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a non-JSON body is itself the finding */
  }
  return {
    attempt,
    ok: res.ok,
    status: res.status,
    engineVersion: res.headers.get('x-engine-version'),
    ms,
    body: json,
    raw: json ? null : text.slice(0, 600),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv[2];
  const tries = Number(process.argv[3] ?? 4);
  const list = only ? MINE.filter(e => e.key === only) : MINE.slice(0, 2);

  const index = [];
  for (const entry of list) {
    const attempts = [];
    let kept = null;
    for (let i = 1; i <= tries; i++) {
      process.stderr.write(`${entry.key} attempt ${i} … `);
      const out = await buildOne(entry, i);
      const n = out.body?.result?.deck?.length ?? 0;
      process.stderr.write(
        `${out.ok ? 'ok' : `FAILED ${out.status} ${out.body?.error ?? ''}`} ${out.ms}ms ${out.engineVersion ?? 'no header'} entries=${n}\n`
      );
      attempts.push({
        attempt: i,
        ok: out.ok,
        status: out.status ?? null,
        ms: out.ms,
        engineVersion: out.engineVersion ?? null,
        error: out.body?.error ?? out.transportError ?? out.raw ?? null,
      });
      if (out.ok && !kept) {
        kept = out;
        fs.writeFileSync(path.join(OUT, `${entry.key}.deck.json`), JSON.stringify(out.body, null, 2));
      }
    }
    fs.writeFileSync(path.join(OUT, `${entry.key}.attempts.json`), JSON.stringify(attempts, null, 2));
    index.push({
      key: entry.key,
      name: entry.name,
      colours: entry.color_identity.length,
      ok: attempts.filter(a => a.ok).length,
      of: attempts.length,
      engineVersion: attempts.find(a => a.engineVersion)?.engineVersion ?? null,
      msOk: attempts.filter(a => a.ok).map(a => a.ms),
      msFail: attempts.filter(a => !a.ok).map(a => a.ms),
      failCodes: [...new Set(attempts.filter(a => !a.ok).map(a => `${a.status} ${a.error ?? ''}`.trim()))],
      haveDeck: !!kept,
    });
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log(JSON.stringify(index, null, 2));
}

main();
