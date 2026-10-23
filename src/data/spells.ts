import type { AllyTarget, Cond, Effect, Keyword, Rider, SkillTag, SpellDef, Stack, Stage } from '../core/types';

/*
 * 주문은 [전투 시작 시] → [사용 시] → 타격 Ⅰ·Ⅱ·Ⅲ… → [시전 후] → [처치 시] 순서로 일어난다.
 * 타격마다 위력·조건·적중 효과가 따로 있고, 설명은 data/describe.ts가 이 데이터에서 만든다.
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
const hpT = (x: number): Cond => ({ targetHpBelow: x });
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
const doom = (power: number, when?: Cond): Effect => ({ kind: 'doom', power, ...(when && { when }) });
const counter = (value: number, when?: Cond): Effect => ({ kind: 'allyStatus', status: 'counter', turns: 1, value, target: 'self', ...(when && { when }) });
const TAUNT: Effect = { kind: 'allyStatus', status: 'taunt', turns: 1, target: 'self' };

const list: SpellDef[] = [
  // ── 솔레아 · 태양 · 화상과 태양핵 ──
  {
    id: 'dawn_thrust', name: '여명 찌르기', cost: 1, input: 'none', output: 'sol', tag: 'strike',
    desc: '새벽빛 창끝으로 세 번 찌른다. 화상이 짙을수록 태양핵이 빨리 찬다. 체인을 연다.',
    start: [atkUp(2, 1, 'self', me('solarCore', 3))],
    effects: [
      gain('solarCore', 1, 'self', has('burn')),
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(4, [ink('burn', 1, 1), got('solarCore', 1, has('burn', 3))]),
        S(3, [ink('burn', 1, 2)], up(has('burn'), 1.3)),
        S(4, [ink('burn', 2, 1), amp(1, 0, me('solarCore', 4))], up(sum('burn', 'solarCore', 5), 1.5)),
      ] },
      gain('solarCore', 1, 'self', chain(2)),
    ],
    kill: [gain('solarCore', 2), dust(1)],
  },
  {
    id: 'solar_cleave', name: '일륜 가르기', cost: 2, input: 'comet', output: 'sol', tag: 'aoe',
    desc: '태양 원반을 휘둘러 전장을 세 번 가른다. 태양핵이 차 있으면 세 번째 원반이 열린다.',
    start: [inflict('burn', 1, 1, 'allEnemies', me('solarCore', 2))],
    effects: [
      gain('solarCore', 1, 'self', has('burn')),
      { kind: 'damage', power: 0, target: 'allEnemies', bonusVs: [{ keyword: 'burn', mult: 1.3 }], stages: [
        S(4, [ink('burn', 1, 1)]),
        S(3, [amp(1, 0, has('burn', 3)), debuff('expose', 1, has('burn', 5))]),
        S(3, [ink('burn', 2, 1), got('solarCore', 1, has('burn', 4))], only(me('solarCore', 3))),
      ] },
      amplify(1, 0, 'allEnemies', chain(3)),
    ],
    kill: [gain('solarCore', 1)],
  },
  {
    id: 'flare_rush', name: '홍염 연격', cost: 2, input: 'nebula', output: 'sol', tag: 'multi',
    desc: '불꽃을 두른 창으로 네 번 몰아친다. 태양핵 둘이 모여야 마지막 일격이 열린다.',
    start: [atkUp(2, 1, 'self')],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(4, [ink('burn', 1, 1)]),
        S(3, [ink('burn', 1, 1), got('solarCore', 1, has('erosion'))]),
        S(4, [got('solarCore', 1, has('burn', 3))], up(has('burn', 3), 1.3)),
        S(5, [ink('burn', 2, 2), pop('burn', 0.5, me('solarCore', 5))], { ...only(me('solarCore', 2)), ...up(has('burn', 4), 1.4) }),
      ] },
      atkUp(2, 1, 'allAllies', me('solarCore', 6)),
    ],
  },
  {
    id: 'noon_verdict', name: '정오의 처단', cost: 2, input: 'luna', output: 'sol', tag: 'execute',
    desc: '해가 가장 높을 때 내리는 판결. 약한 적을 끝내고 화상을 터뜨린다.',
    start: [{ kind: 'enemyStatus', status: 'expose', turns: 1, target: 'focus', when: me('solarCore', 4) }],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', execute: 2, stages: [
        S(5, [ink('burn', 2, 1, hpT(0.5))]),
        S(4, [got('solarCore', 1, has('burn', 4))]),
        S(5, [], { pierce: true, ...up(sum('burn', 'solarCore', 8), 1.6) }),
      ] },
      burst('burn', 1),
      gain('solarCore', 1, 'self', hpT(0.35)),
    ],
    kill: [dust(1), gain('solarCore', 2)],
  },
  {
    id: 'sun_oath', name: '태양의 맹세', cost: 1, input: 'void', output: 'sol', tag: 'buff',
    desc: '전투 전에 태양에 맹세해 힘을 끌어올린다. 태양핵이 넘치면 동료에게도 나눈다.',
    start: [atkUp(4, 2, 'self'), shield(4, 'self', me('solarCore', 2))],
    effects: [
      gain('solarCore', 1),
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('burn', 1, 2)]),
        S(4, [got('solarCore', 1, has('burn', 3))], up(has('burn', 2), 1.5)),
      ] },
      atkUp(2, 1, 'allAllies', me('solarCore', 4)),
      gain('wave', 1, 'allAllies', me('solarCore', 6)),
    ],
  },
  {
    id: 'sun_kindle', name: '불씨 모으기', cost: 1, input: 'none', output: 'sol', tag: 'charge',
    desc: '창끝에 불씨를 모은다. 짙은 화상 위에서는 불씨가 두 배로 튄다. 체인을 연다.',
    start: [gain('solarCore', 1)],
    effects: [
      gain('solarCore', 1),
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('burn', 2, 1)]),
        S(2, [ink('burn', 1, 1), got('solarCore', 1, has('burn', 5))]),
        S(3, [got('solarCore', 1)], only(has('burn', 3))),
      ] },
      shield(5, 'self', me('solarCore', 5)),
    ],
  },
  {
    id: 'stellar_core', name: '항성 응축', cost: 1, input: 'luna', output: 'sol', tag: 'charge',
    desc: '몸 안에 작은 항성을 응축한다. 공격하지 않는 대신 다음 일격을 준비한다.',
    start: [shield(4, 'self')],
    effects: [
      gain('solarCore', 2),
      gain('solarCore', 1, 'self', has('burn')),
      inflict('burn', 1, 2),
      amplify(1, 0, 'focus', has('burn', 4)),
      shield(6, 'self', me('solarCore', 5)),
      boost(0.2, me('solarCore', 6)),
    ],
  },
  {
    id: 'supernova_lance', name: '초신성 창', cost: 3, input: 'comet', output: 'sol', tag: 'finisher',
    desc: '모은 태양핵을 모두 태워 내리꽂는다. 마지막엔 화상까지 터진다.',
    start: [gain('solarCore', 1), inflict('burn', 2, 1, 'focus', me('solarCore', 4))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', consume: { stack: 'solarCore', per: 0.6 }, stages: [
        S(4, [ink('burn', 2, 1)]),
        S(4, [amp(1, 1, has('burn', 3))], up(has('burn', 4), 1.5)),
        S(5, [debuff('expose', 1)], { pierce: true }),
      ] },
      burst('burn', 1),
      { kind: 'enemyStatus', status: 'weaken', turns: 1, target: 'focus', when: chain(3) },
    ],
    kill: [dust(2), gain('solarCore', 2)],
  },
  {
    id: 'corona_rite', name: '코로나 의식', cost: 2, input: 'luna', output: 'sol', tag: 'resonance',
    desc: '태양관을 펼쳐 모든 적을 태운다. 태양 공명이 쌓일수록 뜨거워진다.',
    start: [{ kind: 'attune', element: 'sol', amount: 1, when: me('solarCore', 3) }],
    effects: [
      { kind: 'attune', element: 'sol', amount: 1 },
      { kind: 'damage', power: 0, target: 'allEnemies', attune: 'sol', stages: [
        S(4, [ink('burn', 1, 1)]),
        S(3, [got('solarCore', 1, has('burn', 3)), amp(1, 0, has('burn', 5))]),
        S(2, [ink('burn', 1, 2)], only(chain(3))),
      ] },
      atkUp(2, 1, 'allAllies', LINKED),
    ],
  },

  // ── 루네 · 달 · 월영과 만조 ──
  {
    id: 'moon_veil', name: '월광 베일', cost: 1, input: 'none', output: 'luna', tag: 'heal',
    desc: '달빛 베일로 다친 동료를 감싼다. 만조가 높으면 베일이 모두에게 번진다. 체인을 연다.',
    start: [shield(4, 'lowestAlly'), gain('tide', 1, 'self', hpMe(0.6))],
    effects: [
      heal(10, 'lowestAlly'),
      heal(4, 'allAllies', me('tide', 4)),
      shield(4, 'allAllies', me('tide', 7)),
      gain('tide', 1),
      inflict('moonshade', 1, 1, 'focus', me('tide', 3)),
    ],
  },
  {
    id: 'crescent_edge', name: '초승 칼날', cost: 1, input: 'sol', output: 'luna', tag: 'strike',
    desc: '초승달 칼날 셋. 월영을 새겨 이 적을 때릴 때마다 아군이 회복한다.',
    start: [inflict('moonshade', 1, 1, 'focus', me('tide', 2))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(4, [ink('moonshade', 2, 1)]),
        S(4, [ink('moonshade', 1, 1), debuff('weaken', 1, has('moonshade', 4))]),
        S(3, [got('tide', 1), mend(3, me('tide', 5), 'allAllies')], up(has('moonshade', 3), 1.5)),
      ] },
      gain('tide', 1, 'self', LINKED),
    ],
    kill: [heal(5, 'allAllies'), gain('tide', 2)],
  },
  {
    id: 'tidal_song', name: '조석의 노래', cost: 2, input: 'nebula', output: 'luna', tag: 'heal',
    desc: '밀물과 썰물의 노래. 만조가 높을수록 보호막과 공명파동이 따라온다.',
    start: [gain('tide', 1), shield(3, 'allAllies', me('tide', 3))],
    effects: [
      heal(8, 'allAllies'),
      shield(5, 'allAllies', me('tide', 5)),
      gain('wave', 1, 'allAllies', me('tide', 8)),
      inflict('moonshade', 1, 2, 'allEnemies', me('tide', 10)),
    ],
  },
  {
    id: 'fullmoon_ward', name: '만월 장막', cost: 2, input: 'comet', output: 'luna', tag: 'shield',
    desc: '보름달 장막을 두 겹으로 친다. 루네가 위태로우면 스스로도 돌본다.',
    start: [shield(4, 'allAllies')],
    effects: [
      shield(5, 'allAllies'),
      heal(6, 'lowestAlly'),
      heal(8, 'self', hpMe(0.5)),
      gain('tide', 2, 'self', hpMe(0.5)),
      shield(4, 'lowestAlly', me('tide', 6)),
    ],
  },
  {
    id: 'moon_brand', name: '월흔', cost: 1, input: 'void', output: 'luna', tag: 'debuff',
    desc: '달의 흔적을 새겨 적을 드러내고 무디게 한다.',
    start: [{ kind: 'enemyStatus', status: 'expose', turns: 1, target: 'focus' }],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [debuff('expose', 2)]),
        S(3, [ink('moonshade', 2, 2), amp(1, 0, kinds(2))]),
        S(2, [debuff('weaken', 1), ink('moonshade', 1, 1)], only(has('moonshade', 3))),
      ] },
      gain('tide', 1),
      gain('tide', 1, 'self', has('moonshade', 4)),
    ],
  },
  {
    id: 'moon_halo_mark', name: '달무리 낙인', cost: 1, input: 'sol', output: 'luna', tag: 'mark',
    desc: '달무리 낙인을 겹겹이 찍는다. 각인이 섞이면 모두 짙어진다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('rupture', 1, 1), ink('moonshade', 1, 1)]),
        S(3, [ink('rupture', 1, 1), ink('moonshade', 1, 1), got('tide', 1, has('moonshade', 2))]),
        S(3, [amp(1, 0), debuff('expose', 1, kinds(3))], only(kinds(2))),
      ] },
      heal(4, 'lowestAlly', kinds(3)),
    ],
  },
  {
    id: 'lunar_attune', name: '월광 공명', cost: 1, input: 'luna', output: 'luna', tag: 'resonance',
    desc: '달빛을 되울려 회복하고 만조를 끌어올린다. 링크로 이어 받으면 공명까지 쌓인다.',
    start: [gain('tide', 1, 'self', LINKED)],
    effects: [
      heal(8, 'lowestAlly'),
      gain('tide', 2),
      { kind: 'attune', element: 'luna', amount: 1, when: LINKED },
      heal(4, 'allAllies', me('tide', 6)),
      gain('wave', 1, 'lowestAlly', me('tide', 9)),
    ],
  },
  {
    id: 'eclipse_veil', name: '월식의 장막', cost: 1, input: 'none', output: 'void', tag: 'shield',
    desc: '달이 가려지는 순간의 장막. 공허를 내보내 체인을 연다.',
    start: [gain('tide', 1)],
    effects: [
      shield(5, 'allAllies'),
      inflict('moonshade', 1, 2, 'allEnemies', me('tide', 5)),
      shield(3, 'lowestAlly', hpMe(0.5)),
      { kind: 'attune', element: 'void', amount: 1, when: me('tide', 8) },
    ],
  },
  {
    id: 'crescent_finale', name: '그믐의 종장', cost: 2, input: 'nebula', output: 'luna', tag: 'finisher',
    desc: '차오른 만조를 한꺼번에 풀어 내리친다. 다 풀고 나면 다시 밀물이 든다.',
    start: [inflict('moonshade', 2, 1, 'focus', me('tide', 5))],
    effects: [
      heal(6, 'allAllies', me('tide', 3)),
      { kind: 'damage', power: 0, target: 'focus', consume: { stack: 'tide', per: 0.2 }, stages: [
        S(3, [ink('moonshade', 2, 1)]),
        S(3, [mend(3, has('moonshade'), 'lowestAlly')]),
        S(4, [debuff('weaken', 1)], { pierce: true, ...up(has('moonshade'), 1.4) }),
      ] },
      shield(4, 'allAllies', chain(3)),
    ],
    kill: [gain('tide', 3), heal(4, 'allAllies')],
  },

  // ── 네비아 · 성운 · 증폭과 공명파동 ──
  {
    id: 'interstellar_echo', name: '성간 공명', cost: 1, input: 'none', output: 'nebula', tag: 'utility',
    desc: '별 사이의 메아리를 모아 성진을 끌어오고, 대상에 걸린 각인을 울린다. 체인을 연다.',
    start: [dust(1)],
    effects: [
      dust(1),
      amplify(1, 0, 'focus', has('any')),
      amplify(0, 1, 'focus', kinds(2)),
      gain('wave', 1, 'allAllies', kinds(2)),
      boost(0.3, kinds(3)),
    ],
  },
  {
    id: 'primal_light', name: '원초의 빛', cost: 2, input: 'sol', output: 'nebula', tag: 'buff',
    desc: '태초의 빛으로 모두를 북돋운다. 긴 체인 끝에서는 다음 시전까지 밀어 준다.',
    start: [gain('wave', 1, 'allAllies')],
    effects: [
      atkUp(3, 2, 'allAllies'),
      boost(0.3, chain(3)),
      heal(5, 'allAllies', LINKED),
      amplify(1, 0, 'allEnemies', chain(4)),
    ],
  },
  {
    id: 'nebula_mist', name: '성운 안개', cost: 1, input: 'comet', output: 'nebula', tag: 'debuff',
    desc: '성운 안개로 적을 감싸 각인을 키운다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [debuff('weaken', 2)]),
        S(3, [amp(1, 1), ink('erosion', 1, 1, has('burn'))]),
        S(2, [debuff('expose', 1), spread('rupture', 0.5, has('rupture', 3))], only(kinds(2))),
      ] },
      gain('wave', 1, 'self', kinds(3)),
    ],
  },
  {
    id: 'amplify', name: '공명 증폭', cost: 1, input: 'luna', output: 'nebula', tag: 'utility',
    desc: '다음 시전을 증폭하고 대상의 각인을 부풀린다.',
    start: [amplify(1, 0, 'focus', has('any'))],
    effects: [
      boost(0.4),
      amplify(2, 1),
      boost(0.3, kinds(3)),
      gain('wave', 1, 'allAllies', LINKED),
    ],
  },
  {
    id: 'dust_storm', name: '별먼지 폭풍', cost: 2, input: 'void', output: 'nebula', tag: 'multi',
    desc: '네 가지 각인을 실은 별먼지가 무작위로 몰아친다.',
    effects: [
      { kind: 'damage', power: 0, target: 'random', stages: [
        S(4, [ink('burn', 1, 1)]),
        S(4, [ink('rupture', 1, 1)]),
        S(4, [ink('erosion', 1, 1)]),
        S(3, [ink('tremor', 2, 1), amp(1, 0, kinds(3))], only(chain(2))),
      ] },
      dust(1, chain(4)),
    ],
  },
  {
    id: 'star_tithe', name: '별의 십일조', cost: 0, input: 'none', output: 'nebula', tag: 'charge',
    desc: '별에 바친 십일조가 동료들의 다음 시전을 울린다. 체인을 연다.',
    start: [gain('wave', 1, 'allAllies')],
    effects: [dust(1), amplify(1, 0, 'focus', kinds(2))],
  },
  {
    id: 'dust_brand', name: '성흔 산포', cost: 1, input: 'comet', output: 'nebula', tag: 'mark',
    desc: '무작위 적들에게 성흔을 흩뿌린다. 긴 체인 끝에서는 성흔이 부풀어 오른다.',
    effects: [
      { kind: 'damage', power: 0, target: 'random', stages: [
        S(2, [ink('rupture', 1, 1)]),
        S(2, [ink('rupture', 1, 1)]),
        S(2, [ink('rupture', 1, 1), debuff('expose', 1, has('rupture', 4))]),
        S(3, [amp(1, 0)], only(chain(2))),
      ] },
      inflict('rupture', 1, 1, 'allEnemies', chain(4)),
    ],
  },
  {
    id: 'overflow', name: '성진 범람', cost: 1, input: 'void', output: 'nebula', tag: 'finisher',
    desc: '남은 성진을 모두 쏟아붓는다. 각인이 걸린 적에게는 범람이 더 거세다.',
    start: [dust(1, kinds(2))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', fromStardust: 4, stages: [
        S(3, [amp(1, 0, has('any'))]),
        S(2, [], up(has('any'), 1.5)),
      ] },
      dust(1, chain(3)),
    ],
  },
  {
    id: 'sunwell', name: '태양 우물', cost: 1, input: 'nebula', output: 'sol', tag: 'resonance',
    desc: '태양 우물을 길어 동료를 데우고 공명을 쌓는다.',
    start: [{ kind: 'attune', element: 'sol', amount: 1 }],
    effects: [
      atkUp(2, 2, 'allAllies'),
      heal(8, 'lowestAlly'),
      { kind: 'attune', element: 'sol', amount: 1 },
      inflict('burn', 1, 1, 'allEnemies', LINKED),
      gain('solarCore', 1, 'allAllies', chain(3)),
    ],
  },

  // ── 벨라 · 혜성 · 균열과 조준 ──
  {
    id: 'meteor_snipe', name: '유성 저격', cost: 1, input: 'none', output: 'comet', tag: 'strike',
    desc: '숨을 고르고 세 발. 균열을 새기고 조준을 다듬는다. 체인을 연다.',
    start: [gain('aim', 1), inflict('rupture', 1, 1, 'focus', me('aim', 3))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(5, [ink('rupture', 2, 2)]),
        S(4, [got('aim', 1, has('rupture', 3))], { pierce: true }),
        S(3, [debuff('expose', 1, me('aim', 5))], up(me('aim', 3), 1.6)),
      ] },
      gain('aim', 1, 'self', hpT(0.5)),
    ],
    kill: [gain('aim', 2), dust(1)],
  },
  {
    id: 'tail_volley', name: '꼬리별 연사', cost: 1, input: 'void', output: 'comet', tag: 'multi',
    desc: '꼬리별 탄을 연달아 쏜다. 조준이 서 있으면 한 발 더.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('rupture', 1, 1)]),
        S(3, [ink('rupture', 1, 1)]),
        S(3, [ink('rupture', 1, 1), got('aim', 1, has('rupture', 4))]),
        S(2, [ink('rupture', 1, 2)], only(me('aim', 2))),
      ] },
      amplify(0, 1, 'focus', LINKED),
    ],
  },
  {
    id: 'orbital_strike', name: '궤도 폭격', cost: 2, input: 'nebula', output: 'comet', tag: 'delayed',
    desc: '궤도에서 떨어질 폭격을 예약한다. 조준이 깊으면 더 무겁다.',
    start: [inflict('rupture', 1, 2)],
    effects: [
      inflict('rupture', 2, 3),
      doom(22),
      doom(8, me('aim', 3)),
      gain('aim', 2, 'self', chain(3)),
      { kind: 'enemyStatus', status: 'expose', turns: 1, target: 'focus', when: has('rupture', 4) },
    ],
  },
  {
    id: 'piercing_shot', name: '관통 사격', cost: 2, input: 'sol', output: 'comet', tag: 'pierce',
    desc: '방어를 꿰뚫는 탄. 균열이 남은 만큼 계속 쏜다.',
    start: [gain('aim', 1, 'self', has('rupture'))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', pierce: true, hitsFrom: { keyword: 'rupture', max: 3 }, stages: [
        S(6, [ink('rupture', 1, 1)]),
        S(5, [got('aim', 1, me('aim', 3))], up(has('rupture', 3), 1.5)),
        S(3),
      ] },
    ],
    kill: [gain('aim', 2)],
  },
  {
    id: 'scatter_meteor', name: '산탄 유성', cost: 2, input: 'luna', output: 'comet', tag: 'aoe',
    desc: '유성 파편을 흩뿌려 모든 적에게 균열을 낸다.',
    effects: [
      { kind: 'damage', power: 0, target: 'allEnemies', stages: [
        S(4, [ink('rupture', 1, 2)]),
        S(3, [ink('rupture', 1, 1), amp(1, 0, has('rupture', 4))]),
        S(2, [debuff('expose', 1)], only(me('aim', 3))),
      ] },
      gain('aim', 1, 'self', chain(3)),
    ],
  },
  {
    id: 'steady_aim', name: '조준 호흡', cost: 1, input: 'none', output: 'comet', tag: 'charge',
    desc: '숨을 멈추고 조준을 세운다. 체인을 연다.',
    start: [gain('aim', 1)],
    effects: [
      gain('aim', 2),
      inflict('rupture', 2, 2),
      amplify(1, 0, 'focus', has('rupture', 4)),
      boost(0.3, me('aim', 5)),
      shield(4, 'self', hpMe(0.5)),
    ],
  },
  {
    id: 'gatling_comet', name: '혜성 난사', cost: 2, input: 'sol', output: 'comet', tag: 'multi',
    desc: '여섯 발을 쏟아붓는다. 쌓인 균열이 마지막 탄에 터진다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(2, [ink('rupture', 1, 2)]),
        S(2, [ink('rupture', 1, 2)]),
        S(2, [ink('rupture', 1, 2)]),
        S(2, [ink('rupture', 1, 2), debuff('expose', 1, has('rupture', 6))]),
        S(3, [], up(has('rupture', 5), 1.5)),
        S(3, [pop('rupture', 0.5)], only(me('aim', 4))),
      ] },
    ],
    kill: [gain('aim', 2)],
  },
  {
    id: 'final_star', name: '종언의 별', cost: 3, input: 'void', output: 'comet', tag: 'finisher',
    desc: '조준을 모두 쏟아 마지막 별을 쏜다. 균열이 함께 터진다.',
    start: [gain('aim', 1), inflict('rupture', 2, 1, 'focus', me('aim', 4))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', pierce: true, consume: { stack: 'aim', per: 0.7 }, stages: [
        S(5, [ink('rupture', 2, 1)]),
        S(4, [amp(1, 0, has('rupture', 3))]),
        S(5, [], up(has('rupture', 4), 1.5)),
      ] },
      burst('rupture', 1),
    ],
    kill: [gain('aim', 3), dust(1)],
  },
  {
    id: 'sunfire_round', name: '태양탄', cost: 1, input: 'comet', output: 'sol', tag: 'resonance',
    desc: '태양 공명을 실은 탄. 링크로 이으면 불이 붙는다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', attune: 'sol', stages: [
        S(4, [ink('burn', 1, 1)]),
        S(4, [got('aim', 1, has('rupture'))], up(has('burn'), 1.3)),
        S(3, [ink('burn', 1, 2)], only(LINKED)),
      ] },
      { kind: 'attune', element: 'sol', amount: 1, when: chain(3) },
    ],
  },

  // ── 녹스 · 공허 · 잠식과 허기 ──
  {
    id: 'void_touch', name: '공허의 손길', cost: 1, input: 'luna', output: 'void', tag: 'dot',
    desc: '공허가 스며드는 세 번의 손길. 화상 위에 닿으면 불길째 삼킨다.',
    start: [gain('hunger', 1, 'self', has('burn'))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('erosion', 1, 1)]),
        S(3, [ink('erosion', 1, 1), got('hunger', 1, has('erosion', 3))]),
        S(2, [ink('erosion', 1, 1), debuff('weaken', 1, me('hunger', 6))], up(me('hunger', 3), 1.5)),
      ] },
      { kind: 'convert', from: 'burn', to: 'erosion', mult: 1, target: 'focus', when: me('hunger', 4) },
    ],
    kill: [gain('hunger', 2)],
  },
  {
    id: 'event_horizon', name: '사건의 지평선', cost: 2, input: 'comet', output: 'void', tag: 'debuff',
    desc: '빛도 빠져나오지 못하는 경계로 끌어들인다.',
    start: [{ kind: 'enemyStatus', status: 'weaken', turns: 1, target: 'focus', when: me('hunger', 3) }],
    effects: [
      { kind: 'enemyStatus', status: 'expose', turns: 2, target: 'focus' },
      { kind: 'damage', power: 0, target: 'focus', bonusVs: [{ keyword: 'erosion', mult: 1.4 }], stages: [
        S(5, [ink('erosion', 1, 1)]),
        S(5, [got('hunger', 1, has('erosion', 3))]),
        S(3, [ink('erosion', 2, 2)], only(me('hunger', 5))),
      ] },
      amplify(0, 1, 'focus', has('erosion', 4)),
    ],
  },
  {
    id: 'siphon', name: '흡수', cost: 1, input: 'none', output: 'void', tag: 'drain',
    desc: '베고, 빨아들인다. 위태로울수록 깊게 빤다. 체인을 연다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', lifesteal: 0.6, stages: [
        S(4, [ink('erosion', 1, 1)]),
        S(4, [got('hunger', 1, has('erosion'))]),
        S(3, [mend(4)], only(hpMe(0.5))),
      ] },
      heal(4, 'lowestAlly', me('hunger', 6)),
    ],
    kill: [gain('hunger', 2), heal(6, 'self')],
  },
  {
    id: 'retrograde', name: '역행', cost: 2, input: 'nebula', output: 'void', tag: 'strike',
    desc: '시간을 거슬러 강화와 보호막을 벗기고 벤다. 각인이 섞일수록 깊게 들어간다.',
    effects: [
      { kind: 'purge', target: 'focus' },
      { kind: 'damage', power: 0, target: 'focus', bonusVs: [{ keyword: 'any', mult: 1.3 }], stages: [
        S(5, [amp(0, 1, has('any'))]),
        S(4, [got('hunger', 2, kinds(2))]),
        S(4, [debuff('expose', 1, kinds(3))], up(kinds(3), 1.6)),
      ] },
    ],
    kill: [gain('hunger', 2)],
  },
  {
    id: 'collapse', name: '붕괴', cost: 2, input: 'sol', output: 'void', tag: 'execute',
    desc: '약해진 적을 무너뜨린다. 쓰러지기 직전이면 잠식이 터진다.',
    start: [inflict('erosion', 1, 1, 'focus', hpT(0.5))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', vsDebuffed: 2, stages: [
        S(4, [ink('erosion', 1, 1)]),
        S(4, [got('hunger', 1, hpT(0.5))]),
        S(3, [pop('erosion', 1)], only(hpT(0.5))),
      ] },
    ],
    kill: [gain('hunger', 3), dust(1)],
  },
  {
    id: 'rot_seed', name: '부식의 씨앗', cost: 1, input: 'nebula', output: 'void', tag: 'dot',
    desc: '화상을 썩혀 잠식으로 바꾸고, 허기가 차면 다른 적에게 옮긴다.',
    start: [gain('hunger', 1, 'self', has('burn', 3))],
    effects: [
      { kind: 'convert', from: 'burn', to: 'erosion', mult: 1.5, target: 'focus' },
      inflict('erosion', 2, 2),
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(2, [got('hunger', 1, has('erosion', 5))]),
        S(2, [ink('erosion', 1, 1)]),
        S(2, [spread('erosion', 0.5)], only(me('hunger', 4))),
      ] },
    ],
  },
  {
    id: 'abyss_feast', name: '심연의 만찬', cost: 2, input: 'comet', output: 'void', tag: 'finisher',
    desc: '적의 잠식과 균열을 통째로 삼키고, 허기를 모두 쏟는다.',
    start: [gain('hunger', 1, 'self', kinds(2))],
    effects: [
      heal(6, 'allAllies', me('hunger', 5)),
      { kind: 'damage', power: 0, target: 'focus', devour: { keywords: ['erosion', 'rupture'], per: 0.5 }, consume: { stack: 'hunger', per: 0.1 }, stages: [
        S(3, [ink('erosion', 1, 1)]),
        S(2, [mend(3)]),
        S(3, [], { pierce: true }),
      ] },
    ],
    kill: [gain('hunger', 4), heal(4, 'allAllies')],
  },
  {
    id: 'doom_echo', name: '종말의 메아리', cost: 1, input: 'void', output: 'void', tag: 'delayed',
    desc: '걸린 폭격을 앞당겨 터뜨리고 새 종말을 건다.',
    start: [inflict('erosion', 1, 1)],
    effects: [
      { kind: 'detonate' },
      burst('erosion', 1, has('erosion')),
      doom(12),
      doom(6, me('hunger', 6)),
      gain('hunger', 1, 'self', chain(2)),
    ],
  },
  {
    id: 'void_resonance', name: '공허 공명', cost: 2, input: 'luna', output: 'void', tag: 'resonance',
    desc: '공허 공명을 쌓아 갈수록 깊이 벤다.',
    effects: [
      { kind: 'attune', element: 'void', amount: 1 },
      { kind: 'damage', power: 0, target: 'focus', attune: 'void', stages: [
        S(4, [ink('erosion', 1, 1)]),
        S(3, [ink('erosion', 1, 1), got('hunger', 1, has('erosion', 3))]),
        S(3, [], up(has('erosion', 3), 1.4)),
      ] },
      { kind: 'attune', element: 'void', amount: 1, when: LINKED },
    ],
  },

  // ── 아스트라 · 별빛 · 진동과 불굴 ──
  {
    id: 'galaxy_ward', name: '은하 수호', cost: 1, input: 'wild', output: 'echo', tag: 'shield',
    desc: '은하를 방패 삼아 모두를 지킨다. 불굴이 쌓일수록 방패가 겹친다. 직전 성속을 잇는다.',
    start: [shield(4, 'self'), gain('fortitude', 1, 'self', hpMe(0.5))],
    effects: [
      shield(6, 'allAllies'),
      shield(3, 'allAllies', me('fortitude', 4)),
      shield(4, 'lowestAlly', me('fortitude', 6)),
      counter(6, me('fortitude', 8)),
    ],
  },
  {
    id: 'constellation_echo', name: '성좌 반향', cost: 1, input: 'wild', output: 'echo', tag: 'strike',
    desc: '방패로 세 번 울려 진동을 쌓는다. 직전 성속을 잇는다.',
    start: [shield(3, 'self', me('fortitude', 3))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(3, [ink('tremor', 2, 1)]),
        S(3, [ink('tremor', 1, 1), got('fortitude', 1, SHIELDED)]),
        S(3, [got('fortitude', 1), pop('tremor', 1, has('tremor', 8))], up(has('tremor', 4), 1.5)),
      ] },
    ],
  },
  {
    id: 'taunt_star', name: '도발의 별', cost: 1, input: 'wild', output: 'echo', tag: 'shield',
    desc: '별을 치켜들어 적의 시선을 끈다. 불굴이 깊으면 맞받아친다.',
    start: [TAUNT],
    effects: [shield(12, 'self'), counter(6, me('fortitude', 3)), gain('fortitude', 1, 'self', hpMe(0.5)), inflict('tremor', 2, 1, 'allEnemies', me('fortitude', 6))],
  },
  {
    id: 'counter_stance', name: '반격 태세', cost: 1, input: 'wild', output: 'echo', tag: 'buff',
    desc: '맞받아칠 자세를 잡는다. 위태로울수록 굳건해진다.',
    start: [shield(3, 'self')],
    effects: [counter(10), shield(6, 'self'), gain('fortitude', 2, 'self', hpMe(0.5)), atkUp(2, 1, 'self', me('fortitude', 4))],
  },
  {
    id: 'star_judgement', name: '별의 심판', cost: 3, input: 'wild', output: 'echo', tag: 'strike',
    desc: '체인이 길수록 무거운 심판. 쌓인 진동을 터뜨려 기절시킨다.',
    start: [inflict('tremor', 2, 1, 'focus', me('fortitude', 3))],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', scaleWithChain: true, stages: [
        S(2, [ink('tremor', 2, 1)]),
        S(2, [ink('tremor', 2, 1), got('fortitude', 1)]),
        S(3, [], up(chain(4), 1.5)),
      ] },
      burst('tremor', 1.5),
      { kind: 'enemyStatus', status: 'expose', turns: 1, target: 'focus', when: chain(4) },
    ],
    kill: [dust(2), gain('fortitude', 2)],
  },
  {
    id: 'bulwark_bash', name: '방패 강타', cost: 1, input: 'wild', output: 'echo', tag: 'strike',
    desc: '보호막째 들이받는다. 불굴을 모두 실어 친다.',
    start: [shield(4, 'self')],
    effects: [
      { kind: 'damage', power: 0, target: 'focus', fromShield: 0.4, consume: { stack: 'fortitude', per: 0.12 }, stages: [
        S(3, [ink('tremor', 2, 1)]),
        S(2, [debuff('weaken', 1, has('tremor', 4))]),
        S(2, [ink('tremor', 1, 1)], up(SHIELDED, 1.5)),
      ] },
      gain('fortitude', 1),
    ],
  },
  {
    id: 'star_aegis', name: '별의 성채', cost: 2, input: 'wild', output: 'echo', tag: 'shield',
    desc: '별의 성채를 세워 모든 공격을 받아 낸다.',
    start: [TAUNT, shield(4, 'self')],
    effects: [shield(12, 'self'), counter(12), shield(5, 'allAllies', me('fortitude', 5)), gain('fortitude', 2, 'self', hpMe(0.5))],
  },
  {
    id: 'guiding_star', name: '이정표의 별', cost: 1, input: 'wild', output: 'echo', tag: 'charge',
    desc: '길잡이 별이 모두의 다음 시전을 이끈다.',
    start: [gain('wave', 1, 'allAllies')],
    effects: [boost(0.25), dust(1, chain(3)), shield(3, 'allAllies', me('fortitude', 4))],
  },
  {
    id: 'constellation_mark', name: '성도 낙인', cost: 1, input: 'wild', output: 'echo', tag: 'mark',
    desc: '성도를 새겨 진동과 균열을 겹친다.',
    effects: [
      { kind: 'damage', power: 0, target: 'focus', stages: [
        S(2, [ink('tremor', 2, 1)]),
        S(2, [ink('rupture', 1, 2)]),
        S(2, [ink('tremor', 1, 1), ink('rupture', 1, 1)], only(kinds(2))),
      ] },
      gain('fortitude', 1, 'self', kinds(3)),
    ],
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
