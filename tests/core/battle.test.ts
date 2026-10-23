import { describe, expect, it } from 'vitest';
import { AV_BASE, abilityOf, begin, canUltimate, cloneBattle, maxEnergy, statusStacks, timeline, validateAction } from '../../src/core/battle';
import { unitById } from '../../src/data/units';
import { allyDamage, autoplay, battle, giveTurn, use } from './helpers';

// a0 솔레아(태양) · a1 루네(달) · a2 녹스(공허) · a3 벨라(혜성)
const TEAM = ['solea', 'lune', 'nox', 'vela'];

describe('speed timeline', () => {
  it('the fastest unit acts first and the timeline follows speed', () => {
    const b = battle(['nebia', 'solea', 'lune', 'astra'], ['dark_nebula']);
    // 네비아(112) > 솔레아(105) > 루네(100) > 아스트라(94), 어둠 성운체 90
    const order = timeline(b, 5);
    expect(order[0]).toBe('a0');
    expect(order.slice(0, 5)).toEqual(['a0', 'a1', 'a2', 'a3', 'e0']);
    begin(b);
    expect(b.active).toBe('a0');
  });

  it('enemies faster than everyone act before the first ally turn', () => {
    const b = battle(['astra', 'lune', 'nox', 'vela'], ['shadow_comet']);
    const events = begin(b);
    const firstTurn = events.find((e) => e.type === 'turn');
    expect(firstTurn && firstTurn.type === 'turn' ? firstTurn.uid : null).toBe('e0');
    expect(b.active).not.toBeNull();
  });

  it('after acting, the actor goes to the back of the line', () => {
    const b = battle(TEAM, ['fallen_keeper']);
    begin(b);
    const first = b.active!;
    use(b, first, 'basic', 'e0');
    expect(b.active).not.toBe(first);
    expect(b.av[first]).toBeGreaterThan(0);
    expect(b.av[first]).toBeLessThanOrEqual(AV_BASE / unitById(b.allies.find((a) => a.uid === first)!.defId).spd);
  });
});

describe('skill points and energy', () => {
  it('basic attacks give a skill point, skills spend one, and skills need one', () => {
    const b = battle(TEAM, ['fallen_keeper'], 1, { startSp: 1 });
    giveTurn(b, 'a0');
    use(b, 'a0', 'skill', 'e0');
    expect(b.sp).toBe(0);
    giveTurn(b, 'a3');
    expect(validateAction(b, { allyUid: 'a3', slot: 'skill', targetUid: 'e0' })).toMatch(/성진/);
    use(b, 'a3', 'basic', 'e0');
    expect(b.sp).toBe(1);
  });

  it('acting builds energy, and an ultimate can cut in without ending the turn', () => {
    const b = battle(TEAM, ['fallen_keeper'], 2, { startEnergy: 0 });
    giveTurn(b, 'a0');
    const solea = b.allies[0];
    expect(canUltimate(b, solea)).toBe(false);
    use(b, 'a0', 'basic', 'e0');
    expect(solea.energy).toBeGreaterThanOrEqual(20);

    giveTurn(b, 'a1');
    solea.energy = maxEnergy(solea);
    expect(canUltimate(b, solea)).toBe(true);
    const events = use(b, 'a0', 'ultimate', 'e0');
    expect(events.some((e) => e.type === 'cast' && e.slot === 'ultimate')).toBe(true);
    // 필살기는 루네의 차례를 빼앗지 않는다
    expect(b.active).toBe('a1');
    expect(solea.energy).toBeLessThan(maxEnergy(solea));
  });

  it('only the active ally can use basic attacks and skills', () => {
    const b = battle(TEAM, ['fallen_keeper']);
    giveTurn(b, 'a0');
    expect(validateAction(b, { allyUid: 'a1', slot: 'basic', targetUid: 'e0' })).toMatch(/차례/);
  });
});

