import { abilityById } from '../data/abilities';
import { enemyById } from '../data/enemies';
import { unitById } from '../data/units';
import { Rng } from './rng';
import type {
  Action,
  Affinity,
  Ally,
  AllyTarget,
  BattleEvent,
  BattleMods,
  BattleState,
  AbilityDef,
  Cond,
  DamageEffect,
  DamageSource,
  Effect,
  Enemy,
  Intent,
  Keyword,
  Rider,
  Slot,
  Stack,
  Stage,
  Status,
  StatusId,
} from './types';

/*
 * 속도 기반 턴제(스타레일식).
 * - 유닛마다 행동 값(AV = 10000 / 속도)이 있고, 가장 먼저 0이 되는 유닛이 행동한다.
 * - 술사 차례에는 일반 공격(성진 +1) 또는 전투 스킬(성진 -1)을 쓴다. 필살기는 에너지가 차면
 *   술사 차례 중 언제든 끼어들어 쓸 수 있고, 차례를 넘기지 않는다.
 * - 적은 약점 속성으로 맞으면 강인도가 깎이고, 0이 되면 격파된다: 추가 피해 + 속성 효과 +
 *   다음 차례를 잃는다(그 차례에 강인도가 돌아온다).
 */

export const AV_BASE = 10000;
export const MAX_SP = 5;
export const START_SP = 3;
const WEAKEN_FACTOR = 0.7;
const EXPOSE_FACTOR = 1.3;
/** 격파되지 않은 적은 받는 피해가 줄어든다(강인도 보호) */
const TOUGH_GUARD = 0.9;
const STAR_SHIELD_FACTOR = 0.7;
const EXECUTE_THRESHOLD = 0.35;
/** 양옆 대상에게 가는 피해·강인도 비율 */
const BLAST_SIDE = 0.5;
/** 격파되면 행동이 늦춰지는 비율 */
const BREAK_DELAY = 0.25;
export const KEYWORDS: Keyword[] = ['burn', 'rupture', 'erosion', 'tremor', 'moonshade'];
const DEBUFFS: StatusId[] = ['stun', 'weaken', 'expose', 'doom', ...KEYWORDS];
export const KEYWORD_MAX_VALUE = 20;
export const KEYWORD_MAX_TURNS = 10;
export const STACK_MAX: Record<Stack, number> = { solarCore: 6, aim: 6, tide: 10, hunger: 10, fortitude: 8, wave: 3 };
const AIM_STEP = 0.06;
const HUNGER_STEP = 0.05;
const WAVE_STEP = 0.2;
export const TREMOR_STUN = 8;
/** 에너지: 일반 공격·전투 스킬·필살기 뒤·피격·처치 */
export const ENERGY_GAIN: Record<Slot | 'hit' | 'kill', number> = { basic: 20, skill: 30, ultimate: 5, hit: 10, kill: 10 };
/** 속성 격파 효과 */
export const BREAK_EFFECT: Record<Affinity, string> = {
  sol: '화상 3·2',
  luna: '월영 3·2, 약화 1턴',
  nebula: '모든 각인 위력 +2·횟수 +1',
  comet: '균열 3·3',
  void: '잠식 3·2',
  star: '진동 4·2',
};

export const DEFAULT_MODS: BattleMods = { startSp: START_SP, maxSp: MAX_SP, startEnergy: 0.5 };

type Unit = Ally | Enemy;

export function isAlive(u: { hp: number }): boolean {
  return u.hp > 0;
}

export function hasStatus(u: Unit, id: StatusId): boolean {
  return u.statuses.some((s) => s.id === id && s.turns > 0);
}

function statusValue(u: Unit, id: StatusId): number {
  return u.statuses.filter((s) => s.id === id).reduce((sum, s) => sum + (s.value ?? 0), 0);
}

export function statusStacks(u: Unit, id: StatusId): number {
  return u.statuses.find((s) => s.id === id)?.value ?? 0;
}

export function effectiveAtk(u: Unit): number {
  const atk = u.atk + statusValue(u, 'atkUp');
  return hasStatus(u, 'weaken') ? atk * WEAKEN_FACTOR : atk;
}

function defFactor(def: number): number {
  return 100 / (100 + def * 5);
}

export function speedOf(u: Unit): number {
  return 'energy' in u ? unitById(u.defId).spd : enemyById(u.defId).spd;
}

const baseAv = (u: Unit) => AV_BASE / speedOf(u);

export function abilityOf(ally: Ally, slot: Slot): AbilityDef {
  return abilityById(unitById(ally.defId).kit[slot]);
}

export function maxEnergy(ally: Ally): number {
  return unitById(ally.defId).energy;
}

export function canUltimate(state: BattleState, ally: Ally): boolean {
  return state.outcome === 'ongoing' && state.active !== null && isAlive(ally) && ally.energy >= maxEnergy(ally);
}

