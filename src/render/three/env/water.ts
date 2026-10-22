import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import type { BuildCtx } from './context';
import { NOISE_GLSL } from './glsl';
import { waterNormals } from './maps';

/** 바다: 실시간 반사와 물결 노멀, 해 반짝임 길 */
export function buildSea(ctx: BuildCtx): void {
  const p = ctx.p;
  const size = ctx.q.tier === 'high' ? 1024 : 512;
  const water = new Water(ctx.track(new THREE.PlaneGeometry(1400, 1400)), {
    textureWidth: size,
    textureHeight: size,
    waterNormals: waterNormals(),
    sunDirection: ctx.sunDir.clone(),
    sunColor: new THREE.Color(p.sun.color).multiplyScalar(0.7),
    waterColor: new THREE.Color(p.ground.color),
    distortionScale: 0.55,
    alpha: 1,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  const mat = water.material as THREE.ShaderMaterial;
  mat.uniforms.size.value = 1.2;
  ctx.onUpdate((t) => (mat.uniforms.time.value = t * 0.35));
  ctx.track({ dispose: () => (water.material as THREE.Material).dispose() });
  ctx.group.add(water);
}

/** 하늘섬 아래 구름 바다: 해가 가려진 붉은빛을 받는 두꺼운 구름층 */
export function buildCloudSea(ctx: BuildCtx): void {
  const p = ctx.p;
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      uniforms: {
        ...ctx.shared(),
        uLit: { value: new THREE.Color(p.sun.color).multiplyScalar(0.9) },
        uDark: { value: new THREE.Color(0x12040a) },
        uFog: { value: new THREE.Color(p.fog) },
        uSun: { value: ctx.sunDir },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLit, uDark, uFog, uSun;
        uniform float uTime, uFlash;
        varying vec3 vWorld;
        varying float vDepth;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz * 0.025 + vec2(uTime * 0.01, uTime * 0.004);
          float a = fbm(p + fbm(p * 0.5 + 3.0) * 1.2);
          float b = fbm(p * 2.3 - uTime * 0.006);
          float h = a * 0.7 + b * 0.3;
          // 위를 향한 면이 밝게: 높이 기울기로 가짜 조명
          float dx = fbm(p + vec2(0.02, 0.0)) - a;
          float lit = clamp(0.5 + dx * 18.0 * sign(uSun.x) + (h - 0.45) * 1.6, 0.0, 1.0);
          vec3 col = mix(uDark, uLit, lit * smoothstep(0.3, 0.7, h));
          col += uLit * pow(smoothstep(0.55, 0.85, h), 2.0) * 0.6;
          float f = 1.0 - exp(-pow(vDepth * 0.0035, 2.0));
          col = mix(col, uFog, f);
          gl_FragColor = vec4(col + uFlash * 0.04, 1.0);
        }`,
    }),
  );
  const mesh = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(1600, 1600)), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -16;
  ctx.group.add(mesh);
}
