import { describe, expect, it } from 'vitest';
import { bestPlan } from '../../src/core/autoplan';
import { DEFAULT_MODS, HAND_SIZE, createBattle, executeRound, getFocus, hasStatus, validatePlan } from '../../src/core/battle';
import { newRun } from '../../src/core/run';
import type { BattleState, BattleEvent } from '../../src/core/types';
import { unitById } from '../../src/data/units';

// a0 솔레아(태양) · a1 루네(달) · a2 녹스(공허) · a3 벨라(혜성)
const TEAM = ['solea', 'lune', 'nox', 'vela'];

function battle(enemies: string[], seed = 1, mods = DEFAULT_MODS): BattleState {
  return createBattle(newRun(TEAM, seed).team, enemies, { ...mods }, seed);
}

/** 테스트용: 손패를 원하는 스킬로 고정한다. */
function hand(b: BattleState, cards: Record<string, string[]>): void {
  b.hands = { ...b.hands, ...cards };
}

function hitAfterCast(events: BattleEvent[], spellId: string): number {
  const i = events.findIndex((e) => e.type === 'cast' && e.spellId === spellId);
  const hit = events.slice(i).find((e) => e.type === 'damage');
  return hit && hit.type === 'damage' ? hit.amount + hit.absorbed : 0;
}