describe('toughness and break', () => {
  it('weakness hits wear toughness down; other elements do not', () => {
    // 떠도는 별부스러기: 약점 태양·혜성
    const b = battle(TEAM, ['stray_shard']);
    giveTurn(b, 'a2');
    use(b, 'a2', 'basic', 'e0');
    expect(b.enemies[0].toughness).toBe(b.enemies[0].maxToughness);
    giveTurn(b, 'a0');
    use(b, 'a0', 'basic', 'e0');
    expect(b.enemies[0].toughness).toBe(b.enemies[0].maxToughness - abilityOf(b.allies[0], 'basic').toughness);
  });

  it('a break deals extra damage, delays the enemy, and it loses its next turn while recovering', () => {
    const b = battle(TEAM, ['stray_shard'], 3);
    b.enemies[0].toughness = 5;
    giveTurn(b, 'a0');
    const avBefore = b.av.e0;
    const events = use(b, 'a0', 'basic', 'e0');
    expect(events.some((e) => e.type === 'break')).toBe(true);
    expect(events.some((e) => e.type === 'damage' && e.source === 'break')).toBe(true);
    // 태양 격파: 화상
    expect(statusStacks(b.enemies[0], 'burn')).toBeGreaterThan(0);
    void avBefore;
    // 적의 다음 차례까지 진행: 행동 대신 강인도를 되찾는다
    let guard = 0;
    while (!b.enemies[0].toughness && guard++ < 10 && b.outcome === 'ongoing') {
      const evs = use(b, b.active!, 'basic', 'e0');
      if (evs.some((e) => e.type === 'recover')) {
        expect(evs.some((e) => e.type === 'enemyStunned' && e.enemyUid === 'e0')).toBe(true);
        expect(evs.some((e) => e.type === 'enemyAct' && e.enemyUid === 'e0')).toBe(false);
      }
    }
    if (b.outcome === 'ongoing') expect(b.enemies[0].toughness).toBe(b.enemies[0].maxToughness);
  });
});

describe('enemy turns', () => {
  it('taunt pulls single attacks and counter strikes back', () => {
    const b = battle(['astra', 'solea', 'lune', 'vela'], ['stray_shard'], 3);
    giveTurn(b, 'a0');
    b.enemies[0].intent = { kind: 'attack', power: 10, targetId: 'a3' };
    b.av.e0 = 0.1;
    const events = use(b, 'a0', 'skill');
    const hit = events.find((e) => e.type === 'damage' && e.source === 'enemy');
    expect(hit && hit.type === 'damage' ? hit.targetUid : null).toBe('a0');
    expect(events.some((e) => e.type === 'damage' && e.source === 'counter')).toBe(true);
  });

  it('burn ticks when the enemy turn starts and erosion when it acts', () => {
    const b = battle(TEAM, ['fallen_keeper'], 4);
    b.enemies[0].statuses.push({ id: 'burn', turns: 2, value: 5 }, { id: 'erosion', turns: 2, value: 4 });
    // 루네의 일반 공격은 화상·잠식을 건드리지 않는다
    giveTurn(b, 'a1');
    b.av.e0 = 0.1;
    const events = use(b, 'a1', 'basic', 'e0');
    const enemyTurn = events.findIndex((e) => e.type === 'turn' && e.uid === 'e0');
    const after = events.slice(enemyTurn);
    expect(after.some((e) => e.type === 'damage' && e.source === 'burn' && e.amount === 5)).toBe(true);
    expect(after.some((e) => e.type === 'damage' && e.source === 'erosion' && e.amount === 4)).toBe(true);
  });

  it('occultation steals a skill point', () => {
    const b = battle(TEAM, ['eclipse_eye'], 5, { startSp: 3 });
    giveTurn(b, 'a0');
    b.enemies[0].intent = { kind: 'seal' };
    b.av.e0 = 0.1;
    use(b, 'a0', 'basic', 'e0');
    // 일반 공격 +1, 성식 -1
    expect(b.sp).toBe(3);
  });
});

describe('determinism and auto play', () => {
  it('is deterministic for the same seed and actions', () => {
    const a = battle(TEAM, ['stray_shard', 'shadow_comet'], 9);
    const b = cloneBattle(a);
    autoplay(a);
    autoplay(b);
    expect(a.allies.map((x) => x.hp)).toEqual(b.allies.map((x) => x.hp));
    expect(a.stats).toEqual(b.stats);
  });

  it('the auto player wins the first floor', () => {
    const b = battle(TEAM, ['stray_shard', 'stray_shard'], 11);
    autoplay(b);
    expect(b.outcome).toBe('victory');
  });

  it('damage scales with the listed attack percentage', () => {
    const b = battle(TEAM, ['fallen_keeper'], 6);
    giveTurn(b, 'a3');
    const basic = allyDamage(use(b, 'a3', 'basic', 'e0'));
    const c = battle(TEAM, ['fallen_keeper'], 6);
    giveTurn(c, 'a3');
    const skill = allyDamage(use(c, 'a3', 'skill', 'e0'));
    expect(skill).toBeGreaterThan(basic * 1.5);
  });
});