export function createBattle(allies: Ally[], enemyIds: string[], mods: BattleMods, seed: number): BattleState {
  const rng = new Rng(seed);
  const enemies: Enemy[] = enemyIds.map((id, i) => {
    const def = enemyById(id);
    return {
      uid: `e${i}`,
      defId: id,
      hp: def.maxHp,
      maxHp: def.maxHp,
      atk: def.atk,
      def: def.def,
      shield: 0,
      statuses: [],
      patternIndex: rng.int(def.pattern.length),
      intent: null,
      toughness: def.toughness,
      maxToughness: def.toughness,
      broken: false,
    };
  });
  const team = allies.map((a) => ({ ...a, shield: 0, statuses: [], energy: Math.round(unitById(a.defId).energy * mods.startEnergy) }));
  const state: BattleState = {
    allies: team,
    enemies,
    sp: Math.min(mods.startSp, mods.maxSp),
    maxSp: mods.maxSp,
    focusUid: enemies[0]?.uid ?? null,
    active: null,
    av: {},
    boost: 0,
    turns: 0,
    outcome: 'ongoing',
    rngState: rng.state,
    mods,
    stats: { breaks: 0, ultimates: 0, turns: 0 },
  };
  for (const u of [...team, ...enemies]) state.av[u.uid] = baseAv(u);
  for (const e of enemies) rollIntent(state, e, rng);
  state.rngState = rng.state;
  return state;
}

export function cloneBattle(state: BattleState): BattleState {
  return structuredClone(state);
}

function withRng<T>(state: BattleState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state;
  return out;
}

function rollIntent(state: BattleState, e: Enemy, rng: Rng): void {
  const pattern = enemyById(e.defId).pattern;
  const intent: Intent = { ...pattern[e.patternIndex % pattern.length] };
  const living = state.allies.filter(isAlive);
  if (intent.kind === 'attack' && living.length) intent.targetId = rng.pick(living).uid;
  e.intent = intent;
}

export function getFocus(state: BattleState): Enemy | null {
  const focused = state.enemies.find((e) => e.uid === state.focusUid);
  if (focused && isAlive(focused)) return focused;
  return state.enemies.find(isAlive) ?? null;
}

export function setFocus(state: BattleState, uid: string): void {
  const e = state.enemies.find((x) => x.uid === uid);
  if (e && isAlive(e)) state.focusUid = uid;
}

/** 앞으로의 행동 순서(현재 차례 포함), UI 타임라인용 */
export function timeline(state: BattleState, count = 8): string[] {
  const av = { ...state.av };
  const units = [...state.allies, ...state.enemies].filter(isAlive);
  const out: string[] = state.active ? [state.active] : [];
  if (state.active) av[state.active] = baseAv(units.find((u) => u.uid === state.active)!);
  while (out.length < count && units.length) {
    const next = units.reduce((a, b) => (av[b.uid] < av[a.uid] ? b : a));
    const dt = av[next.uid];
    for (const u of units) av[u.uid] -= dt;
    out.push(next.uid);
    av[next.uid] = baseAv(next);
  }
  return out;
}

const isKeyword = (id: StatusId): id is Keyword => (KEYWORDS as StatusId[]).includes(id);
const isStack = (id: StatusId): id is Stack => id in STACK_MAX;

function addStatus(u: Unit, id: StatusId, turns: number, value?: number): void {
  const existing = u.statuses.find((s) => s.id === id);
  if (isKeyword(id)) {
    if (existing) {
      existing.value = Math.min(KEYWORD_MAX_VALUE, (existing.value ?? 0) + (value ?? 0));
      existing.turns = Math.min(KEYWORD_MAX_TURNS, existing.turns + turns);
    } else u.statuses.push({ id, turns: Math.min(KEYWORD_MAX_TURNS, turns), value: Math.min(KEYWORD_MAX_VALUE, value ?? 0) });
    return;
  }
  if (isStack(id)) {
    if (existing) existing.value = Math.min(STACK_MAX[id], (existing.value ?? 0) + (value ?? 0));
    else u.statuses.push({ id, turns: 99, value: Math.min(STACK_MAX[id], value ?? 0) });
    return;
  }
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    if (value !== undefined) {
      const stacks = (id === 'atkUp' && turns >= 99) || id === 'doom';
      existing.value = stacks ? (existing.value ?? 0) + value : Math.max(existing.value ?? 0, value);
    }
  } else {
    const s: Status = { id, turns };
    if (value !== undefined) s.value = value;
    u.statuses.push(s);
  }
}

function keyword(u: Unit, id: Keyword): Status | undefined {
  return u.statuses.find((s) => s.id === id && s.turns > 0 && (s.value ?? 0) > 0);
}

function spendKeyword(u: Unit, id: Keyword): void {
  const s = u.statuses.find((x) => x.id === id);
  if (!s) return;
  s.turns--;
  if (s.turns <= 0) u.statuses = u.statuses.filter((x) => x !== s);
}

function gainStack(ally: Ally, stack: Stack, amount: number, events: BattleEvent[]): void {
  if (!isAlive(ally) || amount <= 0) return;
  const before = statusStacks(ally, stack);
  addStatus(ally, stack, 99, amount);
  const now = statusStacks(ally, stack);
  if (now !== before) events.push({ type: 'status', targetUid: ally.uid, status: stack, turns: 99, stacks: now });
}

/** 네비아의 패시브: 네비아가 거는 각인은 위력 +1 */
function inflict(target: Enemy, kw: Keyword, value: number, turns: number, caster: Ally | null, events: BattleEvent[]): void {
  if (!isAlive(target)) return;
  const v = value + (caster?.defId === 'nebia' ? 1 : 0);
  addStatus(target, kw, turns, v);
  const s = keyword(target, kw);
  events.push({ type: 'status', targetUid: target.uid, status: kw, turns: s?.turns ?? turns, stacks: s?.value ?? v });
}

