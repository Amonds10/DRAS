import { ELEMENT_ORDER, reactionById } from '../data/elements';
import { enemyById } from '../data/enemies';
import { spellById } from '../data/spells';
import { FULL_CHAIN, linkStep } from './link';
import { Rng } from './rng';
import type {
  Ally,
  BattleEvent,
  BattleMods,
  BattleState,
  Effect,
  Element,
  Enemy,
  Intent,
  PlannedCast,
  Status,
  StatusId,
} from './types';

export const MAX_STARDUST = 10;
export const FULL_CHAIN_POWER = 10;
const WEAKEN_FACTOR = 0.7;
const EXPOSE_FACTOR = 1.3;
const STAR_SHIELD_FACTOR = 0.5;
const STAR_SHIELD_CHAIN = 3;

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
    };
  });
  const state: BattleState = {
    round: 1,
    allies: allies.map((a) => ({ ...a, shield: 0, statuses: [] })),
    enemies,
    stardust: Math.min(mods.startStardust, MAX_STARDUST),
    maxStardust: MAX_STARDUST,
    focusUid: enemies[0]?.uid ?? null,
    seal: null,
    outcome: 'ongoing',
    rngState: rng.state,
    mods,
    stats: { maxChain: 0, reactions: 0, fullChains: 0 },
  };
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

export function rollIntents(state: BattleState): void {
  withRng(state, (rng) => {
    const livingAllies = state.allies.filter(isAlive);
    for (const e of state.enemies) {
      if (!isAlive(e)) {
        e.intent = null;
        continue;
      }
      const pattern = enemyById(e.defId).pattern;
      const intent: Intent = { ...pattern[e.patternIndex % pattern.length] };
      if (intent.kind === 'attack' && livingAllies.length > 0) intent.targetId = rng.pick(livingAllies).uid;
      if (intent.kind === 'seal') intent.element = rng.pick(ELEMENT_ORDER);
      e.intent = intent;
    }
  });
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
    seen.add(c.allyUid);
  }
  if (planCost(plan) > state.stardust) return '성진이 부족합니다.';
  return null;
}

function addStatus(u: Unit, id: StatusId, turns: number, value?: number): void {
  const existing = u.statuses.find((s) => s.id === id);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    if (value !== undefined) existing.value = id === 'atkUp' && turns >= 99 ? (existing.value ?? 0) + value : Math.max(existing.value ?? 0, value);
  } else {
    const s: Status = { id, turns };
    if (value !== undefined) s.value = value;
    u.statuses.push(s);
  }
}

function dealDamage(state: BattleState, target: Unit, amount: number, source: 'ally' | 'enemy' | 'burn' | 'chain', events: BattleEvent[]): void {
  if (!isAlive(target)) return;
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const hpLoss = amount - absorbed;
  target.hp = Math.max(0, target.hp - hpLoss);
  events.push({ type: 'damage', targetUid: target.uid, amount: hpLoss, absorbed, source, hpAfter: target.hp, shieldAfter: target.shield });
  if (!isAlive(target)) {
    target.statuses = [];
    target.shield = 0;
    if ('intent' in target) target.intent = null;
    events.push({ type: 'death', uid: target.uid });
    if (state.focusUid === target.uid) state.focusUid = state.enemies.find(isAlive)?.uid ?? null;
  }
}

interface CastContext {
  caster: Ally;
  mult: number;
  chain: number;
  damageMult: number;
  pierce: boolean;
}

function allyHitAmount(ctx: CastContext, power: number, target: Enemy, scaleWithChain: boolean): number {
  let raw = (power * effectiveAtk(ctx.caster)) / 10;
  raw *= ctx.mult * ctx.damageMult;
  if (scaleWithChain) raw *= ctx.chain;
  if (!ctx.pierce) raw *= defFactor(target.def);
  if (hasStatus(target, 'expose')) raw *= EXPOSE_FACTOR;
  if (enemyById(target.defId).traits?.includes('starShield') && ctx.chain < STAR_SHIELD_CHAIN) raw *= STAR_SHIELD_FACTOR;
  return Math.max(1, Math.round(raw));
}

function allyTargets(state: BattleState, caster: Ally, target: 'lowestAlly' | 'allAllies' | 'self'): Ally[] {
  const living = state.allies.filter(isAlive);
  if (target === 'self') return isAlive(caster) ? [caster] : [];
  if (target === 'allAllies') return living;
  const lowest = [...living].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  return lowest ? [lowest] : [];
}

