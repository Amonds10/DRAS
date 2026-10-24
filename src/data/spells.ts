import type { AllyTarget, Cond, Effect, Keyword, Rider, SkillTag, SpellDef, Stack, Stage } from '../core/types';

/*
 * 술사마다 스킬 4개. 매 라운드 이 중 2장을 손패로 뽑는다.
 * 순서: 라운드 시작 시(start) → 효과 → 타격들 → 시전 후 → 처치 시(kill). 설명은 문장으로 손으로 쓴다.
 * 각인 "화상 2·3" = 위력 2, 횟수 3. 같은 각인을 또 걸면 위력과 횟수가 더해진다.
 * 시너지: 솔레아의 화상 → 녹스가 잠식으로 바꿔 먹는다 / 벨라의 균열 → 모두의 타격에 고정 피해 /
 *        루네의 월영 → 때린 아군 회복 → 만조 / 아스트라의 진동 → 쌓아서 기절 / 네비아는 모든 각인을 키운다.
 */

// ── 조건 ──
const has = (k: Keyword | 'any', min?: number): Cond => (min ? { targetHas: k, targetMin: min } : { targetHas: k });
const me = (stack: Stack, min: number): Cond => ({ casterHas: stack, min });
const sum = (keyword: Keyword, stack: Stack, min: number): Cond => ({ sum: { keyword, stack, min } });
const chain = (n: number): Cond => ({ chain: n });
const kinds = (n: number): Cond => ({ kinds: n });
const LINKED: Cond = { linked: true };
const hpMe = (x: number): Cond => ({ casterHpBelow: x });
const SHIELDED: Cond = { shielded: true };

// ── 적중 효과 ──
const ink = (k: Keyword, value: number, turns: number, when?: Cond): Rider => ({ inflict: k, value, turns, ...(when && { when }) });
const got = (stack: Stack, amount: number, when?: Cond, to?: AllyTarget): Rider => ({ gain: stack, amount, ...(to && { to }), ...(when && { when }) });
const amp = (v: number, t: number, when?: Cond): Rider => ({ amplify: v, turns: t, ...(when && { when }) });
const pop = (k: Keyword, mult: number, when?: Cond): Rider => ({ burst: k, mult, ...(when && { when }) });
const mend = (heal: number, when?: Cond, to?: AllyTarget): Rider => ({ heal, ...(to && { to }), ...(when && { when }) });
const debuff = (d: 'weaken' | 'expose', turns: number, when?: Cond): Rider => ({ debuff: d, turns, ...(when && { when }) });
const spread = (k: Keyword, ratio: number, when?: Cond): Rider => ({ spread: k, ratio, ...(when && { when }) });

// ── 타격 ──
const S = (power: number, onHit: Rider[] = [], x: Omit<Stage, 'power' | 'onHit'> = {}): Stage => ({ power, ...(onHit.length && { onHit }), ...x });
const up = (when: Cond, mult: number) => ({ up: { when, mult } });
const only = (when: Cond) => ({ only: when });

// ── 효과 ──
const gain = (stack: Stack, amount: number, target: AllyTarget = 'self', when?: Cond): Effect => ({ kind: 'gain', stack, amount, target, ...(when && { when }) });
const inflict = (keyword: Keyword, value: number, turns: number, target: 'focus' | 'allEnemies' = 'focus', when?: Cond): Effect => ({ kind: 'inflict', keyword, value, turns, target, ...(when && { when }) });
const heal = (power: number, target: AllyTarget, when?: Cond): Effect => ({ kind: 'heal', power, target, ...(when && { when }) });
const shield = (power: number, target: AllyTarget, when?: Cond): Effect => ({ kind: 'shield', power, target, ...(when && { when }) });
const atkUp = (value: number, turns: number, target: AllyTarget, when?: Cond): Effect => ({ kind: 'allyStatus', status: 'atkUp', value, turns, target, ...(when && { when }) });
const dust = (amount: number, when?: Cond): Effect => ({ kind: 'stardust', amount, ...(when && { when }) });
const boost = (amount: number, when?: Cond): Effect => ({ kind: 'boost', amount, ...(when && { when }) });
const burst = (keyword: Keyword, mult: number, when?: Cond): Effect => ({ kind: 'burst', keyword, mult, target: 'focus', ...(when && { when }) });
const amplify = (value: number, turns: number, target: 'focus' | 'allEnemies' = 'focus', when?: Cond): Effect => ({ kind: 'amplify', value, turns, target, ...(when && { when }) });
const counter = (value: number, when?: Cond): Effect => ({ kind: 'allyStatus', status: 'counter', turns: 1, value, target: 'self', ...(when && { when }) });
const TAUNT: Effect = { kind: 'allyStatus', status: 'taunt', turns: 1, target: 'self' };

