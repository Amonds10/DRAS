/** 성속(星屬). 술사와 적 약점의 속성. 아스트라는 'star'(별빛). */
export type Element = 'sol' | 'luna' | 'nebula' | 'comet' | 'void';
export type Affinity = Element | 'star';

export type Role = 'striker' | 'guardian' | 'support' | 'hexer';

/**
 * 상태. 적에게 거는 각인(화상·균열·잠식·진동·월영)은 위력(value)과 횟수(turns)를 함께 가진다.
 * 술사마다 고유 중첩(태양핵·조준·만조·허기·불굴)이 있고, 공명파동은 다음 행동을 강화한다.
 */
export type StatusId =
  | 'stun' | 'weaken' | 'expose' | 'atkUp' | 'doom' | 'taunt' | 'counter'
  // 적 각인
  | 'burn' | 'rupture' | 'erosion' | 'tremor' | 'moonshade'
  // 술사 고유 중첩
  | 'solarCore' | 'aim' | 'tide' | 'hunger' | 'fortitude' | 'wave';

/** 적에게 거는 각인(위력·횟수를 가진다) */
export type Keyword = 'burn' | 'rupture' | 'erosion' | 'tremor' | 'moonshade';
/** 술사에게 쌓이는 중첩 */
export type Stack = 'solarCore' | 'aim' | 'tide' | 'hunger' | 'fortitude' | 'wave';

export interface Status {
  id: StatusId;
  /** 남은 턴(그 유닛의 턴 기준). 각인은 '횟수'(발동할 때마다 1씩 준다). */
  turns: number;
  /** 각인: 위력. atkUp: 공격 증가량, doom: 폭발 피해, counter: 반격 피해, 중첩: 쌓인 수. */
  value?: number;
}

/** focus: 고른 적 하나, blast: 고른 적과 양옆(양옆은 절반), allEnemies: 모든 적, random: 타격마다 무작위 */
export type EnemyTarget = 'focus' | 'blast' | 'allEnemies' | 'random';
/** chosen: 고른 아군 */
export type AllyTarget = 'lowestAlly' | 'allAllies' | 'self' | 'chosen';

export interface DamageEffect {
  kind: 'damage';
  target: EnemyTarget;
  /** 타격들. power는 공격력의 %(100 = 공격력만큼). */
  stages: Stage[];
  /** 방어 무시 */
  pierce?: boolean;
  /** 대상 HP 35% 이하일 때 배율 */
  execute?: number;
  /** 대상에게 약화 효과가 있을 때 배율 */
  vsDebuffed?: number;
  /** 준 피해의 일부만큼 시전자 회복 */
  lifesteal?: number;
  /** 자기 중첩을 모두 소모해 1중첩당 배율 +per */
  consume?: { stack: Stack; per: number };
  /** 대상 각인을 소모해 (위력 × 횟수) × per만큼 첫 타 피해를 더한다 */
  devour?: { keywords: Keyword[]; per: number };
  /** 대상에게 이 각인이 있으면 배율 */
  bonusVs?: { keyword: Keyword | 'any'; mult: number }[];
  /** 타격마다 일어나는 일(모든 타격 공통) */
  onHit?: Rider[];
  /** 시전자 보호막의 이 비율만큼 타격마다 피해 추가 */
  fromShield?: number;
}

/** 한 번의 타격 */
export interface Stage {
  /** 공격력 % */
  power: number;
  /** 이 조건이 맞을 때만 나간다 */
  only?: Cond;
  /** 조건이 맞으면 이 타격 피해 배율 */
  up?: { when: Cond; mult: number };
  pierce?: boolean;
  /** [적중 시] */
  onHit?: Rider[];
}

