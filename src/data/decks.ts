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
    name: '초신성 예열',
    en: 'KINDLE & CODA',
    plan: '두세 라운드 예열을 모았다가 초신성 창·종언의 별로 한 번에 끝낸다.',
    loadout: {
      solea: ['sun_kindle', 'stellar_core', 'supernova_lance', 'dawn_thrust', 'sun_oath'],
      vela: ['steady_aim', 'final_star', 'meteor_snipe', 'tail_volley', 'piercing_shot'],
      lune: ['moon_veil', 'fullmoon_ward', 'crescent_edge', 'tidal_song', 'moon_brand'],
      astra: ['guiding_star', 'taunt_star', 'galaxy_ward', 'constellation_echo', 'counter_stance'],
    },
  },
  {
    id: 'brand',
    name: '별흔 난사',
    en: 'STARBRAND',
    plan: '연타마다 별흔을 새겨 모든 공격에 고정 피해를 얹고, 심연의 만찬으로 터뜨린다.',
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
    plan: '태양을 내보낼 때마다 각인이 쌓이고, 코로나 의식·태양탄이 갈수록 강해진다. 루네가 버틴다.',
    loadout: {
      solea: ['corona_rite', 'dawn_thrust', 'sun_kindle', 'solar_cleave', 'flare_rush'],
      nebia: ['sunwell', 'interstellar_echo', 'primal_light', 'amplify', 'nebula_mist'],
      vela: ['sunfire_round', 'meteor_snipe', 'scatter_meteor', 'tail_volley', 'piercing_shot'],
      lune: ['moon_halo_mark', 'moon_veil', 'tidal_song', 'fullmoon_ward', 'crescent_edge'],
    },
  },
  {
    id: 'luna',
    name: '만월 해방',
    en: 'LUNAR RELEASE',
    plan: '달 각인을 천천히 쌓으며 버티다가, 그믐의 종장으로 한꺼번에 풀어낸다.',
    loadout: {
      lune: ['lunar_attune', 'crescent_finale', 'moon_veil', 'crescent_edge', 'fullmoon_ward'],
      astra: ['constellation_echo', 'galaxy_ward', 'taunt_star', 'counter_stance', 'guiding_star'],
      nebia: ['amplify', 'interstellar_echo', 'nebula_mist', 'primal_light', 'star_tithe'],
      solea: ['stellar_core', 'noon_verdict', 'dawn_thrust', 'sun_oath', 'flare_rush'],
    },
  },
  {
    id: 'void',
    name: '공허 종말',
    en: 'VOID OMEN',
    plan: '공허 각인과 지연 폭격을 겹겹이 깔고, 종말의 메아리로 앞당겨 터뜨린다.',
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
    plan: '보호막을 두껍게 두르고 반격과 방패 강타로 갚는다. 성진은 범람으로 몰아 쓴다.',
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
