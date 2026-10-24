/** 성속(星屬). 마법이 받고 내보내는 별의 속성. */
export type Element = 'sol' | 'luna' | 'nebula' | 'comet' | 'void';

/**
 * 마법의 입력 성속.
 * - Element: 직전 마법의 출력이 이 성속일 때만 링크된다.
 * - 'none': 기점 마법. 링크되지 않고 새 체인을 연다.
 * - 'wild': 어떤 출력에도 링크된다(별빛 계열).
 */
export type SpellInput = Element | 'none' | 'wild';

/** 마법의 출력 성속. 'echo'는 직전 출력 성속을 그대로 이어받는다. */
export type SpellOutput = Element | 'echo';

export type Role = 'striker' | 'guardian' | 'support' | 'hexer';

/**
 * 상태. 적에게 거는 각인(화상·균열·잠식·진동·월영)은 위력(value)과 횟수(turns)를 함께 가진다.
 * 술사마다 고유 중첩(태양핵·조준·만조·허기·불굴)이 있고, 공명파동은 다음 시전을 강화한다.
 */
export type StatusId =
  | 'stun' | 'weaken' | 'expose' | 'atkUp' | 'seal' | 'doom' | 'taunt' | 'counter'
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
  /** 남은 턴. 각인은 '횟수'(발동할 때마다 1씩 준다). */
  turns: number;
  /**
   * 각인: 위력. atkUp: 공격 증가량, doom: 라운드 끝 폭발 피해, counter: 반격 피해, 중첩: 쌓인 수.
   */
  value?: number;
  /** seal: 봉인된 성속 */
  element?: Element;
}

export type EnemyTarget = 'focus' | 'allEnemies' | 'random';
export type AllyTarget = 'lowestAlly' | 'allAllies' | 'self';

export interface DamageEffect {
  kind: 'damage';
  /** 단타 위력. stages가 있으면 쓰지 않는다. */
  power: number;
  target: EnemyTarget;
  /** 타격 횟수(기본 1). random은 타격마다 대상을 새로 고른다. stages가 있으면 쓰지 않는다. */
  hits?: number;
  /**
   * 타격 단계(Ⅰ, Ⅱ, Ⅲ …). 타격마다 위력·조건·적중 효과가 따로 있다.
   * 없으면 power를 hits번 나눠 친다.
   */
  stages?: Stage[];
  scaleWithChain?: boolean;
  /** 방어 무시 */
  pierce?: boolean;
  /** 대상 HP 35% 이하일 때 배율 */
  execute?: number;
  /** 대상에게 약화 효과가 있을 때 배율 */
  vsDebuffed?: number;
  /** 준 피해의 일부만큼 시전자 회복 */
  lifesteal?: number;
  /** 자기 중첩을 모두 소모해 1중첩당 배율 +per(태양핵·조준·만조·불굴·허기) */
  consume?: { stack: Stack; per: number };
  /** 대상 각인을 소모해 (위력 × 횟수) × per만큼 위력을 더한다 */
  devour?: { keywords: Keyword[]; per: number };
  /** 대상에게 이 각인이 있으면 배율 */
  bonusVs?: { keyword: Keyword | 'any'; mult: number }[];
  /** 대상의 이 각인 횟수만큼 마지막 단계를 되풀이한다(최대 max) */
  hitsFrom?: { keyword: Keyword; max: number };
  /** 타격마다 일어나는 일(모든 단계에 공통) */
  onHit?: Rider[];
  /** 성속 공명: 이 성속의 공명 1당 배율 +12% */
  attune?: Element;
  /** 공명 해방: 이 성속의 공명을 모두 소모하고 1당 배율 +25% */
  releaseAttune?: Element;
  /** 남은 성진을 모두 쓰고 1당 위력 +값 */
  fromStardust?: number;
  /** 시전자 보호막의 이 비율만큼 피해 추가 */
  fromShield?: number;
}

/** 한 번의 타격 */
export interface Stage {
  power: number;
  /** 이 조건이 맞을 때만 나간다(아니면 불발) */
  only?: Cond;
  /** 조건이 맞으면 이 타격 피해 배율 */
  up?: { when: Cond; mult: number };
  /** 이 타격만 방어 무시 */
  pierce?: boolean;
  /** 이 타격만 대상을 바꾼다 */
  target?: EnemyTarget;
  /** [적중 시] */
  onHit?: Rider[];
}

/**
 * 적중 효과. 맞은 대상을 기준으로 조건을 본다.
 * inflict/amplify/burst/weaken·expose는 맞은 대상에게, gain/heal/shield는 아군(기본 자신)에게.
 */
