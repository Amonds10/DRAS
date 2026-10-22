import type { Role, UnitDef } from '../core/types';

/** 술사 6명. 각자 주문 9개 중 5개를 장착하고, 매 라운드 장착한 5개 중 2장을 뽑는다. */
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
    spells: ['dawn_thrust', 'solar_cleave', 'flare_rush', 'noon_verdict', 'sun_oath'],
    pool: ['dawn_thrust', 'solar_cleave', 'flare_rush', 'noon_verdict', 'sun_oath', 'sun_kindle', 'stellar_core', 'supernova_lance', 'corona_rite'],
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
    spells: ['moon_veil', 'crescent_edge', 'tidal_song', 'fullmoon_ward', 'moon_brand'],
    pool: ['moon_veil', 'crescent_edge', 'tidal_song', 'fullmoon_ward', 'moon_brand', 'moon_halo_mark', 'lunar_attune', 'eclipse_veil', 'crescent_finale'],
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
    spells: ['interstellar_echo', 'primal_light', 'nebula_mist', 'amplify', 'dust_storm'],
    pool: ['interstellar_echo', 'primal_light', 'nebula_mist', 'amplify', 'dust_storm', 'star_tithe', 'dust_brand', 'overflow', 'sunwell'],
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
    spells: ['meteor_snipe', 'tail_volley', 'orbital_strike', 'piercing_shot', 'scatter_meteor'],
    pool: ['meteor_snipe', 'tail_volley', 'orbital_strike', 'piercing_shot', 'scatter_meteor', 'steady_aim', 'gatling_comet', 'final_star', 'sunfire_round'],
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
    spells: ['void_touch', 'event_horizon', 'siphon', 'retrograde', 'collapse'],
    pool: ['void_touch', 'event_horizon', 'siphon', 'retrograde', 'collapse', 'rot_seed', 'abyss_feast', 'doom_echo', 'void_resonance'],
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
    spells: ['galaxy_ward', 'constellation_echo', 'taunt_star', 'counter_stance', 'star_judgement'],
    pool: ['galaxy_ward', 'constellation_echo', 'taunt_star', 'counter_stance', 'star_judgement', 'bulwark_bash', 'star_aegis', 'guiding_star', 'constellation_mark'],
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