const list: SpellDef[] = [
  // ── 솔레아 · 태양 ──
  {
    id: 'dawn_thrust', name: '여명 찌르기', cost: 1, input: 'none', output: 'sol', tag: 'strike',
    desc: '새벽빛 창으로 세 번 찔러 위력 12의 피해를 주고 화상 4·4를 남긴다. 대상의 화상이 3 이상이면 태양핵을 1 더 얻고, 마지막 찌르기는 대상 화상과 태양핵의 합이 5 이상일 때 50% 강해진다. 적을 쓰러뜨리면 태양핵 2와 성진 1을 얻는다. 체인을 연다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(4, [ink('burn', 1, 1), got('solarCore', 1, has('burn', 3))]),
      S(4, [ink('burn', 1, 2)]),
      S(4, [ink('burn', 2, 1)], up(sum('burn', 'solarCore', 5), 1.5)),
    ] }],
    kill: [gain('solarCore', 2), dust(1)],
  },
  {
    id: 'stellar_core', name: '항성 응축', cost: 1, input: 'void', output: 'sol', tag: 'charge',
    desc: '몸 안에 작은 항성을 응축해 태양핵 2를 얻고 대상에게 화상 1·2를 건다. 대상이 이미 불타고 있었다면 태양핵을 1 더 얻는다. 태양핵이 5 이상이면 자신에게 보호막 6을 두르고, 다음 시전의 배율을 0.2 높인다.',
    effects: [
      gain('solarCore', 1, 'self', has('burn')),
      gain('solarCore', 2),
      inflict('burn', 1, 2),
      shield(6, 'self', me('solarCore', 5)),
      boost(0.2, me('solarCore', 5)),
    ],
  },
  {
    id: 'flare_rush', name: '홍염 연격', cost: 2, input: 'nebula', output: 'sol', tag: 'multi',
    desc: '불꽃 두른 창으로 세 번 몰아쳐 위력 12의 피해를 주고 화상을 쌓는다. 태양핵이 2 이상이면 네 번째로 내리찍어 위력 5의 피해와 화상 2·2를 더하고, 대상 화상이 4 이상이면 이 일격이 40% 강해진다. 성운의 증폭을 받아 이으면 피해가 크게 오른다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(4, [ink('burn', 1, 1)]),
      S(4, [ink('burn', 1, 1)]),
      S(4, [got('solarCore', 1, has('burn', 3))]),
      S(5, [ink('burn', 2, 2)], { ...only(me('solarCore', 2)), ...up(has('burn', 4), 1.4) }),
    ] }],
  },
  {
    id: 'supernova_lance', name: '초신성 창', cost: 3, input: 'comet', output: 'sol', tag: 'finisher',
    desc: '모은 태양핵을 모두 태워 내리꽂는다. 태양핵 1개당 피해가 60% 증가해 세 번에 걸쳐 위력 13의 피해를 주고, 마지막 일격은 방어를 무시한다. 이어서 대상의 화상을 한꺼번에 터뜨린다(위력×횟수). 적을 쓰러뜨리면 성진 2를 돌려받는다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', consume: { stack: 'solarCore', per: 0.6 }, stages: [S(4, [ink('burn', 2, 1)]), S(4), S(5, [], { pierce: true })] },
      burst('burn', 1),
    ],
    kill: [dust(2)],
  },

  // ── 루네 · 달 ──
  {
    id: 'crescent_edge', name: '초승 칼날', cost: 1, input: 'sol', output: 'luna', tag: 'strike',
    desc: '초승달 칼날 세 번으로 위력 11의 피해를 주고 월영 3·2를 새긴다. 월영이 걸린 적을 때린 아군은 그 위력만큼 회복한다. 마지막 칼날은 만조를 1 채우고, 대상 월영이 3 이상이면 50% 강해진다. 적을 쓰러뜨리면 아군 전원이 5 회복한다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(4, [ink('moonshade', 2, 1)]),
      S(4, [ink('moonshade', 1, 1)]),
      S(3, [got('tide', 1)], up(has('moonshade', 3), 1.5)),
    ] }],
    kill: [heal(5, 'allAllies')],
  },
  {
    id: 'moon_veil', name: '월광 베일', cost: 1, input: 'none', output: 'luna', tag: 'heal',
    desc: '달빛 베일로 가장 다친 아군을 12 회복한다. 만조가 4 이상이면 아군 전원도 4씩 회복하고, 7 이상이면 아군 전원에게 보호막 4를 씌운다. 만조를 1 얻는다. 체인을 연다.',
    effects: [heal(12, 'lowestAlly'), heal(4, 'allAllies', me('tide', 4)), shield(4, 'allAllies', me('tide', 7)), gain('tide', 1)],
  },
  {
    id: 'moon_brand', name: '월흔', cost: 1, input: 'void', output: 'luna', tag: 'debuff',
    desc: '달의 흔적을 두 번 새겨 위력 6의 피해를 주고, 대상을 2턴 노출(받는 피해 +30%)시킨 뒤 월영 2·2를 건다. 월영이 3 이상 쌓이면 1턴 약화까지 건다. 공허의 잠식을 받아 이으면 적이 크게 무너진다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(3, [debuff('expose', 2)]),
      S(3, [ink('moonshade', 2, 2), debuff('weaken', 1, has('moonshade', 3))]),
    ] }],
  },
  {
    id: 'crescent_finale', name: '그믐의 종장', cost: 2, input: 'nebula', output: 'luna', tag: 'finisher',
    desc: '만조가 3 이상이면 먼저 아군 전원을 6 회복한다. 차오른 만조를 모두 풀어 1당 피해를 20% 높이고, 세 번에 걸쳐 위력 10의 피해를 준다. 마지막 일격은 방어를 무시하며 대상에게 월영이 있으면 40% 더 강해진다. 적을 쓰러뜨리면 만조를 3 되찾는다.',
    effects: [
      heal(6, 'allAllies', me('tide', 3)),
      { kind: 'damage', power: 0, target: 'focus', consume: { stack: 'tide', per: 0.2 }, stages: [S(3, [ink('moonshade', 2, 1)]), S(3), S(4, [], { pierce: true, ...up(has('moonshade'), 1.4) })] },
    ],
    kill: [gain('tide', 3)],
  },

  // ── 네비아 · 성운 ──
  {
    id: 'nebula_mist', name: '성운 안개', cost: 1, input: 'comet', output: 'nebula', tag: 'debuff',
    desc: '성운 안개로 세 번 감싸 위력 8의 피해를 주고 대상을 2턴 약화시킨다. 대상에게 걸린 모든 각인의 위력과 횟수를 1씩 늘리고, 각인이 두 종류 이상이면 1턴 노출까지 건다. 혜성의 균열을 받아 이으면 균열이 더 깊어진다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(3, [debuff('weaken', 2)]),
      S(3, [amp(1, 1)]),
      S(2, [debuff('expose', 1, kinds(2))]),
    ] }],
  },
  {
    id: 'star_tithe', name: '별의 십일조', cost: 0, input: 'none', output: 'nebula', tag: 'charge',
    desc: '라운드가 시작될 때 먼저 아군 전원에게 공명파동 1을 준다(다음 시전의 피해·회복·보호막 +20%). 시전하면 성진 1을 얻고, 대상에게 각인이 두 종류 이상 있으면 모두 위력 +1. 성진을 쓰지 않고 체인을 연다.',
    start: [gain('wave', 1, 'allAllies')],
    effects: [dust(1), amplify(1, 0, 'focus', kinds(2))],
  },
  {
    id: 'amplify', name: '공명 증폭', cost: 1, input: 'luna', output: 'nebula', tag: 'utility',
    desc: '다음 시전의 배율을 0.4 높이고, 대상의 모든 각인 위력 +2·횟수 +1. 각인이 세 종류 이상이면 다음 시전 배율이 0.3 더 오른다. 링크로 이어 받았다면 아군 전원에게 공명파동 1을 준다.',
    effects: [boost(0.4), amplify(2, 1), boost(0.3, kinds(3)), gain('wave', 1, 'allAllies', LINKED)],
  },
  {
    id: 'primal_light', name: '원초의 빛', cost: 2, input: 'sol', output: 'nebula', tag: 'buff',
    desc: '라운드가 시작될 때 먼저 아군 전원에게 공명파동 1을 준다. 시전하면 아군 전원의 공격이 2턴 동안 3 오르고, 체인 3 이상에서 쓰면 다음 시전의 배율이 0.3 오른다. 링크로 이어 받았다면 아군 전원을 5 회복한다.',
    start: [gain('wave', 1, 'allAllies')],
    effects: [atkUp(3, 2, 'allAllies'), boost(0.3, chain(3)), heal(5, 'allAllies', LINKED)],
  },

  // ── 벨라 · 혜성 ──
  {
    id: 'meteor_snipe', name: '유성 저격', cost: 1, input: 'none', output: 'comet', tag: 'strike',
    desc: '숨을 고르고 세 발을 쏘아 위력 12의 피해를 준다. 첫 발은 균열 2·2를 새기고, 두 번째 발은 방어를 무시하며 대상 균열이 3 이상이면 조준을 1 얻는다. 조준이 3 이상이면 마지막 발이 60% 강해진다. 적을 쓰러뜨리면 조준 2와 성진 1을 얻는다. 체인을 연다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(5, [ink('rupture', 2, 2)]),
      S(4, [got('aim', 1, has('rupture', 3))], { pierce: true }),
      S(3, [], up(me('aim', 3), 1.6)),
    ] }],
    kill: [gain('aim', 2), dust(1)],
  },
  {
    id: 'scatter_meteor', name: '산탄 유성', cost: 2, input: 'luna', output: 'comet', tag: 'aoe',
    desc: '유성 파편을 흩뿌려 모든 적에게 두 번, 위력 7의 피해를 주고 균열 2·3을 새긴다. 조준이 3 이상이면 세 번째 파편이 위력 2의 피해와 1턴 노출을 더한다. 체인 3 이상에서 쓰면 조준을 1 얻는다.',
    effects: [
      { kind: 'damage', power: 0, target: 'allEnemies', stages: [
        S(4, [ink('rupture', 1, 2)]),
        S(3, [ink('rupture', 1, 1)]),
        S(2, [debuff('expose', 1)], only(me('aim', 3))),
      ] },
      gain('aim', 1, 'self', chain(3)),
    ],
  },
  {
    id: 'gatling_comet', name: '혜성 난사', cost: 2, input: 'sol', output: 'comet', tag: 'multi',
    desc: '여섯 발을 쏟아부어 위력 14의 피해를 준다. 처음 네 발은 균열 1·2를 쌓아 뒤 탄일수록 아프고, 다섯째 발은 대상 균열이 5 이상이면 50% 강해진다. 조준이 4 이상이면 마지막 발이 대상의 균열을 절반 위력으로 터뜨린다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(2, [ink('rupture', 1, 2)]),
      S(2, [ink('rupture', 1, 2)]),
      S(2, [ink('rupture', 1, 2)]),
      S(2, [ink('rupture', 1, 2)]),
      S(3, [], up(has('rupture', 5), 1.5)),
      S(3, [pop('rupture', 0.5, me('aim', 4))]),
    ] }],
    kill: [gain('aim', 2)],
  },
  {
    id: 'final_star', name: '종언의 별', cost: 3, input: 'void', output: 'comet', tag: 'finisher',
    desc: '조준을 모두 쏟아 마지막 별을 쏜다. 조준 1당 피해가 70% 증가하고, 방어를 무시하는 세 발로 위력 14의 피해를 준다. 대상 균열이 4 이상이면 마지막 발이 50% 강해지고, 이어서 대상의 균열을 한꺼번에 터뜨린다(위력×횟수).',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', pierce: true, consume: { stack: 'aim', per: 0.7 }, stages: [S(5, [ink('rupture', 2, 1)]), S(4), S(5, [], up(has('rupture', 4), 1.5))] },
      burst('rupture', 1),
    ],
    kill: [gain('aim', 3)],
  },

  // ── 녹스 · 공허 ──
  {
    id: 'siphon', name: '흡수', cost: 1, input: 'none', output: 'void', tag: 'drain',
    desc: '두 번 베어 위력 9의 피해를 주고 잠식 1·1을 스며들게 한다. 준 피해의 60%만큼 회복하며, 녹스의 체력이 절반 이하면 세 번째로 베어 4를 더 회복한다. 적을 쓰러뜨리면 허기 2를 얻는다. 체인을 연다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', lifesteal: 0.6, stages: [
      S(5, [ink('erosion', 1, 1)]),
      S(4, [got('hunger', 1, has('erosion'))]),
      S(3, [mend(4)], only(hpMe(0.5))),
    ] }],
    kill: [gain('hunger', 2)],
  },
  {
    id: 'void_touch', name: '공허의 손길', cost: 1, input: 'luna', output: 'void', tag: 'dot',
    desc: '세 번 스쳐 위력 8의 피해를 주고 잠식 3·3을 건다. 잠식은 적이 움직일 때마다 위력만큼 피해를 준다. 허기가 3 이상이면 마지막 손길이 50% 강해지고, 허기가 4 이상이면 대상의 화상을 잠식으로 바꾼다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('erosion', 1, 1)]),
        S(3, [ink('erosion', 1, 1), got('hunger', 1, has('erosion', 3))]),
        S(2, [ink('erosion', 1, 1)], up(me('hunger', 3), 1.5)),
      ] },
      { kind: 'convert', from: 'burn', to: 'erosion', mult: 1, target: 'focus', when: me('hunger', 4) },
    ],
  },
  {
    id: 'rot_seed', name: '부식의 씨앗', cost: 1, input: 'nebula', output: 'void', tag: 'dot',
    desc: '대상의 화상을 1.5배 위력의 잠식으로 바꾸고 잠식 2·2를 더한다. 두 번 베어 위력 4의 피해를 주며, 허기가 4 이상이면 대상의 잠식을 다른 모든 적에게 절반만큼 퍼뜨린다. 솔레아의 화상을 녹스가 이어받는 기술이다.',
    effects: [
      { kind: 'convert', from: 'burn', to: 'erosion', mult: 1.5, target: 'focus' },
      inflict('erosion', 2, 2),
      { kind: 'damage', power: 0, target: 'focus', stages: [S(2, [got('hunger', 1, has('erosion', 5))]), S(2, [spread('erosion', 0.5, me('hunger', 4))])] },
    ],
  },
  {
    id: 'abyss_feast', name: '심연의 만찬', cost: 2, input: 'comet', output: 'void', tag: 'finisher',
    desc: '허기가 5 이상이면 먼저 아군 전원을 6 회복한다. 대상의 잠식과 균열을 통째로 삼켜 그 (위력×횟수)의 절반을 위력에 더하고, 허기 1당 피해를 10% 높여 세 번 공격한다. 마지막 일격은 방어를 무시한다. 적을 쓰러뜨리면 허기 4를 얻는다.',
    effects: [
      heal(6, 'allAllies', me('hunger', 5)),
      { kind: 'damage', power: 0, target: 'focus', devour: { keywords: ['erosion', 'rupture'], per: 0.5 }, consume: { stack: 'hunger', per: 0.1 }, stages: [S(3), S(2), S(3, [], { pierce: true })] },
    ],
    kill: [gain('hunger', 4)],
  },

  // ── 아스트라 · 별빛 ──
  {
    id: 'bulwark_bash', name: '방패 강타', cost: 1, input: 'wild', output: 'echo', tag: 'strike',
    desc: '보호막째 세 번 들이받아 위력 7에 자신 보호막의 40%를 타격마다 더한 피해를 준다. 불굴을 모두 실어 1당 피해 +12%, 진동 3·2를 쌓고, 보호막이 있으면 마지막 타격이 50% 강해진다. 어떤 성속이든 받아 그대로 넘긴다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', fromShield: 0.4, consume: { stack: 'fortitude', per: 0.12 }, stages: [
        S(3, [ink('tremor', 2, 1)]),
        S(2),
        S(2, [ink('tremor', 1, 1)], up(SHIELDED, 1.5)),
      ] },
      gain('fortitude', 1),
    ],
  },
  {
    id: 'constellation_echo', name: '성좌 반향', cost: 1, input: 'wild', output: 'echo', tag: 'strike',
    desc: '방패로 세 번 울려 위력 9의 피해를 주고 진동 3·2를 쌓는다. 마지막 울림은 불굴을 1 얻고, 대상 진동이 4 이상이면 50% 강해지며, 8 이상이면 진동을 터뜨려 기절시킨다. 어떤 성속이든 받아 그대로 넘긴다.',
    effects: [{ kind: 'damage', power: 0, target: 'focus', stages: [
      S(3, [ink('tremor', 2, 1)]),
      S(3, [ink('tremor', 1, 1)]),
      S(3, [got('fortitude', 1), pop('tremor', 1, has('tremor', 8))], up(has('tremor', 4), 1.5)),
    ] }],
  },
  {
    id: 'star_aegis', name: '별의 성채', cost: 2, input: 'wild', output: 'echo', tag: 'shield',
    desc: '라운드가 시작될 때 먼저 적의 공격을 끌어온다(도발). 시전하면 자신에게 보호막 16, 반격 12 태세를 갖추고, 불굴이 5 이상이면 아군 전원에게 보호막 5를 나눈다. 반격 피해는 불굴 1당 2 늘어난다.',
    start: [TAUNT],
    effects: [shield(16, 'self'), counter(12), shield(5, 'allAllies', me('fortitude', 5))],
  },
  {
    id: 'star_judgement', name: '별의 심판', cost: 3, input: 'wild', output: 'echo', tag: 'strike',
    desc: '체인이 길수록 무거운 심판. 세 번 내리쳐 위력 7에 체인 수를 곱한 피해를 주고 진동 4·2를 쌓은 뒤, 대상의 진동을 터뜨린다(위력×1.5, 8 이상이면 기절). 체인 4에서 쓰면 마지막 일격이 50% 더 강해진다. 적을 쓰러뜨리면 성진 2를 얻는다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', scaleWithChain: true, stages: [S(2, [ink('tremor', 2, 1)]), S(2, [ink('tremor', 2, 1)]), S(3, [], up(chain(4), 1.5))] },
      burst('tremor', 1.5),
    ],
    kill: [dust(2)],
  },
];

