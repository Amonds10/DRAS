/**
 * 추천 팀: 술사 4명과, 링크가 이어지는 순서 예시. 편성 화면에서 한 번에 적용하고, 밸런스 시뮬레이션도 이 목록을 돈다.
 */
export interface DeckPreset {
  id: string;
  name: string;
  en: string;
  /** 한 줄 요약: 어떻게 이어서 이기는 팀인가 */
  plan: string;
  team: string[];
}

export const DECKS: DeckPreset[] = [
  {
    id: 'ramp',
    name: '초신성 폭주',
    en: 'SOLAR CORE',
    plan: '여명 찌르기 → 초승 칼날로 일식을 터뜨려 적을 묶고, 화상으로 모은 태양핵을 혜성에서 이어 받은 초신성 창으로 태운다.',
    team: ['solea', 'vela', 'lune', 'astra'],
  },
  {
    id: 'brand',
    name: '균열 사냥',
    en: 'RUPTURE HUNT',
    plan: '초승 칼날 → 공허의 손길(월몰) → 종언의 별(블랙홀) → 성운 안개(유성우). 반응 셋을 잇는 체인으로 균열을 쌓는다.',
    team: ['vela', 'nox', 'nebia', 'lune'],
  },
  {
    id: 'sol',
    name: '잿불 증폭',
    en: 'EMBER CHORD',
    plan: '성운 안개 → 홍염 연격(초신성) → 초승 칼날(일식) → 공허의 손길(월몰). 솔레아의 화상을 녹스가 잠식으로 바꿔 먹는다.',
    team: ['solea', 'nox', 'nebia', 'lune'],
  },
  {
    id: 'luna',
    name: '만조 해방',
    en: 'HIGH TIDE',
    plan: '여명 찌르기 → 초승 칼날(일식) → 공명 증폭(조수) → 방패 강타. 회복으로 만조를 채워 그믐의 종장으로 푼다.',
    team: ['lune', 'astra', 'nebia', 'solea'],
  },
  {
    id: 'void',
    name: '공허 포식',
    en: 'VOID FEAST',
    plan: '초승 칼날 → 공허의 손길(월몰) → 종언의 별(블랙홀) → 방패 강타. 잠식과 균열을 깔아 심연의 만찬으로 삼킨다.',
    team: ['nox', 'vela', 'lune', 'astra'],
  },
  {
    id: 'fortress',
    name: '성채 반격',
    en: 'BASTION',
    plan: '여명 찌르기 → 초승 칼날(일식) → 공허의 손길(월몰) → 방패 강타. 아스트라가 어떤 성속이든 받아 체인을 끝까지 잇고 진동을 쌓는다.',
    team: ['astra', 'lune', 'solea', 'nox'],
  },
];
