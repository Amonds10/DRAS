import { FLOORS } from '../data/encounters';
import { REWARD_IDS, rewardById } from '../data/rewards';
import { unitById } from '../data/units';
import { DEFAULT_MODS, createBattle, isAlive } from './battle';
import { Rng } from './rng';
import { TEAM_SIZE } from './team';
import type { Ally, BattleMods, BattleState } from './types';

export const SAVE_VERSION = 1;
export const REVIVE_RATIO = 0.25;
export const POST_BATTLE_HEAL = 0.1;

export type RunPhase = 'map' | 'battle' | 'reward' | 'victory' | 'defeat';

export interface RunState {
  version: number;
  seed: number;
  rngState: number;
  /** 다음에 도전할 층 인덱스 */
  floor: number;
  phase: RunPhase;
  team: Ally[];
  mods: BattleMods;
  battle: BattleState | null;
  rewardChoices: string[] | null;
  stats: { battlesWon: number; maxChain: number; reactions: number; fullChains: number; rounds: number };
}

export function newRun(unitIds: string[], seed: number): RunState {
  if (unitIds.length !== TEAM_SIZE) throw new Error(`팀은 ${TEAM_SIZE}명이어야 합니다.`);
  if (new Set(unitIds).size !== unitIds.length) throw new Error('같은 술사를 두 번 편성할 수 없습니다.');
  const team: Ally[] = unitIds.map((id, i) => {
    const def = unitById(id);
    return { uid: `a${i}`, defId: id, hp: def.maxHp, maxHp: def.maxHp, atk: def.atk, def: def.def, shield: 0, statuses: [] };
  });
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    floor: 0,
    phase: 'map',
    team,
    mods: { ...DEFAULT_MODS },
    battle: null,
    rewardChoices: null,
    stats: { battlesWon: 0, maxChain: 0, reactions: 0, fullChains: 0, rounds: 0 },
  };
}

function withRng<T>(run: RunState, fn: (rng: Rng) => T): T {
  const rng = new Rng(run.rngState);
  const out = fn(rng);
  run.rngState = rng.state;
  return out;
}

export function startBattle(run: RunState): BattleState {
  if (run.phase !== 'map') throw new Error('지도에서만 전투를 시작할 수 있습니다.');
  const floor = FLOORS[run.floor];
  const { enemies, seed } = withRng(run, (rng) => ({ enemies: rng.pick(floor.pools), seed: rng.int(2 ** 31) }));
  run.battle = createBattle(run.team, enemies, run.mods, seed);
  run.phase = 'battle';
  return run.battle;
}

/** 전투가 끝난 뒤 결과를 런에 반영한다. */
export function finishBattle(run: RunState): void {
  const battle = run.battle;
  if (run.phase !== 'battle' || !battle || battle.outcome === 'ongoing') throw new Error('끝난 전투가 없습니다.');
  run.stats.maxChain = Math.max(run.stats.maxChain, battle.stats.maxChain);
  run.stats.reactions += battle.stats.reactions;
  run.stats.fullChains += battle.stats.fullChains;
  run.stats.rounds += battle.round;
  run.battle = null;

  if (battle.outcome === 'defeat') {
    run.phase = 'defeat';
    return;
  }

  run.stats.battlesWon++;
  for (const member of run.team) {
    const after = battle.allies.find((a) => a.uid === member.uid);
    if (!after) continue;
    member.hp = isAlive(after) ? after.hp : Math.round(member.maxHp * REVIVE_RATIO);
    member.hp = Math.min(member.maxHp, member.hp + Math.round(member.maxHp * POST_BATTLE_HEAL));
  }
  run.floor++;
  if (run.floor >= FLOORS.length) {
    run.phase = 'victory';
    return;
  }
  run.rewardChoices = withRng(run, (rng) => rng.shuffle(REWARD_IDS).slice(0, 3));
  run.phase = 'reward';
}

export function chooseReward(run: RunState, rewardId: string): void {
  if (run.phase !== 'reward' || !run.rewardChoices?.includes(rewardId)) throw new Error('고를 수 없는 보상입니다.');
  rewardById(rewardId).apply(run);
  run.rewardChoices = null;
  run.phase = 'map';
}

export function isRunOver(run: RunState): boolean {
  return run.phase === 'victory' || run.phase === 'defeat';
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'starweaver.run';

export function saveRun(store: KeyValueStore, run: RunState): void {
  store.setItem(SAVE_KEY, JSON.stringify(run));
}

export function loadRun(store: KeyValueStore): RunState | null {
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.version !== SAVE_VERSION || isRunOver(run)) return null;
    return run;
  } catch {
    return null;
  }
}

export function clearRun(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY);
}
