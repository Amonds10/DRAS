import type { Element, ReactionDef } from '../core/types';

export interface ElementMeta {
  name: string;
  glyph: string;
  color: string;
}

export const ELEMENTS: Record<Element | 'star', ElementMeta> = {
  sol: { name: '태양', glyph: '☉', color: '#ffc861' },
  luna: { name: '달', glyph: '☾', color: '#a8c8ff' },
  nebula: { name: '성운', glyph: '✺', color: '#f59bd6' },
  comet: { name: '혜성', glyph: '☄', color: '#6fe6d6' },
  void: { name: '공허', glyph: '◉', color: '#a184ff' },
  star: { name: '별빛', glyph: '✦', color: '#ece9ff' },
};

export const ELEMENT_ORDER: Element[] = ['sol', 'luna', 'nebula', 'comet', 'void'];

/** 성좌 반응: 링크된 직전 출력(from)과 이번 출력(to)의 조합으로 발동한다. */
export const REACTIONS: ReactionDef[] = [
  {
    id: 'eclipse',
    name: '일식',
    from: 'sol',
    to: 'luna',
    desc: '집중 대상을 1턴 기절시킨다.',
    effects: [{ kind: 'enemyStatus', status: 'stun', turns: 1, target: 'focus' }],
  },
  {
    id: 'moonset',
    name: '월몰',
    from: 'luna',
    to: 'void',
    desc: '집중 대상의 강화를 걷어내고 2턴 약화시킨다.',
    effects: [
      { kind: 'purge', target: 'focus' },
      { kind: 'enemyStatus', status: 'weaken', turns: 2, target: 'focus' },
    ],
  },
  {
    id: 'blackhole',
    name: '블랙홀',
    from: 'void',
    to: 'comet',
    desc: '모든 적에게 피해를 주고 1턴 노출시킨다.',
    effects: [
      { kind: 'damage', power: 7, target: 'allEnemies' },
      { kind: 'enemyStatus', status: 'expose', turns: 1, target: 'allEnemies' },
    ],
  },
  {
    id: 'meteor',
    name: '유성우',
    from: 'comet',
    to: 'nebula',
    desc: '무작위 적에게 유성 3발을 떨어뜨린다.',
    effects: [{ kind: 'damage', power: 6, target: 'random3' }],
  },
  {
    id: 'supernova',
    name: '초신성',
    from: 'nebula',
    to: 'sol',
    desc: '이번 마법의 피해가 1.5배가 되고 방어를 무시한다.',
    damageMult: 1.5,
    pierce: true,
    effects: [],
  },
  {
    id: 'flare',
    name: '홍염',
    from: 'sol',
    to: 'comet',
    desc: '집중 대상을 3턴 동안 불태운다.',
    effects: [{ kind: 'enemyStatus', status: 'burn', turns: 3, value: 5, target: 'focus' }],
  },
  {
    id: 'tide',
    name: '조수',
    from: 'luna',
    to: 'nebula',
    desc: '아군 전원을 회복시킨다.',
    effects: [{ kind: 'heal', power: 8, target: 'allAllies' }],
  },
];

export function findReaction(from: Element, to: Element): ReactionDef | undefined {
  return REACTIONS.find((r) => r.from === from && r.to === to);
}

export function reactionById(id: string): ReactionDef {
  const r = REACTIONS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown reaction: ${id}`);
  return r;
}

export const STATUS_META: Record<string, { name: string; glyph: string; debuff: boolean }> = {
  stun: { name: '기절', glyph: '✕', debuff: true },
  weaken: { name: '약화', glyph: '↓', debuff: true },
  burn: { name: '연소', glyph: '♨', debuff: true },
  expose: { name: '노출', glyph: '◎', debuff: true },
  atkUp: { name: '공격 상승', glyph: '↑', debuff: false },
  seal: { name: '성식', glyph: '⊘', debuff: true },
};
