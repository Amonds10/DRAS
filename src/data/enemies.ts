import type { EnemyDef } from '../core/types';

const list: EnemyDef[] = [
  { id: 'stray_shard', name: '떠도는 별부스러기', glyph: '✧', maxHp: 46, atk: 10, def: 2, pattern: [{ kind: 'attack', power: 10 }, { kind: 'attack', power: 10 }, { kind: 'defend', shield: 8 }] },
  { id: 'shadow_comet', name: '그림자 혜성', glyph: '☄', maxHp: 56, atk: 11, def: 3, pattern: [{ kind: 'attack', power: 12 }, { kind: 'attackAll', power: 6 }] },
  { id: 'dark_nebula', name: '어둠 성운체', glyph: '❂', maxHp: 72, atk: 10, def: 5, pattern: [{ kind: 'buff', atk: 3 }, { kind: 'attack', power: 11 }, { kind: 'attackAll', power: 7 }] },
  { id: 'eclipse_eye', name: '성식의 눈', glyph: '◐', maxHp: 62, atk: 10, def: 4, pattern: [{ kind: 'seal' }, { kind: 'attack', power: 12 }, { kind: 'attack', power: 10 }] },
  { id: 'fallen_keeper', name: '타락한 별지기', glyph: '♆', maxHp: 180, atk: 13, def: 6, pattern: [{ kind: 'attack', power: 14 }, { kind: 'defend', shield: 14 }, { kind: 'charge' }, { kind: 'attackAll', power: 15 }] },
  {
    id: 'star_devourer',
    name: '별을 삼키는 자',
    glyph: '✹',
    maxHp: 440,
    atk: 14,
    def: 6,
    traits: ['starShield'],
    pattern: [
      { kind: 'seal' },
      { kind: 'attackAll', power: 9 },
      { kind: 'attack', power: 17 },
      { kind: 'buff', atk: 3 },
      { kind: 'charge' },
      { kind: 'attackAll', power: 18 },
    ],
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));

export function enemyById(id: string): EnemyDef {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy: ${id}`);
  return e;
}

export const TRAIT_DESC: Record<string, string> = {
  starShield: '별 삼킴: 체인 3 미만의 마법 피해를 절반으로 줄인다.',
};