/** 녹스의 패시브: 적이 화상·잠식 피해를 받을 때마다 허기 +1 */
function feedHunger(state: BattleState, events: BattleEvent[]): void {
  const nox = state.allies.find((a) => a.defId === 'nox' && isAlive(a));
  if (nox) gainStack(nox, 'hunger', 1, events);
}

function gainEnergy(ally: Ally, amount: number, events: BattleEvent[]): void {
  if (!isAlive(ally) || amount <= 0) return;
  const max = maxEnergy(ally);
  const before = ally.energy;
  ally.energy = Math.min(max, ally.energy + amount);
  if (ally.energy !== before) events.push({ type: 'energy', allyUid: ally.uid, energy: ally.energy });
}

function addSp(state: BattleState, amount: number, events: BattleEvent[]): void {
  const before = state.sp;
  state.sp = Math.max(0, Math.min(state.maxSp, state.sp + amount));
  if (state.sp !== before) events.push({ type: 'sp', amount: state.sp - before, total: state.sp });
}

function dealDamage(state: BattleState, target: Unit, amount: number, source: DamageSource, events: BattleEvent[]): number {
  if (!isAlive(target)) return 0;
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const hpLoss = Math.min(target.hp, amount - absorbed);
  target.hp -= hpLoss;
  events.push({ type: 'damage', targetUid: target.uid, amount: hpLoss, absorbed, source, hpAfter: target.hp, shieldAfter: target.shield });
  if (!isAlive(target)) {
    target.statuses = [];
    target.shield = 0;
    if ('intent' in target) target.intent = null;
    events.push({ type: 'death', uid: target.uid });
    if (state.focusUid === target.uid) state.focusUid = state.enemies.find(isAlive)?.uid ?? null;
  }
  return hpLoss + absorbed;
}

interface Ctx {
  caster: Ally;
  ability: AbilityDef;
  /** 고른 대상(적이면 Enemy, 아군이면 Ally) */
  enemy: Enemy | null;
  ally: Ally | null;
  /** 이번 행동에 걸린 추가 배율(공명파동·다음 행동 강화·중첩 소모) */
  mult: number;
  killed: boolean;
  /** 이번 행동으로 강인도를 이미 깎은 적 */
  toughHit: Set<string>;
}

function devourPower(target: Enemy, eff: DamageEffect): number {
  if (!eff.devour) return 0;
  return eff.devour.keywords.reduce((sum, k) => {
    const st = keyword(target, k);
    return sum + (st ? (st.value ?? 0) * st.turns * eff.devour!.per : 0);
  }, 0);
}

function hasAnyKeyword(u: Unit): boolean {
  return KEYWORDS.some((k) => !!keyword(u, k));
}

function allyHitAmount(state: BattleState, ctx: Ctx, eff: DamageEffect, target: Enemy, st: Stage, side: boolean, first: boolean): number {
  let raw = (st.power / 100) * effectiveAtk(ctx.caster);
  if (first) raw += devourPower(target, eff);
  raw += eff.fromShield ? ctx.caster.shield * eff.fromShield : 0;
  raw *= ctx.mult;
  if (side) raw *= BLAST_SIDE;
  if (eff.execute && target.hp / target.maxHp <= EXECUTE_THRESHOLD) raw *= eff.execute;
  if (eff.vsDebuffed && DEBUFFS.some((d) => hasStatus(target, d))) raw *= eff.vsDebuffed;
  for (const b of eff.bonusVs ?? []) if (b.keyword === 'any' ? hasAnyKeyword(target) : keyword(target, b.keyword)) raw *= b.mult;
  if (st.up && condMet(state, ctx, st.up.when, target)) raw *= st.up.mult;
  if (ctx.caster.defId === 'vela') raw *= 1 + statusStacks(ctx.caster, 'aim') * AIM_STEP;
  if (ctx.caster.defId === 'nox') raw *= 1 + statusStacks(ctx.caster, 'hunger') * HUNGER_STEP;
  if (!eff.pierce && !st.pierce) raw *= defFactor(target.def);
  if (hasStatus(target, 'expose')) raw *= EXPOSE_FACTOR;
  if (!target.broken) {
    raw *= TOUGH_GUARD;
    if (enemyById(target.defId).traits?.includes('starShield')) raw *= STAR_SHIELD_FACTOR;
  }
  // 균열: 맞을 때마다 위력만큼 고정 피해
  raw += keyword(target, 'rupture')?.value ?? 0;
  return Math.max(1, Math.round(raw));
}

function allyTargets(state: BattleState, ctx: { caster: Ally; ally: Ally | null }, target: AllyTarget): Ally[] {
  const living = state.allies.filter(isAlive);
  if (target === 'self') return isAlive(ctx.caster) ? [ctx.caster] : [];
  if (target === 'chosen') return ctx.ally && isAlive(ctx.ally) ? [ctx.ally] : isAlive(ctx.caster) ? [ctx.caster] : [];
  if (target === 'allAllies') return living;
  const lowest = [...living].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  return lowest ? [lowest] : [];
}

