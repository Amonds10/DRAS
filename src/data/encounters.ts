export type FloorKind = 'battle' | 'elite' | 'boss';

export interface FloorDef {
  kind: FloorKind;
  name: string;
  /** 후보 적 구성 중 하나가 무작위로 선택된다 */
  pools: string[][];
}

export const FLOORS: FloorDef[] = [
  { kind: 'battle', name: '새벽 안개 초원', pools: [['stray_shard', 'stray_shard'], ['shadow_comet']] },
  { kind: 'battle', name: '빗속 네온 운하', pools: [['shadow_comet', 'stray_shard'], ['dark_nebula']] },
  { kind: 'battle', name: '모래바람 사구', pools: [['dark_nebula', 'eclipse_eye'], ['eclipse_eye', 'shadow_comet']] },
  { kind: 'elite', name: '오로라 설원', pools: [['fallen_keeper']] },
  { kind: 'boss', name: '부서진 하늘섬', pools: [['star_devourer', 'stray_shard']] },
];
