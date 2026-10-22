import type * as THREE from 'three';
import type { Quality } from '../quality';
import type { PresetDef, ScenePreset } from './presets';

/** 바닥 셰이더가 받는 동적 조명(스킬 VFX가 채운다) */
export interface GroundLights {
  pos: THREE.Vector3[];
  col: THREE.Color[];
}

export const MAX_GROUND_LIGHTS = 8;

/** 매 프레임 갱신할 셰이더 공통 uniform */
export interface TickUniforms {
  uTime: { value: number };
  uFlash: { value: number };
}

/** 배경 조각을 만드는 함수들이 함께 쓰는 재료 */
export interface BuildCtx {
  id: ScenePreset;
  p: PresetDef;
  q: Quality;
  renderer: THREE.WebGLRenderer;
  group: THREE.Group;
  /** 장면에서 광원을 향하는 단위 벡터 */
  sunDir: THREE.Vector3;
  lights: GroundLights;
  track<T extends { dispose(): void }>(o: T): T;
  shared(): TickUniforms;
  onUpdate(fn: (t: number, dt: number) => void): void;
  /** 지형 높이(지형을 만든 뒤에 유효) */
  heightAt(x: number, z: number): number;
}
