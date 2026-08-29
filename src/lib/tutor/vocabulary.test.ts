/**
 * One list of what Magic words mean.
 *
 *   node --test --experimental-strip-types src/lib/tutor/vocabulary.test.ts
 *
 * `src/engine/knowledge/tagger.ts` decides what a card is. Tutor decides how a
 * player says it. This is the seam between those two jobs, and it exists
 * because Tutor used to hold both: four hand-written tables naming all 76 tags
 * the engine writes, with nothing checking either list against the other.
 *
 * They happened to agree, measured by `scripts/tutor-vocabulary-diff.ts`: zero
 * names in each direction that the other did not have. Agreement by hand is not
 * a guarantee, it is a coincidence that has not broken yet, and the day a rule
 * is renamed in the tagger the only symptom would be a question that quietly
 * matches no card.
 *
 * So these are the assertions that make it a guarantee. They are deliberately
 * one-directional: the engine names things, Tutor may only add words for names
 * that exist.
 *
 * This file lives under `src/` because that is where `npm test` looks, and it
 * reaches into `supabase/functions/` the same way the optimiser's rule tests
 * already do.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { TAG_RULES, ALL_TAGS } from '../../engine/knowledge/tagger.ts';
import {
  ALIAS_TAGS,
  LOW_INFORMATION_TAGS,
  TYPE_TAGS as ENGINE_TYPE_TAGS,
} from '../../engine/knowledge/tag-signal.ts';
import {
  CANONICAL_TAGS,
  PHRASINGS,
  SUPERSEDED,
  TAG_SYNONYMS,
  TYPE_TAGS,
  UNION_NAMES,
  isRoleTag,
  plainWords,
  roleWords,
  spelledOut,
} from '../../../supabase/functions/mtg-brain/answer/vocabulary.ts';
import { looksWrong } from '../../../supabase/functions/mtg-brain/answer/voice.ts';

const engineNames = new Set(ALL_TAGS);

describe('Tutor takes its tag names from the engine', () => {
  it('every name Tutor writes words for is a name a rule writes', () => {
    const invented = Object.keys(PHRASINGS).filter(tag => !engineNames.has(tag));
    assert.deepEqual(
      invented,
      [],
      `these are not tags, so nothing will ever carry them: ${invented.join(', ')}`
    );
  });

  /**
   * The tagger emits legacy spellings beside the canonical name so older
   * readers keep working. Tutor must ask for the canonical one, because an
   * alias is a promise somebody made to a previous version of this codebase and
   * can be withdrawn.
   *
   * `removal` is the one exception and it is not a spelling: two separate rules
   * write it, so it is the union of spot removal and board wipes and no
   * canonical name covers both. It is named in `UNION_NAMES` with the counts
   * beside it.
   */
  it('Tutor asks for canonical names, except the one union that has no canonical name', () => {
    const legacy = Object.keys(PHRASINGS).filter(
      tag => ALIAS_TAGS.has(tag) && !UNION_NAMES.has(tag)
    );
    assert.deepEqual(
      legacy,
      [],
      `use the rule's own tag, not its legacy spelling: ${legacy.join(', ')}`
    );
  });

  it('every union name really is written by more than one rule', () => {
    for (const name of UNION_NAMES) {
      const rules = TAG_RULES.filter(r => (r.also ?? []).includes(name));
      assert.ok(
        rules.length > 1,
        `"${name}" is claimed as a union but only ${rules.length} rule writes it, ` +
          `so it should be that rule's own tag instead`
      );
    }
  });

  it('supersession only ever names tags a rule writes under its own name', () => {
    for (const [loser, winners] of Object.entries(SUPERSEDED)) {
      assert.ok(CANONICAL_TAGS.has(loser), `${loser} is not a rule's own tag`);
      for (const winner of winners) {
        assert.ok(CANONICAL_TAGS.has(winner), `${winner} is not a rule's own tag`);
        assert.notEqual(loser, winner, `${loser} cannot supersede itself`);
      }
    }
  });

  /**
   * The engine's set answers "does sharing this tell you anything about two
   * cards". Tutor's answers "is this already printed on the screen". They are
   * different questions, so one addition is allowed, and it has to be declared
   * here rather than appearing quietly in a longer list.
   */
  it('the tags Tutor hides are the engine\'s, plus exactly one named exception', () => {
    const extra = Array.from(TYPE_TAGS).filter(t => !ENGINE_TYPE_TAGS.has(t));
    assert.deepEqual(extra, ['vehicle']);
    for (const tag of ENGINE_TYPE_TAGS) assert.ok(TYPE_TAGS.has(tag), `${tag} should be hidden`);
  });
});

