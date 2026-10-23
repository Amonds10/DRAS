import type { AbilityDef, AllyTarget, Cond, Keyword, Rider, Slot, Stack, Stage } from '../core/types';

/*
 * 술사 6명 × (일반 공격 · 전투 스킬 · 필살기).
 * 위력은 공격력의 %다. 설명은 스타레일식 문장으로 손으로 쓰고, tests/core/abilities.test.ts가
 * 설명 속 핵심 수치(총 위력 %)가 데이터와 맞는지 확인한다.
 */

const has = (k: Keyword | 'any', min?: number): Cond => (min ? { targetHas: k, targetMin: min } : { targetHas: k });
const me = (stack: Stack, min: number): Cond => ({ casterHas: stack, min });
const ink = (k: Keyword, value: number, turns: number, when?: Cond): Rider => ({ inflict: k, value, turns, ...(when && { when }) });
const got = (stack: Stack, amount: number, when?: Cond, to?: AllyTarget): Rider => ({ gain: stack, amount, ...(to && { to }), ...(when && { when }) });
const S = (power: number, onHit: Rider[] = [], x: Omit<Stage, 'power' | 'onHit'> = {}): Stage => ({ power, ...(onHit.length && { onHit }), ...x });

const list: AbilityDef[] = [
  // ── 솔레아 · 태양 ──
  {
    id: 'solea_basic', name: '새벽 찌르기', slot: 'basic', tag: 'strike', aim: 'enemy', toughness: 10,
    desc: '창으로 두 번 찔러 지정한 적에게 공격력 100%의 피해를 주고 화상 1·1을 남긴다. 대상의 화상 위력이 3 이상이면 두 번째 찌르기에서 태양핵을 1 얻는다.',
    effects: [{ kind: 'damage', target: 'focus', stages: [S(50, [ink('burn', 1, 1)]), S(50, [got('solarCore', 1, has('burn', 3))])] }],
  },
  {
    id: 'solea_skill', name: '홍염 연격', slot: 'skill', tag: 'multi', aim: 'enemy', toughness: 20,
    desc: '불꽃 두른 창으로 세 번 몰아쳐 지정한 적에게 공격력 140%의 피해를 주고, 앞의 두 번은 화상 1·1을 부여한다. 태양핵이 2 이상이면 한 번 더 내리찍어 공격력 70%의 피해와 화상 2·2를 더하며, 대상의 화상 위력이 4 이상이면 이 일격의 피해가 40% 증가한다. 행동 후 태양핵을 1 얻는다.',
    effects: [
      { kind: 'damage', target: 'focus', stages: [
        S(45, [ink('burn', 1, 1)]),
        S(45, [ink('burn', 1, 1)]),
        S(50, [got('solarCore', 1, has('burn', 3))]),
        S(70, [ink('burn', 2, 2)], { only: me('solarCore', 2), up: { when: has('burn', 4), mult: 1.4 } }),
      ] },
      { kind: 'gain', stack: 'solarCore', amount: 1, target: 'self' },
    ],
  },
  {
    id: 'solea_ult', name: '초신성 창', slot: 'ultimate', tag: 'finisher', aim: 'enemy', toughness: 30,
    desc: '태양핵을 1 얻은 뒤 모두 태워, 지정한 적에게 세 번에 걸쳐 공격력 360%의 피해를 준다. 태운 태양핵 1개당 피해가 50% 증가하고 마지막 일격은 방어를 무시한다. 이어서 대상의 화상을 한꺼번에 터뜨린다(위력×횟수). 이 기술로 적을 쓰러뜨리면 태양핵을 2 얻는다.',
    effects: [
      { kind: 'gain', stack: 'solarCore', amount: 1, target: 'self' },
      { kind: 'damage', target: 'focus', consume: { stack: 'solarCore', per: 0.5 }, stages: [S(120, [ink('burn', 2, 1)]), S(100), S(140, [], { pierce: true })] },
      { kind: 'burst', keyword: 'burn', mult: 1, target: 'focus' },
    ],
    kill: [{ kind: 'gain', stack: 'solarCore', amount: 2, target: 'self' }],
  },

  // ── 루네 · 달 ──
  {
    id: 'lune_basic', name: '초승 칼날', slot: 'basic', tag: 'strike', aim: 'enemy', toughness: 10,
    desc: '초승달 칼날로 두 번 베어 지정한 적에게 공격력 100%의 피해를 주고 월영 2·1을 새긴다. 월영이 걸린 적을 때린 아군은 그 위력만큼 체력을 회복한다. 두 번째 칼날이 맞으면 만조를 1 얻는다.',
    effects: [{ kind: 'damage', target: 'focus', stages: [S(50, [ink('moonshade', 2, 1)]), S(50, [got('tide', 1)])] }],
  },
  {
    id: 'lune_skill', name: '월광 베일', slot: 'skill', tag: 'heal', aim: 'ally', toughness: 0,
    desc: '지정한 아군의 체력을 공격력 150%만큼 회복한다. 만조가 4 이상이면 아군 전원도 공격력 40%만큼 회복하고, 7 이상이면 지정한 아군에게 공격력 60%의 보호막을 더 씌운다. 행동 후 만조를 1 얻는다.',
    effects: [
      { kind: 'heal', power: 150, target: 'chosen' },
      { kind: 'heal', power: 40, target: 'allAllies', when: me('tide', 4) },
      { kind: 'shield', power: 60, target: 'chosen', when: me('tide', 7) },
      { kind: 'gain', stack: 'tide', amount: 1, target: 'self' },
    ],
  },
  {
    id: 'lune_ult', name: '그믐의 종장', slot: 'ultimate', tag: 'finisher', aim: 'enemy', toughness: 30,
    desc: '아군 전원의 체력을 공격력 100%만큼 회복한 뒤, 차오른 만조를 모두 풀어 지정한 적에게 세 번에 걸쳐 공격력 260%의 피해를 준다. 만조 1당 피해가 15% 증가하고, 마지막 일격은 방어를 무시하며 대상에게 월영이 있으면 40% 더 강해진다. 적을 쓰러뜨리면 만조를 3 얻는다.',
    effects: [
      { kind: 'heal', power: 100, target: 'allAllies' },
      { kind: 'damage', target: 'focus', consume: { stack: 'tide', per: 0.15 }, stages: [S(80, [ink('moonshade', 2, 1)]), S(80), S(100, [], { pierce: true, up: { when: has('moonshade'), mult: 1.4 } })] },
    ],
    kill: [{ kind: 'gain', stack: 'tide', amount: 3, target: 'self' }],
  },

  // ── 네비아 · 성운 ──
  {
    id: 'nebia_basic', name: '성흔 산포', slot: 'basic', tag: 'mark', aim: 'none', toughness: 10,
    desc: '별가루를 세 번 흩뿌려 무작위 적에게 각각 공격력 35%의 피해를 주고, 맞은 적에게 균열 1·1을 남긴다. 네비아가 거는 각인은 위력이 1 높다.',
    effects: [{ kind: 'damage', target: 'random', stages: [S(35, [ink('rupture', 1, 1)]), S(35, [ink('rupture', 1, 1)]), S(35, [ink('rupture', 1, 1)])] }],
  },
  {
    id: 'nebia_skill', name: '공명 증폭', slot: 'skill', tag: 'buff', aim: 'ally', toughness: 0,
    desc: '지정한 아군에게 공명파동 2와 공격력 +3(2턴)을 주고 에너지를 10 채워 준다. 공명파동은 다음 행동의 피해·회복·보호막을 1당 20% 높인다. 동시에 지금 노리는 적의 모든 각인 위력과 횟수를 1씩 늘린다.',
    effects: [
      { kind: 'gain', stack: 'wave', amount: 2, target: 'chosen' },
      { kind: 'allyStatus', status: 'atkUp', turns: 2, value: 3, target: 'chosen' },
      { kind: 'energy', amount: 10, target: 'chosen' },
      { kind: 'amplify', value: 1, turns: 1, target: 'focus' },
    ],
  },
  {
    id: 'nebia_ult', name: '원초의 빛', slot: 'ultimate', tag: 'buff', aim: 'none', toughness: 0,
    desc: '아군 전원의 공격력을 4 높이고(2턴) 공명파동을 1씩 준 뒤, 모두의 행동 순서를 25% 앞당긴다. 모든 적의 각인 위력이 1 오르고, 성진을 1 얻는다.',
    effects: [
      { kind: 'allyStatus', status: 'atkUp', turns: 2, value: 4, target: 'allAllies' },
      { kind: 'gain', stack: 'wave', amount: 1, target: 'allAllies' },
      { kind: 'advance', amount: 0.25, target: 'allAllies' },
      { kind: 'amplify', value: 1, turns: 0, target: 'allEnemies' },
      { kind: 'sp', amount: 1 },
    ],
  },

  // ── 벨라 · 혜성 ──
  {
    id: 'vela_basic', name: '유성 저격', slot: 'basic', tag: 'strike', aim: 'enemy', toughness: 10,
    desc: '두 발을 쏘아 지정한 적에게 공격력 100%의 피해를 준다. 첫 발은 균열 2·2를 새기고, 두 번째 발은 방어를 무시한다. 균열이 걸린 적을 맞힐 때마다 조준이 1 쌓인다.',
    effects: [{ kind: 'damage', target: 'focus', stages: [S(60, [ink('rupture', 2, 2)]), S(40, [], { pierce: true })] }],
  },
  {
    id: 'vela_skill', name: '혜성 난사', slot: 'skill', tag: 'multi', aim: 'enemy', toughness: 20,
    desc: '여섯 발을 쏟아부어 지정한 적에게 공격력 200%의 피해를 준다. 처음 네 발은 균열 1·2를 쌓고, 다섯째 발은 대상의 균열 위력이 5 이상이면 50% 강해진다. 조준이 4 이상이면 마지막 발이 대상의 균열을 절반 위력으로 터뜨린다.',
    effects: [{ kind: 'damage', target: 'focus', stages: [
      S(30, [ink('rupture', 1, 2)]),
      S(30, [ink('rupture', 1, 2)]),
      S(30, [ink('rupture', 1, 2)]),
      S(30, [ink('rupture', 1, 2)]),
      S(40, [], { up: { when: has('rupture', 5), mult: 1.5 } }),
      S(40, [{ burst: 'rupture', mult: 0.5, when: me('aim', 4) }]),
    ] }],
  },
  {
    id: 'vela_ult', name: '종언의 별', slot: 'ultimate', tag: 'finisher', aim: 'enemy', toughness: 30,
    desc: '조준을 모두 쏟아 지정한 적에게 방어를 무시하는 세 발로 공격력 400%의 피해를 준다. 조준 1당 피해가 60% 증가하고, 대상의 균열 위력이 4 이상이면 마지막 발이 50% 강해진다. 이어서 대상의 균열을 한꺼번에 터뜨린다(위력×횟수). 적을 쓰러뜨리면 조준을 3 얻는다.',
    effects: [
      { kind: 'damage', target: 'focus', pierce: true, consume: { stack: 'aim', per: 0.6 }, stages: [S(150, [ink('rupture', 2, 1)]), S(100), S(150, [], { up: { when: has('rupture', 4), mult: 1.5 } })] },
      { kind: 'burst', keyword: 'rupture', mult: 1, target: 'focus' },
    ],
    kill: [{ kind: 'gain', stack: 'aim', amount: 3, target: 'self' }],
  },

  // ── 녹스 · 공허 ──
  {
    id: 'nox_basic', name: '공허의 손길', slot: 'basic', tag: 'dot', aim: 'enemy', toughness: 10,
    desc: '두 번 스쳐 지정한 적에게 공격력 100%의 피해를 주고 잠식 2·3을 스며들게 한다. 잠식은 적이 움직일 때마다 위력만큼 피해를 준다. 대상의 잠식 위력이 3 이상이면 허기를 1 얻는다.',
    effects: [{ kind: 'damage', target: 'focus', stages: [S(50, [ink('erosion', 1, 2)]), S(50, [ink('erosion', 1, 1), got('hunger', 1, has('erosion', 3))])] }],
  },
  {
    id: 'nox_skill', name: '부식의 씨앗', slot: 'skill', tag: 'dot', aim: 'enemy', toughness: 20,
    desc: '지정한 적의 화상을 1.5배 위력의 잠식으로 바꾼 뒤, 대상과 양옆의 적을 두 번 베어 공격력 120%의 피해를 주고(양옆은 절반) 잠식 2·2를 남긴다. 허기가 4 이상이면 두 번째 베기가 맞은 적의 잠식을 다른 모든 적에게 절반만큼 퍼뜨린다.',
    effects: [
      { kind: 'convert', from: 'burn', to: 'erosion', mult: 1.5, target: 'focus' },
      { kind: 'damage', target: 'blast', stages: [S(60, [ink('erosion', 2, 2)]), S(60, [{ spread: 'erosion', ratio: 0.5, when: me('hunger', 4) }])] },
    ],
  },
  {
    id: 'nox_ult', name: '심연의 만찬', slot: 'ultimate', tag: 'finisher', aim: 'enemy', toughness: 30,
    desc: '허기가 5 이상이면 먼저 아군 전원을 공격력 60%만큼 회복한다. 지정한 적의 잠식과 균열을 통째로 삼켜 그 (위력×횟수)의 절반을 첫 타격에 더하고, 세 번에 걸쳐 공격력 360%의 피해를 준다. 허기 1당 피해가 8% 증가하고 마지막 일격은 방어를 무시한다. 적을 쓰러뜨리면 허기를 4 얻고 아군 전원을 공격력 40%만큼 회복한다.',
    effects: [
      { kind: 'heal', power: 60, target: 'allAllies', when: me('hunger', 5) },
      { kind: 'damage', target: 'focus', devour: { keywords: ['erosion', 'rupture'], per: 0.5 }, consume: { stack: 'hunger', per: 0.08 }, stages: [S(120), S(100), S(140, [], { pierce: true })] },
    ],
    kill: [
      { kind: 'gain', stack: 'hunger', amount: 4, target: 'self' },
      { kind: 'heal', power: 40, target: 'allAllies' },
    ],
  },

  // ── 아스트라 · 별빛 ──
  {
    id: 'astra_basic', name: '방패 강타', slot: 'basic', tag: 'strike', aim: 'enemy', toughness: 10,
    desc: '방패로 두 번 들이받아 지정한 적에게 공격력 100%에 자신 보호막의 30%를 더한 피해를 주고 진동 3·2를 쌓는다. 보호막이 있으면 두 번째 타격이 50% 강해진다. 행동 후 불굴을 1 얻는다.',
    effects: [
      { kind: 'damage', target: 'focus', fromShield: 0.3, stages: [S(50, [ink('tremor', 2, 1)]), S(50, [ink('tremor', 1, 1)], { up: { when: { shielded: true }, mult: 1.5 } })] },
      { kind: 'gain', stack: 'fortitude', amount: 1, target: 'self' },
    ],
  },
  {
    id: 'astra_skill', name: '별의 성채', slot: 'skill', tag: 'shield', aim: 'none', toughness: 0,
    desc: '자신에게 공격력 200%, 아군 전원에게 공격력 60%의 보호막을 씌우고 적의 공격을 끌어온다(도발). 다음 차례가 올 때까지 공격받으면 공격력 100%로 반격하며, 불굴 1당 반격 피해가 2 늘어난다.',
    effects: [
      { kind: 'allyStatus', status: 'taunt', turns: 1, target: 'self' },
      { kind: 'shield', power: 200, target: 'self' },
      { kind: 'shield', power: 60, target: 'allAllies' },
      { kind: 'allyStatus', status: 'counter', turns: 1, value: 100, target: 'self' },
    ],
  },
  {
    id: 'astra_ult', name: '별의 심판', slot: 'ultimate', tag: 'aoe', aim: 'none', toughness: 30,
    desc: '별빛을 내리쳐 모든 적에게 두 번, 공격력 160%의 피해를 주고 진동 5·2를 쌓은 뒤 모든 적의 진동을 터뜨린다(위력×1.5, 위력 8 이상이면 기절). 이어서 아군 전원에게 공격력 100%의 보호막을 씌운다.',
    effects: [
      { kind: 'damage', target: 'allEnemies', stages: [S(80, [ink('tremor', 3, 1)]), S(80, [ink('tremor', 2, 1)])] },
      { kind: 'burst', keyword: 'tremor', mult: 1.5, target: 'allEnemies' },
      { kind: 'shield', power: 100, target: 'allAllies' },
    ],
  },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(list.map((a) => [a.id, a]));

export function abilityById(id: string): AbilityDef {
  const a = ABILITIES[id];
  if (!a) throw new Error(`Unknown ability: ${id}`);
  return a;
}

export const SLOT_NAMES: Record<Slot, string> = { basic: '일반 공격', skill: '전투 스킬', ultimate: '필살기' };
export const SLOT_EN: Record<Slot, string> = { basic: 'BASIC ATK', skill: 'SKILL', ultimate: 'ULTIMATE' };

/** 공격 능력의 총 위력(공격력 %, 조건부 타격 제외) */
export function totalPower(a: AbilityDef, includeGated = false): number {
  return a.effects.reduce((sum, e) => (e.kind === 'damage' ? sum + e.stages.filter((s) => includeGated || !s.only).reduce((t, s) => t + s.power, 0) : sum), 0);
}
