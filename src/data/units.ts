import type { Role, UnitDef } from '../core/types';

/** 술사 6명. 각자 고정 스킬 4개와 패시브를 가진다. */
const list: UnitDef[] = [
  {
    id: 'solea',
    name: '솔레아',
    code: 'SOLEA',
    concept: '새벽마다 가장 먼저 창을 드는 선봉.',
    element: 'sol',
    role: 'striker',
    maxHp: 80,
    atk: 14,
    def: 5,
    spells: ['dawn_thrust', 'stellar_core', 'flare_rush', 'supernova_lance'],
    passive: { name: '태양심장', desc: '화상 걸린 적을 때릴 때마다 태양핵 +1(최대 6). 태양핵은 초신성 창이 모두 태운다.' },
    stack: { id: 'solarCore', max: 6 },
  },
  {
    id: 'lune',
    name: '루네',
    code: 'LUNE',
    concept: '다친 사람을 그냥 지나치지 못하는 치유사.',
    element: 'luna',
    role: 'support',
    maxHp: 72,
    atk: 11,
    def: 4,
    spells: ['crescent_edge', 'moon_veil', 'moon_brand', 'crescent_finale'],
    passive: { name: '밀물', desc: '아군이 회복할 때마다 만조 +1(최대 10). 만조는 그믐의 종장이 모두 푼다.' },
    stack: { id: 'tide', max: 10 },
  },
  {
    id: 'nebia',
    name: '네비아',
    code: 'NEBIA',
    concept: '흩어진 별먼지를 모아 동료의 힘으로 바꾼다.',
    element: 'nebula',
    role: 'support',
    maxHp: 70,
    atk: 11,
    def: 4,
    spells: ['nebula_mist', 'star_tithe', 'amplify', 'primal_light'],
    passive: { name: '증폭자', desc: '네비아가 거는 각인은 위력 +1. 공명파동으로 아군의 다음 시전을 강화한다.' },
  },
  {
    id: 'vela',
    name: '벨라',
    code: 'VELA',
    concept: '멀리서 한 발로 끝내는 걸 좋아하는 저격수.',
    element: 'comet',
    role: 'striker',
    maxHp: 64,
    atk: 15,
    def: 3,
    spells: ['meteor_snipe', 'scatter_meteor', 'gatling_comet', 'final_star'],
    passive: { name: '사냥꾼의 눈', desc: '균열 걸린 적을 맞힐 때마다 조준 +1(최대 6). 조준 1당 벨라의 피해 +6%.' },
    stack: { id: 'aim', max: 6 },
  },
  {
    id: 'nox',
    name: '녹스',
    code: 'NOX',
    concept: '말수가 적고, 적의 약점을 먼저 본다.',
    element: 'void',
    role: 'hexer',
    maxHp: 68,
    atk: 12,
    def: 4,
    spells: ['siphon', 'void_touch', 'rot_seed', 'abyss_feast'],
    passive: { name: '포식', desc: '적이 화상·잠식 피해를 받을 때마다 허기 +1(최대 10). 허기 1당 녹스의 피해 +5%.' },
    stack: { id: 'hunger', max: 10 },
  },
  {
    id: 'astra',
    name: '아스트라',
    code: 'ASTRA',
    concept: '모두를 등 뒤에 두고 서는 방패.',
    element: 'star',
    role: 'guardian',
    maxHp: 92,
    atk: 10,
    def: 7,
    spells: ['bulwark_bash', 'constellation_echo', 'star_aegis', 'star_judgement'],
    passive: { name: '불굴', desc: '보호막을 얻거나 공격받을 때마다 불굴 +1(최대 8). 반격 피해 +불굴×2.' },
    stack: { id: 'fortitude', max: 8 },
  },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(list.map((u) => [u.id, u]));
export const UNIT_LIST = list;

export function unitById(id: string): UnitDef {
  const u = UNITS[id];
  if (!u) throw new Error(`Unknown unit: ${id}`);
  return u;
}

export const ROLE_NAMES: Record<Role, string> = {
  striker: '공격',
  guardian: '수호',
  support: '지원',
  hexer: '교란',
};
