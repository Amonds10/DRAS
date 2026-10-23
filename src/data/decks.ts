/**
 * 추천 팀: 술사 4명과 운영 요약. 편성 화면에서 한 번에 적용하고, 밸런스 시뮬레이션도 이 목록을 돈다.
 */
export interface DeckPreset {
  id: string;
  name: string;
  en: string;
  /** 한 줄 요약: 어떻게 이기는 팀인가 */
  plan: string;
  team: string[];
}

export const DECKS: DeckPreset[] = [
  {
    id: 'ramp',
    name: '초신성 폭주',
    en: 'SOLAR CORE',
    plan: '솔레아가 화상을 깔며 태양핵을 채우고, 벨라와 함께 초신성 창·종언의 별로 한 번에 끝낸다. 루네와 아스트라가 버틴다.',
    team: ['solea', 'vela', 'lune', 'astra'],
  },
  {
    id: 'brand',
    name: '균열 사냥',
    en: 'RUPTURE HUNT',
    plan: '네비아와 벨라가 균열을 쌓아 모두의 타격에 고정 피해를 얹고, 녹스가 균열째 삼킨다.',
    team: ['vela', 'nox', 'nebia', 'lune'],
  },
  {
    id: 'sol',
    name: '잿불 증폭',
    en: 'EMBER CHORD',
    plan: '솔레아의 화상을 녹스가 1.5배 잠식으로 바꾸고, 네비아가 각인을 부풀려 터뜨린다.',
    team: ['solea', 'nox', 'nebia', 'lune'],
  },
  {
    id: 'luna',
    name: '만조 해방',
    en: 'HIGH TIDE',
    plan: '월영과 회복으로 만조를 채워 그믐의 종장으로 풀고, 아스트라의 보호막으로 버틴다.',
    team: ['lune', 'astra', 'nebia', 'solea'],
  },
  {
    id: 'void',
    name: '공허 포식',
    en: 'VOID FEAST',
    plan: '잠식과 균열을 겹겹이 깔아 허기를 채우고, 심연의 만찬으로 통째로 삼킨다.',
    team: ['nox', 'vela', 'lune', 'astra'],
  },
  {
    id: 'fortress',
    name: '성채 반격',
    en: 'BASTION',
    plan: '아스트라가 도발과 반격으로 받아 내며 진동을 쌓고, 별의 심판으로 모든 적을 기절시킨다.',
    team: ['astra', 'lune', 'solea', 'nebia'],
  },
];
