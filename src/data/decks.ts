/**
 * 추천 덱: 술사 4명, 각자의 장착 주문 5장, 링크가 이어지는 순서 예시. 편성 화면에서 한 번에 적용하고, 밸런스 시뮬레이션도 이 목록을 돈다.
 */
export interface DeckPreset {
  id: string;
  name: string;
  en: string;
  /** 한 줄 요약: 어떻게 이어서 이기는 팀인가 */
  plan: string;
  team: string[];
  /** 술사 id → 장착 주문 5장 */
  loadout: Record<string, string[]>;
}

export const DECKS: DeckPreset[] = [
  {
    id: 'ramp',
    name: '초신성 폭주',
    en: 'SOLAR CORE',
    plan: '여명 찌르기 → 초승 칼날로 일식을 터뜨려 적을 묶고, 화상으로 모은 태양핵을 혜성에서 이어 받은 초신성 창으로 태운다.',
    team: ['solea', 'vela', 'lune', 'astra'],
    loadout: {
      solea: ['dawn_thrust', 'stellar_core', 'supernova_lance', 'sun_kindle', 'sun_oath'],
      vela: ['meteor_snipe', 'steady_aim', 'final_star', 'tail_volley', 'piercing_shot'],
      lune: ['crescent_edge', 'moon_veil', 'tidal_song', 'fullmoon_ward', 'moon_brand'],
      astra: ['bulwark_bash', 'constellation_echo', 'galaxy_ward', 'guiding_star', 'taunt_star'],
    },
  },
  {
    id: 'brand',
    name: '균열 사냥',
    en: 'RUPTURE HUNT',
    plan: '초승 칼날 → 공허의 손길(월몰) → 종언의 별(블랙홀) → 성운 안개(유성우). 반응 셋을 잇는 체인으로 균열을 쌓는다.',
    team: ['vela', 'nox', 'nebia', 'lune'],
    loadout: {
      vela: ['gatling_comet', 'tail_volley', 'steady_aim', 'final_star', 'meteor_snipe'],
      nox: ['void_touch', 'rot_seed', 'abyss_feast', 'siphon', 'event_horizon'],
      nebia: ['nebula_mist', 'dust_brand', 'primal_light', 'interstellar_echo', 'amplify'],
      lune: ['crescent_edge', 'moon_halo_mark', 'moon_veil', 'fullmoon_ward', 'tidal_song'],
    },
  },
  {
    id: 'sol',
    name: '잿불 증폭',
    en: 'EMBER CHORD',
    plan: '성운 안개 → 홍염 연격(초신성) → 초승 칼날(일식) → 공허의 손길(월몰). 솔레아의 화상을 녹스가 잠식으로 바꿔 먹는다.',
    team: ['solea', 'nox', 'nebia', 'lune'],
    loadout: {
      solea: ['flare_rush', 'dawn_thrust', 'corona_rite', 'sun_kindle', 'solar_cleave'],
      nox: ['void_touch', 'rot_seed', 'siphon', 'collapse', 'abyss_feast'],
      nebia: ['nebula_mist', 'sunwell', 'interstellar_echo', 'primal_light', 'amplify'],
      lune: ['crescent_edge', 'moon_veil', 'moon_halo_mark', 'tidal_song', 'lunar_attune'],
    },
  },
  {
    id: 'luna',
    name: '만조 해방',
    en: 'HIGH TIDE',
    plan: '여명 찌르기 → 초승 칼날(일식) → 공명 증폭(조수) → 방패 강타. 회복으로 만조를 채워 그믐의 종장으로 푼다.',
    team: ['lune', 'astra', 'nebia', 'solea'],
    loadout: {
      lune: ['crescent_edge', 'crescent_finale', 'moon_veil', 'lunar_attune', 'fullmoon_ward'],
      astra: ['bulwark_bash', 'constellation_echo', 'galaxy_ward', 'counter_stance', 'guiding_star'],
      nebia: ['amplify', 'star_tithe', 'interstellar_echo', 'nebula_mist', 'primal_light'],
      solea: ['dawn_thrust', 'stellar_core', 'noon_verdict', 'sun_oath', 'flare_rush'],
    },
  },
  {
    id: 'void',
    name: '공허 포식',
    en: 'VOID FEAST',
    plan: '초승 칼날 → 공허의 손길(월몰) → 종언의 별(블랙홀) → 방패 강타. 잠식과 균열을 깔아 심연의 만찬으로 삼킨다.',
    team: ['nox', 'vela', 'lune', 'astra'],
    loadout: {
      nox: ['void_touch', 'doom_echo', 'void_resonance', 'abyss_feast', 'siphon'],
      vela: ['final_star', 'orbital_strike', 'tail_volley', 'meteor_snipe', 'steady_aim'],
      lune: ['crescent_edge', 'eclipse_veil', 'moon_brand', 'moon_veil', 'tidal_song'],
      astra: ['bulwark_bash', 'constellation_echo', 'galaxy_ward', 'taunt_star', 'guiding_star'],
    },
  },
  {
    id: 'fortress',
    name: '성채 반격',
    en: 'BASTION',
    plan: '여명 찌르기 → 초승 칼날(일식) → 공허의 손길(월몰) → 방패 강타. 아스트라가 어떤 성속이든 받아 체인을 끝까지 잇고 진동을 쌓는다.',
    team: ['astra', 'lune', 'solea', 'nox'],
    loadout: {
      astra: ['bulwark_bash', 'star_aegis', 'counter_stance', 'taunt_star', 'star_judgement'],
      lune: ['crescent_edge', 'fullmoon_ward', 'moon_veil', 'eclipse_veil', 'tidal_song'],
      solea: ['dawn_thrust', 'stellar_core', 'sun_oath', 'noon_verdict', 'solar_cleave'],
      nox: ['void_touch', 'siphon', 'collapse', 'retrograde', 'rot_seed'],
    },
  },
  {
    id: 'oath',
    name: '네 개의 맹세',
    en: 'OATH OF FOUR',
    plan: '여명 찌르기 → 초승 칼날(일식) → 쌍월(월몰) → 태양 탄막. 루네와 쌍둥이 오빠 카이렌, 솔레아와 라이벌 리코가 한 줄로 이어 성좌를 완성한다.',
    team: ['solea', 'lune', 'kairen', 'riko'],
    loadout: {
      solea: ['dawn_thrust', 'stellar_core', 'supernova_lance', 'sun_oath', 'solar_cleave'],
      lune: ['crescent_edge', 'moon_veil', 'tidal_song', 'fullmoon_ward', 'moon_halo_mark'],
      kairen: ['twin_moon', 'kairen_draw', 'moonlit_iai', 'fallen_moon_stance', 'moon_shadow_cut'],
      riko: ['sun_barrage', 'quick_draw', 'smoke_roll', 'twin_fan', 'high_noon'],
    },
  },
  {
    id: 'duel',
    name: '정오의 결투',
    en: 'HIGH NOON',
    plan: '유성 저격 → 엄호 사격(유성우) → 월하일섬 → 월광 공명. 두 총잡이가 틈을 열고 카이렌이 단칼에 끝내면, 루네가 오빠의 달빛을 받아 잇는다.',
    team: ['vela', 'riko', 'kairen', 'lune'],
    loadout: {
      vela: ['meteor_snipe', 'steady_aim', 'tail_volley', 'final_star', 'piercing_shot'],
      riko: ['covering_fire', 'quick_draw', 'smoke_roll', 'sun_barrage', 'hammer_fan'],
      kairen: ['moonlit_iai', 'moon_blade_dance', 'kairen_draw', 'silver_rend', 'fallen_moon_stance'],
      lune: ['lunar_attune', 'moon_veil', 'tidal_song', 'fullmoon_ward', 'crescent_edge'],
    },
  },
];
