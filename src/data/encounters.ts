export type FloorKind = 'battle' | 'elite' | 'boss';

export interface FloorDef {
  kind: FloorKind;
  name: string;
  /** 후보 적 구성 중 하나가 무작위로 선택된다 */
  pools: string[][];
  /** 이 층 적의 체력·공격 배율 */
  scale: EnemyScale;
}

export interface EnemyScale {
  hp: number;
  atk: number;
}

export const FLOORS: FloorDef[] = [
  { kind: 'battle', name: '새벽 안개 초원', pools: [['stray_shard', 'stray_shard'], ['shadow_comet', 'stray_shard'], ['dusk_moth', 'stray_shard']], scale: { hp: 0.9, atk: 1.7 } },
  { kind: 'battle', name: '빗속 네온 운하', pools: [['shadow_comet', 'star_leech'], ['dusk_moth', 'dark_nebula'], ['star_leech', 'stray_shard', 'dusk_moth']], scale: { hp: 0.95, atk: 2.0 } },
  { kind: 'battle', name: '모래바람 사구', pools: [['shard_golem', 'eclipse_eye'], ['dark_nebula', 'eclipse_eye', 'shadow_comet'], ['star_leech', 'shard_golem']], scale: { hp: 1.0, atk: 2.15 } },
  { kind: 'elite', name: '오로라 설원', pools: [['fallen_keeper', 'dusk_moth'], ['fallen_keeper', 'stray_shard']], scale: { hp: 0.95, atk: 1.9 } },
  { kind: 'boss', name: '부서진 하늘섬', pools: [['star_devourer', 'stray_shard'], ['star_devourer', 'dusk_moth']], scale: { hp: 0.9, atk: 1.6 } },
];
