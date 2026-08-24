#!/usr/bin/env node
/**
 * Freeze REAL card records, straight out of the extraction, as test fixtures.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored: what this writes is the DERIVED
 * record, the structured semantics that are the whole point of the port. Forge
 * is GPL-3.0 and was not fetched, read or referenced.
 *
 * ## Why the fixtures are generated and not typed out
 *
 * `record.test.ts` builds its fixtures by hand, which is fine for pinning a
 * design decision and useless for testing a lowering. A hand-written record is
 * a record of what the author BELIEVED the extraction produces, so a lowering
 * tested against one can pass while failing on every real card. Every fixture
 * here is `buildRecord`'s own output for a named card, so a test that passes is
 * a statement about the corpus.
 *
 * ## Oracle text, and where it comes from
 *
 * Each fixture carries the card's Scryfall `oracle_text`, from
 * `scripts/coverage/.data/catalogue.json`. It is NEVER taken from XMage:
 * XMage's display strings carry Wizards of the Coast wording that is not
 * XMage's to license, and the extraction omits their contents for that reason.
 * The text is there so a reader can check a lowering against the card as
 * printed, which is the rule this port follows when the two disagree: the
 * oracle text wins.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/make-fixtures.mjs
 * Writes:
 *   src/lib/cards/xmage/port.fixtures.generated.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

/**
 * The cards the port is tested against, by XMage class name.
 *
 * Chosen so that every primitive ported in this pass is exercised by a card a
 * reader recognises, plus the cards that must REFUSE. The refusals matter as
 * much as the passes: a port with no refusal tests is a port that has not shown
 * it can say no.
 */
const CARDS = [
  /* keywords */
  'SerraAngel',
  'ShivanDragon',
  'ArborbackStomper',
  'AlleyStrangler',
  /* auras: enchant, attach, boost-enchanted */
  'DeadWeight',
  'HolyStrength',
  /* tokens */
  'DragonFodder',
  'CallOfTheConclave',
  /* pumps */
  'GiantGrowth',
  'BullRush',
  'BoaConstrictor',
  'GaeasAnthem',
  /* life */
  'AngelsMercy',
  /* counters, including the four-counter card that catches dropped factory args */
  'BlightRot',
  'Battlegrowth',
  /* removal */
  'StoneRain',
  'Unmake',
  'WrathOfGod',
  'LightningBolt',
  /* granted keywords */
  'Jump',
  'UnnaturalSpeed',
  /* equipment */
  'Bonesplitter',
  'MurderersAxe',
  /* mana */
  'ElvishMystic',
  'FyndhornElder',
  /* tapping */
  'RelicBarrier',
  'EarlyFrost',
  /* searching */
  'SkyshroudClaim',
  'ThreeVisits',
  /* enters tapped */
  'DiregrafGhoul',
  /* planeswalker */
  'GarrukWildspeaker',
  /* Filters narrowed by the FILTER'S OWN constructor argument. That argument
     used to be dropped, so each of these ran with a wider set than the card
     affects: "untap target Forest" untapped any permanent, "Sliver creatures you
     control have haste" gave every creature haste, and "whenever an Angel you
     control enters" fired on a land drop. Both paths into `resolveFilter` are
     pinned: read off the card (Arbor Elf, Blur Sliver, Bishop of Wings, Krenko)
     and read off a StaticFilters field initialiser (Battle Sliver). */
  'ArborElf',
  'BlurSliver',
  'BishopOfWings',
  'BattleSliver',
  'KrenkoMobBoss',
  /* Conditions: the three places one can land, one recognisable card each.
     Anger's is a static condition read from the GRAVEYARD, Anurid Barkripper's
     is a threshold on itself, Galvanic Blast's is a resolving `{do:'if'}`, and
     Felidar Sovereign's is an intervening if on a triggered ability. */
  'Anger',
  'AnuridBarkripper',
  'GalvanicBlast',
  'FelidarSovereign',
  /* The "…Source" family and the two-target effects. Epic Confrontation is the
     one worth naming: a fight is TWO damages that both happen, and Animist's
     Might is the one-way version with a multiplier that used to have nowhere to
     go. Academy Ruins pins the `onTop` flag, which is the whole card. */
  'EpicConfrontation',
  'AnimistsMight',
  'AcademyRuins',
  'AttuneWithAether',
  'BlistercoilWeird',
  /* `{do:'do-if-cost-paid'}`, the controller's own optional cost.
     Academy Rector is the plain shape, one effect on the paid branch. Oloro is
     the shape that found the dropped-addEffect bug: "draw a card AND each
     opponent loses 1 life" is two effects, and only the first was a constructor
     argument, so the port ran half the card and said nothing. */
  'AcademyRector',
  'OloroAgelessAscetic',
  /* `{do:'scry'}` and `{do:'surveil'}`, promoted out of the primitives folder's
     staging file. Preordain is scry with a count above one, which is the number
     the lowering has to read rather than assume; Whisper Agent is the surveil
     side, so the two destinations cannot be collapsed into one verb unnoticed. */
  'Preordain',
  'WhisperAgent',
  /* `{do:'look-and-pick'}`. Anticipate is the plain shape and takes exactly
     one; Commune with Nature is the same class through the OTHER constructor
     family, where `upTo` is derived rather than passed and a filter
     narrows what may be taken. Orazca Puzzle-Door is the one where the cards
     not taken do not go back to the library at all. */
  'Anticipate',
  'CommuneWithNature',
  'OrazcaPuzzleDoor',
  /* cards that must refuse, each for a different reason */
  /* Lorthos taps up to eight permanents AND stops them untapping. The second
     half arrived through `.addEffect`, was invisible to the lowering, and the
     card ran doing less than it prints. It now refuses, because the effect that
     stops them untapping has no entry. */
  'LorthosTheTidemaker',
  /* Master Skald builds `TargetCardInYourGraveyard` twice, once inside its cost
     with a creature filter and once on the ability with an artifact-or-
     enchantment one. The reuse index matched them by class name across nesting
     levels and handed the ability the cost's object, so the card returned a
     CREATURE card. It now refuses on the filter it cannot read. */
  'MasterSkald',
  'BlinkOfAnEye',
  'StormHerd',
  'HareApparent',
  'WordOfBinding',
  'AncestorsAid',
  'AcademyDrake',
  'AbbeyGargoyles',
  'CyclonicRift',
  'RhysticStudy',
  'DocksideExtortionist',
  /* The eleven cards a fresh fifty-card hand check caught in August 2026, every
     one of which RAN and was wrong. Three create several tokens through
     `.withAdditionalTokens`; one inverts a sign through a multiplier the
     filtered branch of a value reader skipped; one is an exhaust ability with
     neither its once-per-game limit nor its sorcery timing; one is a forecast
     ability with none of its four restrictions; one is a step trigger whose
     `TargetController` the record carried and the port read as "you"; one is a
     cost narrowed to a single graveyard; one is a cost narrowed by a predicate
     the record could not read; one is an alternative way to CAST the card that
     lowered as a repeatable activated ability; and one drops the sentence that
     says what happens when nothing was picked. */
  'TriplicateTitan',
  'SomberwaldBeastmaster',
  'WurmcoilEngine',
  'TerrorTide',
  'LilianaTheRepentant',
  'SteelingStance',
  'FeveredVisions',
  'NightSoil',
  'SanctumSpirit',
  'SaprolingSymbiosis',
  'ContagiousVorrac',
  /* And one the disagreement census caught rather than the sample: a mana
     ability whose second cost was added after its constructor ran. */
  'SpringleafDrum',
  /* Round three of the same hand check, three more of the same shape: a token
     argument nothing read, an ability class that writes its own condition and
     its own second effect, and a target class whose restriction lived only in
     the prompt a player reads. */
  'FalconerAdept',
  'ThunderfootBaloth',
  'FamishedGhoul',
  'Cultivate',
  'BattleOfWits',
];