describe('every job the engine can name, a player can ask for', () => {
  /**
   * This is the ratchet the whole file is for. Add a rule to `TAG_RULES` and it
   * becomes askable in the same commit, with the tag spelled out as the words,
   * because `TAG_SYNONYMS` is derived rather than listed. Before it was derived,
   * 29 hand-written entries covered 28 of the engine's 56 ideas.
   */
  it('nothing the engine can say about a card is unreachable', () => {
    const shouldBeAskable = Array.from(CANONICAL_TAGS).filter(
      tag => !ENGINE_TYPE_TAGS.has(tag) && !LOW_INFORMATION_TAGS.has(tag)
    );
    const askable = new Set(TAG_SYNONYMS.map(s => s.tag));
    const missing = shouldBeAskable.filter(tag => !askable.has(tag)).sort();
    assert.deepEqual(missing, [], `no wording reaches these: ${missing.join(', ')}`);
  });

  /**
   * `etb` is on 4,512 cards and `evasion` on 4,291, so "the most played cards
   * that enter the battlefield" is a fact about nothing. That judgement is the
   * engine's and Tutor follows it rather than making its own.
   */
  it('the two tags the engine calls meaningless are not offered as a list', () => {
    for (const tag of LOW_INFORMATION_TAGS) {
      assert.ok(
        !TAG_SYNONYMS.some(s => s.tag === tag),
        `${tag} is on too many cards to be a list, per the engine`
      );
    }
  });

  it('every asking phrase belongs to exactly one job', () => {
    const owner = new Map<string, string>();
    for (const entry of TAG_SYNONYMS) {
      for (const word of entry.words) {
        const already = owner.get(word);
        assert.equal(
          already,
          undefined,
          `"${word}" would mean both ${already} and ${entry.tag}, and which one wins ` +
            `depends on the order of the list rather than on the question`
        );
        owner.set(word, entry.tag);
      }
    }
  });

  it('every job has at least one way to ask for it and a way to say it back', () => {
    for (const entry of TAG_SYNONYMS) {
      assert.ok(entry.words.length > 0, `${entry.tag} has no words`);
      assert.ok(entry.says.trim().length > 0, `${entry.tag} has nothing to be called`);
      assert.ok(entry.words.includes(spelledOut(entry.tag)), `${entry.tag} is not askable by its own name`);
    }
  });
});

describe('the words obey the copy rules', () => {
  /**
   * `looksWrong` is the same check the answerer runs on every sentence before
   * it ships. Running it on the vocabulary itself means a banned word cannot
   * enter through a tag name, which matters because the default wording for a
   * new tag is the tag id spelled out.
   */
  it('nothing a player reads breaks a copy rule', () => {
    for (const tag of ALL_TAGS) {
      for (const text of [spelledOut(tag), plainWords(tag), PHRASINGS[tag]?.says ?? '']) {
        if (!text) continue;
        assert.deepEqual(looksWrong(text), [], `"${text}" (from ${tag})`);
      }
    }
    for (const entry of TAG_SYNONYMS) {
      assert.deepEqual(looksWrong(entry.says), [], `${entry.tag} says "${entry.says}"`);
    }
  });
});