function healAlly(state: BattleState, a: Ally, amount: number, events: BattleEvent[]): void {
  if (!isAlive(a)) return;
  const healed = Math.min(a.maxHp - a.hp, amount);
  a.hp += healed;
  events.push({ type: 'heal', targetUid: a.uid, amount: healed, hpAfter: a.hp });
  // 루네의 패시브: 아군이 회복할 때마다 만조 +1
  const lune = state.allies.find((x) => x.defId === 'lune' && isAlive(x));
  if (lune && healed > 0) gainStack(lune, 'tide', 1, events);
}

function giveShield(a: Ally, amount: number, events: BattleEvent[]): void {
  if (!isAlive(a)) return;
  a.shield += amount;
  events.push({ type: 'shield', targetUid: a.uid, amount, shieldAfter: a.shield });
  // 아스트라의 패시브: 보호막을 얻을 때마다 불굴 +1
  if (a.defId === 'astra') gainStack(a, 'fortitude', 1, events);
}

function focusOf(state: BattleState, ctx: Ctx): Enemy | null {
  return ctx.enemy && isAlive(ctx.enemy) ? ctx.enemy : getFocus(state);
}

function enemyTargets(state: BattleState, ctx: Ctx, target: 'focus' | 'allEnemies'): Enemy[] {
  return target === 'focus' ? [focusOf(state, ctx)].filter((x): x is Enemy => !!x) : state.enemies.filter(isAlive);
}

function condMet(state: BattleState, ctx: Ctx, c: Cond, target: Enemy | null = focusOf(state, ctx)): boolean {
  if (c.targetHas) {
    if (!target) return false;
    if (c.targetHas === 'any') {
      if (!hasAnyKeyword(target)) return false;
    } else if ((keyword(target, c.targetHas)?.value ?? 0) < (c.targetMin ?? 1)) return false;
  }
  if (c.kinds && (!target || KEYWORDS.filter((k) => keyword(target, k)).length < c.kinds)) return false;
  if (c.casterHas && statusStacks(ctx.caster, c.casterHas) < (c.min ?? 1)) return false;
  if (c.sum && (target ? keyword(target, c.sum.keyword)?.value ?? 0 : 0) + statusStacks(ctx.caster, c.sum.stack) < c.sum.min) return false;
  if (c.targetHpBelow !== undefined && (!target || target.hp / target.maxHp > c.targetHpBelow)) return false;
  if (c.casterHpBelow !== undefined && ctx.caster.hp / ctx.caster.maxHp > c.casterHpBelow) return false;
  if (c.shielded && ctx.caster.shield <= 0) return false;
  if (c.broken && !target?.broken) return false;
  return true;
}

function spreadKeyword(state: BattleState, from: Enemy, kw: Keyword, ratio: number, caster: Ally | null, events: BattleEvent[]): void {
  const st = keyword(from, kw);
  if (!st) return;
  const v = Math.max(1, Math.round((st.value ?? 0) * ratio));
  const n = Math.max(1, Math.round(st.turns * ratio));
  for (const e of state.enemies) if (e !== from && isAlive(e)) inflict(e, kw, v, n, caster, events);
}

function burstKeyword(state: BattleState, t: Enemy, kw: Keyword, mult: number, events: BattleEvent[]): void {
  const st = keyword(t, kw);
  if (!st) return;
  const v = st.value ?? 0;
  t.statuses = t.statuses.filter((x) => x !== st);
  const dmg = Math.round((kw === 'tremor' ? v : v * st.turns) * mult);
  dealDamage(state, t, Math.max(1, dmg), 'burst', events);
  if (kw === 'burn' || kw === 'erosion') feedHunger(state, events);
  if (kw === 'tremor' && v >= TREMOR_STUN && isAlive(t)) {
    addStatus(t, 'stun', 1);
    events.push({ type: 'status', targetUid: t.uid, status: 'stun', turns: 1 });
  }
}

function amplifyKeywords(t: Enemy, value: number, turns: number, events: BattleEvent[]): void {
  if (!isAlive(t)) return;
  for (const st of t.statuses) {
    if (!isKeyword(st.id)) continue;
    st.value = Math.min(KEYWORD_MAX_VALUE, (st.value ?? 0) + value);
    st.turns = Math.min(KEYWORD_MAX_TURNS, st.turns + turns);
    events.push({ type: 'status', targetUid: t.uid, status: st.id, turns: st.turns, stacks: st.value });
  }
}

function applyRider(state: BattleState, ctx: Ctx, r: Rider, t: Enemy, events: BattleEvent[]): void {
  if (r.when && !condMet(state, ctx, r.when, t)) return;
  if ('inflict' in r) inflict(t, r.inflict, r.value, r.turns, ctx.caster, events);
  else if ('gain' in r) for (const a of allyTargets(state, ctx, r.to ?? 'self')) gainStack(a, r.gain, r.amount, events);
  else if ('heal' in r) for (const a of allyTargets(state, ctx, r.to ?? 'self')) healAlly(state, a, Math.round((r.heal / 100) * effectiveAtk(ctx.caster)), events);
  else if ('shield' in r) for (const a of allyTargets(state, ctx, r.to ?? 'self')) giveShield(a, Math.round((r.shield / 100) * effectiveAtk(ctx.caster)), events);
  else if ('amplify' in r) amplifyKeywords(t, r.amplify, r.turns, events);
  else if ('burst' in r) {
    if (isAlive(t)) burstKeyword(state, t, r.burst, r.mult, events);
  } else if ('debuff' in r) {
    if (isAlive(t)) {
      addStatus(t, r.debuff, r.turns);
      events.push({ type: 'status', targetUid: t.uid, status: r.debuff, turns: r.turns });
    }
  } else if ('spread' in r) spreadKeyword(state, t, r.spread, r.ratio, ctx.caster, events);
}

