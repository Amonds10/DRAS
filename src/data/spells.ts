import type { SkillTag, SpellDef } from '../core/types';

const list: SpellDef[] = [
  // 솔레아 · 태양
  { id: 'dawn_thrust', name: '여명 찌르기', cost: 1, input: 'none', output: 'sol', tag: 'strike', desc: '집중 대상을 찌른다. 체인을 연다.', effects: [{ kind: 'damage', power: 12, target: 'focus' }] },
  { id: 'solar_cleave', name: '일륜 가르기', cost: 2, input: 'comet', output: 'sol', tag: 'aoe', desc: '모든 적을 벤다.', effects: [{ kind: 'damage', power: 9, target: 'allEnemies' }] },
  { id: 'flare_rush', name: '홍염 연격', cost: 2, input: 'nebula', output: 'sol', tag: 'multi', desc: '집중 대상을 3번 연속 공격.', effects: [{ kind: 'damage', power: 5, target: 'focus', hits: 3 }] },
  { id: 'noon_verdict', name: '정오의 처단', cost: 2, input: 'luna', output: 'sol', tag: 'execute', desc: 'HP 35% 이하인 대상에게 2배 피해.', effects: [{ kind: 'damage', power: 13, target: 'focus', execute: 2 }] },
  { id: 'sun_oath', name: '태양의 맹세', cost: 1, input: 'void', output: 'sol', tag: 'buff', desc: '자신 공격 +4(2턴) 후 공격.', effects: [{ kind: 'allyStatus', status: 'atkUp', turns: 2, value: 4, target: 'self' }, { kind: 'damage', power: 6, target: 'focus' }] },
  // 루네 · 달
  { id: 'moon_veil', name: '월광 베일', cost: 1, input: 'none', output: 'luna', tag: 'heal', desc: '가장 다친 아군 회복. 체인을 연다.', effects: [{ kind: 'heal', power: 14, target: 'lowestAlly' }] },
  { id: 'crescent_edge', name: '초승 칼날', cost: 1, input: 'sol', output: 'luna', tag: 'strike', desc: '집중 대상에게 피해.', effects: [{ kind: 'damage', power: 12, target: 'focus' }] },
  { id: 'tidal_song', name: '조석의 노래', cost: 2, input: 'nebula', output: 'luna', tag: 'heal', desc: '아군 전원 회복.', effects: [{ kind: 'heal', power: 9, target: 'allAllies' }] },
  { id: 'fullmoon_ward', name: '만월 장막', cost: 2, input: 'comet', output: 'luna', tag: 'shield', desc: '아군 전원 보호막, 가장 다친 아군 회복.', effects: [{ kind: 'shield', power: 8, target: 'allAllies' }, { kind: 'heal', power: 6, target: 'lowestAlly' }] },
  { id: 'moon_brand', name: '월흔', cost: 1, input: 'void', output: 'luna', tag: 'debuff', desc: '집중 대상 노출(2턴)·약화(1턴).', effects: [{ kind: 'damage', power: 5, target: 'focus' }, { kind: 'enemyStatus', status: 'expose', turns: 2, target: 'focus' }, { kind: 'enemyStatus', status: 'weaken', turns: 1, target: 'focus' }] },
  // 네비아 · 성운
  { id: 'interstellar_echo', name: '성간 공명', cost: 1, input: 'none', output: 'nebula', tag: 'utility', desc: '성진 2 획득. 체인을 연다.', effects: [{ kind: 'stardust', amount: 2 }] },
  { id: 'primal_light', name: '원초의 빛', cost: 2, input: 'sol', output: 'nebula', tag: 'buff', desc: '아군 전원 공격 +3(2턴).', effects: [{ kind: 'allyStatus', status: 'atkUp', turns: 2, value: 3, target: 'allAllies' }] },
  { id: 'nebula_mist', name: '성운 안개', cost: 1, input: 'comet', output: 'nebula', tag: 'debuff', desc: '피해를 주고 2턴 약화.', effects: [{ kind: 'damage', power: 6, target: 'focus' }, { kind: 'enemyStatus', status: 'weaken', turns: 2, target: 'focus' }] },
  { id: 'amplify', name: '공명 증폭', cost: 1, input: 'luna', output: 'nebula', tag: 'utility', desc: '다음 마법의 배율 +0.5.', effects: [{ kind: 'boost', amount: 0.5 }] },
  { id: 'dust_storm', name: '별먼지 폭풍', cost: 2, input: 'void', output: 'nebula', tag: 'multi', desc: '무작위 적에게 4번 공격.', effects: [{ kind: 'damage', power: 5, target: 'random', hits: 4 }] },
  // 벨라 · 혜성
  { id: 'meteor_snipe', name: '유성 저격', cost: 1, input: 'none', output: 'comet', tag: 'strike', desc: '집중 대상 저격. 체인을 연다.', effects: [{ kind: 'damage', power: 13, target: 'focus' }] },
  { id: 'tail_volley', name: '꼬리별 연사', cost: 1, input: 'void', output: 'comet', tag: 'multi', desc: '집중 대상을 2번 쏜다.', effects: [{ kind: 'damage', power: 6, target: 'focus', hits: 2 }] },
  { id: 'orbital_strike', name: '궤도 폭격', cost: 2, input: 'nebula', output: 'comet', tag: 'delayed', desc: '라운드가 끝날 때 집중 대상에 큰 피해.', effects: [{ kind: 'doom', power: 26 }] },
  { id: 'piercing_shot', name: '관통 사격', cost: 2, input: 'sol', output: 'comet', tag: 'pierce', desc: '방어를 무시하는 일격.', effects: [{ kind: 'damage', power: 15, target: 'focus', pierce: true }] },
  { id: 'scatter_meteor', name: '산탄 유성', cost: 2, input: 'luna', output: 'comet', tag: 'aoe', desc: '모든 적에게 피해.', effects: [{ kind: 'damage', power: 8, target: 'allEnemies' }] },
  // 녹스 · 공허
  { id: 'void_touch', name: '공허의 손길', cost: 1, input: 'luna', output: 'void', tag: 'dot', desc: '피해를 주고 3턴 연소.', effects: [{ kind: 'damage', power: 7, target: 'focus' }, { kind: 'enemyStatus', status: 'burn', turns: 3, value: 4, target: 'focus' }] },
  { id: 'event_horizon', name: '사건의 지평선', cost: 2, input: 'comet', output: 'void', tag: 'debuff', desc: '피해를 주고 2턴 노출.', effects: [{ kind: 'damage', power: 10, target: 'focus' }, { kind: 'enemyStatus', status: 'expose', turns: 2, target: 'focus' }] },
  { id: 'siphon', name: '흡수', cost: 1, input: 'none', output: 'void', tag: 'drain', desc: '준 피해의 60%만큼 회복. 체인을 연다.', effects: [{ kind: 'damage', power: 10, target: 'focus', lifesteal: 0.6 }] },
  { id: 'retrograde', name: '역행', cost: 2, input: 'nebula', output: 'void', tag: 'strike', desc: '강화와 보호막을 걷어내고 공격.', effects: [{ kind: 'purge', target: 'focus' }, { kind: 'damage', power: 13, target: 'focus' }] },
  { id: 'collapse', name: '붕괴', cost: 2, input: 'sol', output: 'void', tag: 'execute', desc: '약화 효과가 걸린 대상에게 2배 피해.', effects: [{ kind: 'damage', power: 10, target: 'focus', vsDebuffed: 2 }] },
  // 아스트라 · 별빛
  { id: 'galaxy_ward', name: '은하 수호', cost: 1, input: 'wild', output: 'echo', tag: 'shield', desc: '아군 전원 보호막. 직전 성속을 잇는다.', effects: [{ kind: 'shield', power: 8, target: 'allAllies' }] },
  { id: 'constellation_echo', name: '성좌 반향', cost: 1, input: 'wild', output: 'echo', tag: 'strike', desc: '피해. 직전 성속을 잇는다.', effects: [{ kind: 'damage', power: 8, target: 'focus' }] },
  { id: 'taunt_star', name: '도발의 별', cost: 1, input: 'wild', output: 'echo', tag: 'shield', desc: '이번 턴 단일 공격을 대신 받고 보호막.', effects: [{ kind: 'allyStatus', status: 'taunt', turns: 1, target: 'self' }, { kind: 'shield', power: 14, target: 'self' }] },
  { id: 'counter_stance', name: '반격 태세', cost: 1, input: 'wild', output: 'echo', tag: 'buff', desc: '이번 턴 공격받으면 반격.', effects: [{ kind: 'allyStatus', status: 'counter', turns: 1, value: 10, target: 'self' }, { kind: 'shield', power: 6, target: 'self' }] },
  { id: 'star_judgement', name: '별의 심판', cost: 3, input: 'wild', output: 'echo', tag: 'strike', desc: '체인 수에 비례한 피해.', effects: [{ kind: 'damage', power: 7, target: 'focus', scaleWithChain: true }] },
];

export const SPELLS: Record<string, SpellDef> = Object.fromEntries(list.map((s) => [s.id, s]));

export function spellById(id: string): SpellDef {
  const s = SPELLS[id];
  if (!s) throw new Error(`Unknown spell: ${id}`);
  return s;
}

/** 카드 아래 작은 영문 표식(리버스 1999식 Didone 대문자) */
export const TAG_EN: Record<SkillTag, string> = {
  strike: 'STRIKE',
  multi: 'FLURRY',
  aoe: 'NOVA',
  pierce: 'PIERCE',
  execute: 'VERDICT',
  drain: 'DRAIN',
  dot: 'BURN',
  delayed: 'OMEN',
  debuff: 'HEX',
  heal: 'MEND',
  shield: 'WARD',
  buff: 'RITE',
  utility: 'ARCANA',
};

export const TAG_NAMES: Record<SkillTag, string> = {
  strike: '단일',
  multi: '연타',
  aoe: '광역',
  pierce: '관통',
  execute: '처단',
  drain: '흡수',
  dot: '지속',
  delayed: '지연',
  debuff: '약화',
  heal: '치유',
  shield: '보호',
  buff: '강화',
  utility: '보조',
};