export type Rider = (
  | { inflict: Keyword; value: number; turns: number }
  | { gain: Stack; amount: number; to?: AllyTarget }
  | { heal: number; to?: AllyTarget }
  | { shield: number; to?: AllyTarget }
  | { amplify: number; turns: number }
  | { burst: Keyword; mult: number }
  | { stardust: number }
  | { debuff: 'weaken' | 'expose'; turns: number }
  /** 맞은 대상의 이 각인을 다른 모든 적에게 퍼뜨린다(위력·횟수 × ratio) */
  | { spread: Keyword; ratio: number }
) & { when?: Cond };

/** 효과 발동 조건. '대상'은 적중 효과·타격에서는 맞은 적, 그 밖에는 집중 대상. */
export interface Cond {
  /** 대상에게 이 각인이 있다(targetMin이 있으면 위력이 그 이상) */
  targetHas?: Keyword | 'any';
  targetMin?: number;
  /** 대상의 각인 종류가 이 이상 */
  kinds?: number;
  /** 시전자에게 이 중첩이 min 이상 */
  casterHas?: Stack;
  min?: number;
  /** 대상 각인 위력 + 시전자 중첩의 합이 이 이상 */
  sum?: { keyword: Keyword; stack: Stack; min: number };
  /** 체인이 이 이상 */
  chain?: number;
  /** 링크로 이어 시전했다 */
  linked?: boolean;
  /** 대상 HP 비율이 이 이하 */
  targetHpBelow?: number;
  /** 시전자 HP 비율이 이 이하 */
  casterHpBelow?: number;
  /** 시전자에게 보호막이 있다 */
  shielded?: boolean;
}

export type Effect = (
  | DamageEffect
  | { kind: 'heal'; power: number; target: AllyTarget }
  | { kind: 'shield'; power: number; target: AllyTarget }
  | { kind: 'enemyStatus'; status: StatusId; turns: number; value?: number; target: 'focus' | 'allEnemies' }
  | { kind: 'allyStatus'; status: StatusId; turns: number; value?: number; target: AllyTarget }
  | { kind: 'stardust'; amount: number }
  | { kind: 'purge'; target: 'focus' | 'allEnemies' }
  /** 다음 마법의 체인 배율에 더해진다 */
  | { kind: 'boost'; amount: number }
  /** 집중 대상에 지연 폭발을 건다. 라운드가 끝날 때 터진다. */
  | { kind: 'doom'; power: number }
  /** 중첩을 쌓는다 */
  | { kind: 'gain'; stack: Stack; amount: number; target: AllyTarget }
  /** 각인을 건다(위력·횟수가 더해진다) */
  | { kind: 'inflict'; keyword: Keyword; value: number; turns: number; target: 'focus' | 'allEnemies' }
  /** 대상에게 걸린 모든 각인의 위력·횟수를 늘린다 */
  | { kind: 'amplify'; value: number; turns: number; target: 'focus' | 'allEnemies' }
  /** 각인을 지금 터뜨린다: 화상·잠식·균열은 위력 × 횟수 × mult, 진동은 위력 × mult(8 이상이면 기절) */
  | { kind: 'burst'; keyword: Keyword; mult: number; target: 'focus' | 'allEnemies' }
  /** 각인을 다른 각인으로 바꾼다(위력 × mult) */
  | { kind: 'convert'; from: Keyword; to: Keyword; mult: number; target: 'focus' | 'allEnemies' }
  /** 집중 대상의 각인을 다른 모든 적에게 퍼뜨린다(위력·횟수 × ratio) */
  | { kind: 'spread'; keyword: Keyword; ratio: number }
  /** 성속 공명을 더 쌓는다 */
  | { kind: 'attune'; element: Element; amount: number }
  /** 걸려 있는 지연 폭발을 지금 모두 터뜨린다 */
  | { kind: 'detonate' }
) & { when?: Cond };

/** 카드에 표시하는 스킬 유형(연출도 이 값을 따른다) */
export type SkillTag =
  | 'strike'
  | 'multi'
  | 'aoe'
  | 'pierce'
  | 'execute'
  | 'drain'
  | 'dot'
  | 'delayed'
  | 'debuff'
  | 'heal'
  | 'shield'
  | 'buff'
  | 'utility'
  /** 예열: 다음 일격을 위해 힘을 모은다 */
  | 'charge'
  /** 극딜: 모은 것을 한 번에 쏟는다 */
  | 'finisher'
  /** 별흔: 적에게 쌓아 평타를 키운다 */
  | 'mark'
  /** 공명: 같은 성속을 쌓을수록 강해진다 */
  | 'resonance';

