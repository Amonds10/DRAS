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

export type StatusId = 'stun' | 'weaken' | 'burn' | 'expose' | 'atkUp' | 'seal';

export interface Status {
  id: StatusId;
  turns: number;
  /** burn: 턴당 피해, atkUp: 공격 증가량 */
  value?: number;
  /** seal: 봉인된 성속 */
  element?: Element;
}

export type EnemyTarget = 'focus' | 'allEnemies' | 'random3';
export type AllyTarget = 'lowestAlly' | 'allAllies' | 'self';

export type Effect =
  | { kind: 'damage'; power: number; target: EnemyTarget; scaleWithChain?: boolean }
  | { kind: 'heal'; power: number; target: AllyTarget }
  | { kind: 'shield'; power: number; target: AllyTarget }
  | { kind: 'enemyStatus'; status: StatusId; turns: number; value?: number; target: 'focus' | 'allEnemies' }
  | { kind: 'allyStatus'; status: StatusId; turns: number; value?: number; target: AllyTarget }
  | { kind: 'stardust'; amount: number }
  | { kind: 'purge'; target: 'focus' | 'allEnemies' };

export interface SpellDef {
  id: string;
  name: string;
  cost: number;
  input: SpellInput;
  output: SpellOutput;
  effects: Effect[];
  desc: string;
}

export interface UnitDef {
  id: string;
  name: string;
  /** 'star'는 별빛(중립) 계열 */
  element: Element | 'star';
  role: Role;
  maxHp: number;
  atk: number;
  def: number;
  spells: [string, string];
}

export interface ReactionDef {
  id: string;
  name: string;
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
  /** 이번 아군 턴 동안 봉인된 성속(성식) */
  seal: Element | null;
  outcome: BattleOutcome;
  rngState: number;
  mods: BattleMods;
  stats: { maxChain: number; reactions: number; fullChains: number };
}

export type BattleEvent =
  | { type: 'cast'; allyUid: string; spellId: string; linked: boolean; chain: number; mult: number; outElement: Element | null; sealed: boolean }
  | { type: 'reaction'; reactionId: string; allyUid: string }
  | { type: 'fullChain'; bonus: number }
  | { type: 'damage'; targetUid: string; amount: number; absorbed: number; source: 'ally' | 'enemy' | 'burn' | 'chain'; hpAfter: number; shieldAfter: number }
  | { type: 'heal'; targetUid: string; amount: number; hpAfter: number }
  | { type: 'shield'; targetUid: string; amount: number; shieldAfter: number }
  | { type: 'status'; targetUid: string; status: StatusId; turns: number }
  | { type: 'purge'; targetUid: string }
  | { type: 'stardust'; amount: number }
  | { type: 'skip'; allyUid: string; reason: 'cost' | 'dead' | 'stun' }
  | { type: 'enemyAct'; enemyUid: string; intent: Intent }
  | { type: 'seal'; element: Element }
  | { type: 'enemyStunned'; enemyUid: string }
  | { type: 'death'; uid: string }
  | { type: 'round'; round: number }
  | { type: 'outcome'; outcome: BattleOutcome };
