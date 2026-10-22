import { describe, expect, it } from 'vitest';
import { bestPlan } from '../../src/core/autoplan';
import { DEFAULT_MODS, createBattle, executeRound, getFocus, hasStatus, validatePlan } from '../../src/core/battle';
import { newRun } from '../../src/core/run';
import type { BattleState } from '../../src/core/types';

const TEAM = ['sol_striker', 'luna_striker', 'void_hexer', 'comet_striker'];

function battle(enemies: string[], seed = 1, mods = DEFAULT_MODS): BattleState {
  return createBattle(newRun(TEAM, seed).team, enemies, { ...mods }, seed);
}

describe('battle', () => {
  it('rolls enemy intents on creation', () => {
    const b = battle(['stray_shard', 'shadow_comet']);
    expect(b.enemies.every((e) => e.intent !== null)).toBe(true);
    expect(b.stardust).toBe(DEFAULT_MODS.startStardust);
  });

  it('rejects plans that cost more stardust than available', () => {
    const b = battle(['stray_shard']);
    const plan = [
      { allyUid: 'a0', spellId: 'corona_burst' },
      { allyUid: 'a1', spellId: 'fullmoon_fall' },
    ];
    expect(validatePlan(b, plan)).toMatch('성진');
  });

  it('rejects plans that use the same ally twice', () => {
    const b = battle(['stray_shard']);
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'dawn_lance' }, { allyUid: 'a0', spellId: 'dawn_lance' }])).not.toBeNull();
  });

  it('a linked cast deals more damage than an unlinked one', () => {
    const linked = battle(['fallen_keeper'], 7, { ...DEFAULT_MODS, startStardust: 10 });
    const unlinked = battle(['fallen_keeper'], 7, { ...DEFAULT_MODS, startStardust: 10 });
    const linkedEvents = executeRound(linked, [
      { allyUid: 'a0', spellId: 'dawn_lance' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
    ]);
    const unlinkedEvents = executeRound(unlinked, [
      { allyUid: 'a3', spellId: 'tail_shot' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
    ]);
    const crescentDamage = (events: ReturnType<typeof executeRound>) => {
      const i = events.findIndex((e) => e.type === 'cast' && e.spellId === 'crescent_edge');
      const hit = events.slice(i).find((e) => e.type === 'damage');
      return hit && hit.type === 'damage' ? hit.amount + hit.absorbed : 0;
    };
    expect(crescentDamage(linkedEvents)).toBeGreaterThan(crescentDamage(unlinkedEvents));
  });

  it('eclipse stuns the focused enemy so it skips its action', () => {
    const b = battle(['stray_shard'], 3);
    const events = executeRound(b, [
      { allyUid: 'a0', spellId: 'dawn_lance' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
    ]);
    expect(events.some((e) => e.type === 'reaction' && e.reactionId === 'eclipse')).toBe(true);
    if (b.outcome === 'ongoing') expect(events.some((e) => e.type === 'enemyStunned')).toBe(true);
  });

  it('a full chain triggers the constellation bonus', () => {
    const b = battle(['fallen_keeper'], 5, { ...DEFAULT_MODS, startStardust: 10 });
    const events = executeRound(b, [
      { allyUid: 'a0', spellId: 'dawn_lance' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
      { allyUid: 'a2', spellId: 'void_touch' },
      { allyUid: 'a3', spellId: 'tail_shot' },
    ]);
    expect(events.some((e) => e.type === 'fullChain')).toBe(true);
    expect(b.stats.fullChains).toBe(1);
    expect(b.stats.maxChain).toBe(4);
  });

  it('statuses expire at the end of the round', () => {
    const b = battle(['fallen_keeper'], 2, { ...DEFAULT_MODS, startStardust: 10 });
    executeRound(b, [
      { allyUid: 'a0', spellId: 'dawn_lance' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
    ]);
    expect(hasStatus(b.enemies[0], 'stun')).toBe(false);
  });

  it('focus moves to a living enemy after the focus dies', () => {
    const b = battle(['stray_shard', 'stray_shard'], 9);
    b.enemies[0].hp = 1;
    executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_lance' }]);
    expect(getFocus(b)?.uid).toBe('e1');
  });

  it('is deterministic for the same seed and plan', () => {
    const plan = [{ allyUid: 'a0', spellId: 'dawn_lance' }];
    const a = battle(['shadow_comet', 'stray_shard'], 42);
    const b = battle(['shadow_comet', 'stray_shard'], 42);
    expect(executeRound(a, plan)).toEqual(executeRound(b, plan));
  });

  it('the auto planner can win the first floor', () => {
    const b = battle(['stray_shard', 'stray_shard'], 11);
    for (let i = 0; i < 30 && b.outcome === 'ongoing'; i++) executeRound(b, bestPlan(b));
    expect(b.outcome).toBe('victory');
  });
});
