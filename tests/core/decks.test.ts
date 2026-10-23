import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS, STACK_MAX, TREMOR_STUN, createBattle, executeRound, statusStacks } from '../../src/core/battle';
import { newRun, validLoadout } from '../../src/core/run';
import { analyzeTeam } from '../../src/core/team';
import type { BattleEvent, BattleState } from '../../src/core/types';
import { DECKS } from '../../src/data/decks';
import { SPELLS } from '../../src/data/spells';
import { UNIT_LIST } from '../../src/data/units';

// a0 솔레아 · a1 루네 · a2 녹스 · a3 벨라
const TEAM = ['solea', 'lune', 'nox', 'vela'];

function battle(enemies: string[], seed = 1, loadouts: Record<string, string[]> = {}): BattleState {
  return createBattle(newRun(TEAM, seed, loadouts).team, enemies, { ...DEFAULT_MODS, startStardust: 10 }, seed);
}

function damageAfter(events: BattleEvent[], spellId: string): number {
  const i = events.findIndex((e) => e.type === 'cast' && e.spellId === spellId);
  let sum = 0;
  for (const e of events.slice(i + 1)) {
    if (e.type === 'cast' || e.type === 'enemyAct') break;
    if (e.type === 'damage' && e.source === 'ally') sum += e.amount + e.absorbed;
  }
  return sum;
}

