import * as THREE from 'three';
import { fxTexture } from '../textures';
import type { BuildCtx } from './context';
import { NOISE_GLSL } from './glsl';

/** 낮게 깔리는 안개 띠. 해 쪽을 바라보면 햇빛이 번져 밝아진다. */
export function buildFogBands(ctx: BuildCtx): void {
  const p = ctx.p;
  const geo = ctx.track(new THREE.PlaneGeometry(1, 1));
  const strength = { meadow: 0.45, coast: 0.6, dunes: 0.45, snowfield: 0.6, skyruins: 0.7, neon: 0.9 }[p.scenery];
  const layers: [number, number, number, number][] = [
    [-9, 1.6, 90, 0.26],
    [-18, 3, 140, 0.34],
    [-34, 5.5, 220, 0.42],
    [-60, 9, 320, 0.4],
  ];
  const sunCol = new THREE.Color(p.sun.color);
  layers.forEach(([z, h, w, a], i) => {
    const mat = ctx.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...ctx.shared(),
          uColor: { value: new THREE.Color(p.fog).multiplyScalar(1.1) },
          uSunCol: { value: sunCol },
          uSun: { value: ctx.sunDir },
          uAlpha: { value: Math.min(0.85, a * strength) },
          uSeed: { value: i * 11.0 },
        },
        vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor, uSunCol, uSun; uniform float uAlpha, uTime, uSeed;
          varying vec2 vUv; varying vec3 vWorld;
          ${NOISE_GLSL}
          void main() {
            float n = fbm(vec2(vUv.x * 7.0 + uTime * 0.025 + uSeed, vUv.y * 2.2 - uTime * 0.01));
            float a = smoothstep(0.3, 0.8, n) * smoothstep(1.0, 0.15, vUv.y) * smoothstep(0.0, 0.2, vUv.y);
            a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            vec3 v = normalize(vWorld - cameraPosition);
            float glow = pow(max(dot(v, uSun), 0.0), 6.0);
            gl_FragColor = vec4(uColor + uSunCol * glow * 0.25, a * uAlpha);
          }`,
      }),
    );
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(w, h * 2, 1);
    m.position.set(0, ctx.heightAt(0, z) + h * 0.6, z);
    ctx.group.add(m);
  });
}

/** 비: 빗줄기 선분과 바닥에서 튀는 물방울 */
export function buildRain(ctx: BuildCtx): void {
  const p = ctx.p;
  const count = Math.round(4200 * p.rain * (0.5 + ctx.q.particles * 0.5));
  const pos = new Float32Array(count * 2 * 3);
  const end = new Float32Array(count * 2);
  const rnd = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 56;
    const y = Math.random() * 24;
    const z = -26 + Math.random() * 36;
    const r = Math.random();
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.set([x, y, z], j * 3);
      end[j] = k;
      rnd[j] = r;
    }
  }
  const geo = ctx.track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...ctx.shared(), uIntensity: { value: p.rain } },
      vertexShader: /* glsl */ `
        attribute float aEnd; attribute float aRand;
        uniform float uTime;
        varying float vA;
        void main() {
          vec3 p = position;
          float speed = 17.0 + aRand * 9.0;
          float y = mod(p.y - uTime * speed, 24.0);
          float len = 0.5 + aRand * 0.6;
          p.y = y - aEnd * len;
          p.x += -0.14 * aEnd * len + y * 0.06;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (1.0 - aEnd * 0.9) * (0.16 + aRand * 0.3) * smoothstep(60.0, 8.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity, uFlash;
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.62, 0.7, 0.85) * (1.0 + uFlash * 2.0), vA * uIntensity); }`,
    }),
  );
  const rain = new THREE.LineSegments(geo, mat);
  rain.frustumCulled = false;
  ctx.group.add(rain);

  // 튀는 물방울: 바닥 위 무작위 점이 짧게 번쩍인다
  const n = Math.round(900 * ctx.q.particles);
  const sp = new Float32Array(n * 3);
  const sr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sp.set([(Math.random() - 0.5) * 40, 0.04, -24 + Math.random() * 32], i * 3);
    sr[i] = Math.random();
  }
  const sg = ctx.track(new THREE.BufferGeometry());
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aRand', new THREE.BufferAttribute(sr, 1));
  const sm = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...ctx.shared(), uMap: { value: fxTexture('soft') } },
      vertexShader: /* glsl */ `
        attribute float aRand; uniform float uTime; varying float vA;
        void main() {
          float ph = fract(uTime * (1.6 + aRand) + aRand * 13.0);
          vec3 p = position + vec3(0.0, ph * 0.18, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.0 - ph) * 70.0 / -mv.z;
          vA = (1.0 - ph) * 0.3;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.7, 0.8, 0.95), texture2D(uMap, gl_PointCoord).a * vA); }`,
    }),
  );
  const splashes = new THREE.Points(sg, sm);
  splashes.frustumCulled = false;
  ctx.group.add(splashes);
}

/** 떠다니는 입자: 재, 불씨, 눈, 꽃가루·먼지, 모래바람 */
export function buildParticles(ctx: BuildCtx): void {
  const p = ctx.p;
  const n = Math.round(p.particles.count * (0.4 + ctx.q.particles * 0.6));
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 44, Math.random() * 14, -18 + Math.random() * 28], i * 3);
    rnd[i] = Math.random();
  }
  const geo = ctx.track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const kind = { ash: 0, embers: 1, snow: 2, motes: 3, dust: 4, none: 0 }[p.particles.kind];
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: kind === 1 || kind === 3 ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { ...ctx.shared(), uColor: { value: new THREE.Color(p.particles.color) }, uKind: { value: kind }, uMap: { value: fxTexture('soft') } },
      vertexShader: /* glsl */ `
        attribute float aRand;
        uniform float uTime, uKind;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * (0.25 + aRand * 0.35);
          if (uKind == 4.0) {
            p.x = mod(p.x + uTime * (6.0 + aRand * 6.0) + 22.0, 44.0) - 22.0;
            p.y = mod(p.y * 0.35 + sin(t * 3.0 + aRand * 9.0) * 0.4, 5.0);
          } else {
            float dir = (uKind == 1.0 || uKind == 3.0) ? 1.0 : -1.0;
            float speed = uKind == 2.0 ? 1.1 : (uKind == 3.0 ? 0.22 : 0.6);
            p.y = mod(p.y + dir * t * speed * 4.0, 14.0);
            p.x += sin(t * 2.0 + aRand * 20.0) * 0.6 + (uKind == 2.0 ? t * 0.8 : 0.0);
          }
          p.z += cos(t * 1.5 + aRand * 13.0) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float size = uKind == 1.0 ? 0.09 : (uKind == 2.0 ? 0.12 : (uKind == 3.0 ? 0.06 : (uKind == 4.0 ? 0.06 : 0.08)));
          gl_PointSize = size * (0.6 + aRand) * 600.0 / -mv.z;
          float top = uKind == 4.0 ? 5.0 : 14.0;
          vA = smoothstep(0.0, 1.0, p.y) * smoothstep(top, top * 0.7, p.y) * (0.35 + 0.35 * sin(uTime * 3.0 + aRand * 40.0) + 0.3);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform sampler2D uMap;
        varying float vA;
        void main() { gl_FragColor = vec4(uColor, texture2D(uMap, gl_PointCoord).a * vA); }`,
    }),
  );
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.group.add(pts);

  if (kind === 4) buildSandSheets(ctx);
}

/** 모래바람: 지면을 쓸고 지나가는 반투명 모래 막 */
function buildSandSheets(ctx: BuildCtx): void {
  const geo = ctx.track(new THREE.PlaneGeometry(1, 1));
  for (let i = 0; i < 3; i++) {
    const mat = ctx.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { ...ctx.shared(), uColor: { value: new THREE.Color(0xe8c898) }, uSeed: { value: i * 5.0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uTime, uSeed;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vec2(vUv.x * 10.0 - uTime * (0.9 + uSeed * 0.05), vUv.y * 3.0);
            float n = fbm(p + fbm(p * 0.7 + uSeed));
            float a = smoothstep(0.45, 0.85, n) * smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.1, vUv.y);
            a *= smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
            gl_FragColor = vec4(uColor, a * 0.32);
          }`,
      }),
    );
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(120, 2.4 + i, 1);
    m.position.set(0, 1 + i * 0.4, -6 - i * 9);
    ctx.group.add(m);
  }
}
