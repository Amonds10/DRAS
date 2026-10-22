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

export type StatusId = 'stun' | 'weaken' | 'burn' | 'expose' | 'atkUp' | 'seal' | 'doom' | 'taunt' | 'counter' | 'kindle' | 'starmark';

export interface Status {
  id: StatusId;
  turns: number;
  /**
   * burn: 턴당 피해(중첩), atkUp: 공격 증가량, doom: 라운드 끝 폭발 피해, counter: 반격 피해,
   * kindle: 예열 중첩(아군, 마무리 일격이 소모), starmark: 별흔 중첩(적, 타격마다 고정 추가 피해)
   */
  value?: number;
  /** seal: 봉인된 성속 */
  element?: Element;
}

export type EnemyTarget = 'focus' | 'allEnemies' | 'random';
export type AllyTarget = 'lowestAlly' | 'allAllies' | 'self';

export interface DamageEffect {
  kind: 'damage';
  power: number;
  target: EnemyTarget;
  /** 타격 횟수(기본 1). random은 타격마다 대상을 새로 고른다. */
  hits?: number;
  scaleWithChain?: boolean;
  /** 방어 무시 */
  pierce?: boolean;
  /** 대상 HP 35% 이하일 때 배율 */
  execute?: number;
  /** 대상에게 약화 효과가 있을 때 배율 */
  vsDebuffed?: number;
  /** 준 피해의 일부만큼 시전자 회복 */
  lifesteal?: number;
  /** 예열 소모: 시전자의 예열 1중첩당 배율 +값. 시전 뒤 예열을 모두 비운다. */
  kindleMult?: number;
  /** 타격마다 대상에게 별흔을 이만큼 새긴다 */
  mark?: number;
  /** 별흔 폭발: 대상의 별흔 1중첩당 위력 +값. 맞힌 뒤 별흔을 비운다. */
  consumeMarks?: number;
  /** 성속 공명: 이 성속의 각인 1중첩당 배율 +10% */
  attune?: Element;
  /** 공명 해방: 이 성속의 각인을 모두 소모하고 1중첩당 배율 +25% */
  releaseAttune?: Element;
  /** 남은 성진을 모두 쓰고 1당 위력 +값 */
  fromStardust?: number;
  /** 시전자 보호막의 이 비율만큼 피해 추가 */
  fromShield?: number;
}

export type Effect =
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
  /** 예열을 쌓는다(최대 6) */
  | { kind: 'kindle'; amount: number; target: AllyTarget }
  /** 별흔을 새긴다(최대 12) */
  | { kind: 'mark'; amount: number; target: 'focus' | 'allEnemies' }
  /** 성속 각인을 더 쌓는다 */
  | { kind: 'attune'; element: Element; amount: number }
  /** 걸려 있는 지연 폭발을 지금 모두 터뜨린다 */
  | { kind: 'detonate' };

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
  effects: Effect[];
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
  /** 기본 장착 주문 5개(매 라운드 이 중 2장을 뽑는다) */
  spells: string[];
  /** 배울 수 있는 주문 전체(장착 후보). 기본 장착 5개를 포함한다. */
  pool: string[];
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
  /** 장착한 주문 5개. 없으면 술사 기본 장착을 쓴다. */
  spells?: string[];
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

export type DamageSource = 'ally' | 'enemy' | 'burn' | 'chain' | 'doom' | 'counter';

export type BattleEvent =
  | { type: 'cast'; allyUid: string; spellId: string; linked: boolean; chain: number; mult: number; outElement: Element | null; sealed: boolean }
  | { type: 'reaction'; reactionId: string; allyUid: string }
  | { type: 'fullChain'; bonus: number }
  | { type: 'damage'; targetUid: string; amount: number; absorbed: number; source: DamageSource; hpAfter: number; shieldAfter: number }
  | { type: 'heal'; targetUid: string; amount: number; hpAfter: number }
  | { type: 'shield'; targetUid: string; amount: number; shieldAfter: number }
  | { type: 'status'; targetUid: string; status: StatusId; turns: number; stacks?: number }
  | { type: 'unleash'; allyUid: string; stacks: number; mult: number }
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
