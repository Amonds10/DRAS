import { describe, expect, it } from 'vitest';
import { STACK_MAX, maxEnergy, statusStacks } from '../../src/core/battle';
import { ABILITIES, totalPower } from '../../src/data/abilities';
import { DECKS } from '../../src/data/decks';
import { ENEMIES } from '../../src/data/enemies';
import { UNIT_LIST } from '../../src/data/units';
import { allyDamage, battle, giveTurn, use } from './helpers';

describe('kits', () => {
  it('every unit has a basic attack, a skill and an ultimate in the right slots', () => {
    for (const u of UNIT_LIST) {
      for (const slot of ['basic', 'skill', 'ultimate'] as const) {
        const ab = ABILITIES[u.kit[slot]];
        expect(ab, `${u.id} ${slot}`).toBeDefined();
        expect(ab.slot).toBe(slot);
      }
    }
  });

  it('the attack % written in each description matches the data', () => {
    for (const ab of Object.values(ABILITIES)) {
      const m = ab.desc.match(/공격력 (\d+)%(?:의|에)/);
      const power = totalPower(ab);
      if (!power || ab.desc.includes('각각')) continue;
      expect(m, ab.id).not.toBeNull();
      expect(Number(m![1]), ab.id).toBe(power);
    }
  });

  it('descriptions use prose, not bracket tags', () => {
    for (const ab of Object.values(ABILITIES)) expect(ab.desc).not.toMatch(/\[(사용 시|적중 시|전투 시작 시)\]/);
  });

  it('every enemy has a weakness each team preset can hit at least sometimes', () => {
    for (const d of DECKS) {
      const els = new Set(d.team.map((id) => UNIT_LIST.find((u) => u.id === id)!.element));
      const covered = Object.values(ENEMIES).filter((e) => e.weak.some((w) => els.has(w)));
      expect(covered.length, d.id).toBeGreaterThanOrEqual(3);
    }
  });
});

// a0 솔레아 · a1 루네 · a2 녹스 · a3 벨라
const TEAM = ['solea', 'lune', 'nox', 'vela'];

describe('synergy mechanics', () => {
  it('solar core builds on burning enemies and the ultimate burns it for a bigger hit', () => {
    const cold = battle(TEAM, ['fallen_keeper'], 2);
    giveTurn(cold, 'a0');
    cold.allies[0].energy = maxEnergy(cold.allies[0]);
    const coldHit = allyDamage(use(cold, 'a0', 'ultimate', 'e0'));

    const hot = battle(TEAM, ['fallen_keeper'], 2);
    hot.enemies[0].statuses.push({ id: 'burn', turns: 5, value: 4 });
    giveTurn(hot, 'a0');
    use(hot, 'a0', 'skill', 'e0');
    expect(statusStacks(hot.allies[0], 'solarCore')).toBeGreaterThanOrEqual(3);
    hot.allies[0].statuses = hot.allies[0].statuses.filter((s) => s.id !== 'solarCore');
    hot.allies[0].statuses.push({ id: 'solarCore', turns: 99, value: STACK_MAX.solarCore });
    giveTurn(hot, 'a1');
    hot.allies[0].energy = maxEnergy(hot.allies[0]);
    const events = use(hot, 'a0', 'ultimate', 'e0');
    expect(events.some((e) => e.type === 'unleash' && e.stack === 'solarCore')).toBe(true);
    expect(allyDamage(events)).toBeGreaterThan(coldHit * 2.5);
  });

  it('rupture adds flat damage to every hit', () => {
    const plain = battle(TEAM, ['fallen_keeper'], 5);
    giveTurn(plain, 'a0');
    const a = allyDamage(use(plain, 'a0', 'basic', 'e0'));
    const cracked = battle(TEAM, ['fallen_keeper'], 5);
    cracked.enemies[0].statuses.push({ id: 'rupture', turns: 5, value: 4 });
    giveTurn(cracked, 'a0');
    const b = allyDamage(use(cracked, 'a0', 'basic', 'e0'));
    expect(b - a).toBeGreaterThanOrEqual(2 * 4 - 1);
  });

  it("nox's skill turns burn into stronger erosion", () => {
    const b = battle(TEAM, ['fallen_keeper'], 6);
    b.enemies[0].statuses.push({ id: 'burn', turns: 3, value: 4 });
    giveTurn(b, 'a2');
    use(b, 'a2', 'skill', 'e0');
    expect(statusStacks(b.enemies[0], 'burn')).toBe(0);
    expect(statusStacks(b.enemies[0], 'erosion')).toBeGreaterThanOrEqual(6 + 2);
  });

  it('healing fills tide, and moonshade heals whoever hits the marked enemy', () => {
    const b = battle(TEAM, ['fallen_keeper'], 7);
    b.allies[0].hp = 20;
    giveTurn(b, 'a1');
    use(b, 'a1', 'skill', 'a0');
    expect(b.allies[0].hp).toBeGreaterThan(20);
    expect(statusStacks(b.allies[1], 'tide')).toBeGreaterThanOrEqual(2);
    b.enemies[0].statuses.push({ id: 'moonshade', turns: 2, value: 5 });
    b.allies[3].hp = 30;
    giveTurn(b, 'a3');
    const events = use(b, 'a3', 'basic', 'e0');
    expect(events.some((e) => e.type === 'heal' && e.targetUid === 'a3' && e.amount > 0)).toBe(true);
  });

  it("nebia's ultimate pulls every ally's next turn forward", () => {
    const b = battle(['nebia', 'solea', 'lune', 'astra'], ['fallen_keeper'], 8);
    giveTurn(b, 'a0');
    const before = { ...b.av };
    b.allies[0].energy = maxEnergy(b.allies[0]);
    use(b, 'a0', 'ultimate');
    for (const uid of ['a1', 'a2', 'a3']) expect(b.av[uid]).toBeLessThan(before[uid]);
  });

  it('a tremor burst at high potency stuns', () => {
    const b = battle(['astra', 'lune', 'nox', 'vela'], ['fallen_keeper'], 4);
    b.enemies[0].statuses.push({ id: 'tremor', turns: 3, value: 6 });
    giveTurn(b, 'a0');
    b.allies[0].energy = maxEnergy(b.allies[0]);
    const events = use(b, 'a0', 'ultimate');
    expect(statusStacks(b.enemies[0], 'tremor')).toBe(0);
    expect(events.some((e) => e.type === 'status' && e.status === 'stun') || b.enemies[0].hp <= 0).toBe(true);
  });
});
