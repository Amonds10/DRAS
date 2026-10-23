import type { RunState } from '../core/run';

export interface RewardDef {
  id: string;
  name: string;
  glyph: string;
  desc: string;
  apply: (run: RunState) => void;
}

const list: RewardDef[] = [
  {
    id: 'mend',
    name: '성광 회복',
    glyph: '✚',
    desc: '모든 술사의 HP를 최대치의 50%만큼 회복합니다.',
    apply: (run) => {
      for (const a of run.team) a.hp = Math.min(a.maxHp, a.hp + Math.round(a.maxHp * 0.5));
    },
  },
  {
    id: 'vigor',
    name: '별의 활력',
    glyph: '♥',
    desc: '모든 술사의 최대 HP가 12 늘고 그만큼 회복합니다.',
    apply: (run) => {
      for (const a of run.team) {
        a.maxHp += 12;
        a.hp += 12;
      }
    },
  },
  {
    id: 'might',
    name: '성좌 각인',
    glyph: '⚔',
    desc: '모든 술사의 공격이 2 오릅니다.',
    apply: (run) => {
      for (const a of run.team) a.atk += 2;
    },
  },
  {
    id: 'ward',
    name: '별갑',
    glyph: '⛨',
    desc: '모든 술사의 방어가 2 오릅니다.',
    apply: (run) => {
      for (const a of run.team) a.def += 2;
    },
  },
  {
    id: 'flow',
    name: '성진의 흐름',
    glyph: '✦',
    desc: '성진을 최대 1개 더 모을 수 있습니다.',
    apply: (run) => {
      run.mods.maxSp += 1;
    },
  },
  {
    id: 'reserve',
    name: '성진 비축',
    glyph: '❖',
    desc: '전투를 시작할 때 성진을 1 더 가지고 시작합니다.',
    apply: (run) => {
      run.mods.startSp += 1;
    },
  },
  {
    id: 'resonance',
    name: '선율 예열',
    glyph: '✷',
    desc: '전투를 시작할 때 필살기 에너지가 25% 더 차 있습니다.',
    apply: (run) => {
      run.mods.startEnergy = Math.min(1, run.mods.startEnergy + 0.25);
    },
  },
];

export const REWARDS: Record<string, RewardDef> = Object.fromEntries(list.map((r) => [r.id, r]));
export const REWARD_IDS = list.map((r) => r.id);

export function rewardById(id: string): RewardDef {
  const r = REWARDS[id];
  if (!r) throw new Error(`Unknown reward: ${id}`);
  return r;
}