/** 약점 속성으로 맞으면 강인도를 깎고, 0이 되면 격파한다 */
function hitToughness(state: BattleState, ctx: Ctx, t: Enemy, side: boolean, events: BattleEvent[]): void {
  if (t.broken || !isAlive(t) || ctx.toughHit.has(t.uid)) return;
  const el = unitById(ctx.caster.defId).element;
  if (!enemyById(t.defId).weak.includes(el)) return;
  ctx.toughHit.add(t.uid);
  const amount = Math.round(ctx.ability.toughness * (side ? BLAST_SIDE : 1));
  if (amount <= 0) return;
  t.toughness = Math.max(0, t.toughness - amount);
  events.push({ type: 'toughness', targetUid: t.uid, amount, after: t.toughness });
  if (t.toughness > 0) return;
  t.broken = true;
  state.stats.breaks++;
  events.push({ type: 'break', targetUid: t.uid, element: el });
  dealDamage(state, t, Math.round(effectiveAtk(ctx.caster) * (1 + t.maxToughness / 60)), 'break', events);
  if (!isAlive(t)) return;
  state.av[t.uid] += baseAv(t) * BREAK_DELAY;
  switch (el) {
    case 'sol':
      inflict(t, 'burn', 3, 2, ctx.caster, events);
      break;
    case 'luna':
      inflict(t, 'moonshade', 3, 2, ctx.caster, events);
      addStatus(t, 'weaken', 1);
      events.push({ type: 'status', targetUid: t.uid, status: 'weaken', turns: 1 });
      break;
    case 'nebula':
      amplifyKeywords(t, 2, 1, events);
      break;
    case 'comet':
      inflict(t, 'rupture', 3, 3, ctx.caster, events);
      break;
    case 'void':
      inflict(t, 'erosion', 3, 2, ctx.caster, events);
      break;
    case 'star':
      inflict(t, 'tremor', 4, 2, ctx.caster, events);
      break;
  }
}

function blastTargets(state: BattleState, main: Enemy): { t: Enemy; side: boolean }[] {
  const living = state.enemies.filter(isAlive);
  const i = living.indexOf(main);
  return [{ t: main, side: false }, ...[living[i - 1], living[i + 1]].filter((x): x is Enemy => !!x).map((t) => ({ t, side: true }))];
}

function runDamage(state: BattleState, eff: DamageEffect, ctx: Ctx, rng: Rng, events: BattleEvent[]): void {
  if (eff.consume) {
    const k = statusStacks(ctx.caster, eff.consume.stack);
    const mult = 1 + k * eff.consume.per;
    ctx.mult *= mult;
    ctx.caster.statuses = ctx.caster.statuses.filter((s) => s.id !== eff.consume!.stack);
    if (k > 0) events.push({ type: 'unleash', allyUid: ctx.caster.uid, stack: eff.consume.stack, stacks: k, mult: Math.round(mult * 100) / 100 });
  }
  let dealt = 0;
  const firstHit = new Set<string>();
  for (let i = 0; i < eff.stages.length; i++) {
    if (!state.enemies.some(isAlive)) break;
    const st = eff.stages[i];
    const skipped = !!st.only && !condMet(state, ctx, st.only);
    events.push({ type: 'stage', allyUid: ctx.caster.uid, index: i, total: eff.stages.length, skipped });
    if (skipped) continue;
    let targets: { t: Enemy; side: boolean }[];
    const main = focusOf(state, ctx);
    if (eff.target === 'focus') targets = main ? [{ t: main, side: false }] : [];
    else if (eff.target === 'blast') targets = main ? blastTargets(state, main) : [];
    else if (eff.target === 'allEnemies') targets = state.enemies.filter(isAlive).map((t) => ({ t, side: false }));
    else {
      const living = state.enemies.filter(isAlive);
      targets = living.length ? [{ t: rng.pick(living), side: false }] : [];
    }
    for (const { t, side } of targets) {
      const had = { burn: !!keyword(t, 'burn'), rupture: !!keyword(t, 'rupture'), moon: keyword(t, 'moonshade') };
      const first = !firstHit.has(t.uid);
      firstHit.add(t.uid);
      dealt += dealDamage(state, t, allyHitAmount(state, ctx, eff, t, st, side, first), 'ally', events);
      if (had.rupture) spendKeyword(t, 'rupture');
      if (eff.devour && first) t.statuses = t.statuses.filter((s) => !eff.devour!.keywords.includes(s.id as Keyword));
      if (had.moon && isAlive(ctx.caster)) {
        healAlly(state, ctx.caster, had.moon.value ?? 0, events);
        spendKeyword(t, 'moonshade');
      }
      if (ctx.caster.defId === 'solea' && had.burn) gainStack(ctx.caster, 'solarCore', 1, events);
      if (ctx.caster.defId === 'vela' && had.rupture) gainStack(ctx.caster, 'aim', 1, events);
      hitToughness(state, ctx, t, side, events);
      if (isAlive(t)) for (const r of [...(eff.onHit ?? []), ...(st.onHit ?? [])]) applyRider(state, ctx, r, t, events);
      if (!isAlive(t)) {
        gainEnergy(ctx.caster, ENERGY_GAIN.kill, events);
        if (ctx.ability.kill && !ctx.killed) {
          ctx.killed = true;
          events.push({ type: 'trigger', allyUid: ctx.caster.uid, abilityId: ctx.ability.id, phase: 'kill' });
          applyEffects(state, ctx.ability.kill, ctx, rng, events);
        }
      }
    }
  }
  if (eff.lifesteal && dealt > 0 && isAlive(ctx.caster)) healAlly(state, ctx.caster, Math.round(dealt * eff.lifesteal), events);
}