/** 적중 효과. 맞은 대상을 기준으로 조건을 본다. */
export type Rider = (
  | { inflict: Keyword; value: number; turns: number }
  | { gain: Stack; amount: number; to?: AllyTarget }
  | { heal: number; to?: AllyTarget }
  | { shield: number; to?: AllyTarget }
  | { amplify: number; turns: number }
  | { burst: Keyword; mult: number }
  | { debuff: 'weaken' | 'expose'; turns: number }
  | { spread: Keyword; ratio: number }
) & { when?: Cond };

/** 효과 발동 조건. '대상'은 적중 효과·타격에서는 맞은 적, 그 밖에는 고른 적. */
export interface Cond {
  targetHas?: Keyword | 'any';
  targetMin?: number;
  kinds?: number;
  casterHas?: Stack;
  min?: number;
  sum?: { keyword: Keyword; stack: Stack; min: number };
  targetHpBelow?: number;
  casterHpBelow?: number;
  shielded?: boolean;
  /** 대상이 격파 상태 */
  broken?: boolean;
}

export type Effect = (
  | DamageEffect
  /** power는 시전자 공격력 %(회복·보호막) */
  | { kind: 'heal'; power: number; target: AllyTarget }
  | { kind: 'shield'; power: number; target: AllyTarget }
  | { kind: 'enemyStatus'; status: StatusId; turns: number; value?: number; target: 'focus' | 'allEnemies' }
  | { kind: 'allyStatus'; status: StatusId; turns: number; value?: number; target: AllyTarget }
  /** 성진(스킬 포인트) */
  | { kind: 'sp'; amount: number }
  | { kind: 'purge'; target: 'focus' | 'allEnemies' }
  /** 아군의 다음 행동 피해 +amount(배율) */
  | { kind: 'boost'; amount: number }
  /** 행동 게이지를 당긴다(0.25 = 25%) */
  | { kind: 'advance'; amount: number; target: AllyTarget }
  /** 적의 행동을 늦춘다 */
  | { kind: 'delay'; amount: number; target: 'focus' | 'allEnemies' }
  /** 필살기 에너지 */
  | { kind: 'energy'; amount: number; target: AllyTarget }
  | { kind: 'doom'; power: number }
  | { kind: 'gain'; stack: Stack; amount: number; target: AllyTarget }
  | { kind: 'inflict'; keyword: Keyword; value: number; turns: number; target: 'focus' | 'allEnemies' }
  | { kind: 'amplify'; value: number; turns: number; target: 'focus' | 'allEnemies' }
  | { kind: 'burst'; keyword: Keyword; mult: number; target: 'focus' | 'allEnemies' }
  | { kind: 'convert'; from: Keyword; to: Keyword; mult: number; target: 'focus' | 'allEnemies' }
  | { kind: 'spread'; keyword: Keyword; ratio: number }
  | { kind: 'detonate' }
) & { when?: Cond };

/** 연출 유형 */
export type SkillTag =
  | 'strike' | 'multi' | 'aoe' | 'pierce' | 'execute' | 'drain' | 'dot' | 'delayed' | 'debuff'
  | 'heal' | 'shield' | 'buff' | 'utility' | 'charge' | 'finisher' | 'mark' | 'resonance';

/** 술사의 능력 칸: 일반 공격, 전투 스킬, 필살기 */
export type Slot = 'basic' | 'skill' | 'ultimate';

/** 누구를 고르는가: 적 하나(enemy), 아군 하나(ally), 고르지 않음(none) */
export type Aim = 'enemy' | 'ally' | 'none';

export interface AbilityDef {
  id: string;
  name: string;
  slot: Slot;
  tag: SkillTag;
  aim: Aim;
  /** 문장형 설명(스타레일식). 각인·중첩 이름은 화면에서 색이 입혀진다. */
  desc: string;
  effects: Effect[];
  /** 처치 시(행동당 한 번) */
  kill?: Effect[];
  /** 약점 적중 시 깎는 강인도(고른 대상 기준, 양옆은 절반) */
  toughness: number;
}

