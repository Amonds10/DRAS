import { describe, expect, it } from 'vitest';
import { previewChain } from '../../src/core/link';
import { validLoadout } from '../../src/core/run';
import { analyzeTeam } from '../../src/core/team';
import { DECKS } from '../../src/data/decks';
import { spellById } from '../../src/data/spells';

describe('analyzeTeam', () => {
  it('finds a full chain and its reactions', () => {
    const syn = analyzeTeam(['solea', 'lune', 'nox', 'vela']);
    expect(syn.maxChain).toBe(4);
    expect(syn.reactions).toEqual(expect.arrayContaining(['eclipse', 'moonset', 'blackhole']));
  });

  it('the suggested sequence produces the reported chain in the real link rules', () => {
    const syn = analyzeTeam(['nebia', 'solea', 'vela', 'astra']);
    const steps = previewChain(syn.bestSequence.map((s) => spellById(s.spellId)));
    expect(steps[steps.length - 1].chain).toBe(syn.maxChain);
  });

  it('every pair of characters can link at least one way', () => {
    const ids = ['solea', 'lune', 'nebia', 'vela', 'nox', 'astra'];
    for (const a of ids) for (const b of ids) if (a !== b) expect(analyzeTeam([a, b]).maxChain, `${a}→${b}`).toBe(2);
  });

  it('every recommended deck loadout is valid and reaches a full chain', () => {
    for (const d of DECKS) {
      for (const id of d.team) expect(validLoadout(id, d.loadout[id]), `${d.id}:${id}`).toBe(true);
      expect(analyzeTeam(d.team, d.loadout).maxChain, d.id).toBe(4);
    }
  });
});
