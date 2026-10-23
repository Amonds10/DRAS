import { KEYWORDS, abilityOf, canUltimate, cloneBattle, act, isAlive, statusStacks, validateAction } from './battle';
import type { Action, BattleState } from './types';

function score(state: BattleState): number {
  if (state.outcome === 'victory') return 1e6 + state.allies.reduce((s, a) => s + a.hp, 0);
  if (state.outcome === 'defeat') return -1e6;
  const enemyHp = state.enemies.reduce((s, e) => s + e.hp, 0);
  const allyHp = state.allies.reduce((s, a) => s + a.hp + a.shield * 0.5, 0);
  const alive = state.allies.filter(isAlive).length;
  // 쌓아 둔 자원(고유 중첩·적 각인·강인도·에너지·성진)도 앞으로의 피해로 쳐서, 준비하는 운영이 손해 보지 않게 한다.
  const stacks = state.allies.filter(isAlive).reduce((s, a) => s + (['solarCore', 'aim', 'tide', 'hunger', 'fortitude', 'wave'] as const).reduce((t, k) => t + statusStacks(a, k), 0), 0);
  const marks = state.enemies.filter(isAlive).reduce((s, e) => s + e.statuses.reduce((t, st) => t + (KEYWORDS.includes(st.id as never) ? (st.value ?? 0) * Math.min(st.turns, 4) * 0.5 : 0), 0), 0);
  const tough = state.enemies.filter(isAlive).reduce((s, e) => s + (e.maxToughness - e.toughness) * 0.15 + (e.broken ? 8 : 0), 0);
  const energy = state.allies.filter(isAlive).reduce((s, a) => s + a.energy * 0.08, 0);
  return allyHp * 1.2 + alive * 25 - enemyHp + state.sp * 4 + stacks * 3 + marks * 1.2 + tough + energy;
}

/** 지금 고를 수 있는 행동 전부(필살기 포함) */
export function candidateActions(state: BattleState): Action[] {
  const out: Action[] = [];
  const enemies = state.enemies.filter(isAlive).map((e) => e.uid);
  const allies = state.allies.filter(isAlive).map((a) => a.uid);
  const push = (allyUid: string, slot: Action['slot']) => {
    const ally = state.allies.find((a) => a.uid === allyUid)!;
    const ab = abilityOf(ally, slot);
    const targets = ab.aim === 'enemy' ? enemies : ab.aim === 'ally' ? allies : [null];
    for (const t of targets) {
      const a = { allyUid, slot, targetUid: t };
      if (!validateAction(state, a)) out.push(a);
    }
  };
  for (const ally of state.allies) if (canUltimate(state, ally)) push(ally.uid, 'ultimate');
  if (state.active) {
    push(state.active, 'basic');
    push(state.active, 'skill');
  }
  return out;
}

/** 행동 하나를 시뮬레이션해 점수가 가장 높은 것을 고른다(밸런스 검증용) */
export function bestAction(state: BattleState): Action | null {
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (const a of candidateActions(state)) {
    const sim = cloneBattle(state);
    act(sim, a);
    const s = score(sim);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}