describe('deck mechanics', () => {
  it('every unit has 9 learnable spells including its 5 defaults, and every spell exists', () => {
    for (const u of UNIT_LIST) {
      expect(u.pool).toHaveLength(9);
      for (const s of u.spells) expect(u.pool).toContain(s);
      for (const s of u.pool) expect(SPELLS[s]).toBeDefined();
    }
  });

  it('uses the equipped loadout when drawing hands', () => {
    const load = { solea: ['sun_kindle', 'stellar_core', 'supernova_lance', 'corona_rite', 'dawn_thrust'] };
    const b = battle(['fallen_keeper'], 3, load);
    for (let i = 0; i < 5 && b.outcome === 'ongoing'; i++) {
      for (const id of b.hands.a0) expect(load.solea).toContain(id);
      executeRound(b, []);
    }
  });

  it('rejects loadouts outside the pool or of the wrong size', () => {
    expect(validLoadout('solea', ['dawn_thrust'])).toBe(false);
    expect(validLoadout('solea', ['dawn_thrust', 'solar_cleave', 'flare_rush', 'noon_verdict', 'moon_veil'])).toBe(false);
    expect(() => newRun(TEAM, 1, { solea: ['moon_veil'] })).toThrow();
  });

  it('solar core persists across rounds, caps, and supernova lance burns it for a bigger hit', () => {
    const b = battle(['fallen_keeper'], 2);
    for (let r = 0; r < 3; r++) {
      b.hands.a0 = ['stellar_core', 'sun_kindle'];
      executeRound(b, [{ allyUid: 'a0', spellId: 'stellar_core' }]);
    }
    expect(statusStacks(b.allies[0], 'solarCore')).toBe(STACK_MAX.solarCore);

    const cold = battle(['fallen_keeper'], 2);
    cold.hands.a0 = ['supernova_lance', 'sun_kindle'];
    const coldHit = damageAfter(executeRound(cold, [{ allyUid: 'a0', spellId: 'supernova_lance' }]), 'supernova_lance');
    b.stardust = 10;
    b.hands.a0 = ['supernova_lance', 'sun_kindle'];
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'supernova_lance' }]);
    expect(damageAfter(events, 'supernova_lance')).toBeGreaterThan(coldHit * 3);
    expect(events.some((e) => e.type === 'unleash' && e.stack === 'solarCore' && e.stacks === STACK_MAX.solarCore)).toBe(true);
    expect(statusStacks(b.allies[0], 'solarCore')).toBe(0);
  });

  it('solea gains solar core when she hits a burning enemy', () => {
    const b = battle(['fallen_keeper'], 3);
    b.enemies[0].statuses.push({ id: 'burn', turns: 3, value: 2 });
    b.hands.a0 = ['dawn_thrust', 'sun_oath'];
    executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]);
    expect(statusStacks(b.allies[0], 'solarCore')).toBe(1);
  });

  it('rupture builds under a volley and adds flat damage to the next ally hit', () => {
    const b = battle(['fallen_keeper'], 5);
    b.hands.a3 = ['gatling_comet', 'tail_volley'];
    executeRound(b, [{ allyUid: 'a3', spellId: 'gatling_comet' }]);
    const rupture = b.enemies[0].statuses.find((s) => s.id === 'rupture');
    expect(rupture?.value).toBeGreaterThanOrEqual(5);
    // 벨라는 균열 걸린 적을 맞힐 때마다 조준이 쌓인다
    expect(statusStacks(b.allies[3], 'aim')).toBeGreaterThanOrEqual(4);

    const fresh = battle(['fallen_keeper'], 5);
    fresh.hands.a0 = ['dawn_thrust', 'sun_oath'];
    const plain = damageAfter(executeRound(fresh, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]), 'dawn_thrust');
    b.hands.a0 = ['dawn_thrust', 'sun_oath'];
    const cracked = damageAfter(executeRound(b, [{ allyUid: 'a0', spellId: 'dawn_thrust' }]), 'dawn_thrust');
    expect(cracked - plain).toBeGreaterThanOrEqual((rupture?.value ?? 0) - 1);
  });

  it('rot seed turns burn into stronger erosion, and abyss feast devours erosion and rupture', () => {
    const b = battle(['fallen_keeper'], 6);
    b.enemies[0].statuses.push({ id: 'burn', turns: 3, value: 4 });
    b.hands.a2 = ['rot_seed', 'siphon'];
    executeRound(b, [{ allyUid: 'a2', spellId: 'rot_seed' }]);
    expect(statusStacks(b.enemies[0], 'burn')).toBe(0);
    expect(statusStacks(b.enemies[0], 'erosion')).toBeGreaterThanOrEqual(6);

    b.enemies[0].statuses.push({ id: 'rupture', turns: 3, value: 3 });
    b.stardust = 10;
    b.hands.a2 = ['abyss_feast', 'siphon'];
    executeRound(b, [{ allyUid: 'a2', spellId: 'abyss_feast' }]);
    expect(statusStacks(b.enemies[0], 'erosion')).toBe(0);
    expect(statusStacks(b.enemies[0], 'rupture')).toBe(0);
  });

  it('crescent finale releases the tide that healing built up', () => {
    const b = battle(['fallen_keeper'], 7);
    b.allies[0].hp = 10;
    b.hands.a1 = ['lunar_attune', 'moon_veil'];
    executeRound(b, [{ allyUid: 'a1', spellId: 'lunar_attune' }]);
    const tide = statusStacks(b.allies[1], 'tide');
    expect(tide).toBeGreaterThanOrEqual(3);
    b.stardust = 10;
    b.hands.a1 = ['crescent_finale', 'moon_veil'];
    const events = executeRound(b, [{ allyUid: 'a1', spellId: 'crescent_finale' }]);
    expect(events.some((e) => e.type === 'unleash' && e.stack === 'tide' && e.stacks >= 3)).toBe(true);
    expect(statusStacks(b.allies[1], 'tide')).toBeLessThan(tide);
  });

  it('every cast attunes its output element', () => {
    const b = battle(['fallen_keeper'], 7);
    b.hands.a1 = ['lunar_attune', 'moon_veil'];
    executeRound(b, [{ allyUid: 'a1', spellId: 'lunar_attune' }]);
    expect(b.attune.luna).toBeGreaterThanOrEqual(1);
  });

  it('a tremor burst at high potency stuns the enemy', () => {
    const team = ['astra', 'lune', 'nox', 'vela'];
    const b = createBattle(newRun(team, 4).team, ['fallen_keeper'], { ...DEFAULT_MODS, startStardust: 10 }, 4);
    b.enemies[0].statuses.push({ id: 'tremor', turns: 3, value: TREMOR_STUN });
    b.hands.a0 = ['star_judgement', 'taunt_star'];
    const events = executeRound(b, [{ allyUid: 'a0', spellId: 'star_judgement' }]);
    expect(statusStacks(b.enemies[0], 'tremor')).toBe(0);
    expect(events.some((e) => e.type === 'enemyStunned') || b.enemies[0].hp <= 0).toBe(true);
  });

  it('overflow spends all remaining stardust as power', () => {
    const b = battle(['fallen_keeper'], 8);
    b.allies = b.allies.map((a) => (a.defId === 'solea' ? { ...a, defId: 'nebia', spells: ['overflow', 'star_tithe', 'amplify', 'primal_light', 'nebula_mist'] } : a));
    b.hands.a0 = ['overflow', 'star_tithe'];
    b.stardust = 9;
    executeRound(b, [{ allyUid: 'a0', spellId: 'overflow' }]);
    expect(b.stardust).toBe(DEFAULT_MODS.stardustPerTurn);
  });

  it('doom echo detonates pending dooms right away', () => {
    const b = battle(['fallen_keeper'], 9);
    b.enemies[0].statuses.push({ id: 'doom', turns: 1, value: 20 });
    b.hands.a2 = ['doom_echo', 'siphon'];
    const events = executeRound(b, [{ allyUid: 'a2', spellId: 'doom_echo' }]);
    const castAt = events.findIndex((e) => e.type === 'cast');
    const firstEnemyAct = events.findIndex((e) => e.type === 'enemyAct' || e.type === 'enemyStunned');
    const boom = events.findIndex((e) => e.type === 'damage' && e.source === 'doom');
    expect(boom).toBeGreaterThan(castAt);
    expect(boom).toBeLessThan(firstEnemyAct === -1 ? Infinity : firstEnemyAct);
  });

  it('every preset deck is a legal team whose loadouts can chain', () => {
    for (const d of DECKS) {
      const ids = Object.keys(d.loadout);
      expect(ids).toHaveLength(4);
      for (const id of ids) expect(validLoadout(id, d.loadout[id])).toBe(true);
      expect(analyzeTeam(ids, d.loadout).maxChain).toBeGreaterThanOrEqual(3);
    }
  });
});
