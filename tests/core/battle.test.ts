import { describe, expect, it } from 'vitest';
import { bestPlan } from '../../src/core/autoplan';
import { DEFAULT_MODS, createBattle, executeRound, getFocus, ready, statusStacks, validatePlan } from '../../src/core/battle';
import { newRun } from '../../src/core/run';
import type { BattleEvent, BattleMods, BattleState } from '../../src/core/types';
import { SPELLS, spellById } from '../../src/data/spells';
import { UNIT_LIST, unitById } from '../../src/data/units';

// a0 솔레아(태양) · a1 루네(달) · a2 녹스(공허) · a3 벨라(혜성)
const TEAM = ['solea', 'lune', 'nox', 'vela'];

function battle(enemies: string[], seed = 1, mods: Partial<BattleMods> = {}, team = TEAM): BattleState {
  return createBattle(newRun(team, seed).team, enemies, { ...DEFAULT_MODS, startStardust: 10, ...mods }, seed);
}

function dmgAfterCast(events: BattleEvent[], spellId: string): number {
  const i = events.findIndex((e) => e.type === 'cast' && e.spellId === spellId);
  let sum = 0;
  for (const e of events.slice(i + 1)) {
    if (e.type === 'cast' || e.type === 'enemyAct' || e.type === 'fullChain') break;
    if (e.type === 'damage' && e.source === 'ally') sum += e.amount + e.absorbed;
  }
  return sum;
}

describe('fixed skills and cooldowns', () => {
  it('every caster has exactly four skills that all exist', () => {
    for (const u of UNIT_LIST) {
      expect(u.spells).toHaveLength(4);
      for (const id of u.spells) expect(SPELLS[id], id).toBeDefined();
    }
  });

  it("rejects another caster's skill, overspending, and using a caster twice", () => {
    const b = battle(['stray_shard'], 1, { startStardust: 3 });
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'crescent_edge' }])).toMatch('스킬이 아닙니다');
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'supernova_lance' }, { allyUid: 'a1', spellId: 'crescent_edge' }])).toMatch('성진');
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }, { allyUid: 'a0', spellId: 'stellar_core' }])).not.toBeNull();
  });

  it('a skill with a cooldown rests for that many rounds; cooldown 0 skills are always ready', () => {
    const b = battle(['fallen_keeper'], 2);
    expect(spellById('flare_rush').cooldown).toBe(1);
    executeRound(b, [{ allyUid: 'a0', spellId: 'flare_rush' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    expect(ready(b.allies[0], 'flare_rush')).toBe(false);
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'flare_rush' }])).toMatch('쿨타임');
    expect(ready(b.allies[1], 'crescent_edge')).toBe(true);
    executeRound(b, []);
    expect(ready(b.allies[0], 'flare_rush')).toBe(true);
  });
});

