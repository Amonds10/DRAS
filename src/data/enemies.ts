import type { EnemyDef, EnemyMove } from '../core/types';

/*
 * 적은 이름 붙은 행동을 순서대로 되풀이한다. 다음 행동은 머리 위에 예고되고, 눌러 보면 패턴 전체가 보인다.
 * 잡몹은 패턴 아무 칸에서 시작하고, 별지기·별을 삼키는 자는 처음부터 시작해 체력이 절반 아래로 떨어지면 2단계 패턴으로 바뀐다.
 */
const hit = (name: string, power: number, x: Partial<EnemyMove> = {}): EnemyMove => ({ name, kind: 'attack', power, ...x });
const all = (name: string, power: number, x: Partial<EnemyMove> = {}): EnemyMove => ({ name, kind: 'attackAll', power, ...x });

const list: EnemyDef[] = [
  {
    id: 'stray_shard',
    name: '떠도는 별부스러기',
    glyph: '✧',
    maxHp: 70,
    atk: 12,
    def: 2,
    pattern: [hit('파편 찌르기', 10), hit('흩날리기', 6, { hits: 2 }), hit('결정화', 6, { shield: 10 })],
  },
  {
    id: 'shadow_comet',
    name: '그림자 혜성',
    glyph: '☄',
    maxHp: 86,
    atk: 13,
    def: 3,
    pattern: [hit('꼬리 채찍', 12), hit('약한 곳 노리기', 10, { aim: 'lowest' }), all('낙하', 7)],
  },
  {
    id: 'dusk_moth',
    name: '황혼 나방',
    glyph: '❦',
    maxHp: 74,
    atk: 11,
    def: 2,
    pattern: [
      { name: '인분 살포', kind: 'curse', burn: [3, 2] },
      hit('날개 베기', 7, { hits: 2, burn: [2, 2] }),
      { name: '현혹의 날갯짓', kind: 'curse', weaken: 1 },
    ],
  },
  {
    id: 'star_leech',
    name: '별빛 거머리',
    glyph: '♒',
    maxHp: 92,
    atk: 12,
    def: 3,
    pattern: [
      { name: '흡혈', kind: 'drain', power: 13, aim: 'lowest', lifesteal: 0.8 },
      { name: '성진 갉기', kind: 'steal', steal: 2, power: 5 },
      hit('부풀기', 7, { shield: 12 }),
    ],
  },
  {
    id: 'dark_nebula',
    name: '어둠 성운체',
    glyph: '❂',
    maxHp: 112,
    atk: 12,
    def: 5,
    pattern: [hit('응축 일격', 8, { atk: 3 }), hit('성운 촉수', 12), all('암흑 파동', 7, { weaken: 1 }), { name: '재생 안개', kind: 'mend', heal: 16 }],
  },
  {
    id: 'eclipse_eye',
    name: '성식의 눈',
    glyph: '◐',
    maxHp: 96,
    atk: 12,
    def: 4,
    pattern: [{ name: '성식', kind: 'seal' }, hit('꿰뚫는 응시', 12, { expose: 1 }), { name: '빛 삼킴', kind: 'steal', steal: 1, power: 6 }],
  },
  {
    id: 'shard_golem',
    name: '조각 수호상',
    glyph: '⬢',
    maxHp: 150,
    atk: 14,
    def: 8,
    pattern: [
      { name: '수호 결정', kind: 'guard', shield: 12 },
      hit('분쇄', 14, { aim: 'shielded', shatter: true }),
      { name: '기력 모으기', kind: 'charge' },
      all('대지진', 11, { shatter: true }),
    ],
  },
  {
    id: 'fallen_keeper',
    name: '타락한 별지기',
    glyph: '♆',
    maxHp: 300,
    atk: 15,
    def: 6,
    pattern: [hit('별지기의 창', 15), all('수호의 맹세', 6, { shield: 18 }), { name: '심판 준비', kind: 'charge' }, all('낙성', 15)],
    phase2: {
      at: 0.5,
      name: '타락한 맹세',
      atk: 3,
      pattern: [
        hit('광기의 연격', 8, { hits: 3, aim: 'lowest' }),
        { name: '저주의 등불', kind: 'curse', burn: [4, 3], weaken: 1 },
        { name: '천벌 준비', kind: 'charge' },
        all('천벌', 17, { shatter: true }),
      ],
    },
  },
  {
    id: 'star_devourer',
    name: '별을 삼키는 자',
    glyph: '✹',
    maxHp: 680,
    atk: 16,
    def: 6,
    traits: ['starShield'],
    pattern: [
      { name: '성식', kind: 'seal' },
      all('포식의 파동', 9),
      { name: '물어뜯기', kind: 'drain', power: 17, lifesteal: 0.5 },
      { name: '성진 포식', kind: 'steal', steal: 2, power: 5, atk: 2 },
      { name: '숨 고르기', kind: 'charge' },
      all('종말의 숨', 18),
    ],
    phase2: {
      at: 0.5,
      name: '굶주린 별',
      atk: 4,
      pattern: [
        { name: '삼킴', kind: 'drain', power: 11, hits: 2, shatter: true, lifesteal: 0.5, aim: 'shielded' },
        { name: '공허의 숨결', kind: 'curse', burn: [5, 3], expose: 1 },
        { name: '성식', kind: 'seal' },
        { name: '별빛 포식', kind: 'steal', steal: 3, power: 8 },
        { name: '멸망 준비', kind: 'charge' },
        all('멸망', 24),
      ],
    },
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
export const ENEMY_LIST = list;

export function enemyById(id: string): EnemyDef {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy: ${id}`);
  return e;
}

export const TRAIT_DESC: Record<string, string> = {
  starShield: '별 삼킴: 체인 3 미만의 마법 피해를 절반으로 줄인다. 중첩을 모아 쏘는 일격(배율 2배 이상)은 뚫린다.',
};

/** 행동 한 칸을 문장으로: 예고 툴팁과 상세 정보의 패턴 목록에 쓴다 */
export function moveText(m: EnemyMove): string {
  const parts: string[] = [];
  const hits = m.hits && m.hits > 1 ? ` ×${m.hits}` : '';
  const aim = m.aim === 'lowest' ? '체력이 가장 낮은 술사' : m.aim === 'shielded' ? '보호막이 가장 두꺼운 술사' : '술사 한 명';
  switch (m.kind) {
    case 'attack':
      parts.push(`${aim}에게 위력 ${m.power}${hits}`);
      break;
    case 'drain':
      parts.push(`${aim}에게 위력 ${m.power}${hits}, 준 피해의 ${Math.round((m.lifesteal ?? 0.5) * 100)}% 회복`);
      break;
    case 'attackAll':
      parts.push(`술사 전원에게 위력 ${m.power}${hits}`);
      break;
    case 'curse':
      parts.push('술사 전원에게 저주');
      break;
    case 'steal':
      parts.push(`남은 성진 ${m.steal} 빼앗기${m.power ? `, 전원에게 위력 ${m.power}` : ''}`);
      break;
    case 'defend':
      parts.push(`자신에게 보호막 ${m.shield}`);
      break;
    case 'guard':
      parts.push(`적 전원에게 보호막 ${m.shield}`);
      break;
    case 'mend':
      parts.push(`적 전원 ${m.heal} 회복`);
      break;
    case 'buff':
      parts.push(`공격 +${m.atk}(전투 내내)`);
      break;
    case 'seal':
      parts.push('다음 턴 한 성속의 링크를 끊는다');
      break;
    case 'charge':
      parts.push('힘을 모은다. 다음 행동이 강하다');
      break;
  }
  if (m.shatter) parts.push('먼저 보호막을 부순다');
  if (m.kind !== 'defend' && m.kind !== 'guard' && m.kind !== 'buff') {
    if (m.shield) parts.push(`뒤이어 자신에게 보호막 ${m.shield}`);
    if (m.atk) parts.push(`공격 +${m.atk}`);
  }
  if (m.burn) parts.push(`화상 ${m.burn[0]}·${m.burn[1]}`);
  if (m.weaken) parts.push(`약화 ${m.weaken}턴`);
  if (m.expose) parts.push(`노출 ${m.expose}턴`);
  return parts.join(' · ');
}
