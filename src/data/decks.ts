/**
 * 추천 덱: 팀 4명과 각자의 장착 주문 5개.
 * 편성 화면에서 한 번에 적용하고, 밸런스 시뮬레이션도 이 목록을 돈다.
 */
export interface DeckPreset {
  id: string;
  name: string;
  en: string;
  /** 한 줄 요약: 어떻게 이기는 덱인가 */
  plan: string;
  /** 술사 id → 장착 주문 5개 */
  loadout: Record<string, string[]>;
}

export const DECKS: DeckPreset[] = [
  {
    id: 'ramp',
    name: '초신성 폭주',
    en: 'SOLAR CORE',
    plan: '화상을 깔아 태양핵을 채우고, 벨라의 조준과 함께 초신성 창·종언의 별로 한 번에 끝낸다.',
    loadout: {
      solea: ['sun_kindle', 'stellar_core', 'supernova_lance', 'dawn_thrust', 'sun_oath'],
      vela: ['steady_aim', 'final_star', 'meteor_snipe', 'tail_volley', 'piercing_shot'],
      lune: ['moon_veil', 'fullmoon_ward', 'crescent_edge', 'tidal_song', 'moon_brand'],
      astra: ['guiding_star', 'taunt_star', 'galaxy_ward', 'constellation_echo', 'counter_stance'],
    },
  },
  {
    id: 'brand',
    name: '균열 사냥',
    en: 'RUPTURE HUNT',
    plan: '연타로 균열을 새겨 모두의 타격에 고정 피해를 얹고, 녹스가 균열·잠식을 집어삼킨다.',
    loadout: {
      vela: ['gatling_comet', 'tail_volley', 'steady_aim', 'scatter_meteor', 'meteor_snipe'],
      nox: ['rot_seed', 'abyss_feast', 'void_touch', 'siphon', 'event_horizon'],
      nebia: ['dust_brand', 'dust_storm', 'interstellar_echo', 'nebula_mist', 'amplify'],
      lune: ['moon_halo_mark', 'moon_veil', 'moon_brand', 'crescent_edge', 'tidal_song'],
    },
  },
  {
    id: 'sol',
    name: '태양 공명',
    en: 'SOLAR CHORD',
    plan: '태양을 내보낼 때마다 공명이 쌓이고, 화상 걸린 적에게 코로나 의식·태양탄이 갈수록 강해진다.',
    loadout: {
      solea: ['corona_rite', 'dawn_thrust', 'sun_kindle', 'solar_cleave', 'flare_rush'],
      nebia: ['sunwell', 'interstellar_echo', 'primal_light', 'amplify', 'nebula_mist'],
      vela: ['sunfire_round', 'meteor_snipe', 'scatter_meteor', 'tail_volley', 'piercing_shot'],
      lune: ['moon_halo_mark', 'moon_veil', 'tidal_song', 'fullmoon_ward', 'crescent_edge'],
    },
  },
  {
    id: 'luna',
    name: '만조 해방',
    en: 'HIGH TIDE',
    plan: '월영을 걸어 때릴 때마다 회복하고, 그 회복으로 만조를 채워 그믐의 종장으로 풀어낸다.',
    loadout: {
      lune: ['lunar_attune', 'crescent_finale', 'moon_veil', 'crescent_edge', 'fullmoon_ward'],
      astra: ['constellation_echo', 'galaxy_ward', 'taunt_star', 'counter_stance', 'guiding_star'],
      nebia: ['amplify', 'interstellar_echo', 'nebula_mist', 'primal_light', 'star_tithe'],
      solea: ['stellar_core', 'noon_verdict', 'dawn_thrust', 'sun_oath', 'flare_rush'],
    },
  },
  {
    id: 'void',
    name: '공허 포식',
    en: 'VOID FEAST',
    plan: '잠식과 지연 폭격을 겹겹이 깔아 허기를 채우고, 종말의 메아리로 앞당겨 터뜨린다.',
    loadout: {
      nox: ['void_resonance', 'doom_echo', 'void_touch', 'collapse', 'siphon'],
      vela: ['orbital_strike', 'tail_volley', 'meteor_snipe', 'final_star', 'steady_aim'],
      lune: ['eclipse_veil', 'moon_brand', 'moon_veil', 'crescent_edge', 'tidal_song'],
      astra: ['constellation_echo', 'galaxy_ward', 'taunt_star', 'counter_stance', 'guiding_star'],
    },
  },
  {
    id: 'fortress',
    name: '성채 반격',
    en: 'BASTION',
    plan: '보호막과 피격으로 불굴을 쌓아 반격·방패 강타로 갚고, 진동을 모아 별의 심판으로 기절시킨다.',
    loadout: {
      astra: ['bulwark_bash', 'star_aegis', 'counter_stance', 'taunt_star', 'galaxy_ward'],
      lune: ['fullmoon_ward', 'eclipse_veil', 'moon_veil', 'tidal_song', 'moon_brand'],
      solea: ['stellar_core', 'dawn_thrust', 'sun_oath', 'noon_verdict', 'solar_cleave'],
      nebia: ['overflow', 'interstellar_echo', 'star_tithe', 'primal_light', 'amplify'],
    },
  },
];

export function deckById(id: string): DeckPreset | undefined {
  return DECKS.find((d) => d.id === id);
}
