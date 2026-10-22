import type { SpellDef } from '../core/types';

const list: SpellDef[] = [
  // 태양
  { id: 'dawn_lance', name: '여명의 창', cost: 1, input: 'none', output: 'sol', desc: '집중 대상에게 피해. 체인을 연다.', effects: [{ kind: 'damage', power: 12, target: 'focus' }] },
  { id: 'corona_burst', name: '코로나 폭발', cost: 2, input: 'comet', output: 'sol', desc: '모든 적에게 피해.', effects: [{ kind: 'damage', power: 9, target: 'allEnemies' }] },
  { id: 'halo_wall', name: '광륜 방벽', cost: 1, input: 'luna', output: 'sol', desc: '아군 전원에게 보호막.', effects: [{ kind: 'shield', power: 9, target: 'allAllies' }] },
  { id: 'sun_strike', name: '일륜 강타', cost: 1, input: 'nebula', output: 'sol', desc: '집중 대상에게 피해.', effects: [{ kind: 'damage', power: 12, target: 'focus' }] },
  // 달
  { id: 'crescent_edge', name: '초승 칼날', cost: 1, input: 'sol', output: 'luna', desc: '집중 대상에게 피해.', effects: [{ kind: 'damage', power: 13, target: 'focus' }] },
  { id: 'fullmoon_fall', name: '만월 낙하', cost: 3, input: 'void', output: 'luna', desc: '집중 대상에게 큰 피해.', effects: [{ kind: 'damage', power: 24, target: 'focus' }] },
  { id: 'moon_veil', name: '월광 베일', cost: 1, input: 'none', output: 'luna', desc: '가장 다친 아군 회복. 체인을 연다.', effects: [{ kind: 'heal', power: 14, target: 'lowestAlly' }] },
  { id: 'tidal_song', name: '조석의 노래', cost: 2, input: 'nebula', output: 'luna', desc: '아군 전원 회복.', effects: [{ kind: 'heal', power: 9, target: 'allAllies' }] },
  // 성운
  { id: 'nebula_mist', name: '성운 안개', cost: 1, input: 'comet', output: 'nebula', desc: '집중 대상에게 피해, 2턴 약화.', effects: [{ kind: 'damage', power: 7, target: 'focus' }, { kind: 'enemyStatus', status: 'weaken', turns: 2, target: 'focus' }] },
  { id: 'stardust_vortex', name: '별먼지 소용돌이', cost: 2, input: 'luna', output: 'nebula', desc: '모든 적에게 피해.', effects: [{ kind: 'damage', power: 8, target: 'allEnemies' }] },
  { id: 'interstellar_echo', name: '성간 공명', cost: 1, input: 'none', output: 'nebula', desc: '성진 2 획득. 체인을 연다.', effects: [{ kind: 'stardust', amount: 2 }] },
  { id: 'primal_light', name: '원초의 빛', cost: 2, input: 'sol', output: 'nebula', desc: '아군 전원 2턴 공격 +3.', effects: [{ kind: 'allyStatus', status: 'atkUp', turns: 2, value: 3, target: 'allAllies' }] },
  // 혜성
  { id: 'tail_shot', name: '꼬리별 사격', cost: 1, input: 'void', output: 'comet', desc: '집중 대상에게 피해.', effects: [{ kind: 'damage', power: 13, target: 'focus' }] },
  { id: 'comet_fall', name: '혜성 낙하', cost: 2, input: 'nebula', output: 'comet', desc: '집중 대상에게 큰 피해.', effects: [{ kind: 'damage', power: 18, target: 'focus' }] },
  { id: 'meteor_dash', name: '유성 돌진', cost: 1, input: 'none', output: 'comet', desc: '집중 대상에게 피해. 체인을 연다.', effects: [{ kind: 'damage', power: 11, target: 'focus' }] },
  { id: 'orbit_barrage', name: '궤도 난사', cost: 2, input: 'sol', output: 'comet', desc: '모든 적에게 피해.', effects: [{ kind: 'damage', power: 8, target: 'allEnemies' }] },
  // 공허
  { id: 'void_touch', name: '공허의 손길', cost: 1, input: 'luna', output: 'void', desc: '집중 대상에게 피해, 3턴 연소.', effects: [{ kind: 'damage', power: 8, target: 'focus' }, { kind: 'enemyStatus', status: 'burn', turns: 3, value: 4, target: 'focus' }] },
  { id: 'event_horizon', name: '사건의 지평선', cost: 2, input: 'comet', output: 'void', desc: '집중 대상에게 피해, 2턴 노출.', effects: [{ kind: 'damage', power: 10, target: 'focus' }, { kind: 'enemyStatus', status: 'expose', turns: 2, target: 'focus' }] },
  { id: 'dark_curtain', name: '암흑 장막', cost: 1, input: 'none', output: 'void', desc: '아군 전원에게 보호막. 체인을 연다.', effects: [{ kind: 'shield', power: 7, target: 'allAllies' }] },
  { id: 'retrograde', name: '역행', cost: 2, input: 'nebula', output: 'void', desc: '집중 대상에게 피해, 강화 제거.', effects: [{ kind: 'purge', target: 'focus' }, { kind: 'damage', power: 14, target: 'focus' }] },
  // 별빛
  { id: 'constellation_echo', name: '성좌 반향', cost: 1, input: 'wild', output: 'echo', desc: '집중 대상에게 피해. 직전 성속을 그대로 잇는다.', effects: [{ kind: 'damage', power: 8, target: 'focus' }] },
  { id: 'polaris_guide', name: '북극성 인도', cost: 2, input: 'wild', output: 'echo', desc: '아군 전원 회복과 보호막. 직전 성속을 잇는다.', effects: [{ kind: 'heal', power: 6, target: 'allAllies' }, { kind: 'shield', power: 6, target: 'allAllies' }] },
  { id: 'galaxy_ward', name: '은하 수호', cost: 1, input: 'wild', output: 'echo', desc: '아군 전원에게 보호막. 직전 성속을 잇는다.', effects: [{ kind: 'shield', power: 8, target: 'allAllies' }] },
  { id: 'star_judgement', name: '별의 심판', cost: 3, input: 'wild', output: 'echo', desc: '체인 수에 비례한 피해. 직전 성속을 잇는다.', effects: [{ kind: 'damage', power: 7, target: 'focus', scaleWithChain: true }] },
];

export const SPELLS: Record<string, SpellDef> = Object.fromEntries(list.map((s) => [s.id, s]));

export function spellById(id: string): SpellDef {
  const s = SPELLS[id];
  if (!s) throw new Error(`Unknown spell: ${id}`);
  return s;
}