export interface UnitDef {
  id: string;
  name: string;
  code: string;
  concept: string;
  element: Affinity;
  role: Role;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  /** 필살기에 필요한 에너지 */
  energy: number;
  kit: { basic: string; skill: string; ultimate: string };
  passive: { name: string; desc: string };
  stack?: { id: Stack; max: number };
}

export type Intent =
  | { kind: 'attack'; power: number; targetId?: string }
  | { kind: 'attackAll'; power: number }
  | { kind: 'defend'; shield: number }
  | { kind: 'buff'; atk: number }
  /** 성식: 성진 1을 빼앗는다 */
  | { kind: 'seal' }
  | { kind: 'charge' };

export type EnemyTrait = 'starShield';

export interface EnemyDef {
  id: string;
  name: string;
  glyph: string;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  /** 강인도: 약점 속성으로 깎아 0이 되면 격파 */
  toughness: number;
  weak: Affinity[];
  pattern: Intent[];
  traits?: EnemyTrait[];
}

export interface Ally {
  uid: string;
  defId: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  shield: number;
  statuses: Status[];
  energy: number;
}

export interface Enemy {
  uid: string;
  defId: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  shield: number;
  statuses: Status[];
  patternIndex: number;
  intent: Intent | null;
  toughness: number;
  maxToughness: number;
  broken: boolean;
}

/** 플레이어의 행동: 누가, 어느 능력으로, 누구에게 */
export interface Action {
  allyUid: string;
  slot: Slot;
  targetUid: string | null;
}

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

/** 전투 수정자: 런 보상으로 쌓이는 값 */
export interface BattleMods {
  startSp: number;
  maxSp: number;
  /** 전투 시작 시 에너지(최대치 비율) */
  startEnergy: number;
}

export interface BattleState {
  allies: Ally[];
  enemies: Enemy[];
  /** 성진(스킬 포인트): 일반 공격 +1, 전투 스킬 -1 */
  sp: number;
  maxSp: number;
  /** 고른 적 */
  focusUid: string | null;
  /** 지금 차례인 술사(없으면 진행 중) */
  active: string | null;
  /** 행동 값: 0이 되면 차례가 온다 */
  av: Record<string, number>;
  /** 다음 아군 행동 피해 보너스 */
  boost: number;
  /** 지금까지 지난 턴 수(아군·적 모두) */
  turns: number;
  outcome: BattleOutcome;
  rngState: number;
  mods: BattleMods;
  stats: { breaks: number; ultimates: number; turns: number };
}

export type DamageSource = 'ally' | 'enemy' | 'burn' | 'doom' | 'counter' | 'erosion' | 'burst' | 'break';

export type BattleEvent =
  | { type: 'turn'; uid: string }
  | { type: 'cast'; allyUid: string; abilityId: string; slot: Slot; targetUid: string | null }
  | { type: 'damage'; targetUid: string; amount: number; absorbed: number; source: DamageSource; hpAfter: number; shieldAfter: number }
  | { type: 'heal'; targetUid: string; amount: number; hpAfter: number }
  | { type: 'shield'; targetUid: string; amount: number; shieldAfter: number }
  | { type: 'status'; targetUid: string; status: StatusId; turns: number; stacks?: number }
  | { type: 'unleash'; allyUid: string; stack: Stack; stacks: number; mult: number }
  | { type: 'stage'; allyUid: string; index: number; total: number; skipped: boolean }
  | { type: 'trigger'; allyUid: string; abilityId: string; phase: 'kill' | 'cond' }
  | { type: 'toughness'; targetUid: string; amount: number; after: number }
  | { type: 'break'; targetUid: string; element: Affinity }
  | { type: 'recover'; targetUid: string }
  | { type: 'energy'; allyUid: string; energy: number }
  | { type: 'sp'; amount: number; total: number }
  | { type: 'purge'; targetUid: string }
  | { type: 'enemyAct'; enemyUid: string; intent: Intent }
  | { type: 'enemyStunned'; enemyUid: string }
  | { type: 'death'; uid: string }
  | { type: 'outcome'; outcome: BattleOutcome };