describe('links and reactions', () => {
  it('a linked cast deals more damage than an unlinked one', () => {
    const linked = battle(['fallen_keeper'], 7);
    const unlinked = battle(['fallen_keeper'], 7);
    const a = executeRound(linked, [{ allyUid: 'a0', spellId: 'dawn_thrust' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    const b = executeRound(unlinked, [{ allyUid: 'a3', spellId: 'meteor_snipe' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    expect(dmgAfterCast(a, 'crescent_edge')).toBeGreaterThan(dmgAfterCast(b, 'crescent_edge'));
  });

  it('sun into moon triggers the eclipse reaction and stuns the target', () => {
    const b = battle(['fallen_keeper'], 2);
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    expect(events.some((e) => e.type === 'reaction' && e.reactionId === 'eclipse')).toBe(true);
    expect(events.some((e) => e.type === 'enemyStunned')).toBe(true);
  });

  it('four linked casts complete the constellation', () => {
    const b = battle(['fallen_keeper'], 3);
    const events = executeRound(b, [
      { allyUid: 'a0', spellId: 'dawn_thrust' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
      { allyUid: 'a2', spellId: 'void_touch' },
      { allyUid: 'a3', spellId: 'final_star' },
    ]);
    expect(events.some((e) => e.type === 'fullChain')).toBe(true);
    expect(b.stats.maxChain).toBe(4);
  });
});

describe('synergy', () => {
  it('multi-hit skills hit once per stage that fires', () => {
    const b = battle(['fallen_keeper'], 8);
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'flare_rush' }]);
    const stages = events.filter((e) => e.type === 'stage');
    const hits = events.filter((e) => e.type === 'damage' && e.source === 'ally');
    expect(stages).toHaveLength(4);
    expect(hits).toHaveLength(stages.filter((e) => e.type === 'stage' && !e.skipped).length);
  });

  it('solar core builds on burning enemies and the finisher burns it for a bigger hit', () => {
    const cold = battle(['fallen_keeper'], 4);
    const coldHit = dmgAfterCast(executeRound(cold, [{ allyUid: 'a0', spellId: 'supernova_lance' }]), 'supernova_lance');
    const hot = battle(['fallen_keeper'], 4);
    hot.enemies[0].statuses.push({ id: 'burn', turns: 5, value: 4 });
    executeRound(hot, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]);
    expect(statusStacks(hot.allies[0], 'solarCore')).toBeGreaterThanOrEqual(3);
    hot.allies[0].statuses = hot.allies[0].statuses.filter((s) => s.id !== 'solarCore');
    hot.allies[0].statuses.push({ id: 'solarCore', turns: 99, value: 6 });
    hot.stardust = 10;
    const events = executeRound(hot, [{ allyUid: 'a0', spellId: 'supernova_lance' }]);
    expect(events.some((e) => e.type === 'unleash' && e.stack === 'solarCore')).toBe(true);
    expect(dmgAfterCast(events, 'supernova_lance')).toBeGreaterThan(coldHit * 3);
  });

  it('rot seed turns burn into stronger erosion', () => {
    const b = battle(['fallen_keeper'], 6);
    b.enemies[0].statuses.push({ id: 'burn', turns: 3, value: 4 });
    executeRound(b, [{ allyUid: 'a2', spellId: 'rot_seed' }]);
    expect(statusStacks(b.enemies[0], 'burn')).toBe(0);
    expect(statusStacks(b.enemies[0], 'erosion')).toBeGreaterThanOrEqual(6);
  });

  it('round-start effects fire before anyone casts', () => {
    const b = battle(['fallen_keeper'], 5, {}, ['nebia', 'solea', 'lune', 'vela']);
    const events = executeRound(b, [{ allyUid: 'a1', spellId: 'dawn_thrust' }, { allyUid: 'a0', spellId: 'star_tithe' }]);
    const start = events.findIndex((e) => e.type === 'trigger' && e.phase === 'start');
    const firstCast = events.findIndex((e) => e.type === 'cast');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(firstCast);
  });

  it('lifesteal heals the caster', () => {
    const b = battle(['fallen_keeper'], 10);
    b.allies[2].hp = 20;
    const events = executeRound(b, [{ allyUid: 'a2', spellId: 'siphon' }]);
    expect(events.some((e) => e.type === 'heal' && e.targetUid === 'a2' && e.amount > 0)).toBe(true);
  });
});

describe('battle flow', () => {
  it('focus moves to a living enemy after the focus dies', () => {
    const b = battle(['stray_shard', 'stray_shard'], 9);
    b.enemies[0].hp = 1;
    executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]);
    expect(getFocus(b)?.uid).toBe('e1');
  });

  it('is deterministic for the same seed and plan', () => {
    const a = battle(['shadow_comet', 'stray_shard'], 42);
    const b = battle(['shadow_comet', 'stray_shard'], 42);
    const plan = [{ allyUid: 'a0', spellId: 'dawn_thrust' }];
    expect(executeRound(a, plan)).toEqual(executeRound(b, plan));
  });

  it('the auto planner can win the first floor', () => {
    const b = battle(['stray_shard', 'stray_shard'], 11, { startStardust: DEFAULT_MODS.startStardust });
    for (let i = 0; i < 30 && b.outcome === 'ongoing'; i++) executeRound(b, bestPlan(b));
    expect(b.outcome).toBe('victory');
  });
});

describe('skill text', () => {
  it('descriptions are prose without bracket tags', () => {
    for (const sp of Object.values(SPELLS)) expect(sp.desc, sp.id).not.toMatch(/\[(사용 시|적중 시|전투 시작 시|시전 후)\]/);
  });

  it('the first "위력 N" in a damage skill matches its always-firing stages', () => {
    for (const sp of Object.values(SPELLS)) {
      const dmg = sp.effects.find((e) => e.kind === 'damage');
      const m = sp.desc.match(/위력 (\d+)/);
      if (!dmg || dmg.kind !== 'damage' || !dmg.stages || !m) continue;
      const base = dmg.stages.filter((s) => !s.only).reduce((t, s) => t + s.power, 0);
      expect(Number(m[1]), sp.id).toBe(base);
    }
  });

  it('every skill is used by exactly one caster', () => {
    const used = UNIT_LIST.flatMap((u) => u.spells);
    expect(new Set(used).size).toBe(used.length);
    expect(used.sort()).toEqual(Object.keys(SPELLS).sort());
    void unitById;
  });
});
