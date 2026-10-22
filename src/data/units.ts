import type { Role, UnitDef } from '../core/types';

/** 캐릭터 설정 없이 성속과 역할만 가진 범용 술사들. */
const list: UnitDef[] = [
  { id: 'sol_striker', name: '태양 공격술사', element: 'sol', role: 'striker', maxHp: 70, atk: 14, def: 4, spells: ['dawn_lance', 'corona_burst'] },
  { id: 'sol_guardian', name: '태양 수호술사', element: 'sol', role: 'guardian', maxHp: 96, atk: 10, def: 8, spells: ['halo_wall', 'sun_strike'] },
  { id: 'luna_striker', name: '달 공격술사', element: 'luna', role: 'striker', maxHp: 66, atk: 14, def: 3, spells: ['crescent_edge', 'fullmoon_fall'] },
  { id: 'luna_support', name: '달 치유술사', element: 'luna', role: 'support', maxHp: 72, atk: 9, def: 5, spells: ['moon_veil', 'tidal_song'] },
  { id: 'nebula_hexer', name: '성운 교란술사', element: 'nebula', role: 'hexer', maxHp: 70, atk: 11, def: 4, spells: ['nebula_mist', 'stardust_vortex'] },
  { id: 'nebula_support', name: '성운 지원술사', element: 'nebula', role: 'support', maxHp: 74, atk: 9, def: 5, spells: ['interstellar_echo', 'primal_light'] },
  { id: 'comet_striker', name: '혜성 공격술사', element: 'comet', role: 'striker', maxHp: 66, atk: 14, def: 3, spells: ['tail_shot', 'comet_fall'] },
  { id: 'comet_raider', name: '혜성 돌격술사', element: 'comet', role: 'striker', maxHp: 80, atk: 12, def: 5, spells: ['meteor_dash', 'orbit_barrage'] },
  { id: 'void_hexer', name: '공허 교란술사', element: 'void', role: 'hexer', maxHp: 68, atk: 12, def: 4, spells: ['void_touch', 'event_horizon'] },
  { id: 'void_guardian', name: '공허 수호술사', element: 'void', role: 'guardian', maxHp: 92, atk: 10, def: 7, spells: ['dark_curtain', 'retrograde'] },
  { id: 'star_conductor', name: '별빛 지휘술사', element: 'star', role: 'support', maxHp: 76, atk: 10, def: 5, spells: ['constellation_echo', 'polaris_guide'] },
  { id: 'star_warden', name: '별빛 파수술사', element: 'star', role: 'guardian', maxHp: 86, atk: 11, def: 6, spells: ['galaxy_ward', 'star_judgement'] },
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
