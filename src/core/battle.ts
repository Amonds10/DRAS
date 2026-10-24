import { ELEMENT_ORDER, reactionById } from '../data/elements';
import { enemyById } from '../data/enemies';
import { spellById } from '../data/spells';
import { unitById } from '../data/units';
import { FULL_CHAIN, linkStep } from './link';
import { Rng } from './rng';
import type {
  Ally,
  BattleEvent,
  BattleMods,
  BattleState,
  DamageEffect,
  DamageSource,
  Cond,
  Effect,
  Element,
  Enemy,
  EnemyMove,
  Intent,
  Keyword,
  PlannedCast,
  Rider,
  SpellDef,
  Stack,
  Stage,
  Status,
  StatusId,
} from './types';

export const MAX_STARDUST = 10;
export const FULL_CHAIN_POWER = 10;
const WEAKEN_FACTOR = 0.7;
const EXPOSE_FACTOR = 1.3;
const STAR_SHIELD_FACTOR = 0.5;
const STAR_SHIELD_CHAIN = 3;
const EXECUTE_THRESHOLD = 0.35;
export const KEYWORDS: Keyword[] = ['burn', 'rupture', 'erosion', 'tremor', 'moonshade'];
const DEBUFFS: StatusId[] = ['stun', 'weaken', 'expose', 'doom', ...KEYWORDS];
/** 각인 위력·횟수 상한 */
export const KEYWORD_MAX_VALUE = 20;
export const KEYWORD_MAX_TURNS = 10;
/** 술사 고유 중첩 상한 */
export const STACK_MAX: Record<Stack, number> = { solarCore: 6, aim: 6, tide: 10, hunger: 10, fortitude: 8, wave: 3, edge: 6, heat: 8 };
/** 술사 고유 중첩 전부(표시·자동 계획용) */
export const STACK_IDS = Object.keys(STACK_MAX) as Stack[];
export const MAX_ATTUNE = 10;
/** 조준 1당 벨라 피해, 허기 1당 녹스 피해, 공명파동 1당 다음 시전 */
const AIM_STEP = 0.06;
const HUNGER_STEP = 0.05;
/** 카이렌: 검기 1당 피해 +10% */
const EDGE_STEP = 0.1;
/** 리코: 과열 1당 피해 +6%, 과열은 시전마다 최대 2까지 오른다 */
const HEAT_STEP = 0.06;
const HEAT_PER_CAST = 2;
const WAVE_STEP = 0.2;
/** 진동 폭발이 기절을 거는 위력 */
export const TREMOR_STUN = 8;
const ATTUNE_STEP = 0.12;
/** 타격 위력 보정: 주문이 여러 단계로 나뉘고 적중 효과가 붙은 만큼 한 타의 무게를 덜어 낸다 */
const STAGE_SCALE = 0.6;
const RELEASE_STEP = 0.25;

export const DEFAULT_MODS: BattleMods = { stardustPerTurn: 3, startStardust: 4, fullChainBonus: 1 };

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

export function effectiveAtk(u: Unit): number {
  const atk = u.atk + statusValue(u, 'atkUp');
  return hasStatus(u, 'weaken') ? atk * WEAKEN_FACTOR : atk;
}

function defFactor(def: number): number {
  return 100 / (100 + def * 5);
}

export function createBattle(allies: Ally[], enemyIds: string[], mods: BattleMods, seed: number, scale: { hp: number; atk: number } = { hp: 1, atk: 1 }): BattleState {
  const rng = new Rng(seed);
  const enemies: Enemy[] = enemyIds.map((id, i) => {
    const def = enemyById(id);
    const hp = Math.round(def.maxHp * scale.hp);
    return {
      uid: `e${i}`,
      defId: id,
      hp,
      maxHp: hp,
      atk: Math.round(def.atk * scale.atk),
      def: def.def,
      shield: 0,
      statuses: [],
      // 단계가 있는 강적은 패턴 처음부터, 잡몹은 아무 칸에서나 시작한다
      patternIndex: def.phase2 ? 0 : rng.int(def.pattern.length),
      intent: null,
    };
  });
  const state: BattleState = {
    round: 1,
    allies: allies.map((a) => ({ ...a, shield: 0, statuses: [] })),
    enemies,
    stardust: Math.min(mods.startStardust, MAX_STARDUST),
    maxStardust: MAX_STARDUST,
    focusUid: enemies[0]?.uid ?? null,
    hands: {},
    seal: null,
    attune: { sol: 0, luna: 0, nebula: 0, comet: 0, void: 0 },
    outcome: 'ongoing',
    rngState: rng.state,
    mods,
    stats: { maxChain: 0, reactions: 0, fullChains: 0 },
  };
  drawHands(state);
  rollIntents(state);
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

export const HAND_SIZE = 2;

/** 살아 있는 술사마다 장착한 주문 5장 중 2장을 손패로 뽑는다. */
export function drawHands(state: BattleState): void {
  withRng(state, (rng) => {
    state.hands = {};
    for (const a of state.allies) {
      if (!isAlive(a)) continue;
      state.hands[a.uid] = rng.shuffle(a.spells ?? unitById(a.defId).spells).slice(0, HAND_SIZE);
    }
  });
}

/** 지금 단계의 행동 패턴 */
export function currentPattern(e: Enemy): EnemyMove[] {
  const def = enemyById(e.defId);
  return e.enraged && def.phase2 ? def.phase2.pattern : def.pattern;
}

const SINGLE_TARGET: EnemyMove['kind'][] = ['attack', 'drain'];

/** 행동 하나를 예고로 만든다: 노릴 술사와 봉인할 성속을 미리 정한다 */
function makeIntent(state: BattleState, move: EnemyMove, rng: Rng | null): Intent {
  const intent: Intent = { ...move };
  const living = state.allies.filter(isAlive);
  if (SINGLE_TARGET.includes(move.kind) && living.length) {
    if (move.aim === 'lowest' || !rng) intent.targetId = [...living].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0].uid;
    else if (move.aim === 'shielded') intent.targetId = [...living].sort((a, b) => b.shield - a.shield || b.def - a.def)[0].uid;
    else intent.targetId = rng.pick(living).uid;
  }
  if (move.kind === 'seal') intent.element = rng ? rng.pick(ELEMENT_ORDER) : ELEMENT_ORDER[state.round % ELEMENT_ORDER.length];
  return intent;
}