export interface SpellDef {
  id: string;
  name: string;
  cost: number;
  input: SpellInput;
  output: SpellOutput;
  /** 사용 시 순서대로 일어난다. 피해 앞의 효과는 [사용 시], 뒤의 효과는 [시전 후]로 보인다. */
  effects: Effect[];
  /** [전투 시작 시] 이번 턴 시전할 예정이면, 누구보다 먼저(성진이 모자라 못 쓰면 일어나지 않는다) */
  start?: Effect[];
  /** [처치 시] 이 주문의 타격으로 적을 쓰러뜨리면(시전당 한 번) */
  kill?: Effect[];
  /** 한 줄 소개 */
  /** 문장형 설명 */
  desc: string;
  tag: SkillTag;
}

export interface UnitDef {
  id: string;
  name: string;
  /** 영문 코드네임 */
  code: string;
  /** 한 줄 소개 */
  concept: string;
  /** 'star'는 별빛(중립) 계열 */
  element: Element | 'star';
  role: Role;
  maxHp: number;
  atk: number;
  def: number;
  /** 술사의 스킬 4개. 매 라운드 이 중 2장을 손패로 뽑는다. */
  spells: string[];
  /** 고유 패시브(전투 중 늘 켜져 있다) */
  passive: { name: string; desc: string };
  /** 이 술사가 쌓는 고유 중첩(게이지로 보여 준다) */
  stack?: { id: Stack; max: number };
}

export interface ReactionDef {
  id: string;
  name: string;
  en: string;
  from: Element;
  to: Element;
  desc: string;
  /** 이번 마법의 피해 배율 */
  damageMult?: number;
  /** 이번 마법이 방어를 무시하는지 */
  pierce?: boolean;
  effects: Effect[];
}

export type Intent =
  | { kind: 'attack'; power: number; targetId?: string }
  | { kind: 'attackAll'; power: number }
  | { kind: 'defend'; shield: number }
  | { kind: 'buff'; atk: number }
  | { kind: 'seal'; element?: Element }
  | { kind: 'charge' };

export type EnemyTrait = 'starShield';

export interface EnemyDef {
  id: string;
  name: string;
  glyph: string;
  maxHp: number;
  atk: number;
  def: number;
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
}

export interface PlannedCast {
  allyUid: string;
  spellId: string;
}

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

/** 전투 수정자: 런 보상으로 쌓이는 값 */
export interface BattleMods {
  stardustPerTurn: number;
  startStardust: number;
  fullChainBonus: number;
}

export interface BattleState {
  round: number;
  allies: Ally[];
  enemies: Enemy[];
  stardust: number;
  maxStardust: number;
  focusUid: string | null;
  /** 이번 라운드 손패: 아군 uid → 뽑은 스킬 */
  hands: Record<string, string[]>;
  /** 이번 아군 턴 동안 봉인된 성속(성식) */
  seal: Element | null;
  /** 성속 각인: 전투 내내 그 성속을 내보낸 시전 수(최대 10). 공명 주문이 이 값을 쓴다. */
  attune: Record<Element, number>;
  outcome: BattleOutcome;
  rngState: number;
  mods: BattleMods;
  stats: { maxChain: number; reactions: number; fullChains: number };
}

export type DamageSource = 'ally' | 'enemy' | 'burn' | 'chain' | 'doom' | 'counter' | 'erosion' | 'burst';

export type BattleEvent =
  | { type: 'cast'; allyUid: string; spellId: string; linked: boolean; chain: number; mult: number; outElement: Element | null; sealed: boolean }
  | { type: 'reaction'; reactionId: string; allyUid: string }
  | { type: 'fullChain'; bonus: number }
  | { type: 'damage'; targetUid: string; amount: number; absorbed: number; source: DamageSource; hpAfter: number; shieldAfter: number }
  | { type: 'heal'; targetUid: string; amount: number; hpAfter: number }
  | { type: 'shield'; targetUid: string; amount: number; shieldAfter: number }
  | { type: 'status'; targetUid: string; status: StatusId; turns: number; stacks?: number }
  | { type: 'unleash'; allyUid: string; stack: Stack; stacks: number; mult: number }
  /** 타격 단계가 시작된다(불발이면 skipped) */
  | { type: 'stage'; allyUid: string; index: number; total: number; skipped: boolean }
  /** 조건부 효과·전투 시작 시·처치 시 효과가 발동했다 */
  | { type: 'trigger'; allyUid: string; spellId: string; phase: 'start' | 'use' | 'kill' | 'after' }
  | { type: 'purge'; targetUid: string }
  | { type: 'stardust'; amount: number }
  | { type: 'attune'; element: Element; total: number }
  | { type: 'release'; element: Element; stacks: number }
  | { type: 'skip'; allyUid: string; reason: 'cost' | 'dead' | 'stun' }
  | { type: 'enemyAct'; enemyUid: string; intent: Intent }
  | { type: 'seal'; element: Element }
  | { type: 'enemyStunned'; enemyUid: string }
  | { type: 'death'; uid: string }
  | { type: 'round'; round: number }
  | { type: 'outcome'; outcome: BattleOutcome };