function applyEffects(state: BattleState, effects: Effect[], ctx: CastContext, rng: Rng, events: BattleEvent[]): void {
  for (const eff of effects) {
    switch (eff.kind) {
      case 'damage': {
        const targets: Enemy[] = [];
        if (eff.target === 'focus') {
          const f = getFocus(state);
          if (f) targets.push(f);
        } else if (eff.target === 'allEnemies') {
          targets.push(...state.enemies.filter(isAlive));
        } else {
          for (let i = 0; i < 3; i++) {
            const living = state.enemies.filter(isAlive);
            if (living.length) targets.push(rng.pick(living));
          }
        }
        for (const t of targets) dealDamage(state, t, allyHitAmount(ctx, eff.power, t, !!eff.scaleWithChain), 'ally', events);
        break;
      }
      case 'heal':
        for (const a of allyTargets(state, ctx.caster, eff.target)) {
          const amount = Math.min(a.maxHp - a.hp, Math.round(eff.power * ctx.mult));
          a.hp += amount;
          events.push({ type: 'heal', targetUid: a.uid, amount, hpAfter: a.hp });
        }
        break;
      case 'shield':
        for (const a of allyTargets(state, ctx.caster, eff.target)) {
          const amount = Math.round(eff.power * ctx.mult);
          a.shield += amount;
          events.push({ type: 'shield', targetUid: a.uid, amount, shieldAfter: a.shield });
        }
        break;
      case 'enemyStatus': {
        const targets = eff.target === 'focus' ? [getFocus(state)].filter((x): x is Enemy => !!x) : state.enemies.filter(isAlive);
        for (const t of targets) {
          addStatus(t, eff.status, eff.turns, eff.value);
          events.push({ type: 'status', targetUid: t.uid, status: eff.status, turns: eff.turns });
        }
        break;
      }
      case 'allyStatus':
        for (const a of allyTargets(state, ctx.caster, eff.target)) {
          addStatus(a, eff.status, eff.turns, eff.value);
          events.push({ type: 'status', targetUid: a.uid, status: eff.status, turns: eff.turns });
        }
        break;
      case 'stardust': {
        const before = state.stardust;
        state.stardust = Math.min(state.maxStardust, state.stardust + eff.amount);
        events.push({ type: 'stardust', amount: state.stardust - before });
        break;
      }
      case 'purge': {
        const targets = eff.target === 'focus' ? [getFocus(state)].filter((x): x is Enemy => !!x) : state.enemies.filter(isAlive);
        for (const t of targets) {
          t.statuses = t.statuses.filter((s) => s.id !== 'atkUp');
          t.shield = 0;
          events.push({ type: 'purge', targetUid: t.uid });
        }
        break;
      }
    }
  }
}

function checkOutcome(state: BattleState): void {
  if (state.enemies.every((e) => !isAlive(e))) state.outcome = 'victory';
  else if (state.allies.every((a) => !isAlive(a))) state.outcome = 'defeat';
}

function runPlayerPhase(state: BattleState, plan: PlannedCast[], rng: Rng, events: BattleEvent[]): void {
  let prevOut: Element | null = null;
  let prevChain = 0;
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
    events.push({ type: 'cast', allyUid: ally.uid, spellId: spell.id, linked: step.linked, chain: step.chain, mult: step.mult, outElement: step.outElement, sealed: step.sealed });
    const reaction = step.reactionId ? reactionById(step.reactionId) : null;
    const ctx: CastContext = {
      caster: ally,
      mult: step.mult,
      chain: step.chain,
      damageMult: reaction?.damageMult ?? 1,
      pierce: reaction?.pierce ?? false,
    };
    if (reaction) events.push({ type: 'reaction', reactionId: reaction.id, allyUid: ally.uid });
    applyEffects(state, spell.effects, ctx, rng, events);
    if (reaction && reaction.effects.length) applyEffects(state, reaction.effects, { ...ctx, damageMult: 1, pierce: false }, rng, events);
    if (reaction) state.stats.reactions++;
    state.stats.maxChain = Math.max(state.stats.maxChain, step.chain);

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
  const raw = ((power * effectiveAtk(enemy)) / 10) * defFactor(target.def);
  return Math.max(1, Math.round(raw));
}

function runEnemyPhase(state: BattleState, rng: Rng, events: BattleEvent[]): void {
  for (const e of state.enemies) e.shield = 0;
  for (const e of state.enemies) {
    if (state.outcome !== 'ongoing') break;
    if (!isAlive(e) || !e.intent) continue;
    const intent = e.intent;
    e.patternIndex++;
    if (hasStatus(e, 'stun')) {
      events.push({ type: 'enemyStunned', enemyUid: e.uid });
      continue;
    }
    events.push({ type: 'enemyAct', enemyUid: e.uid, intent });
    const living = state.allies.filter(isAlive);
    switch (intent.kind) {
      case 'attack': {
        let target = living.find((a) => a.uid === intent.targetId);
        if (!target && living.length) target = rng.pick(living);
        if (target) dealDamage(state, target, enemyHitAmount(e, intent.power, target), 'enemy', events);
        break;
      }
      case 'attackAll':
        for (const a of living) dealDamage(state, a, enemyHitAmount(e, intent.power, a), 'enemy', events);
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
        if (intent.element) {
          state.seal = intent.element;
          events.push({ type: 'seal', element: intent.element });
        }
        break;
      case 'charge':
        break;
    }
    checkOutcome(state);
  }
}

function endRound(state: BattleState, events: BattleEvent[]): void {
  for (const e of state.enemies) {
    const burn = e.statuses.find((s) => s.id === 'burn');
    if (burn && isAlive(e)) dealDamage(state, e, burn.value ?? 0, 'burn', events);
  }
  for (const u of [...state.allies, ...state.enemies]) {
    for (const s of u.statuses) s.turns--;
    u.statuses = u.statuses.filter((s) => s.turns > 0);
  }
  for (const a of state.allies) a.shield = 0;
  checkOutcome(state);
}

/**
 * 한 라운드를 진행한다: 아군 시전 → 적 행동 → 라운드 정리 → 다음 라운드 준비.
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
  rollIntents(state);
  events.push({ type: 'round', round: state.round });
  return events;
}