export function rollIntents(state: BattleState): void {
  withRng(state, (rng) => {
    for (const e of state.enemies) {
      if (!isAlive(e)) {
        e.intent = null;
        continue;
      }
      const pattern = currentPattern(e);
      e.intent = makeIntent(state, pattern[e.patternIndex % pattern.length], rng);
    }
  });
}

/** 체력이 문턱 아래로 떨어진 강적은 2단계로: 공격이 오르고 새 패턴의 첫 행동을 곧바로 예고한다 */
function checkPhase(state: BattleState, e: Enemy, events: BattleEvent[]): void {
  const p2 = enemyById(e.defId).phase2;
  if (!p2 || e.enraged || !isAlive(e) || e.hp > e.maxHp * p2.at) return;
  e.enraged = true;
  e.atk += p2.atk;
  e.patternIndex = 0;
  e.statuses = e.statuses.filter((s) => s.id !== 'stun');
  e.intent = makeIntent(state, p2.pattern[0], null);
  events.push({ type: 'phase', enemyUid: e.uid, name: p2.name });
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

export function planCost(plan: PlannedCast[]): number {
  return plan.reduce((sum, c) => sum + spellById(c.spellId).cost, 0);
}

export function validatePlan(state: BattleState, plan: PlannedCast[]): string | null {
  const seen = new Set<string>();
  for (const c of plan) {
    const ally = state.allies.find((a) => a.uid === c.allyUid);
    if (!ally) return '알 수 없는 술사입니다.';
    if (!isAlive(ally)) return '쓰러진 술사는 시전할 수 없습니다.';
    if (seen.has(c.allyUid)) return '술사는 한 턴에 한 번만 시전할 수 있습니다.';
    if (!state.hands[c.allyUid]?.includes(c.spellId)) return '이번 라운드 손패에 없는 스킬입니다.';
    seen.add(c.allyUid);
  }
  if (planCost(plan) > state.stardust) return '성진이 부족합니다.';
  return null;
}

const isKeyword = (id: StatusId): id is Keyword => (KEYWORDS as StatusId[]).includes(id);
const isStack = (id: StatusId): id is Stack => id in STACK_MAX;

function addStatus(u: Unit, id: StatusId, turns: number, value?: number): void {
  const existing = u.statuses.find((s) => s.id === id);
  if (isKeyword(id)) {
    // 각인: 위력과 횟수가 모두 더해진다
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
      // 적의 영구 강화·지연 폭격은 누적, 나머지는 큰 값을 남긴다.
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

/** 각인 횟수를 하나 줄이고, 다 쓰면 지운다 */
function spendKeyword(u: Unit, id: Keyword): void {
  const s = u.statuses.find((x) => x.id === id);
  if (!s) return;
  s.turns--;
  if (s.turns <= 0) u.statuses = u.statuses.filter((x) => x !== s);
}

/** 술사에게 중첩을 쌓고 알린다 */
function gainStack(ally: Ally, stack: Stack, amount: number, events: BattleEvent[]): void {
  if (!isAlive(ally) || amount <= 0) return;
  const before = statusStacks(ally, stack);
  addStatus(ally, stack, 99, amount);
  const now = statusStacks(ally, stack);
  if (now !== before) events.push({ type: 'status', targetUid: ally.uid, status: stack, turns: 99, stacks: now });
}

/** 적에게 각인을 건다. 네비아의 패시브: 네비아가 거는 각인은 위력 +1. */
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
  } else if ('intent' in target) checkPhase(state, target, events);
  return hpLoss + absorbed;
}

interface CastContext {
  caster: Ally;
  /** 시전 중인 주문(성좌 반응 효과면 null) */
  spell: SpellDef | null;
  linked: boolean;
  /** 이번 시전에서 처치 시 효과가 이미 일어났는지 */
  killed?: boolean;
  mult: number;
  chain: number;
  damageMult: number;
  pierce: boolean;
  /** 이번 시전에서 이미 정해진 추가 배율(예열 소모, 공명 해방)과 추가 위력(성진 소모) */
  extraMult?: number;
  extraPower?: number;
  /** 이번 시전에서 패시브로 얻은 중첩(카이렌 검기·리코 과열의 시전당 상한용) */
  passiveGained?: number;
}

export function statusStacks(u: Unit, id: StatusId): number {
  return u.statuses.find((s) => s.id === id)?.value ?? 0;
}

/** 대상 각인을 집어삼킬 때 더해지는 위력: 각 각인의 (위력 × 횟수) × per */
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

function allyHitAmount(state: BattleState, ctx: CastContext, eff: DamageEffect, target: Enemy, st: Stage): number {
  let raw = ((st.power * STAGE_SCALE + (ctx.extraPower ?? 0) + devourPower(target, eff)) * effectiveAtk(ctx.caster)) / 10;
  raw += eff.fromShield ? ctx.caster.shield * eff.fromShield : 0;
  raw *= ctx.mult * ctx.damageMult * (ctx.extraMult ?? 1);
  if (eff.attune) raw *= 1 + state.attune[eff.attune] * ATTUNE_STEP;
  if (eff.scaleWithChain) raw *= ctx.chain;
  if (eff.execute && target.hp / target.maxHp <= EXECUTE_THRESHOLD) raw *= eff.execute;
  if (eff.vsDebuffed && DEBUFFS.some((d) => hasStatus(target, d))) raw *= eff.vsDebuffed;
  for (const b of eff.bonusVs ?? []) if (b.keyword === 'any' ? hasAnyKeyword(target) : keyword(target, b.keyword)) raw *= b.mult;
  if (st.up && condMet(state, ctx, st.up.when, target)) raw *= st.up.mult;
  // 패시브: 벨라는 조준, 녹스는 허기만큼 강해진다
  if (ctx.caster.defId === 'vela') raw *= 1 + statusStacks(ctx.caster, 'aim') * AIM_STEP;
  if (ctx.caster.defId === 'nox') raw *= 1 + statusStacks(ctx.caster, 'hunger') * HUNGER_STEP;
  if (ctx.caster.defId === 'kairen') raw *= 1 + statusStacks(ctx.caster, 'edge') * EDGE_STEP;
  if (ctx.caster.defId === 'riko') raw *= 1 + statusStacks(ctx.caster, 'heat') * HEAT_STEP;
  if (!ctx.pierce && !eff.pierce && !st.pierce) raw *= defFactor(target.def);
  if (hasStatus(target, 'expose')) raw *= EXPOSE_FACTOR;
  // 성좌 방패: 체인 3 미만이면 절반. 중첩을 모아 쏘는 일격(배율 2배 이상)은 방패를 뚫는다.
  const charged = (ctx.extraMult ?? 1) >= 2;
  if (enemyById(target.defId).traits?.includes('starShield') && ctx.chain < STAR_SHIELD_CHAIN && !charged) raw *= STAR_SHIELD_FACTOR;
  // 균열: 맞을 때마다 위력만큼 고정 피해(방어·방패 무시)
  raw += keyword(target, 'rupture')?.value ?? 0;
  return Math.max(1, Math.round(raw));
}

function allyTargets(state: BattleState, caster: Ally, target: 'lowestAlly' | 'allAllies' | 'self'): Ally[] {
  const living = state.allies.filter(isAlive);
  if (target === 'self') return isAlive(caster) ? [caster] : [];
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

function enemyTargets(state: BattleState, target: 'focus' | 'allEnemies'): Enemy[] {
  return target === 'focus' ? [getFocus(state)].filter((x): x is Enemy => !!x) : state.enemies.filter(isAlive);
}

/** 효과 조건. 대상을 주지 않으면 집중 대상을 본다. */
function condMet(state: BattleState, ctx: CastContext, c: Cond, target: Enemy | null = getFocus(state)): boolean {
  if (c.targetHas) {
    if (!target) return false;
    if (c.targetHas === 'any') {
      if (!hasAnyKeyword(target)) return false;
    } else if ((keyword(target, c.targetHas)?.value ?? 0) < (c.targetMin ?? 1)) return false;
  }
  if (c.kinds && (!target || KEYWORDS.filter((k) => keyword(target, k)).length < c.kinds)) return false;
  if (c.casterHas && statusStacks(ctx.caster, c.casterHas) < (c.min ?? 1)) return false;
  if (c.sum && (target ? keyword(target, c.sum.keyword)?.value ?? 0 : 0) + statusStacks(ctx.caster, c.sum.stack) < c.sum.min) return false;
  if (c.chain && ctx.chain < c.chain) return false;
  if (c.linked && !ctx.linked) return false;
  if (c.targetHpBelow !== undefined && (!target || target.hp / target.maxHp > c.targetHpBelow)) return false;
  if (c.casterHpBelow !== undefined && ctx.caster.hp / ctx.caster.maxHp > c.casterHpBelow) return false;
  if (c.shielded && ctx.caster.shield <= 0) return false;
  return true;
}

/** 각인을 퍼뜨린다: 다른 모든 적에게 위력·횟수 × ratio */
function spreadKeyword(state: BattleState, from: Enemy, kw: Keyword, ratio: number, caster: Ally | null, events: BattleEvent[]): void {
  const st = keyword(from, kw);
  if (!st) return;
  const v = Math.max(1, Math.round((st.value ?? 0) * ratio));
  const n = Math.max(1, Math.round(st.turns * ratio));
  for (const e of state.enemies) if (e !== from && isAlive(e)) inflict(e, kw, v, n, caster, events);
}

/** 각인을 지금 터뜨린다 */
function burstKeyword(state: BattleState, t: Enemy, kw: Keyword, mult: number, events: BattleEvent[]): void {
  const st = keyword(t, kw);
  if (!st) return;
  const v = st.value ?? 0;
  t.statuses = t.statuses.filter((x) => x !== st);
  const dmg = Math.round((kw === 'tremor' ? v : v * st.turns) * mult);
  dealDamage(state, t, Math.max(1, dmg), 'burst', events);
  if (kw === 'burn' || kw === 'erosion') feedHunger(state, events);
  if (kw === 'tremor' && v >= TREMOR_STUN && isAlive(t)) stunEnemy(t, events);
}

/** 기절: 막 기절에서 깨어난 적(버팀)은 기절하지 않는다 */
function stunEnemy(t: Enemy, events: BattleEvent[]): void {
  if (!isAlive(t)) return;
  if (hasStatus(t, 'steady')) {
    events.push({ type: 'resist', targetUid: t.uid });
    return;
  }
  addStatus(t, 'stun', 1);
  events.push({ type: 'status', targetUid: t.uid, status: 'stun', turns: 1 });
}

/** 적중 효과 하나를 맞은 대상 t를 기준으로 적용한다 */
function applyRider(state: BattleState, ctx: CastContext, r: Rider, t: Enemy, events: BattleEvent[]): void {
  if (r.when && !condMet(state, ctx, r.when, t)) return;
  if ('inflict' in r) inflict(t, r.inflict, r.value, r.turns, ctx.caster, events);
  else if ('gain' in r) for (const a of allyTargets(state, ctx.caster, r.to ?? 'self')) gainStack(a, r.gain, r.amount, events);
  else if ('heal' in r) for (const a of allyTargets(state, ctx.caster, r.to ?? 'self')) healAlly(state, a, r.heal, events);
  else if ('shield' in r) for (const a of allyTargets(state, ctx.caster, r.to ?? 'self')) giveShield(a, r.shield, events);
  else if ('amplify' in r) amplifyKeywords(t, r.amplify, r.turns, events);
  else if ('burst' in r) {
    if (isAlive(t)) burstKeyword(state, t, r.burst, r.mult, events);
  } else if ('stardust' in r) addStardust(state, r.stardust, events);
  else if ('debuff' in r) {
    if (isAlive(t)) {
      addStatus(t, r.debuff, r.turns);
      events.push({ type: 'status', targetUid: t.uid, status: r.debuff, turns: r.turns });
    }
  } else if ('spread' in r) spreadKeyword(state, t, r.spread, r.ratio, ctx.caster, events);
}

function giveShield(a: Ally, amount: number, events: BattleEvent[]): void {
  if (!isAlive(a)) return;
  a.shield += amount;
  events.push({ type: 'shield', targetUid: a.uid, amount, shieldAfter: a.shield });
  // 아스트라의 패시브: 보호막을 얻을 때마다 불굴 +1
  if (a.defId === 'astra') gainStack(a, 'fortitude', 1, events);
}

function addStardust(state: BattleState, amount: number, events: BattleEvent[]): void {
  const before = state.stardust;
  state.stardust = Math.min(state.maxStardust, state.stardust + amount);
  events.push({ type: 'stardust', amount: state.stardust - before });
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

/**
 * 효과를 적용한다. 다음 마법에 넘길 배율 보너스(boost)를 돌려준다.
 * phase를 주면(전투 시작 시·처치 시) 조건부 효과의 발동을 그 이름으로 알린다.
 */
function applyEffects(state: BattleState, effects: Effect[], ctx: CastContext, rng: Rng, events: BattleEvent[], phase?: 'start' | 'kill'): number {
  let boost = 0;
  let boostCarry = 0;
  let struck = false;
  for (const eff of effects) {
    if (eff.when) {
      if (!condMet(state, ctx, eff.when)) continue;
      if (ctx.spell && !phase) events.push({ type: 'trigger', allyUid: ctx.caster.uid, spellId: ctx.spell.id, phase: struck ? 'after' : 'use' });
    }
    if (eff.kind === 'damage') struck = true;
    switch (eff.kind) {
      case 'damage': {
        const hctx: CastContext = { ...ctx };
        // 자기 중첩 소모: 1중첩당 배율을 올리고 비운다
        if (eff.consume) {
          const k = statusStacks(ctx.caster, eff.consume.stack);
          const mult = 1 + k * eff.consume.per;
          hctx.extraMult = (hctx.extraMult ?? 1) * mult;
          ctx.caster.statuses = ctx.caster.statuses.filter((s) => s.id !== eff.consume!.stack);
          if (k > 0) events.push({ type: 'unleash', allyUid: ctx.caster.uid, stack: eff.consume.stack, stacks: k, mult: Math.round(mult * 100) / 100 });
        }
        // 공명 해방: 그 성속 각인을 모두 소모
        if (eff.releaseAttune) {
          const n = state.attune[eff.releaseAttune];
          hctx.extraMult = (hctx.extraMult ?? 1) * (1 + n * RELEASE_STEP);
          state.attune[eff.releaseAttune] = 0;
          events.push({ type: 'release', element: eff.releaseAttune, stacks: n });
        }
        // 성진 소모: 남은 성진을 모두 위력으로
        if (eff.fromStardust) {
          const spent = state.stardust;
          state.stardust = 0;
          hctx.extraPower = spent * eff.fromStardust;
          if (spent) events.push({ type: 'stardust', amount: -spent });
        }
        const focus = getFocus(state);
        const extra = eff.hitsFrom && focus ? Math.min(eff.hitsFrom.max, keyword(focus, eff.hitsFrom.keyword)?.turns ?? 0) : 0;
        const base: Stage[] = eff.stages ?? Array.from({ length: eff.hits ?? 1 }, () => ({ power: eff.power }));
        const stages = base.length && extra ? [...base, ...Array.from({ length: extra }, () => base[base.length - 1])] : base;
        let dealt = 0;
        for (let i = 0; i < stages.length; i++) {
          if (!state.enemies.some(isAlive)) break;
          const st = stages[i];
          const skipped = !!st.only && !condMet(state, hctx, st.only);
          events.push({ type: 'stage', allyUid: ctx.caster.uid, index: i, total: stages.length, skipped });
          if (skipped) continue;
          const aim = st.target ?? eff.target;
          let targets: Enemy[];
          if (aim === 'focus') targets = [getFocus(state)].filter((x): x is Enemy => !!x);
          else if (aim === 'allEnemies') targets = state.enemies.filter(isAlive);
          else {
            const living = state.enemies.filter(isAlive);
            targets = living.length ? [rng.pick(living)] : [];
          }
          for (const t of targets) {
            const had = { burn: !!keyword(t, 'burn'), rupture: !!keyword(t, 'rupture'), moon: keyword(t, 'moonshade'), down: (['stun', 'weaken', 'expose'] as const).some((d) => hasStatus(t, d)) };
            dealt += dealDamage(state, t, allyHitAmount(state, hctx, eff, t, st), 'ally', events);
            if (had.rupture) spendKeyword(t, 'rupture');
            // 집어삼킨 각인은 첫 타에 사라진다
            if (eff.devour) t.statuses = t.statuses.filter((s) => !eff.devour!.keywords.includes(s.id as Keyword));
            // 월영: 때린 술사가 위력만큼 회복
            if (had.moon && isAlive(ctx.caster)) {
              healAlly(state, ctx.caster, had.moon.value ?? 0, events);
              spendKeyword(t, 'moonshade');
            }
            // 패시브: 솔레아는 화상 걸린 적을, 벨라는 균열 걸린 적을 때리면 고유 중첩이 쌓인다
            if (ctx.caster.defId === 'solea' && had.burn) gainStack(ctx.caster, 'solarCore', 1, events);
            if (ctx.caster.defId === 'vela' && had.rupture) gainStack(ctx.caster, 'aim', 1, events);
            // 카이렌은 약화·노출·기절한 적을 베면(시전마다 한 번), 리코는 맞힐 때마다(시전마다 최대 2) 쌓인다
            if (ctx.caster.defId === 'kairen' && had.down && !ctx.passiveGained) {
              ctx.passiveGained = 1;
              gainStack(ctx.caster, 'edge', 1, events);
            }
            if (ctx.caster.defId === 'riko' && (ctx.passiveGained ?? 0) < HEAT_PER_CAST) {
              ctx.passiveGained = (ctx.passiveGained ?? 0) + 1;
              gainStack(ctx.caster, 'heat', 1, events);
            }
            if (isAlive(t)) for (const r of [...(eff.onHit ?? []), ...(st.onHit ?? [])]) applyRider(state, ctx, r, t, events);
            // 처치 시: 시전당 한 번
            if (!isAlive(t) && ctx.spell?.kill && !ctx.killed) {
              ctx.killed = true;
              events.push({ type: 'trigger', allyUid: ctx.caster.uid, spellId: ctx.spell.id, phase: 'kill' });
              boostCarry += applyEffects(state, ctx.spell.kill, ctx, rng, events, 'kill');
            }
          }
        }
        if (eff.lifesteal && dealt > 0 && isAlive(ctx.caster)) healAlly(state, ctx.caster, Math.round(dealt * eff.lifesteal), events);
        break;
      }
      case 'heal':
        for (const a of allyTargets(state, ctx.caster, eff.target)) healAlly(state, a, Math.round(eff.power * ctx.mult * (ctx.extraMult ?? 1)), events);
        break;
      case 'shield':
        for (const a of allyTargets(state, ctx.caster, eff.target)) giveShield(a, Math.round(eff.power * ctx.mult * (ctx.extraMult ?? 1)), events);
        break;
      case 'enemyStatus': {
        const targets = eff.target === 'focus' ? [getFocus(state)].filter((x): x is Enemy => !!x) : state.enemies.filter(isAlive);
        for (const t of targets) {
          if (eff.status === 'stun') {
            stunEnemy(t, events);
            continue;
          }
          addStatus(t, eff.status, eff.turns, eff.value);
          events.push({ type: 'status', targetUid: t.uid, status: eff.status, turns: eff.turns });
        }
        break;
      }
      case 'allyStatus':
        for (const a of allyTargets(state, ctx.caster, eff.target)) {
          // 반격 피해는 시전자의 공격력과 체인 배율을 따른다.
          const value = eff.status === 'counter' && eff.value ? Math.round(((eff.value * effectiveAtk(ctx.caster)) / 10) * ctx.mult) : eff.value;
          addStatus(a, eff.status, eff.turns, value);
          events.push({ type: 'status', targetUid: a.uid, status: eff.status, turns: eff.turns });
        }
        break;
      case 'stardust':
        addStardust(state, eff.amount, events);
        break;
      case 'purge': {
        const targets = eff.target === 'focus' ? [getFocus(state)].filter((x): x is Enemy => !!x) : state.enemies.filter(isAlive);
        for (const t of targets) {
          t.statuses = t.statuses.filter((s) => s.id !== 'atkUp');
          t.shield = 0;
          events.push({ type: 'purge', targetUid: t.uid });
        }
        break;
      }
      case 'boost':
        boost += eff.amount;
        break;
      case 'gain':
        for (const a of allyTargets(state, ctx.caster, eff.target)) gainStack(a, eff.stack, eff.amount, events);
        break;
      case 'inflict':
        for (const t of enemyTargets(state, eff.target)) inflict(t, eff.keyword, eff.value, eff.turns, ctx.caster, events);
        break;
      case 'amplify':
        for (const t of enemyTargets(state, eff.target)) amplifyKeywords(t, eff.value, eff.turns, events);
        break;
      case 'burst':
        for (const t of enemyTargets(state, eff.target)) burstKeyword(state, t, eff.keyword, eff.mult, events);
        break;
      case 'spread': {
        const f = getFocus(state);
        if (f) spreadKeyword(state, f, eff.keyword, eff.ratio, ctx.caster, events);
        break;
      }
      case 'convert':
        for (const t of enemyTargets(state, eff.target)) {
          const st = keyword(t, eff.from);
          if (!st) continue;
          t.statuses = t.statuses.filter((x) => x !== st);
          inflict(t, eff.to, Math.round((st.value ?? 0) * eff.mult), st.turns, null, events);
        }
        break;
      case 'attune':
        state.attune[eff.element] = Math.min(MAX_ATTUNE, state.attune[eff.element] + eff.amount);
        events.push({ type: 'attune', element: eff.element, total: state.attune[eff.element] });
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
        const t = getFocus(state);
        if (!t) break;
        let raw = ((eff.power * effectiveAtk(ctx.caster)) / 10) * ctx.mult * ctx.damageMult;
        if (!ctx.pierce) raw *= defFactor(t.def);
        addStatus(t, 'doom', 1, Math.max(1, Math.round(raw)));
        events.push({ type: 'status', targetUid: t.uid, status: 'doom', turns: 1 });
        break;
      }
    }
  }
  return boost + boostCarry;
}

function checkOutcome(state: BattleState): void {
  if (state.enemies.every((e) => !isAlive(e))) state.outcome = 'victory';
  else if (state.allies.every((a) => !isAlive(a))) state.outcome = 'defeat';
}

function runPlayerPhase(state: BattleState, plan: PlannedCast[], rng: Rng, events: BattleEvent[]): void {
  let prevOut: Element | null = null;
  let prevChain = 0;
  let boost = 0;
  // 전투 시작 시: 이번 턴 실제로 시전할 주문의 효과가 누구의 시전보다 먼저 일어난다
  let budget = state.stardust;
  for (const cast of plan) {
    const ally = state.allies.find((a) => a.uid === cast.allyUid);
    const spell = spellById(cast.spellId);
    if (!ally || !isAlive(ally) || spell.cost > budget) continue;
    budget -= spell.cost;
    if (!spell.start) continue;
    const ctx: CastContext = { caster: ally, spell, linked: false, mult: 1, chain: 0, damageMult: 1, pierce: false };
    // 조건이 하나도 맞지 않으면 발동하지 않은 것으로 친다
    if (!spell.start.some((e) => !e.when || condMet(state, ctx, e.when))) continue;
    events.push({ type: 'trigger', allyUid: ally.uid, spellId: spell.id, phase: 'start' });
    boost += applyEffects(state, spell.start, ctx, rng, events, 'start');
  }
  for (const cast of plan) {
    if (state.outcome !== 'ongoing') break;
    const ally = state.allies.find((a) => a.uid === cast.allyUid);
    if (!ally || !isAlive(ally)) {
      events.push({ type: 'skip', allyUid: cast.allyUid, reason: 'dead' });
      continue;
    }
    const spell = spellById(cast.spellId);
    if (spell.cost > state.stardust) {
      events.push({ type: 'skip', allyUid: ally.uid, reason: 'cost' });
      continue;
    }
    state.stardust -= spell.cost;
    const step = linkStep(prevOut, prevChain, spell, state.seal);
    const mult = Math.round((step.mult + boost) * 100) / 100;
    boost = 0;
    events.push({ type: 'cast', allyUid: ally.uid, spellId: spell.id, linked: step.linked, chain: step.chain, mult, outElement: step.outElement, sealed: step.sealed });
    const reaction = step.reactionId ? reactionById(step.reactionId) : null;
    // 카이렌의 패시브: 링크를 이어받아 시전하면 검기 +1
    if (ally.defId === 'kairen' && step.linked) gainStack(ally, 'edge', 1, events);
    // 공명파동: 쌓인 만큼 이번 시전을 강화하고 사라진다
    const wave = statusStacks(ally, 'wave');
    if (wave) ally.statuses = ally.statuses.filter((s) => s.id !== 'wave');
    const ctx: CastContext = {
      caster: ally,
      spell,
      linked: step.linked,
      mult,
      chain: step.chain,
      damageMult: reaction?.damageMult ?? 1,
      pierce: reaction?.pierce ?? false,
      extraMult: wave ? 1 + wave * WAVE_STEP : undefined,
    };
    boost += applyEffects(state, spell.effects, ctx, rng, events);
    // 반응은 주문이 다 맞은 뒤에 터진다(초신성의 배율은 이미 이 주문에 실렸다)
    if (reaction) events.push({ type: 'reaction', reactionId: reaction.id, allyUid: ally.uid });
    if (reaction && reaction.effects.length) applyEffects(state, reaction.effects, { ...ctx, spell: null, damageMult: 1, pierce: false }, rng, events);
    if (reaction) state.stats.reactions++;
    state.stats.maxChain = Math.max(state.stats.maxChain, step.chain);
    // 성속 각인: 내보낸 성속을 하나 쌓는다(별빛 계열은 이어받은 성속을 쌓는다)
    if (step.outElement && state.attune[step.outElement] < MAX_ATTUNE) {
      state.attune[step.outElement]++;
      events.push({ type: 'attune', element: step.outElement, total: state.attune[step.outElement] });
    }

    if (step.chain === FULL_CHAIN) {
      state.stats.fullChains++;
      const bonus = state.mods.fullChainBonus;
      events.push({ type: 'fullChain', bonus });
      const power = Math.round(FULL_CHAIN_POWER * bonus);
      for (const e of state.enemies.filter(isAlive)) dealDamage(state, e, power, 'chain', events);
      const before = state.stardust;
      state.stardust = Math.min(state.maxStardust, state.stardust + 1);
      events.push({ type: 'stardust', amount: state.stardust - before });
    }
    prevOut = step.outElement;
    prevChain = step.chain;
    checkOutcome(state);
  }
  state.seal = null;
}

export function enemyHitAmount(enemy: Enemy, power: number, target: Ally): number {
  let raw = ((power * effectiveAtk(enemy)) / 10) * defFactor(target.def);
  if (hasStatus(target, 'expose')) raw *= EXPOSE_FACTOR;
  return Math.max(1, Math.round(raw));
}

function hitAlly(state: BattleState, enemy: Enemy, ally: Ally, power: number, events: BattleEvent[]): number {
  const dealt = dealDamage(state, ally, enemyHitAmount(enemy, power, ally), 'enemy', events);
  // 아스트라의 패시브: 맞을 때마다 불굴 +1, 반격은 불굴 1당 +2
  if (ally.defId === 'astra') gainStack(ally, 'fortitude', 1, events);
  const counter = ally.statuses.find((s) => s.id === 'counter');
  const bonus = ally.defId === 'astra' ? statusStacks(ally, 'fortitude') * 2 : 0;
  if (counter?.value && isAlive(ally) && isAlive(enemy)) dealDamage(state, enemy, counter.value + bonus, 'counter', events);
  return dealt;
}

/** 적의 저주: 맞은 술사에게 화상·약화·노출을 남긴다 */
function curseAlly(ally: Ally, move: EnemyMove, events: BattleEvent[]): void {
  if (!isAlive(ally)) return;
  if (move.burn) {
    addStatus(ally, 'burn', move.burn[1], move.burn[0]);
    events.push({ type: 'status', targetUid: ally.uid, status: 'burn', turns: move.burn[1] });
  }
  for (const id of ['weaken', 'expose'] as const) {
    const turns = move[id];
    if (!turns) continue;
    addStatus(ally, id, turns);
    events.push({ type: 'status', targetUid: ally.uid, status: id, turns });
  }
}

/** 한 명을 hits번 때린다(보호막 파괴·흡혈·저주 포함). 준 피해를 돌려준다. */
function strike(state: BattleState, e: Enemy, target: Ally, move: EnemyMove, events: BattleEvent[]): number {
  if (move.shatter && target.shield > 0) {
    target.shield = 0;
    events.push({ type: 'shatter', targetUid: target.uid });
  }
  let dealt = 0;
  for (let i = 0; i < (move.hits ?? 1); i++) {
    if (!isAlive(e) || !isAlive(target)) break;
    dealt += hitAlly(state, e, target, move.power ?? 0, events);
  }
  curseAlly(target, move, events);
  return dealt;
}

function runEnemyPhase(state: BattleState, rng: Rng, events: BattleEvent[]): void {
  for (const e of state.enemies) e.shield = 0;
  for (const e of state.enemies) {
    if (state.outcome !== 'ongoing') break;
    if (!isAlive(e) || !e.intent) continue;
    const intent = e.intent;
    e.patternIndex++;
    if (hasStatus(e, 'stun')) {
      // 깨어난 뒤 다음 라운드까지(강적은 두 라운드) 다시 기절하지 않는다
      e.statuses = e.statuses.filter((s) => s.id !== 'stun');
      addStatus(e, 'steady', enemyById(e.defId).phase2 ? 3 : 2);
      events.push({ type: 'enemyStunned', enemyUid: e.uid });
      continue;
    }
    events.push({ type: 'enemyAct', enemyUid: e.uid, intent });
    // 잠식: 움직일 때마다 위력만큼 피해를 받고 횟수가 준다
    const ero = keyword(e, 'erosion');
    if (ero) {
      dealDamage(state, e, ero.value ?? 0, 'erosion', events);
      spendKeyword(e, 'erosion');
      feedHunger(state, events);
      if (!isAlive(e)) {
        checkOutcome(state);
        continue;
      }
    }
    const living = state.allies.filter(isAlive);
    const taunter = living.find((a) => hasStatus(a, 'taunt'));
    const single = () => taunter ?? living.find((a) => a.uid === intent.targetId) ?? (living.length ? rng.pick(living) : undefined);
    switch (intent.kind) {
      case 'attack': {
        const target = single();
        if (target) strike(state, e, target, intent, events);
        break;
      }
      case 'drain': {
        const target = single();
        if (!target) break;
        const dealt = strike(state, e, target, intent, events);
        const amount = Math.min(e.maxHp - e.hp, Math.round(dealt * (intent.lifesteal ?? 0.5)));
        if (amount > 0 && isAlive(e)) {
          e.hp += amount;
          events.push({ type: 'heal', targetUid: e.uid, amount, hpAfter: e.hp });
        }
        break;
      }
      case 'attackAll':
        for (const a of living) {
          if (!isAlive(e)) break;
          strike(state, e, a, intent, events);
        }
        break;
      case 'curse':
        for (const a of living) curseAlly(a, intent, events);
        break;
      case 'steal': {
        const amount = Math.min(state.stardust, intent.steal ?? 1);
        state.stardust -= amount;
        events.push({ type: 'steal', enemyUid: e.uid, amount });
        if (amount) events.push({ type: 'stardust', amount: -amount });
        if (intent.power) for (const a of living) strike(state, e, a, intent, events);
        break;
      }
      case 'defend':
        e.shield += intent.shield ?? 0;
        events.push({ type: 'shield', targetUid: e.uid, amount: intent.shield ?? 0, shieldAfter: e.shield });
        break;
      case 'guard':
        for (const o of state.enemies.filter(isAlive)) {
          o.shield += intent.shield ?? 0;
          events.push({ type: 'shield', targetUid: o.uid, amount: intent.shield ?? 0, shieldAfter: o.shield });
        }
        break;
      case 'mend':
        for (const o of state.enemies.filter(isAlive)) {
          const amount = Math.min(o.maxHp - o.hp, intent.heal ?? 0);
          if (amount <= 0) continue;
          o.hp += amount;
          events.push({ type: 'heal', targetUid: o.uid, amount, hpAfter: o.hp });
        }
        break;
      case 'buff':
        addStatus(e, 'atkUp', 99, intent.atk);
        events.push({ type: 'status', targetUid: e.uid, status: 'atkUp', turns: 99 });
        break;
      case 'seal':
        if (intent.element) {
          state.seal = intent.element;
          events.push({ type: 'seal', element: intent.element });
        }
        break;
      case 'charge':
        break;
    }
    // 공격 행동에 붙은 뒷효과: 때린 뒤 자신에게 보호막·공격 강화
    if (isAlive(e) && intent.kind !== 'defend' && intent.kind !== 'guard' && intent.kind !== 'buff') {
      if (intent.shield) {
        e.shield += intent.shield;
        events.push({ type: 'shield', targetUid: e.uid, amount: intent.shield, shieldAfter: e.shield });
      }
      if (intent.atk) {
        addStatus(e, 'atkUp', 99, intent.atk);
        events.push({ type: 'status', targetUid: e.uid, status: 'atkUp', turns: 99 });
      }
    }
    checkOutcome(state);
  }
}

function endRound(state: BattleState, events: BattleEvent[]): void {
  // 적이 남긴 저주 화상은 술사도 태운다
  for (const a of state.allies) {
    const burn = keyword(a, 'burn');
    if (burn && isAlive(a)) dealDamage(state, a, burn.value ?? 0, 'burn', events);
  }
  for (const e of state.enemies) {
    const doom = e.statuses.find((s) => s.id === 'doom');
    if (doom && isAlive(e)) dealDamage(state, e, doom.value ?? 0, 'doom', events);
    const burn = keyword(e, 'burn');
    if (burn && isAlive(e)) {
      dealDamage(state, e, burn.value ?? 0, 'burn', events);
      feedHunger(state, events);
    }
  }
  // 균열·잠식·월영은 발동할 때만 횟수가 줄고, 나머지는 라운드마다 준다
  const countOnly: StatusId[] = ['rupture', 'erosion', 'moonshade'];
  for (const u of [...state.allies, ...state.enemies]) {
    for (const s of u.statuses) if (!countOnly.includes(s.id)) s.turns--;
    u.statuses = u.statuses.filter((s) => s.turns > 0);
  }
  for (const a of state.allies) a.shield = 0;
  checkOutcome(state);
}

/**
 * 한 라운드를 진행한다: 아군 시전 → 적 행동 → 라운드 정리 → 다음 라운드 준비(손패 뽑기, 적 예고).
 * state를 직접 변경하고, 화면 연출용 이벤트 목록을 돌려준다.
 */
export function executeRound(state: BattleState, plan: PlannedCast[]): BattleEvent[] {
  if (state.outcome !== 'ongoing') return [];
  const error = validatePlan(state, plan);
  if (error) throw new Error(error);
  const events: BattleEvent[] = [];
  withRng(state, (rng) => {
    runPlayerPhase(state, plan, rng, events);
    checkOutcome(state);
    if (state.outcome === 'ongoing') runEnemyPhase(state, rng, events);
  });
  if (state.outcome === 'ongoing') endRound(state, events);
  if (state.outcome !== 'ongoing') {
    events.push({ type: 'outcome', outcome: state.outcome });
    return events;
  }
  state.round++;
  state.stardust = Math.min(state.maxStardust, state.stardust + state.mods.stardustPerTurn);
  drawHands(state);
  rollIntents(state);
  events.push({ type: 'round', round: state.round });
  return events;
}
