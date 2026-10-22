import * as THREE from 'three';
import type { BuildCtx } from './context';

let gradient: THREE.DataTexture | null = null;

/** 셀 셰이딩 명암 단계: 그늘 · 중간 · 빛 세 단계 */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = [96, 168, 228, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** 셀 셰이딩 재질. wind를 주면 높이에 비례해 바람에 흔들린다(나무). */
export function toonMaterial(ctx: BuildCtx, opts: THREE.MeshToonMaterialParameters & { wind?: number } = {}): THREE.MeshToonMaterial {
  const { wind, ...params } = opts;
  const mat = ctx.track(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), ...params }));
  if (wind) {
    const tick = ctx.shared();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = tick.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = max(position.y - 1.0, 0.0);
        float gust = 0.6 + 0.4 * sin(uTime * 0.4 + ip.x * 0.05);
        transformed.x += sin(uTime * 1.3 + ip.x * 0.35 + ip.z * 0.2) * ${wind.toFixed(3)} * sway * gust;
        transformed.z += cos(uTime * 1.07 + ip.x * 0.21) * ${(wind * 0.5).toFixed(3)} * sway * gust;`,
      );
    };
  }
  return mat;
}
