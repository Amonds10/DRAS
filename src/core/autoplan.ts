import { spellById } from '../data/spells';
import { cloneBattle, executeRound, isAlive, statusStacks } from './battle';
import type { BattleState, PlannedCast } from './types';

function* candidatePlans(state: BattleState, prefix: PlannedCast[] = [], cost = 0): Generator<PlannedCast[]> {
  yield prefix;
  for (const ally of state.allies) {
    if (!isAlive(ally) || prefix.some((p) => p.allyUid === ally.uid)) continue;
    for (const spellId of state.hands[ally.uid] ?? []) {
      const c = cost + spellById(spellId).cost;
      if (c > state.stardust) continue;
      yield* candidatePlans(state, [...prefix, { allyUid: ally.uid, spellId }], c);
    }
  }
}

function score(state: BattleState): number {
  if (state.outcome === 'victory') return 1e6 + state.allies.reduce((s, a) => s + a.hp, 0);
  if (state.outcome === 'defeat') return -1e6;
  const enemyHp = state.enemies.reduce((s, e) => s + e.hp, 0);
  const allyHp = state.allies.reduce((s, a) => s + a.hp, 0);
  const alive = state.allies.filter(isAlive).length;
  // 쌓아 둔 자원(예열·별흔·각인·지연 폭격)도 미래 피해로 쳐서, 준비하는 덱을 손해 보지 않게 한다.
  const kindle = state.allies.filter(isAlive).reduce((s, a) => s + statusStacks(a, 'kindle'), 0);
  const marks = state.enemies.filter(isAlive).reduce((s, e) => s + statusStacks(e, 'starmark') + statusStacks(e, 'doom') * 0.8, 0);
  const attune = Object.values(state.attune).reduce((s, n) => s + n, 0);
  return allyHp * 1.2 + alive * 25 - enemyHp + state.stardust * 3 + kindle * 5 + marks * 1.5 + attune * 2;
}

/** 모든 시전 순서를 한 라운드씩 시뮬레이션해 가장 점수가 높은 계획을 고른다(밸런스 검증용). */
export function bestPlan(state: BattleState): PlannedCast[] {
  let best: PlannedCast[] = [];
  let bestScore = -Infinity;
  for (const plan of candidatePlans(state)) {
    const sim = cloneBattle(state);
    executeRound(sim, plan);
    const s = score(sim);
    if (s > bestScore) {
      bestScore = s;
      best = plan;
    }
  }
  return best;
}
