import { describe, expect, it } from 'vitest';
import { chainMult, linkStep, previewChain } from '../../src/core/link';
import { spellById } from '../../src/data/spells';

const s = spellById;

describe('linkStep', () => {
  it('starts a chain at 1 without a previous cast', () => {
    const step = linkStep(null, 0, s('dawn_thrust'), null);
    expect(step).toMatchObject({ linked: false, chain: 1, mult: 1, outElement: 'sol', reactionId: null });
  });

  it('links when the previous output matches the input', () => {
    const step = linkStep('sol', 1, s('crescent_edge'), null);
    expect(step).toMatchObject({ linked: true, chain: 2, mult: 1.25, outElement: 'luna', reactionId: 'eclipse' });
  });

  it('breaks the chain when the input does not match', () => {
    const step = linkStep('comet', 2, s('crescent_edge'), null);
    expect(step).toMatchObject({ linked: false, chain: 1 });
  });

  it('starter spells never link even after a cast', () => {
    expect(linkStep('sol', 2, s('meteor_snipe'), null).linked).toBe(false);
  });

  it('wild/echo spells link to anything and pass the element through without a reaction', () => {
    const step = linkStep('void', 2, s('constellation_echo'), null);
    expect(step).toMatchObject({ linked: true, chain: 3, outElement: 'void', reactionId: null });
  });

  it('a sealed output element breaks the link', () => {
    const step = linkStep('sol', 1, s('crescent_edge'), 'luna');
    expect(step).toMatchObject({ linked: false, sealed: true, chain: 1, outElement: 'luna' });
  });
});

describe('previewChain', () => {
  it('reaches a full chain with reactions', () => {
    const steps = previewChain(['dawn_thrust', 'crescent_edge', 'void_touch', 'final_star'].map(s));
    expect(steps.map((x) => x.chain)).toEqual([1, 2, 3, 4]);
    expect(steps.map((x) => x.reactionId)).toEqual([null, 'eclipse', 'moonset', 'blackhole']);
    expect(steps[3].mult).toBe(chainMult(4));
  });
});
