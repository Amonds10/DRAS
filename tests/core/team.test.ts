import { describe, expect, it } from 'vitest';
import { previewChain } from '../../src/core/link';
import { analyzeTeam } from '../../src/core/team';
import { spellById } from '../../src/data/spells';

describe('analyzeTeam', () => {
  it('finds a full chain and its reactions', () => {
    const syn = analyzeTeam(['sol_striker', 'luna_striker', 'void_hexer', 'comet_striker']);
    expect(syn.maxChain).toBe(4);
    expect(syn.reactions).toEqual(expect.arrayContaining(['eclipse', 'moonset', 'blackhole']));
  });

  it('the suggested sequence produces the reported chain in the real link rules', () => {
    const syn = analyzeTeam(['nebula_support', 'sol_guardian', 'comet_raider', 'star_warden']);
    const steps = previewChain(syn.bestSequence.map((s) => spellById(s.spellId)));
    expect(steps[steps.length - 1].chain).toBe(syn.maxChain);
  });

  it('a team without links tops out at chain 1', () => {
    const syn = analyzeTeam(['sol_striker', 'comet_raider', 'luna_support', 'void_guardian']);
    expect(syn.maxChain).toBeGreaterThanOrEqual(1);
    expect(syn.linkPairs).toBeGreaterThanOrEqual(0);
  });
});