describe('battle', () => {
  it('draws two skills per ally from their own deck and rolls intents', () => {
    const b = battle(['stray_shard', 'shadow_comet']);
    expect(b.enemies.every((e) => e.intent !== null)).toBe(true);
    for (const a of b.allies) {
      expect(b.hands[a.uid]).toHaveLength(HAND_SIZE);
      for (const id of b.hands[a.uid]) expect(unitById(a.defId).spells).toContain(id);
    }
  });

  it('redraws hands every round', () => {
    const b = battle(['fallen_keeper'], 4);
    const seen = new Set<string>();
    for (let i = 0; i < 6 && b.outcome === 'ongoing'; i++) {
      seen.add(b.hands.a0.join());
      executeRound(b, []);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('rejects skills that are not in the hand', () => {
    const b = battle(['stray_shard']);
    hand(b, { a0: ['dawn_thrust', 'sun_oath'] });
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'solar_cleave' }])).toMatch('손패');
  });

  it('rejects plans that cost more stardust than available or reuse an ally', () => {
    const b = battle(['stray_shard']);
    hand(b, { a0: ['solar_cleave', 'flare_rush'], a1: ['tidal_song', 'fullmoon_ward'], a2: ['retrograde', 'collapse'] });
    const tooMuch = [
      { allyUid: 'a0', spellId: 'solar_cleave' },
      { allyUid: 'a1', spellId: 'tidal_song' },
      { allyUid: 'a2', spellId: 'retrograde' },
    ];
    expect(validatePlan(b, tooMuch)).toMatch('성진');
    expect(validatePlan(b, [{ allyUid: 'a0', spellId: 'solar_cleave' }, { allyUid: 'a0', spellId: 'flare_rush' }])).not.toBeNull();
  });

  it('a linked cast deals more damage than an unlinked one', () => {
    const mods = { ...DEFAULT_MODS, startStardust: 10 };
    const linked = battle(['fallen_keeper'], 7, mods);
    const unlinked = battle(['fallen_keeper'], 7, mods);
    hand(linked, { a0: ['dawn_thrust', 'sun_oath'], a1: ['crescent_edge', 'moon_veil'] });
    hand(unlinked, { a3: ['meteor_snipe', 'tail_volley'], a1: ['crescent_edge', 'moon_veil'] });
    const a = executeRound(linked, [{ allyUid: 'a0', spellId: 'dawn_thrust' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    const b = executeRound(unlinked, [{ allyUid: 'a3', spellId: 'meteor_snipe' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    expect(hitAfterCast(a, 'crescent_edge')).toBeGreaterThan(hitAfterCast(b, 'crescent_edge'));
  });

  it('eclipse stuns the focused enemy so it skips its action', () => {
    const b = battle(['fallen_keeper'], 3);
    hand(b, { a0: ['dawn_thrust', 'sun_oath'], a1: ['crescent_edge', 'moon_veil'] });
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    expect(events.some((e) => e.type === 'reaction' && e.reactionId === 'eclipse')).toBe(true);
    expect(events.some((e) => e.type === 'enemyStunned')).toBe(true);
  });

  it('a full chain triggers the constellation bonus', () => {
    const b = battle(['fallen_keeper'], 5, { ...DEFAULT_MODS, startStardust: 10 });
    hand(b, { a0: ['dawn_thrust', 'sun_oath'], a1: ['crescent_edge', 'moon_veil'], a2: ['void_touch', 'siphon'], a3: ['tail_volley', 'meteor_snipe'] });
    const events = executeRound(b, [
      { allyUid: 'a0', spellId: 'dawn_thrust' },
      { allyUid: 'a1', spellId: 'crescent_edge' },
      { allyUid: 'a2', spellId: 'void_touch' },
      { allyUid: 'a3', spellId: 'tail_volley' },
    ]);
    expect(events.some((e) => e.type === 'fullChain')).toBe(true);
    expect(b.stats.maxChain).toBe(4);
  });

  it('multi-hit skills hit several times', () => {
    const b = battle(['fallen_keeper'], 8, { ...DEFAULT_MODS, startStardust: 10 });
    hand(b, { a0: ['flare_rush', 'sun_oath'] });
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'flare_rush' }]);
    const playerHits = events.filter((e) => e.type === 'damage' && e.source === 'ally');
    const stages = events.filter((e) => e.type === 'stage');
    expect(stages).toHaveLength(4);
    // 네 번째 타격은 태양핵 2 이상일 때만 나간다
    expect(playerHits).toHaveLength(stages.filter((e) => e.type === 'stage' && !e.skipped).length);
    expect(playerHits.length).toBeGreaterThanOrEqual(3);
  });

  it('execute doubles damage on low-HP targets', () => {
    const mods = { ...DEFAULT_MODS, startStardust: 10 };
    const full = battle(['fallen_keeper'], 9, mods);
    const low = battle(['fallen_keeper'], 9, mods);
    low.enemies[0].hp = 40;
    hand(full, { a0: ['noon_verdict', 'sun_oath'] });
    hand(low, { a0: ['noon_verdict', 'sun_oath'] });
    const a = hitAfterCast(executeRound(full, [{ allyUid: 'a0', spellId: 'noon_verdict' }]), 'noon_verdict');
    const b = hitAfterCast(executeRound(low, [{ allyUid: 'a0', spellId: 'noon_verdict' }]), 'noon_verdict');
    expect(b).toBeGreaterThanOrEqual(a * 2 - 1);
  });

  it('lifesteal heals the caster', () => {
    const b = battle(['fallen_keeper'], 10);
    b.allies[2].hp = 20;
    hand(b, { a2: ['siphon', 'void_touch'] });
    const events = executeRound(b, [{ allyUid: 'a2', spellId: 'siphon' }]);
    expect(events.some((e) => e.type === 'heal' && e.targetUid === 'a2' && e.amount > 0)).toBe(true);
  });

  it('delayed strikes explode at the end of the round', () => {
    const b = battle(['fallen_keeper'], 11, { ...DEFAULT_MODS, startStardust: 10 });
    hand(b, { a3: ['orbital_strike', 'meteor_snipe'] });
    const events = executeRound(b, [{ allyUid: 'a3', spellId: 'orbital_strike' }]);
    expect(events.some((e) => e.type === 'damage' && e.source === 'doom' && e.amount + e.absorbed > 20)).toBe(true);
    expect(hasStatus(b.enemies[0], 'doom')).toBe(false);
  });

  it('boost raises the next cast multiplier', () => {
    const b = createBattle(newRun(['nebia', 'solea', 'lune', 'vela'], 2).team, ['fallen_keeper'], { ...DEFAULT_MODS, startStardust: 10 }, 2);
    hand(b, { a0: ['amplify', 'primal_light'], a1: ['dawn_thrust', 'sun_oath'] });
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'amplify' }, { allyUid: 'a1', spellId: 'dawn_thrust' }]);
    const cast = events.find((e) => e.type === 'cast' && e.spellId === 'dawn_thrust');
    expect(cast && cast.type === 'cast' ? cast.mult : 0).toBe(1.4);
  });

  it('taunt pulls single attacks and counter strikes back', () => {
    const b = createBattle(newRun(['astra', 'solea', 'lune', 'vela'], 3).team, ['stray_shard'], { ...DEFAULT_MODS, startStardust: 10 }, 3);
    b.enemies[0].intent = { kind: 'attack', power: 10, targetId: 'a3' };
    hand(b, { a0: ['taunt_star', 'counter_stance'] });
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'taunt_star' }]);
    const enemyHit = events.find((e) => e.type === 'damage' && e.source === 'enemy');
    expect(enemyHit && enemyHit.type === 'damage' ? enemyHit.targetUid : null).toBe('a0');

    const c = createBattle(newRun(['astra', 'solea', 'lune', 'vela'], 3).team, ['fallen_keeper'], { ...DEFAULT_MODS, startStardust: 10 }, 3);
    c.enemies[0].intent = { kind: 'attack', power: 10, targetId: 'a0' };
    hand(c, { a0: ['counter_stance', 'taunt_star'] });
    const ev2 = executeRound(c, [{ allyUid: 'a0', spellId: 'counter_stance' }]);
    expect(ev2.some((e) => e.type === 'damage' && e.source === 'counter')).toBe(true);
  });

  it('statuses expire at the end of the round', () => {
    const b = battle(['fallen_keeper'], 2, { ...DEFAULT_MODS, startStardust: 10 });
    hand(b, { a0: ['dawn_thrust', 'sun_oath'], a1: ['crescent_edge', 'moon_veil'] });
    executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }, { allyUid: 'a1', spellId: 'crescent_edge' }]);
    expect(hasStatus(b.enemies[0], 'stun')).toBe(false);
  });

  it('focus moves to a living enemy after the focus dies', () => {
    const b = battle(['stray_shard', 'stray_shard'], 9);
    b.enemies[0].hp = 1;
    hand(b, { a0: ['dawn_thrust', 'sun_oath'] });
    executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]);
    expect(getFocus(b)?.uid).toBe('e1');
  });

  it('is deterministic for the same seed and plan', () => {
    const a = battle(['shadow_comet', 'stray_shard'], 42);
    const b = battle(['shadow_comet', 'stray_shard'], 42);
    const plan = [{ allyUid: 'a0', spellId: a.hands.a0[0] }];
    expect(executeRound(a, plan)).toEqual(executeRound(b, plan));
  });

  it('the auto planner can win the first floor', () => {
    const b = battle(['stray_shard', 'stray_shard'], 11);
    for (let i = 0; i < 30 && b.outcome === 'ongoing'; i++) executeRound(b, bestPlan(b));
    expect(b.outcome).toBe('victory');
  });
});