function applyEffects(state: BattleState, effects: Effect[], ctx: Ctx, rng: Rng, events: BattleEvent[]): void {
  for (const eff of effects) {
    if (eff.when) {
      if (!condMet(state, ctx, eff.when)) continue;
      events.push({ type: 'trigger', allyUid: ctx.caster.uid, abilityId: ctx.ability.id, phase: 'cond' });
    }
    const pct = (p: number) => Math.round((p / 100) * effectiveAtk(ctx.caster) * ctx.mult);
    switch (eff.kind) {
      case 'damage':
        runDamage(state, eff, ctx, rng, events);
        break;
      case 'heal':
        for (const a of allyTargets(state, ctx, eff.target)) healAlly(state, a, pct(eff.power), events);
        break;
      case 'shield':
        for (const a of allyTargets(state, ctx, eff.target)) giveShield(a, pct(eff.power), events);
        break;
      case 'enemyStatus':
        for (const t of enemyTargets(state, ctx, eff.target)) {
          addStatus(t, eff.status, eff.turns, eff.value);
          events.push({ type: 'status', targetUid: t.uid, status: eff.status, turns: eff.turns });
        }
        break;
      case 'allyStatus':
        for (const a of allyTargets(state, ctx, eff.target)) {
          const value = eff.status === 'counter' && eff.value ? pct(eff.value) : eff.value;
          addStatus(a, eff.status, eff.turns, value);
          events.push({ type: 'status', targetUid: a.uid, status: eff.status, turns: eff.turns });
        }
        break;
      case 'sp':
        addSp(state, eff.amount, events);
        break;
      case 'purge':
        for (const t of enemyTargets(state, ctx, eff.target)) {
          t.statuses = t.statuses.filter((s) => s.id !== 'atkUp');
          t.shield = 0;
          events.push({ type: 'purge', targetUid: t.uid });
        }
        break;
      case 'boost':
        state.boost += eff.amount;
        break;
      case 'advance':
        for (const a of allyTargets(state, ctx, eff.target)) if (a.uid !== state.active) state.av[a.uid] = Math.max(0, state.av[a.uid] - baseAv(a) * eff.amount);
        break;
      case 'delay':
        for (const t of enemyTargets(state, ctx, eff.target)) state.av[t.uid] += baseAv(t) * eff.amount;
        break;
      case 'energy':
        for (const a of allyTargets(state, ctx, eff.target)) gainEnergy(a, eff.amount, events);
        break;
      case 'gain':
        for (const a of allyTargets(state, ctx, eff.target)) gainStack(a, eff.stack, eff.amount, events);
        break;
      case 'inflict':
        for (const t of enemyTargets(state, ctx, eff.target)) inflict(t, eff.keyword, eff.value, eff.turns, ctx.caster, events);
        break;
      case 'amplify':
        for (const t of enemyTargets(state, ctx, eff.target)) amplifyKeywords(t, eff.value, eff.turns, events);
        break;
      case 'burst':
        for (const t of enemyTargets(state, ctx, eff.target)) burstKeyword(state, t, eff.keyword, eff.mult, events);
        break;
      case 'spread': {
        const f = focusOf(state, ctx);
        if (f) spreadKeyword(state, f, eff.keyword, eff.ratio, ctx.caster, events);
        break;
      }
      case 'convert':
        for (const t of enemyTargets(state, ctx, eff.target)) {
          const st = keyword(t, eff.from);
          if (!st) continue;
          t.statuses = t.statuses.filter((x) => x !== st);
          inflict(t, eff.to, Math.round((st.value ?? 0) * eff.mult), st.turns, null, events);
        }
        break;
      case 'detonate':
        for (const e of state.enemies) {
          const doom = e.statuses.find((s) => s.id === 'doom');
          if (doom && isAlive(e)) {
            e.statuses = e.statuses.filter((s) => s !== doom);
            dealDamage(state, e, doom.value ?? 0, 'doom', events);
          }
        }
        break;
      case 'doom': {
        const t = focusOf(state, ctx);
        if (!t) break;
        addStatus(t, 'doom', 1, Math.max(1, Math.round((eff.power / 100) * effectiveAtk(ctx.caster) * defFactor(t.def))));
        events.push({ type: 'status', targetUid: t.uid, status: 'doom', turns: 1 });
        break;
      }
    }
  }
}

function checkOutcome(state: BattleState): void {
  if (state.enemies.every((e) => !isAlive(e))) state.outcome = 'victory';
  else if (state.allies.every((a) => !isAlive(a))) state.outcome = 'defeat';
}

