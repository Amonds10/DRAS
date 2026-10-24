import { spellById } from '../data/spells';
import { unitById } from '../data/units';
import { KEYWORDS, cloneBattle, executeRound, isAlive, ready, statusStacks } from './battle';
import type { BattleState, PlannedCast } from './types';

function score(state: BattleState): number {
  if (state.outcome === 'victory') return 1e6 + state.allies.reduce((s, a) => s + a.hp, 0);
  if (state.outcome === 'defeat') return -1e6;
  const enemyHp = state.enemies.reduce((s, e) => s + e.hp, 0);
  const allyHp = state.allies.reduce((s, a) => s + a.hp, 0);
  const alive = state.allies.filter(isAlive).length;
  // 쌓아 둔 자원(고유 중첩·적 각인·지연 폭격·성속 각인)도 미래 피해로 쳐서, 준비하는 덱을 손해 보지 않게 한다.
  const stacks = state.allies.filter(isAlive).reduce((s, a) => s + (['solarCore', 'aim', 'tide', 'hunger', 'fortitude', 'wave'] as const).reduce((t, k) => t + statusStacks(a, k), 0), 0);
  const marks = state.enemies.filter(isAlive).reduce((s, e) => s + e.statuses.reduce((t, st) => t + (KEYWORDS.includes(st.id as never) ? (st.value ?? 0) * Math.min(st.turns, 4) * 0.5 : 0), 0) + statusStacks(e, 'doom') * 0.8, 0);
  const attune = Object.values(state.attune).reduce((s, n) => s + n, 0);
  return allyHp * 1.2 + alive * 25 - enemyHp + state.stardust * 3 + stacks * 4 + marks * 1.2 + attune * 2;
}

/** 다음에 덧붙일 수 있는 시전(살아 있고, 아직 안 쓴 술사의 쿨타임 끝난 스킬, 성진 안에서) */
function extensions(state: BattleState, prefix: PlannedCast[]): PlannedCast[][] {
  const cost = prefix.reduce((s, c) => s + spellById(c.spellId).cost, 0);
  const out: PlannedCast[][] = [];
  for (const ally of state.allies) {
    if (!isAlive(ally) || prefix.some((p) => p.allyUid === ally.uid)) continue;
    for (const spellId of unitById(ally.defId).spells) {
      if (!ready(ally, spellId) || cost + spellById(spellId).cost > state.stardust) continue;
      out.push([...prefix, { allyUid: ally.uid, spellId }]);
    }
  }
  return out;
}

const evaluate = (state: BattleState, plan: PlannedCast[]) => {
  const sim = cloneBattle(state);
  executeRound(sim, plan);
  return score(sim);
};

/** 시전 순서를 한 칸씩 늘려 가며 점수가 좋은 계획 몇 개만 남기는 빔 탐색(밸런스 검증용) */
export function bestPlan(state: BattleState, width = 5): PlannedCast[] {
  let best: PlannedCast[] = [];
  let bestScore = evaluate(state, []);
  let beam: PlannedCast[][] = [[]];
  for (let depth = 0; depth < state.allies.length; depth++) {
    const scored = beam.flatMap((p) => extensions(state, p)).map((plan) => ({ plan, s: evaluate(state, plan) }));
    if (!scored.length) break;
    scored.sort((a, b) => b.s - a.s);
    if (scored[0].s > bestScore) {
      bestScore = scored[0].s;
      best = scored[0].plan;
    }
    beam = scored.slice(0, width).map((x) => x.plan);
  }
  return best;
}
