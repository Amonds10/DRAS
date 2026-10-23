import type { Element } from '../core/types';

export interface ElementMeta {
  name: string;
  en: string;
  glyph: string;
  color: string;
}

export const ELEMENTS: Record<Element | 'star', ElementMeta> = {
  sol: { name: '태양', en: 'SOL', glyph: '☉', color: '#efbe55' },
  luna: { name: '달', en: 'LUNA', glyph: '☾', color: '#a9c2e8' },
  nebula: { name: '성운', en: 'NEBULA', glyph: '✺', color: '#e09bc4' },
  comet: { name: '혜성', en: 'COMET', glyph: '☄', color: '#74cdbd' },
  void: { name: '공허', en: 'VOID', glyph: '◉', color: '#a891e6' },
  star: { name: '별빛', en: 'STELLA', glyph: '✦', color: '#f1e6c8' },
};

export const ELEMENT_ORDER: Element[] = ['sol', 'luna', 'nebula', 'comet', 'void'];

export const STATUS_META: Record<string, { name: string; glyph: string; debuff: boolean; desc: string; keyword?: boolean }> = {
  stun: { name: '기절', glyph: '✕', debuff: true, desc: '이번 턴에 행동하지 못한다' },
  weaken: { name: '약화', glyph: '↓', debuff: true, desc: '주는 피해가 줄어든다' },
  expose: { name: '노출', glyph: '◎', debuff: true, desc: '받는 피해가 늘어난다' },
  atkUp: { name: '공격 상승', glyph: '↑', debuff: false, desc: '주는 피해가 늘어난다' },
  doom: { name: '폭격 예정', glyph: '◎', debuff: true, desc: '다음 차례가 올 때 폭격이 떨어진다' },
  taunt: { name: '도발', glyph: '⛨', debuff: false, desc: '적의 공격을 끌어온다' },
  counter: { name: '반격', glyph: '⟲', debuff: false, desc: '맞으면 되받아친다' },
  // 적 각인(위력·횟수)
  burn: { name: '화상', glyph: '♨', debuff: true, keyword: true, desc: '차례가 시작될 때 위력만큼 피해, 횟수 -1' },
  rupture: { name: '균열', glyph: '✧', debuff: true, keyword: true, desc: '아군에게 맞을 때마다 위력만큼 추가 피해(방어 무시), 횟수 -1' },
  erosion: { name: '잠식', glyph: '◐', debuff: true, keyword: true, desc: '적이 움직일 때마다 위력만큼 피해, 횟수 -1' },
  tremor: { name: '진동', glyph: '≋', debuff: true, keyword: true, desc: '쌓아 두었다가 터뜨린다. 위력 8 이상에서 터지면 기절' },
  moonshade: { name: '월영', glyph: '☾', debuff: true, keyword: true, desc: '이 적을 때린 아군이 위력만큼 회복, 횟수 -1' },
  // 술사 고유 중첩
  solarCore: { name: '태양핵', glyph: '☉', debuff: false, desc: '솔레아: 초신성 창이 모두 태워 1당 피해 +60%' },
  aim: { name: '조준', glyph: '⌖', debuff: false, desc: '벨라: 1당 피해 +6%, 종언의 별이 모두 써서 1당 +70%' },
  tide: { name: '만조', glyph: '≈', debuff: false, desc: '루네: 그믐의 종장이 모두 풀어 1당 피해 +20%' },
  hunger: { name: '허기', glyph: '◉', debuff: false, desc: '녹스: 1당 피해 +5%, 심연의 만찬이 모두 써서 1당 +10%' },
  fortitude: { name: '불굴', glyph: '⛉', debuff: false, desc: '아스트라: 반격 +2씩, 방패 강타가 모두 써서 1당 +12%' },
  wave: { name: '공명파동', glyph: '∿', debuff: false, desc: '다음 행동의 피해·회복·보호막 +20%(중첩당), 행동하면 사라진다' },
};