/** 행동이 가능한지. 안 되면 이유를 돌려준다. */
export function validateAction(state: BattleState, action: Action): string | null {
  if (state.outcome !== 'ongoing') return '전투가 끝났습니다.';
  if (!state.active) return '아직 술사의 차례가 아닙니다.';
  const ally = state.allies.find((a) => a.uid === action.allyUid);
  if (!ally || !isAlive(ally)) return '행동할 수 없는 술사입니다.';
  if (action.slot === 'ultimate') {
    if (ally.energy < maxEnergy(ally)) return '에너지가 부족합니다.';
  } else {
    if (ally.uid !== state.active) return '이 술사의 차례가 아닙니다.';
    if (action.slot === 'skill' && state.sp < 1) return '성진이 부족합니다.';
  }
  const ab = abilityOf(ally, action.slot);
  if (ab.aim === 'enemy' && action.targetUid && !state.enemies.some((e) => e.uid === action.targetUid && isAlive(e))) return '쓰러진 적은 고를 수 없습니다.';
  if (ab.aim === 'ally' && action.targetUid && !state.allies.some((a) => a.uid === action.targetUid && isAlive(a))) return '쓰러진 아군은 고를 수 없습니다.';
  return null;
}

/** 술사의 행동 하나를 처리한다. 일반 공격·전투 스킬은 차례를 넘기고, 다음 술사 차례까지 적 턴을 진행한다. */
export function act(state: BattleState, action: Action): BattleEvent[] {
  const err = validateAction(state, action);
  if (err) throw new Error(err);
  const events: BattleEvent[] = [];
  withRng(state, (rng) => {
    const ally = state.allies.find((a) => a.uid === action.allyUid)!;
    const ab = abilityOf(ally, action.slot);
    const enemy = ab.aim === 'enemy' ? (state.enemies.find((e) => e.uid === action.targetUid && isAlive(e)) ?? getFocus(state)) : getFocus(state);
    if (ab.aim === 'enemy' && enemy) state.focusUid = enemy.uid;
    const chosenAlly = ab.aim === 'ally' ? (state.allies.find((a) => a.uid === action.targetUid && isAlive(a)) ?? ally) : null;
    events.push({ type: 'cast', allyUid: ally.uid, abilityId: ab.id, slot: action.slot, targetUid: ab.aim === 'enemy' ? (enemy?.uid ?? null) : (chosenAlly?.uid ?? null) });
    // 행동 값 정리: 필살기는 에너지를 비우고, 나머지는 성진을 주고받는다
    if (action.slot === 'ultimate') {
      ally.energy = 0;
      state.stats.ultimates++;
      events.push({ type: 'energy', allyUid: ally.uid, energy: 0 });
    } else addSp(state, action.slot === 'basic' ? 1 : -1, events);
    // 공명파동·다음 행동 강화
    const wave = statusStacks(ally, 'wave');
    if (wave) ally.statuses = ally.statuses.filter((s) => s.id !== 'wave');
    const mult = (1 + wave * WAVE_STEP) * (1 + state.boost);
    state.boost = 0;
    const ctx: Ctx = { caster: ally, ability: ab, enemy, ally: chosenAlly, mult, killed: false, toughHit: new Set() };
    applyEffects(state, ab.effects, ctx, rng, events);
    gainEnergy(ally, ENERGY_GAIN[action.slot], events);
    checkOutcome(state);
    if (action.slot !== 'ultimate' && state.outcome === 'ongoing') {
      endAllyTurn(state, ally);
      advance(state, rng, events);
    }
  });
  if (state.outcome !== 'ongoing') events.push({ type: 'outcome', outcome: state.outcome });
  return events;
}

/** 전투를 시작하거나 이어서, 다음 술사 차례까지 진행한다(적이 먼저 움직일 수 있다). */
export function begin(state: BattleState): BattleEvent[] {
  if (state.active || state.outcome !== 'ongoing') return [];
  const events: BattleEvent[] = [];
  withRng(state, (rng) => advance(state, rng, events));
  if (state.outcome !== 'ongoing') events.push({ type: 'outcome', outcome: state.outcome });
  return events;
}

function endAllyTurn(state: BattleState, ally: Ally): void {
  // 지속 효과는 주인의 턴이 끝날 때 줄어든다(도발·반격은 다음 차례가 올 때 사라진다)
  for (const s of ally.statuses) if (!isStack(s.id) && s.id !== 'taunt' && s.id !== 'counter') s.turns--;
  ally.statuses = ally.statuses.filter((s) => s.turns > 0);
  state.av[ally.uid] = baseAv(ally);
  state.active = null;
}

function startAllyTurn(state: BattleState, ally: Ally, events: BattleEvent[]): void {
  ally.shield = 0;
  ally.statuses = ally.statuses.filter((s) => s.id !== 'taunt' && s.id !== 'counter');
  state.active = ally.uid;
  events.push({ type: 'turn', uid: ally.uid });
}

/** 다음 행동할 유닛을 고른다: 행동 값이 가장 작은 쪽, 같으면 술사가 먼저 */
function nextActor(state: BattleState): Ally | Enemy | null {
  const units = [...state.allies, ...state.enemies].filter(isAlive);
  if (!units.length) return null;
  return units.reduce((a, b) => (state.av[b.uid] < state.av[a.uid] - 1e-9 ? b : a));
}

