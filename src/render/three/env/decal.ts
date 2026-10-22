import * as THREE from 'three';
import { MAX_GROUND_LIGHTS, type BuildCtx } from './context';

/**
 * 지형 위에 덧그리는 무대 표식(동심원, 눈금, 옅은 격자)과 스킬 VFX의 바닥 조명.
 * 가산 합성이라 밝은 낮 장면에서도 지형 질감을 가리지 않는다.
 */
export function buildStageDecal(ctx: BuildCtx): void {
  const p = ctx.p;
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: {
        ...ctx.shared(),
        uRing: { value: new THREE.Color(p.ring) },
        uDay: { value: p.light?.kind === 'sun' ? 1 : 0 },
        uLightPos: { value: ctx.lights.pos },
        uLightCol: { value: ctx.lights.col },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uRing;
        uniform float uDay, uTime;
        uniform vec3 uLightPos[${MAX_GROUND_LIGHTS}];
        uniform vec3 uLightCol[${MAX_GROUND_LIGHTS}];
        varying vec3 vWorld;
        void main() {
          vec2 p = vWorld.xz;
          vec2 q = p - vec2(0.0, 0.2);
          float r = length(q);
          float ring = smoothstep(0.04, 0.0, abs(r - 7.0)) + 0.5 * smoothstep(0.025, 0.0, abs(r - 7.45));
          float ang = atan(q.y, q.x);
          float ticks = step(0.9, fract(ang * 36.0 / 6.2831)) * smoothstep(0.22, 0.0, abs(r - 7.22));
          // 천천히 도는 바깥 호
          float arc = step(0.75, fract((ang + uTime * 0.05) / 6.2831 * 3.0)) * smoothstep(0.03, 0.0, abs(r - 7.85)) * 0.6;
          vec2 gl = abs(fract(p * 0.5) - 0.5);
          float grid = smoothstep(0.015, 0.0, min(gl.x, gl.y)) * 0.05 * smoothstep(9.0, 5.0, r);
          vec3 col = uRing * (ring * 0.55 + ticks * 0.5 + arc + grid) * mix(1.0, 0.7, uDay);
          vec3 light = vec3(0.0);
          for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
            vec3 d = uLightPos[i] - vWorld;
            light += uLightCol[i] / (1.0 + dot(d, d) * 0.55);
          }
          col += light * 0.35;
          col *= smoothstep(16.0, 11.0, r);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  const mesh = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(34, 34)), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  ctx.group.add(mesh);
}
