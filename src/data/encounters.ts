export type FloorKind = 'battle' | 'elite' | 'boss';

export interface FloorDef {
  kind: FloorKind;
  name: string;
  /** 후보 적 구성 중 하나가 무작위로 선택된다 */
  pools: string[][];
}

export const FLOORS: FloorDef[] = [
  { kind: 'battle', name: '희미한 성역', pools: [['stray_shard', 'stray_shard'], ['shadow_comet']] },
  { kind: 'battle', name: '흐르는 성역', pools: [['shadow_comet', 'stray_shard'], ['dark_nebula']] },
  { kind: 'battle', name: '일그러진 성역', pools: [['dark_nebula', 'eclipse_eye'], ['eclipse_eye', 'shadow_comet']] },
  { kind: 'elite', name: '별지기의 제단', pools: [['fallen_keeper']] },
  { kind: 'boss', name: '삼켜진 하늘', pools: [['star_devourer', 'stray_shard']] },
];