describe('reading one card back', () => {
  it('a legacy spelling is never printed beside the tag it duplicates', () => {
    for (const tag of ALIAS_TAGS) {
      assert.ok(!isRoleTag(tag), `${tag} is a second name for something already said`);
    }
  });

  /**
   * The real shape of a spot removal spell in `cards.tags`: the rule's own tag
   * plus two legacy spellings of it. Before the alias graph was imported, this
   * printed "spot removal, removal, spot removal" and was deduplicated only
   * because two of the three happened to have been given identical words.
   */
  it('three names for one idea are said once', () => {
    assert.deepEqual(roleWords(['targeted-removal', 'removal', 'removal-spot', 'instant']), [
      'spot removal',
    ]);
  });

  it('the more precise of two true statements is the one printed', () => {
    assert.deepEqual(roleWords(['tutor', 'tutor-narrow']), ['a tutor for one kind of card']);
    assert.deepEqual(roleWords(['ramp', 'mana-rock']), ['a mana rock']);
    assert.deepEqual(roleWords(['tutor']), ['a tutor']);
  });

  it('a type tag is never a role', () => {
    assert.deepEqual(roleWords(['creature', 'artifact', 'vehicle']), []);
  });

  /**
   * The caller prints the first four, so the order is what a player reads. It
   * used to be alphabetical on our own tag ids, which put "does something when
   * it enters" ahead of "a counterspell" because e sorts before c.
   */
  it('the most telling thing about a card is printed first', () => {
    assert.deepEqual(
      roleWords(['creature', 'etb', 'evasion', 'counterspell', 'card-draw']),
      ['a counterspell', 'draws cards', 'hard to block', 'does something when it enters']
    );
  });

  it('a tag nobody has written words for is still sayable', () => {
    assert.equal(spelledOut('cost-reduction'), 'cost reduction');
    assert.equal(plainWords('cost-reduction'), 'makes your spells cheaper');
  });
});

describe('the paths hold up at deploy', () => {
  /**
   * A Deno function is bundled from its own directory, and the Supabase CLI
   * reports a specifier that lands on nothing as
   *
   *     WARN: failed to read file: open .../engine/knowledge/behaviour.ts
   *
   * A warning, not an error, so the function ships and the missing module only
   * shows up when a player asks the question that needs it. That has already
   * happened once on this project, to the facet shim, and it went unnoticed for
   * as long as it did because nothing walked the imports.
   *
   * Tutor now reaches out of `answer/` into `_engine/`, which is exactly the
   * shape that failed. `scripts/vendor-resolve-check.mjs` checks the facet shim
   * in the two functions that rank a pool, and Tutor has no facet mirror, so it
   * is not covered there. This is the check for the paths Tutor actually has.
   */
  const FUNCTION_ROOT = path.join(process.cwd(), 'supabase', 'functions', 'mtg-brain');
  const SPECIFIER = /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s+['"]([^'"]+)['"]/gm;

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      // The vendored engine is checked byte for byte by engine-parity.test.ts.
      if (entry.isDirectory()) {
        if (entry.name !== '_engine') walk(p);
      } else if (entry.name.endsWith('.ts')) files.push(p);
    }
  };
  walk(FUNCTION_ROOT);

  it('Tutor has files to check', () => {
    assert.ok(files.length >= 5, `found only ${files.length} files under mtg-brain`);
  });

  it('every relative import in Tutor lands on a file that exists', () => {
    const broken: string[] = [];
    for (const file of files) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (!fs.existsSync(target)) {
          broken.push(`${path.relative(process.cwd(), file)} imports ${spec}`);
        }
      }
    }
    assert.deepEqual(broken, [], broken.join('\n'));
  });

  it('nothing in Tutor reaches outside the function it deploys as', () => {
    const escaping: string[] = [];
    for (const file of files) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (!target.startsWith(FUNCTION_ROOT)) {
          escaping.push(`${path.relative(process.cwd(), file)} imports ${spec}, which would not be bundled`);
        }
      }
    }
    assert.deepEqual(escaping, [], escaping.join('\n'));
  });
});