export const SPELLS: Record<string, SpellDef> = Object.fromEntries(list.map((s) => [s.id, s]));

export function spellById(id: string): SpellDef {
  const s = SPELLS[id];
  if (!s) throw new Error(`Unknown spell: ${id}`);
  return s;
}

/** 카드 아래 작은 영문 표식(리버스 1999식 Didone 대문자) */
export const TAG_EN: Record<SkillTag, string> = {
  strike: 'STRIKE',
  multi: 'FLURRY',
  aoe: 'NOVA',
  pierce: 'PIERCE',
  execute: 'VERDICT',
  drain: 'DRAIN',
  dot: 'BURN',
  delayed: 'OMEN',
  debuff: 'HEX',
  heal: 'MEND',
  shield: 'WARD',
  buff: 'RITE',
  utility: 'ARCANA',
  charge: 'BUILD',
  finisher: 'CODA',
  mark: 'SIGIL',
  resonance: 'CHORD',
};

export const TAG_NAMES: Record<SkillTag, string> = {
  strike: '단일',
  multi: '연타',
  aoe: '광역',
  pierce: '관통',
  execute: '처단',
  drain: '흡수',
  dot: '지속',
  delayed: '지연',
  debuff: '약화',
  heal: '치유',
  shield: '보호',
  buff: '강화',
  utility: '보조',
  charge: '축적',
  finisher: '극딜',
  mark: '각인',
  resonance: '공명',
};
