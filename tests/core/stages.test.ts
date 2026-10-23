import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS, createBattle, executeRound, statusStacks } from '../../src/core/battle';
import { newRun } from '../../src/core/run';
import type { BattleEvent, BattleState } from '../../src/core/types';
import { describeSpell, spellPlainText } from '../../src/data/describe';
import { SPELLS } from '../../src/data/spells';

// a0 솔레아 · a1 루네 · a2 녹스 · a3 벨라
const TEAM = ['solea', 'lune', 'nox', 'vela'];

function battle(enemies: string[], seed = 1): BattleState {
  return createBattle(newRun(TEAM, seed).team, enemies, { ...DEFAULT_MODS, startStardust: 10 }, seed);
}

const stagesOf = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { type: 'stage' }> => e.type === 'stage');

describe('staged skills', () => {
  it('every stage announces itself, and a stage whose condition fails is skipped', () => {
    const b = battle(['fallen_keeper'], 2);
    b.hands.a3 = ['tail_volley', 'meteor_snipe'];
    const events = executeRound(b, [{ allyUid: 'a3', spellId: 'tail_volley' }]);
    const st = stagesOf(events);
    expect(st.map((e) => e.index)).toEqual([0, 1, 2, 3]);
    expect(st.every((e) => e.total === 4)).toBe(true);
    // Ⅳ는 조준 2 이상일 때만: 앞 타격으로 조준이 쌓였으면 나간다
    const hits = events.filter((e) => e.type === 'damage' && e.source === 'ally').length;
    expect(hits).toBe(st.filter((e) => !e.skipped).length);
  });

  it('a gated stage is skipped when its condition is not met', () => {
    const b = battle(['fallen_keeper'], 3);
    b.hands.a1 = ['moon_brand', 'moon_veil'];
    // 월흔 Ⅲ은 대상 월영 3 이상일 때만 나간다. 깨끗한 적이면 Ⅱ의 월영 2만 걸린다.
    const events = executeRound(b, [{ allyUid: 'a1', spellId: 'moon_brand' }]);
    const third = stagesOf(events)[2];
    expect(third.skipped).toBe(true);
  });

  it('combat-start effects of every planned cast happen before the first cast', () => {
    const b = battle(['fallen_keeper'], 4);
    b.hands.a3 = ['meteor_snipe', 'tail_volley'];
    b.hands.a0 = ['sun_oath', 'dawn_thrust'];
    const events = executeRound(b, [
      { allyUid: 'a3', spellId: 'meteor_snipe' },
      { allyUid: 'a0', spellId: 'sun_oath' },
    ]);
    const firstCast = events.findIndex((e) => e.type === 'cast');
    const starts = events.map((e, i) => (e.type === 'trigger' && e.phase === 'start' ? i : -1)).filter((i) => i >= 0);
    expect(starts).toHaveLength(2);
    expect(Math.max(...starts)).toBeLessThan(firstCast);
  });

  it('a cast the team cannot afford does not fire its combat-start effects', () => {
    const b = battle(['fallen_keeper'], 4);
    b.stardust = 1;
    b.hands.a0 = ['supernova_lance', 'dawn_thrust'];
    const events = executeRound(b, []);
    expect(events.some((e) => e.type === 'trigger')).toBe(false);
  });

  it('on-kill effects fire once when the skill finishes an enemy', () => {
    const b = battle(['stray_shard', 'stray_shard'], 5);
    b.enemies[0].hp = 3;
    b.hands.a0 = ['dawn_thrust', 'sun_oath'];
    const before = statusStacks(b.allies[0], 'solarCore');
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]);
    expect(events.filter((e) => e.type === 'trigger' && e.phase === 'kill')).toHaveLength(1);
    expect(statusStacks(b.allies[0], 'solarCore')).toBeGreaterThanOrEqual(before + 2);
  });

  it('hit riders check the enemy that was hit', () => {
    const b = battle(['fallen_keeper'], 6);
    b.enemies[0].statuses.push({ id: 'burn', turns: 3, value: 3 });
    b.hands.a0 = ['dawn_thrust', 'sun_oath'];
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]);
    // 여명 찌르기 Ⅰ: [대상 화상 3 이상] 태양핵 +1 — 패시브(+1)와 합쳐 한 타격에 두 번 오른다
    const firstStage = events.findIndex((e) => e.type === 'stage');
    const secondStage = events.findIndex((e, i) => i > firstStage && e.type === 'stage');
    const gains = events.slice(firstStage, secondStage).filter((e) => e.type === 'status' && e.status === 'solarCore');
    expect(gains.length).toBeGreaterThanOrEqual(2);
  });
});

describe('spell descriptions', () => {
  it('every spell has at most one attack and a readable generated description', () => {
    for (const sp of Object.values(SPELLS)) {
      expect(sp.effects.filter((e) => e.kind === 'damage').length).toBeLessThanOrEqual(1);
      const text = spellPlainText(sp);
      expect(text).not.toMatch(/undefined|NaN|\[\]/);
      const d = describeSpell(sp);
      expect(d.pre.length + d.stages.length + d.post.length).toBeGreaterThan(0);
    }
  });

  it('damage skills describe each stage with its own power', () => {
    const d = describeSpell(SPELLS.gatling_comet);
    expect(d.stages).toHaveLength(6);
    expect(d.stages[5].only).toContain('조준 4 이상');
    expect(d.head).toBe('대상에게 6단 공격');
  });
});
