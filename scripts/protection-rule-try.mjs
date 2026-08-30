/**
 * What would a `protection` role actually admit, and what would it wrongly
 * admit? Measured over the real catalogue before a line of it is written.
 *
 * WHY THE MEASUREMENT COMES FIRST
 * -------------------------------
 * `ROLE_FACETS` in `behaviour.ts` carries two long comments about rules that
 * looked right and were wrong in both directions at once: a mass-pump rule that
 * made Adventuring Gear a win condition and refused Craterhoof Behemoth, and a
 * poison rule that made a 1/1 Rat one of Kaalia's three ways to end a game.
 * Both were caught by naming the cards. So this names the cards.
 *
 * THE CANDIDATE RULE
 * ------------------
 * A card protects your commander when it GRANTS one of the protective keywords
 * to something else. It does not protect your commander by HAVING one:
 * Slippery Bogle has hexproof and does nothing for your commander, and a rule
 * that cannot tell Slippery Bogle from Swiftfoot Boots is the Blightbelly Rat
 * mistake in a different word.
 *
 * So: one of the protective keywords, AND evidence of granting.
 *
 *   grants  `eff:attach`            equipment and auras: Boots, Greaves, Robe
 *           not a creature type     instants, sorceries, enchantments that grant
 *
 * The second half is deliberately crude and the output is what says whether it
 * can stay that way.
 *
 * Run: node scripts/protection-rule-try.mjs
 */
import process from 'node:process';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const KEYWORDS = ['kw:hexproof', 'kw:shroud', 'kw:ward', 'kw:indestructible', 'kw:protection'];

const isCreature = t => /\bcreature\b/i.test(String(t ?? '').split('//')[0]) && !/\bland\b/i.test(String(t ?? '').split('//')[0]);

/**
 * The rule under test, second draft.
 *
 * The first draft said "has a protective keyword and is not a creature", and
 * the catalogue answered immediately: it admitted Darksteel Citadel, Lotus
 * Field, Cascading Cataracts, Darksteel Ingot and six artifact Bridges. Every
 * one of those HAS the keyword. None of them GRANTS it, and a rule that cannot
 * tell Darksteel Citadel from Swiftfoot Boots is the Blightbelly Rat mistake
 * in a different word.
 *
 * The signal that separates them was already in the vocabulary:
 *
 *   Darksteel Citadel  kw:indestructible                                     bare
 *   Slippery Bogle     kw:hexproof                                           bare
 *   Swiftfoot Boots    kw:hexproof   + eff:attach + cares:type:creature      granted
 *   Eldrazi Monument   kw:indestructible + scope:all + cares:type:creature   granted
 *   Darksteel Forge    kw:indestructible + scope:all + cares:type:artifact   granted, but to ARTIFACTS
 *
 * A granted keyword arrives with something saying WHO it is granted to. A
 * keyword the card simply has arrives alone. And the third column is why the
 * subject matters as well as the grant: your commander is a creature, so
 * Darksteel Forge protects your artifacts and not your commander.
 */
const GRANTS_TO_A_CREATURE = row => {
  const f = row.facets ?? [];
  const grants = f.includes('eff:attach') || f.includes('scope:all');
  const toCreatures = f.includes('cares:type:creature') || f.includes('cares:type:permanent');
  return grants && toCreatures;
};

function qualifies(row) {
  const f = row.facets ?? [];
  if (!KEYWORDS.some(k => f.includes(k))) return false;
  return GRANTS_TO_A_CREATURE(row);
}

async function page(from, to) {
  const url =
    `${SUPABASE_URL}/rest/v1/cards_pool?select=name,type_line,edhrec_rank,facets,tags` +
    `&commander_legal=eq.legal&edhrec_rank=gte.${from}&edhrec_rank=lt.${to}` +
    `&order=edhrec_rank.asc&limit=1000`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const rows = [];
  for (let from = 1; from < 3000; from += 750) rows.push(...(await page(from, from + 750)));
  console.log(`read ${rows.length} commander-legal cards in the top 3000 by rank\n`);

  const yes = rows.filter(qualifies);
  console.log(`the rule admits ${yes.length} of them (${((100 * yes.length) / rows.length).toFixed(1)}%)\n`);

  console.log('--- ADMITTED, most played first (read these as a player) ---');
  for (const r of yes.slice(0, 45)) {
    const how = (r.facets ?? []).includes('eff:attach') ? 'attach' : 'scope:all';
    console.log(
      `  ${String(r.edhrec_rank).padStart(4)}  ${r.name.padEnd(30)} ${String(r.type_line).slice(0, 26).padEnd(27)} via ${how}` +
        `  ${(r.tags ?? []).includes('protection') ? '[tagged protection]' : ''}`
    );
  }

  /* The half that matters more: cards the TAGGER calls protection that the rule
     refuses. Each one is either a false negative or proof the crude half has to
     get less crude. */
  const taggedOnly = rows.filter(r => (r.tags ?? []).includes('protection') && !qualifies(r));
  console.log(`\n--- TAGGED protection, rule REFUSES: ${taggedOnly.length} ---`);
  for (const r of taggedOnly.slice(0, 30)) {
    const f = r.facets ?? [];
    const why = !KEYWORDS.some(k => f.includes(k)) ? 'no protective keyword' : 'the keyword is not granted to a creature';
    console.log(`  ${String(r.edhrec_rank).padStart(4)}  ${r.name.padEnd(30)} ${String(r.type_line).slice(0, 24).padEnd(25)} ${why}`);
  }

  /* And the reverse: admitted but NOT tagged. A disagreement worth reading. */
  const ruleOnly = yes.filter(r => !(r.tags ?? []).includes('protection'));
  console.log(`\n--- rule ADMITS, tagger does not call it protection: ${ruleOnly.length} ---`);
  for (const r of ruleOnly.slice(0, 30)) {
    console.log(`  ${String(r.edhrec_rank).padStart(4)}  ${r.name.padEnd(30)} ${String(r.type_line).slice(0, 30)}`);
  }

  /* The two cards this exists for. */
  console.log('\n--- the cards the audit said were missing from every deck ---');
  for (const name of ['Swiftfoot Boots', 'Lightning Greaves']) {
    const r = rows.find(x => x.name === name);
    console.log(`  ${name}: ${r ? (qualifies(r) ? 'ADMITTED' : 'REFUSED') : 'not in the top 3000'}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
