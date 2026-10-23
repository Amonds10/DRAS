import { act, begin, createBattle, DEFAULT_MODS } from '../../src/core/battle';
import { bestAction } from '../../src/core/autoplan';
import { newRun } from '../../src/core/run';
import type { Action, BattleEvent, BattleMods, BattleState, Slot } from '../../src/core/types';

export function battle(team: string[], enemies: string[], seed = 1, mods: Partial<BattleMods> = {}): BattleState {
  return createBattle(newRun(team, seed).team, enemies, { ...DEFAULT_MODS, ...mods }, seed);
}

/** 이 술사의 차례가 오도록 행동 값을 조정하고 진행한다 */
export function giveTurn(b: BattleState, allyUid: string): BattleEvent[] {
  b.active = null;
  for (const uid of Object.keys(b.av)) b.av[uid] = 5000;
  b.av[allyUid] = 0;
  return begin(b);
}

export function use(b: BattleState, allyUid: string, slot: Slot, targetUid: string | null = null): BattleEvent[] {
  const a: Action = { allyUid, slot, targetUid };
  return act(b, a);
}

export function allyDamage(events: BattleEvent[]): number {
  let sum = 0;
  for (const e of events) {
    if (e.type === 'turn') break;
    if (e.type === 'damage' && e.source === 'ally') sum += e.amount + e.absorbed;
  }
  return sum;
}

export function autoplay(b: BattleState, limit = 400): void {
  begin(b);
  for (let i = 0; i < limit && b.outcome === 'ongoing'; i++) act(b, bestAction(b)!);
}