const wanted = new Set(CARDS);

const { records, meta } = await loadRecords();

const oracle = new Map();
for (const row of JSON.parse(readFileSync(path.join(REPO, 'scripts/coverage/.data/catalogue.json'), 'utf8')).rows) {
  if (!oracle.has(row.oracle_id)) oracle.set(row.oracle_id, row);
}

const out = {};
const missing = [];
for (const record of records) {
  const cls = record.provenance.xmageClass;
  if (!wanted.has(cls) || out[cls]) continue;
  const row = oracle.get(record.oracleId);
  out[cls] = {
    record,
    scryfall: row
      ? {
          name: row.name,
          manaCost: row.mana_cost ?? null,
          typeLine: row.type_line ?? null,
          oracleText: row.oracle_text ?? null,
        }
      : null,
  };
}
for (const cls of CARDS) if (!out[cls]) missing.push(cls);

const generated = `/**
 * GENERATED by scripts/xmage/make-fixtures.mjs. Do not edit by hand.
 *
 * Real card records, exactly as \`scripts/xmage/build-records.mjs\` produces
 * them from XMage, each with the card's Scryfall oracle text so a reader can
 * check a lowering against the printed card.
 *
 * Records derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage, read in place and
 * not vendored. Display-string CONTENTS are absent from the records by design:
 * they carry Wizards of the Coast wording. \`scryfall.oracleText\` is Scryfall's
 * and is the source this project uses for a card's words. Forge is GPL-3.0 and
 * was not fetched, read or referenced.
 *
 * ${Object.keys(out).length} cards. XMage commit ${meta.commit}.
 */

import type { CardRecord } from './record.ts';

export interface Fixture {
  record: CardRecord;
  scryfall: { name: string; manaCost: string | null; typeLine: string | null; oracleText: string | null } | null;
}

export const PORT_FIXTURES: Record<string, Fixture> = ${JSON.stringify(out, null, 1)} as unknown as Record<string, Fixture>;

/** The fixture, or a loud failure. A test that silently skips a missing card tests nothing. */
export function fixture(cls: string): Fixture {
  const found = PORT_FIXTURES[cls];
  if (!found) throw new Error(\`no fixture for \${cls}; re-run scripts/xmage/make-fixtures.mjs\`);
  return found;
}
`;

writeFileSync(path.join(REPO, 'src/lib/cards/xmage/port.fixtures.generated.ts'), generated);

console.log(`fixtures written  ${Object.keys(out).length} of ${CARDS.length}`);
if (missing.length > 0) console.log(`NOT FOUND in the extraction: ${missing.join(', ')}`);
for (const [cls, f] of Object.entries(out)) {
  console.log(`  ${cls.padEnd(24)} ${f.scryfall?.name ?? '(no Scryfall row)'}`);
}