function advance(state: BattleState, rng: Rng, events: BattleEvent[]): void {
  for (let guard = 0; guard < 200 && state.outcome === 'ongoing'; guard++) {
    const next = nextActor(state);
    if (!next) return;
    const dt = state.av[next.uid];
    for (const u of [...state.allies, ...state.enemies]) if (isAlive(u)) state.av[u.uid] -= dt;
    state.turns++;
    state.stats.turns++;
    if ('energy' in next) {
      startAllyTurn(state, next, events);
      return;
    }
    enemyTurn(state, next, rng, events);
    state.av[next.uid] = baseAv(next);
    checkOutcome(state);
  }
}

/** 적 공격 배율: 한 사이클에 적이 한 번씩만 움직이므로 한 방이 무겁다 */
const ENEMY_POWER = 1.6;

export function enemyHitAmount(enemy: Enemy, power: number, target: Ally): number {
  const raw = ((power * ENEMY_POWER * effectiveAtk(enemy)) / 10) * defFactor(target.def);
  return Math.max(1, Math.round(raw));
}

function hitAlly(state: BattleState, enemy: Enemy, ally: Ally, power: number, events: BattleEvent[]): void {
  dealDamage(state, ally, enemyHitAmount(enemy, power, ally), 'enemy', events);
  gainEnergy(ally, ENERGY_GAIN.hit, events);
  if (ally.defId === 'astra') gainStack(ally, 'fortitude', 1, events);
  const counter = ally.statuses.find((s) => s.id === 'counter');
  const bonus = ally.defId === 'astra' ? statusStacks(ally, 'fortitude') * 2 : 0;
  if (counter?.value && isAlive(ally) && isAlive(enemy)) dealDamage(state, enemy, counter.value + bonus, 'counter', events);
}

function enemyTurn(state: BattleState, e: Enemy, rng: Rng, events: BattleEvent[]): void {
  events.push({ type: 'turn', uid: e.uid });
  e.shield = 0;
  // 차례가 시작될 때: 지연 폭격, 화상
  const doom = e.statuses.find((s) => s.id === 'doom');
  if (doom) {
    e.statuses = e.statuses.filter((s) => s !== doom);
    dealDamage(state, e, doom.value ?? 0, 'doom', events);
  }
  const burn = keyword(e, 'burn');
  if (burn && isAlive(e)) {
    dealDamage(state, e, burn.value ?? 0, 'burn', events);
    spendKeyword(e, 'burn');
    feedHunger(state, events);
  }
  if (!isAlive(e)) return;
  // 격파: 이 차례를 잃고 강인도를 되찾는다
  if (e.broken) {
    e.broken = false;
    e.toughness = e.maxToughness;
    events.push({ type: 'recover', targetUid: e.uid });
    events.push({ type: 'enemyStunned', enemyUid: e.uid });
    endEnemyTurn(e);
    return;
  }
  if (hasStatus(e, 'stun')) {
    e.statuses = e.statuses.filter((s) => s.id !== 'stun');
    events.push({ type: 'enemyStunned', enemyUid: e.uid });
    endEnemyTurn(e);
    return;
  }
  const intent = e.intent ?? enemyById(e.defId).pattern[e.patternIndex % enemyById(e.defId).pattern.length];
  events.push({ type: 'enemyAct', enemyUid: e.uid, intent });
  // 잠식: 움직일 때마다 위력만큼 피해
  const ero = keyword(e, 'erosion');
  if (ero) {
    dealDamage(state, e, ero.value ?? 0, 'erosion', events);
    spendKeyword(e, 'erosion');
    feedHunger(state, events);
    if (!isAlive(e)) return;
  }
  const living = state.allies.filter(isAlive);
  switch (intent.kind) {
    case 'attack': {
      const taunter = living.find((a) => hasStatus(a, 'taunt'));
      let target = taunter ?? living.find((a) => a.uid === intent.targetId);
      if (!target && living.length) target = rng.pick(living);
      if (target) hitAlly(state, e, target, intent.power, events);
      break;
    }
    case 'attackAll':
      for (const a of living) {
        if (!isAlive(e)) break;
        hitAlly(state, e, a, intent.power, events);
      }
      break;
    case 'defend':
      e.shield += intent.shield;
      events.push({ type: 'shield', targetUid: e.uid, amount: intent.shield, shieldAfter: e.shield });
      break;
    case 'buff':
      addStatus(e, 'atkUp', 99, intent.atk);
      events.push({ type: 'status', targetUid: e.uid, status: 'atkUp', turns: 99 });
      break;
    case 'seal':
      addSp(state, -1, events);
      break;
    case 'charge':
      break;
  }
  e.patternIndex++;
  endEnemyTurn(e);
  if (isAlive(e)) rollIntent(state, e, rng);
  checkOutcome(state);
}

function endEnemyTurn(e: Enemy): void {
  const countOnly: StatusId[] = ['burn', 'rupture', 'erosion', 'moonshade', 'tremor', 'doom'];
  for (const s of e.statuses) if (!countOnly.includes(s.id) && s.turns < 90) s.turns--;
  e.statuses = e.statuses.filter((s) => s.turns > 0);
}
