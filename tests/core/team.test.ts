import { describe, expect, it } from 'vitest';
import { previewChain } from '../../src/core/link';
import { analyzeTeam } from '../../src/core/team';
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
    for (const a of ids) for (const b of ids) if (a !== b) expect(analyzeTeam([a, b]).maxChain).toBe(2);
  });
});
