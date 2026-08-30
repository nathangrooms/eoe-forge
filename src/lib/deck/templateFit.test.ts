/**
 * Blueprint matching, and the two ways it could be wrong.
 *
 *   node --test --experimental-strip-types src/lib/deck/templateFit.test.ts
 *
 * Offering too much is the failure this replaced: the panel asked Tutor for
 * "5-7 recommendations" with power levels and learning curves, and Tutor
 * refused because none of that is knowable from what we hold. Offering too
 * little is the opposite failure and just as bad, because a panel that suggests
 * nothing is the empty state it was added to remove.
 *
 * So the assertions are about what may and may not be OFFERED, not about
 * ranking niceties.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fitsForDeck, suggestTemplates, type FitTemplate } from './templateFit.ts';

const TEMPLATES: FitTemplate[] = [
  { id: 'aggro-burn', name: 'Aggressive Burn', formats: ['standard', 'modern'], colors: ['R'] },
  { id: 'aristocrats', name: 'Aristocrats', formats: ['commander'], colors: ['B', 'R'] },
  { id: 'voltron', name: 'Voltron', formats: ['commander'], colors: ['W', 'U', 'R', 'G'] },
  { id: 'draw-go', name: 'Draw-Go Control', formats: ['commander'], colors: ['W', 'U'] },
  { id: 'artifacts', name: 'Artifact Ramp', formats: ['commander'], colors: [] },
];

const ATRAXA = { name: 'Atraxa', format: 'commander', colors: ['W', 'U', 'B', 'G'] };
const MONO_U = { name: 'Talrand', format: 'commander', colors: ['U'] };

describe('a blueprint has to be buildable in the deck', () => {
  it('refuses a template whose format is not the deck\'s', () => {
    const names = fitsForDeck(ATRAXA, TEMPLATES).map(f => f.templateName);
    /* Aggressive Burn is Standard and Modern. It is not a weak suggestion for a
       Commander deck, it is the wrong answer, so it is not offered at all. */
    assert.equal(names.includes('Aggressive Burn'), false, names.join(', '));
  });

  it('refuses a template needing a colour the deck cannot play', () => {
    const names = fitsForDeck(ATRAXA, TEMPLATES).map(f => f.templateName);
    /* Atraxa is WUBG. Aristocrats wants black AND red; a Commander deck cannot
       play a red card at any strength, so this is not buildable rather than
       weakly buildable. */
    assert.equal(names.includes('Aristocrats'), false, names.join(', '));
    assert.equal(names.includes('Voltron'), false, 'Voltron needs red');
  });

  it('offers what does fit, and says why in facts', () => {
    const fits = fitsForDeck(ATRAXA, TEMPLATES);
    const names = fits.map(f => f.templateName);
    assert.ok(names.includes('Draw-Go Control'), names.join(', '));
    assert.ok(names.includes('Artifact Ramp'), 'a colourless blueprint fits every deck');

    for (const fit of fits) {
      assert.ok(fit.because.length > 0);
      /* Every reason is one of the two facts. Nothing about power, playstyle or
         difficulty, because we hold none of those and the panel this replaced
         was inventing them. */
      assert.doesNotMatch(fit.because, /power|playstyle|difficulty|learning|beginner/i);
      assert.ok(/commander/i.test(fit.because), `no format in: ${fit.because}`);
    }
  });

  it('ranks an exact colour match above one that uses a slice of the deck', () => {
    const fits = fitsForDeck(MONO_U, [
      { id: 'mono-u', name: 'Mono Blue', formats: ['commander'], colors: ['U'] },
      { id: 'colourless', name: 'Artifact Ramp', formats: ['commander'], colors: [] },
    ]);
    assert.equal(fits[0].templateName, 'Mono Blue');
    assert.match(fits[0].because, /Exactly/);
  });
});

describe('across every deck the player has', () => {
  it('offers each blueprint once, kept against the deck it fits best', () => {
    const out = suggestTemplates([ATRAXA, MONO_U], TEMPLATES);
    const ids = out.map(f => f.templateId);
    assert.equal(new Set(ids).size, ids.length, `a blueprint was offered twice: ${ids.join(', ')}`);

    /* Draw-Go is WU, and Talrand is mono-blue, so it is not buildable there at
       all: white is outside the identity. Atraxa is the only deck it fits.
       That was a fixture I got wrong on the first draft and the test caught it,
       which is the point of the colour gate being a gate. */
    const drawGo = out.find(f => f.templateId === 'draw-go');
    assert.equal(drawGo?.deckName, 'Atraxa', drawGo?.because);
  });

  it('keeps a blueprint against the deck whose colours it matches most tightly', () => {
    const monoBlue: FitTemplate = { id: 'mono-u', name: 'Mono Blue', formats: ['commander'], colors: ['U'] };
    /* Buildable in both: exactly Talrand's colours, and a quarter of Atraxa's. */
    const out = suggestTemplates([ATRAXA, MONO_U], [monoBlue]);
    assert.equal(out.length, 1);
    assert.equal(out[0].deckName, 'Talrand', out[0].because);
    assert.match(out[0].because, /Exactly/);
  });

  it('suggests nothing when the player has no decks, rather than guessing', () => {
    assert.deepEqual(suggestTemplates([], TEMPLATES), []);
  });

  it('honours the limit', () => {
    assert.ok(suggestTemplates([ATRAXA, MONO_U], TEMPLATES, 2).length <= 2);
  });
});
