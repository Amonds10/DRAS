import type { SkillTag, SpellDef } from '../core/types';

/*
 * 주문 설명 표기
 * - 각인 "화상 2·3" = 위력 2, 횟수 3. 같은 각인을 또 걸면 위력과 횟수가 더해진다.
 * - [적중] 타격마다, [조건] 조건이 맞을 때만, [시전 후] 피해를 다 준 다음.
 * 시너지: 솔레아의 화상 → 녹스가 잠식으로 바꿔 먹는다 / 벨라의 균열 → 모두의 타격에 고정 피해 /
 *        루네의 월영 → 때린 아군 회복 → 만조 / 아스트라의 진동 → 쌓아서 기절 / 네비아는 모든 각인을 키운다.
 */
const list: SpellDef[] = [
  // ── 솔레아 · 태양 · 화상과 태양핵 ──
  { id: 'dawn_thrust', name: '여명 찌르기', cost: 1, input: 'none', output: 'sol', tag: 'strike', desc: '집중 대상을 찌른다. 체인을 연다.\n[적중] 화상 2·2', effects: [{ kind: 'damage', power: 10, target: 'focus', onHit: [{ inflict: 'burn', value: 2, turns: 2 }] }] },
  { id: 'solar_cleave', name: '일륜 가르기', cost: 2, input: 'comet', output: 'sol', tag: 'aoe', desc: '모든 적을 벤다.\n[화상 대상] 피해 +40%\n[적중] 화상 1·2', effects: [{ kind: 'damage', power: 8, target: 'allEnemies', bonusVs: [{ keyword: 'burn', mult: 1.4 }], onHit: [{ inflict: 'burn', value: 1, turns: 2 }] }] },
  { id: 'flare_rush', name: '홍염 연격', cost: 2, input: 'nebula', output: 'sol', tag: 'multi', desc: '집중 대상을 3번 연속 공격.\n[적중] 화상 1·1\n화상 걸린 적을 때릴수록 태양핵이 빨리 찬다.', effects: [{ kind: 'damage', power: 5, target: 'focus', hits: 3, onHit: [{ inflict: 'burn', value: 1, turns: 1 }] }] },
  { id: 'noon_verdict', name: '정오의 처단', cost: 2, input: 'luna', output: 'sol', tag: 'execute', desc: 'HP 35% 이하인 대상에게 2배 피해.\n[시전 후] 대상의 화상을 터뜨린다(위력×횟수).', effects: [{ kind: 'damage', power: 12, target: 'focus', execute: 2 }, { kind: 'burst', keyword: 'burn', mult: 1, target: 'focus' }] },
  { id: 'sun_oath', name: '태양의 맹세', cost: 1, input: 'void', output: 'sol', tag: 'buff', desc: '자신 공격 +4(2턴), 태양핵 +1 후 공격.\n[화상 대상] 피해 +30%', effects: [{ kind: 'allyStatus', status: 'atkUp', turns: 2, value: 4, target: 'self' }, { kind: 'gain', stack: 'solarCore', amount: 1, target: 'self' }, { kind: 'damage', power: 6, target: 'focus', bonusVs: [{ keyword: 'burn', mult: 1.3 }] }] },
  { id: 'sun_kindle', name: '불씨 모으기', cost: 1, input: 'none', output: 'sol', tag: 'charge', desc: '태양핵 +2, 가볍게 찌른다. 체인을 연다.\n[적중] 화상 2·1', effects: [{ kind: 'gain', stack: 'solarCore', amount: 2, target: 'self' }, { kind: 'damage', power: 5, target: 'focus', onHit: [{ inflict: 'burn', value: 2, turns: 1 }] }] },
  { id: 'stellar_core', name: '항성 응축', cost: 1, input: 'luna', output: 'sol', tag: 'charge', desc: '태양핵 +2, 자신 보호막 6.\n[대상이 화상] 태양핵 +1 더', effects: [{ kind: 'gain', stack: 'solarCore', amount: 2, target: 'self' }, { kind: 'shield', power: 6, target: 'self' }, { kind: 'gain', stack: 'solarCore', amount: 1, target: 'self', when: { targetHas: 'burn' } }] },
  { id: 'supernova_lance', name: '초신성 창', cost: 3, input: 'comet', output: 'sol', tag: 'finisher', desc: '태양핵을 모두 태워 일격. 태양핵 1당 피해 +60%.\n[시전 후] 대상의 화상을 터뜨린다.', effects: [{ kind: 'damage', power: 12, target: 'focus', consume: { stack: 'solarCore', per: 0.6 } }, { kind: 'burst', keyword: 'burn', mult: 1, target: 'focus' }] },
  { id: 'corona_rite', name: '코로나 의식', cost: 2, input: 'luna', output: 'sol', tag: 'resonance', desc: '모든 적에게 피해. 태양 공명 1당 +12%. 태양 공명 +1.\n[적중] 화상 1·1', effects: [{ kind: 'attune', element: 'sol', amount: 1 }, { kind: 'damage', power: 9, target: 'allEnemies', attune: 'sol', onHit: [{ inflict: 'burn', value: 1, turns: 1 }] }] },

  // ── 루네 · 달 · 월영과 만조 ──
  { id: 'moon_veil', name: '월광 베일', cost: 1, input: 'none', output: 'luna', tag: 'heal', desc: '가장 다친 아군 회복 14. 체인을 연다.', effects: [{ kind: 'heal', power: 14, target: 'lowestAlly' }] },
  { id: 'crescent_edge', name: '초승 칼날', cost: 1, input: 'sol', output: 'luna', tag: 'strike', desc: '집중 대상에게 피해.\n[적중] 월영 3·2 — 이 적을 때린 아군이 3 회복(2번)', effects: [{ kind: 'damage', power: 11, target: 'focus', onHit: [{ inflict: 'moonshade', value: 3, turns: 2 }] }] },
  { id: 'tidal_song', name: '조석의 노래', cost: 2, input: 'nebula', output: 'luna', tag: 'heal', desc: '아군 전원 회복 9.\n[만조 5 이상] 아군 전원 보호막 5', effects: [{ kind: 'heal', power: 9, target: 'allAllies' }, { kind: 'shield', power: 5, target: 'allAllies', when: { casterHas: 'tide', min: 5 } }] },
  { id: 'fullmoon_ward', name: '만월 장막', cost: 2, input: 'comet', output: 'luna', tag: 'shield', desc: '아군 전원 보호막 8, 가장 다친 아군 회복 6.', effects: [{ kind: 'shield', power: 8, target: 'allAllies' }, { kind: 'heal', power: 6, target: 'lowestAlly' }] },
  { id: 'moon_brand', name: '월흔', cost: 1, input: 'void', output: 'luna', tag: 'debuff', desc: '피해 5, 노출(2턴)·약화(1턴).\n월영 2·3', effects: [{ kind: 'damage', power: 5, target: 'focus' }, { kind: 'enemyStatus', status: 'expose', turns: 2, target: 'focus' }, { kind: 'enemyStatus', status: 'weaken', turns: 1, target: 'focus' }, { kind: 'inflict', keyword: 'moonshade', value: 2, turns: 3, target: 'focus' }] },
  { id: 'moon_halo_mark', name: '달무리 낙인', cost: 1, input: 'sol', output: 'luna', tag: 'mark', desc: '집중 대상을 2번 벤다.\n[적중] 균열 1·1, 월영 1·1', effects: [{ kind: 'damage', power: 4, target: 'focus', hits: 2, onHit: [{ inflict: 'rupture', value: 1, turns: 1 }, { inflict: 'moonshade', value: 1, turns: 1 }] }] },
  { id: 'lunar_attune', name: '월광 공명', cost: 1, input: 'luna', output: 'luna', tag: 'resonance', desc: '가장 다친 아군 회복 8, 만조 +2.', effects: [{ kind: 'heal', power: 8, target: 'lowestAlly' }, { kind: 'gain', stack: 'tide', amount: 2, target: 'self' }] },
  { id: 'eclipse_veil', name: '월식의 장막', cost: 1, input: 'none', output: 'void', tag: 'shield', desc: '아군 전원 보호막 5, 만조 +1. 공허를 내보내 체인을 연다.', effects: [{ kind: 'shield', power: 5, target: 'allAllies' }, { kind: 'gain', stack: 'tide', amount: 1, target: 'self' }] },
  { id: 'crescent_finale', name: '그믐의 종장', cost: 2, input: 'nebula', output: 'luna', tag: 'finisher', desc: '[만조 3 이상] 먼저 아군 전원 회복 6\n만조를 모두 풀어 일격. 만조 1당 피해 +20%.', effects: [{ kind: 'heal', power: 6, target: 'allAllies', when: { casterHas: 'tide', min: 3 } }, { kind: 'damage', power: 9, target: 'focus', consume: { stack: 'tide', per: 0.2 } }] },

  // ── 네비아 · 성운 · 증폭과 공명파동 ──
  { id: 'interstellar_echo', name: '성간 공명', cost: 1, input: 'none', output: 'nebula', tag: 'utility', desc: '성진 2. 체인을 연다.\n[대상에게 각인] 모든 각인 위력 +1', effects: [{ kind: 'stardust', amount: 2 }, { kind: 'amplify', value: 1, turns: 0, target: 'focus', when: { targetHas: 'any' } }] },
  { id: 'primal_light', name: '원초의 빛', cost: 2, input: 'sol', output: 'nebula', tag: 'buff', desc: '아군 전원 공격 +3(2턴), 공명파동 1.', effects: [{ kind: 'allyStatus', status: 'atkUp', turns: 2, value: 3, target: 'allAllies' }, { kind: 'gain', stack: 'wave', amount: 1, target: 'allAllies' }] },
  { id: 'nebula_mist', name: '성운 안개', cost: 1, input: 'comet', output: 'nebula', tag: 'debuff', desc: '피해 6, 약화(2턴).\n대상의 모든 각인 위력 +1·횟수 +1', effects: [{ kind: 'damage', power: 6, target: 'focus' }, { kind: 'enemyStatus', status: 'weaken', turns: 2, target: 'focus' }, { kind: 'amplify', value: 1, turns: 1, target: 'focus' }] },
  { id: 'amplify', name: '공명 증폭', cost: 1, input: 'luna', output: 'nebula', tag: 'utility', desc: '다음 마법의 배율 +0.5.\n대상의 모든 각인 위력 +2·횟수 +1', effects: [{ kind: 'boost', amount: 0.5 }, { kind: 'amplify', value: 2, turns: 1, target: 'focus' }] },
  { id: 'dust_storm', name: '별먼지 폭풍', cost: 2, input: 'void', output: 'nebula', tag: 'multi', desc: '무작위 적에게 4번 공격.\n[적중] 화상 1·1 (네비아의 각인은 위력 +1)', effects: [{ kind: 'damage', power: 5, target: 'random', hits: 4, onHit: [{ inflict: 'burn', value: 1, turns: 1 }] }] },
  { id: 'star_tithe', name: '별의 십일조', cost: 0, input: 'none', output: 'nebula', tag: 'charge', desc: '성진 1, 아군 전원 공명파동 1. 체인을 연다.\n공명파동: 다음 시전 피해·회복·보호막 +20%(중첩당)', effects: [{ kind: 'stardust', amount: 1 }, { kind: 'gain', stack: 'wave', amount: 1, target: 'allAllies' }] },
  { id: 'dust_brand', name: '성흔 산포', cost: 1, input: 'comet', output: 'nebula', tag: 'mark', desc: '무작위 적 4번 공격.\n[적중] 균열 1·1', effects: [{ kind: 'damage', power: 3, target: 'random', hits: 4, onHit: [{ inflict: 'rupture', value: 1, turns: 1 }] }] },
  { id: 'overflow', name: '성진 범람', cost: 1, input: 'void', output: 'nebula', tag: 'finisher', desc: '남은 성진을 모두 쏟는다. 성진 1당 위력 +4.', effects: [{ kind: 'damage', power: 5, target: 'focus', fromStardust: 4 }] },
  { id: 'sunwell', name: '태양 우물', cost: 1, input: 'nebula', output: 'sol', tag: 'resonance', desc: '아군 전원 공격 +2(2턴), 가장 다친 아군 회복 8. 태양 공명 +2.', effects: [{ kind: 'allyStatus', status: 'atkUp', turns: 2, value: 2, target: 'allAllies' }, { kind: 'heal', power: 8, target: 'lowestAlly' }, { kind: 'attune', element: 'sol', amount: 2 }] },

  // ── 벨라 · 혜성 · 균열과 조준 ──
  { id: 'meteor_snipe', name: '유성 저격', cost: 1, input: 'none', output: 'comet', tag: 'strike', desc: '집중 대상 저격. 체인을 연다.\n[적중] 균열 2·2 — 아군이 때릴 때마다 2 추가 피해(2번)', effects: [{ kind: 'damage', power: 12, target: 'focus', onHit: [{ inflict: 'rupture', value: 2, turns: 2 }] }] },
  { id: 'tail_volley', name: '꼬리별 연사', cost: 1, input: 'void', output: 'comet', tag: 'multi', desc: '집중 대상을 2번 쏜다.\n[적중] 균열 1·1', effects: [{ kind: 'damage', power: 6, target: 'focus', hits: 2, onHit: [{ inflict: 'rupture', value: 1, turns: 1 }] }] },
  { id: 'orbital_strike', name: '궤도 폭격', cost: 2, input: 'nebula', output: 'comet', tag: 'delayed', desc: '라운드가 끝날 때 집중 대상에 큰 피해.\n지금 균열 2·3', effects: [{ kind: 'doom', power: 24 }, { kind: 'inflict', keyword: 'rupture', value: 2, turns: 3, target: 'focus' }] },
  { id: 'piercing_shot', name: '관통 사격', cost: 2, input: 'sol', output: 'comet', tag: 'pierce', desc: '방어를 무시하는 일격.\n[추가] 대상 균열 횟수만큼(최대 4) 4씩 더 쏜다', effects: [{ kind: 'damage', power: 12, target: 'focus', pierce: true }, { kind: 'damage', power: 4, target: 'focus', pierce: true, hits: 0, hitsFrom: { keyword: 'rupture', max: 4 } }] },
  { id: 'scatter_meteor', name: '산탄 유성', cost: 2, input: 'luna', output: 'comet', tag: 'aoe', desc: '모든 적에게 피해.\n[적중] 균열 1·2', effects: [{ kind: 'damage', power: 8, target: 'allEnemies', onHit: [{ inflict: 'rupture', value: 1, turns: 2 }] }] },
  { id: 'steady_aim', name: '조준 호흡', cost: 1, input: 'none', output: 'comet', tag: 'charge', desc: '조준 +2, 집중 대상에 균열 2·2. 체인을 연다.', effects: [{ kind: 'gain', stack: 'aim', amount: 2, target: 'self' }, { kind: 'inflict', keyword: 'rupture', value: 2, turns: 2, target: 'focus' }] },
  { id: 'gatling_comet', name: '혜성 난사', cost: 2, input: 'sol', output: 'comet', tag: 'multi', desc: '집중 대상 5연사.\n[적중] 균열 1·2 — 쏠수록 균열이 쌓여 뒤 탄이 세진다', effects: [{ kind: 'damage', power: 3, target: 'focus', hits: 5, onHit: [{ inflict: 'rupture', value: 1, turns: 2 }] }] },
  { id: 'final_star', name: '종언의 별', cost: 3, input: 'void', output: 'comet', tag: 'finisher', desc: '방어 무시 일격. 조준 1당 피해 +70%.\n[시전 후] 대상의 균열을 터뜨린다(위력×횟수).', effects: [{ kind: 'damage', power: 14, target: 'focus', pierce: true, consume: { stack: 'aim', per: 0.7 } }, { kind: 'burst', keyword: 'rupture', mult: 1, target: 'focus' }] },
  { id: 'sunfire_round', name: '태양탄', cost: 1, input: 'comet', output: 'sol', tag: 'resonance', desc: '집중 대상 피해. 태양 공명 1당 +12%.\n[화상 대상] 피해 +30%', effects: [{ kind: 'damage', power: 11, target: 'focus', attune: 'sol', bonusVs: [{ keyword: 'burn', mult: 1.3 }] }] },

  // ── 녹스 · 공허 · 잠식과 허기 ──
  { id: 'void_touch', name: '공허의 손길', cost: 1, input: 'luna', output: 'void', tag: 'dot', desc: '피해를 주고 잠식 3·2 — 적이 움직일 때마다 3 피해(2번)', effects: [{ kind: 'damage', power: 7, target: 'focus' }, { kind: 'inflict', keyword: 'erosion', value: 3, turns: 2, target: 'focus' }] },
  { id: 'event_horizon', name: '사건의 지평선', cost: 2, input: 'comet', output: 'void', tag: 'debuff', desc: '피해, 노출(2턴).\n[잠식 대상] 피해 +40%', effects: [{ kind: 'damage', power: 10, target: 'focus', bonusVs: [{ keyword: 'erosion', mult: 1.4 }] }, { kind: 'enemyStatus', status: 'expose', turns: 2, target: 'focus' }] },
  { id: 'siphon', name: '흡수', cost: 1, input: 'none', output: 'void', tag: 'drain', desc: '준 피해의 60%만큼 회복. 체인을 연다.\n[적중] 잠식 2·1', effects: [{ kind: 'damage', power: 10, target: 'focus', lifesteal: 0.6, onHit: [{ inflict: 'erosion', value: 2, turns: 1 }] }] },
  { id: 'retrograde', name: '역행', cost: 2, input: 'nebula', output: 'void', tag: 'strike', desc: '강화와 보호막을 걷어내고 공격.\n[각인이 걸린 대상] 피해 +30%', effects: [{ kind: 'purge', target: 'focus' }, { kind: 'damage', power: 12, target: 'focus', bonusVs: [{ keyword: 'any', mult: 1.3 }] }] },
  { id: 'collapse', name: '붕괴', cost: 2, input: 'sol', output: 'void', tag: 'execute', desc: '약화 효과가 걸린 대상에게 2배 피해.', effects: [{ kind: 'damage', power: 10, target: 'focus', vsDebuffed: 2 }] },
  { id: 'rot_seed', name: '부식의 씨앗', cost: 1, input: 'nebula', output: 'void', tag: 'dot', desc: '대상의 화상을 잠식으로 바꾼다(위력 ×1.5).\n잠식 2·2', effects: [{ kind: 'convert', from: 'burn', to: 'erosion', mult: 1.5, target: 'focus' }, { kind: 'inflict', keyword: 'erosion', value: 2, turns: 2, target: 'focus' }] },
  { id: 'abyss_feast', name: '심연의 만찬', cost: 2, input: 'comet', output: 'void', tag: 'finisher', desc: '[허기 5 이상] 먼저 아군 전원 회복 6\n대상의 잠식·균열을 집어삼킨다: (위력×횟수)의 절반만큼 위력 +. 허기 1당 피해 +10%.', effects: [{ kind: 'heal', power: 6, target: 'allAllies', when: { casterHas: 'hunger', min: 5 } }, { kind: 'damage', power: 6, target: 'focus', devour: { keywords: ['erosion', 'rupture'], per: 0.5 }, consume: { stack: 'hunger', per: 0.1 } }] },
  { id: 'doom_echo', name: '종말의 메아리', cost: 1, input: 'void', output: 'void', tag: 'delayed', desc: '걸린 폭격을 지금 터뜨리고 새 폭격을 건다.\n[잠식 대상] 잠식을 터뜨린다', effects: [{ kind: 'detonate' }, { kind: 'burst', keyword: 'erosion', mult: 1, target: 'focus' }, { kind: 'doom', power: 12 }] },
  { id: 'void_resonance', name: '공허 공명', cost: 2, input: 'luna', output: 'void', tag: 'resonance', desc: '피해. 공허 공명 1당 +12%. 공허 공명 +1.\n[적중] 잠식 1·1', effects: [{ kind: 'attune', element: 'void', amount: 1 }, { kind: 'damage', power: 9, target: 'focus', attune: 'void', onHit: [{ inflict: 'erosion', value: 1, turns: 1 }] }] },

  // ── 아스트라 · 별빛 · 진동과 불굴 ──
  { id: 'galaxy_ward', name: '은하 수호', cost: 1, input: 'wild', output: 'echo', tag: 'shield', desc: '아군 전원 보호막 8. 직전 성속을 잇는다.', effects: [{ kind: 'shield', power: 8, target: 'allAllies' }] },
  { id: 'constellation_echo', name: '성좌 반향', cost: 1, input: 'wild', output: 'echo', tag: 'strike', desc: '피해. 직전 성속을 잇는다.\n[적중] 진동 3·2 — 쌓아 두었다가 터뜨린다(8 이상이면 기절)', effects: [{ kind: 'damage', power: 8, target: 'focus', onHit: [{ inflict: 'tremor', value: 3, turns: 2 }] }] },
  { id: 'taunt_star', name: '도발의 별', cost: 1, input: 'wild', output: 'echo', tag: 'shield', desc: '이번 턴 단일 공격을 대신 받고 보호막 14.', effects: [{ kind: 'allyStatus', status: 'taunt', turns: 1, target: 'self' }, { kind: 'shield', power: 14, target: 'self' }] },
  { id: 'counter_stance', name: '반격 태세', cost: 1, input: 'wild', output: 'echo', tag: 'buff', desc: '이번 턴 공격받으면 반격(+불굴 1당 2), 보호막 6.', effects: [{ kind: 'allyStatus', status: 'counter', turns: 1, value: 10, target: 'self' }, { kind: 'shield', power: 6, target: 'self' }] },
  { id: 'star_judgement', name: '별의 심판', cost: 3, input: 'wild', output: 'echo', tag: 'strike', desc: '체인 수에 비례한 피해.\n[시전 후] 진동을 터뜨린다(위력만큼, 8 이상이면 기절).', effects: [{ kind: 'damage', power: 7, target: 'focus', scaleWithChain: true }, { kind: 'burst', keyword: 'tremor', mult: 1.5, target: 'focus' }] },
  { id: 'bulwark_bash', name: '방패 강타', cost: 1, input: 'wild', output: 'echo', tag: 'strike', desc: '자신 보호막만큼 더 세게 친다. 불굴 1당 피해 +12%.\n[적중] 진동 2·2', effects: [{ kind: 'damage', power: 7, target: 'focus', fromShield: 1, consume: { stack: 'fortitude', per: 0.12 }, onHit: [{ inflict: 'tremor', value: 2, turns: 2 }] }] },
  { id: 'star_aegis', name: '별의 성채', cost: 2, input: 'wild', output: 'echo', tag: 'shield', desc: '보호막 18, 도발, 반격 12.', effects: [{ kind: 'shield', power: 18, target: 'self' }, { kind: 'allyStatus', status: 'taunt', turns: 1, target: 'self' }, { kind: 'allyStatus', status: 'counter', turns: 1, value: 12, target: 'self' }] },
  { id: 'guiding_star', name: '이정표의 별', cost: 1, input: 'wild', output: 'echo', tag: 'charge', desc: '아군 전원 공명파동 1, 다음 마법 배율 +0.25.', effects: [{ kind: 'gain', stack: 'wave', amount: 1, target: 'allAllies' }, { kind: 'boost', amount: 0.25 }] },
  { id: 'constellation_mark', name: '성도 낙인', cost: 1, input: 'wild', output: 'echo', tag: 'mark', desc: '피해를 주고 각인을 겹쳐 새긴다.\n진동 3·2, 균열 1·3', effects: [{ kind: 'damage', power: 4, target: 'focus' }, { kind: 'inflict', keyword: 'tremor', value: 3, turns: 2, target: 'focus' }, { kind: 'inflict', keyword: 'rupture', value: 1, turns: 3, target: 'focus' }] },
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
