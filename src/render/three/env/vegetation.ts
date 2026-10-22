import * as THREE from 'three';
import type { BuildCtx } from './context';
import { NOISE_GLSL } from './glsl';
import { fbm2, lcg } from './noise';

interface GrassStyle {
  count: number;
  base: number;
  tip: number;
  height: [number, number];
  /** 0이면 고르게, 클수록 덤불처럼 뭉친다 */
  clump: number;
  flowers: number;
}

function styleFor(ctx: BuildCtx): GrassStyle | null {
  const g = ctx.q.grass;
  switch (ctx.p.scenery) {
    case 'meadow':
      return { count: g, base: 0x24401a, tip: 0x88a852, height: [0.2, 0.45], clump: 0, flowers: Math.round(g * 0.03) };
    case 'dunes':
      return { count: Math.round(g * 0.07), base: 0x6a4a28, tip: 0xe0c890, height: [0.25, 0.55], clump: 0.62, flowers: 0 };
    case 'snowfield':
      return { count: Math.round(g * 0.06), base: 0x2a3028, tip: 0xa8ae98, height: [0.2, 0.45], clump: 0.6, flowers: 0 };
    case 'skyruins':
      return { count: Math.round(g * 0.18), base: 0x1a0c0a, tip: 0x8a4430, height: [0.2, 0.5], clump: 0.5, flowers: 0 };
    default:
      return null;
  }
}

/** 풀잎: 인스턴스 하나가 잎 하나. 바람, 역광 투과, 뿌리 쪽 그늘을 셰이더에서 계산한다. */
export function buildVegetation(ctx: BuildCtx): void {
  const st = styleFor(ctx);
  if (!st || st.count <= 0) return;
  const rand = lcg(ctx.id.length * 977 + 5);
  const p = ctx.p;

  // 잎 하나: 3마디 + 끝점
  const levels = [0, 0.3, 0.62, 1];
  const verts: number[] = [];
  const idx: number[] = [];
  levels.forEach((y, i) => {
    if (i === levels.length - 1) verts.push(0, y, 0);
    else verts.push(-0.5, y, 0, 0.5, y, 0);
  });
  for (let i = 0; i < levels.length - 2; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const t = (levels.length - 2) * 2;
  idx.push(t, t + 1, t + 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);

  const offsets: number[] = [];
  const params: number[] = [];
  let placed = 0;
  for (let tries = 0; placed < st.count && tries < st.count * 6; tries++) {
    const z = -40 + Math.pow(rand(), 0.7) * 52;
    const span = 11 + (12 - z) * 0.5;
    const x = (rand() * 2 - 1) * span;
    if (st.clump > 0 && fbm2(x * 0.09, z * 0.09, 3, 31) < st.clump) continue;
    const e = Math.hypot(x / 1.6, z + 1);
    const trampled = e < 8.5 ? 0.35 + 0.65 * Math.max(0, (e - 5) / 3.5) : 1;
    if (e < 5 && rand() < 0.6) continue;
    const y = ctx.heightAt(x, z);
    if (y < -0.5) continue;
    offsets.push(x, y - 0.02, z);
    // 카메라 바로 앞 풀은 낮게 깎아 무대를 가리지 않게 한다
    const near = z > 1 ? Math.max(0.35, 1 - (z - 1) / 10) : 1;
    const hgt = (st.height[0] + rand() * (st.height[1] - st.height[0])) * trampled * near * (0.8 + fbm2(x * 0.05, z * 0.05, 2, 7) * 0.5);
    params.push(rand() * Math.PI * 2, hgt, 0.04 + rand() * 0.04, rand());
    placed++;
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 4));
  geo.instanceCount = placed;

  const c = (n: number) => new THREE.Color(n);
  const tick = ctx.shared();
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        ...tick,
        uSunDir: { value: ctx.sunDir },
        uSunCol: { value: c(p.sun.color).multiplyScalar(p.sun.intensity * 0.45) },
        uSky: { value: c(p.hemi.sky).multiplyScalar(p.hemi.intensity * 0.55) },
        uGround: { value: c(p.hemi.ground).multiplyScalar(p.hemi.intensity * 0.55) },
        uBase: { value: c(st.base) },
        uTip: { value: c(st.tip) },
        uFogCol: { value: c(p.fog) },
        uFogDensity: { value: p.fogDensity },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;
        attribute vec4 aParams;
        uniform float uTime;
        uniform vec3 uSunDir, uSunCol, uSky, uGround, uBase, uTip;
        uniform float uFogDensity;
        varying vec3 vCol;
        varying float vFog;
        ${NOISE_GLSL}
        void main() {
          float ang = aParams.x, hgt = aParams.y, wid = aParams.z;
          float y = position.y;
          vec3 p = vec3(position.x * wid * (1.0 - y * 0.8), y * hgt, 0.0);
          float c = cos(ang), s = sin(ang);
          vec3 rp = vec3(p.x * c, p.y, p.x * s);
          // 바람: 큰 돌풍 파도 + 잔떨림
          float gust = noise(aOffset.xz * 0.06 + vec2(uTime * 0.45, uTime * 0.12));
          float flutter = sin(uTime * 4.0 + aParams.w * 30.0) * 0.08;
          float bend = (0.15 + gust * 0.85 + flutter) * y * y * hgt;
          rp.x += bend * 0.7;
          rp.y -= bend * bend * 0.3;
          rp.z += bend * 0.2;
          vec3 world = aOffset + rp;
          vec4 mv = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mv;

          // 셀 톤: 빛을 두 단계로 끊고, 뿌리→끝 색도 계단으로
          vec3 n = normalize(vec3(-s, 0.7, c));
          float ndl = abs(dot(n, uSunDir));
          float litStep = ndl > 0.45 ? 1.0 : 0.72;
          float tipStep = y > 0.55 ? 1.0 : (y > 0.25 ? 0.6 : 0.25);
          vec3 albedo = mix(uBase, uTip, tipStep) * (0.9 + aParams.w * 0.18);
          vec3 amb = mix(uGround, uSky, 0.5);
          vCol = albedo * (amb + uSunCol * litStep);
          float d = -mv.z;
          vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogCol;
        varying vec3 vCol;
        varying float vFog;
        void main() { gl_FragColor = vec4(mix(vCol, uFogCol, vFog), 1.0); }`,
    }),
  );
  const mesh = new THREE.Mesh(ctx.track(geo), mat);
  mesh.frustumCulled = false;
  ctx.group.add(mesh);

  if (st.flowers > 0) buildFlowers(ctx, st.flowers, rand);
}

/** 풀 사이 들꽃: 작은 점 */
function buildFlowers(ctx: BuildCtx, n: number, rand: () => number): void {
  const pos: number[] = [];
  const col: number[] = [];
  const palette = [new THREE.Color(0xf4f0e0), new THREE.Color(0xf0d060), new THREE.Color(0xb88ae0), new THREE.Color(0xf0a0b0)];
  for (let i = 0; i < n; i++) {
    const z = -40 + rand() * 50;
    const x = (rand() * 2 - 1) * (12 + (12 - z) * 0.6);
    if (Math.hypot(x / 1.6, z + 1) < 8) continue;
    if (fbm2(x * 0.12, z * 0.12, 3, 41) < 0.5) continue;
    pos.push(x, ctx.heightAt(x, z) + 0.28 + rand() * 0.25, z);
    const c = palette[Math.floor(rand() * palette.length)];
    col.push(c.r, c.g, c.b);
  }
  const geo = ctx.track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      uniforms: { uFogCol: { value: new THREE.Color(ctx.p.fog) }, uFogDensity: { value: ctx.p.fogDensity }, uLight: { value: ctx.p.sun.intensity * 0.12 + 0.2 } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        uniform float uFogDensity, uLight;
        varying vec3 vCol;
        varying float vFog;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 0.05 * 900.0 / -mv.z;
          vCol = color * uLight;
          vFog = 1.0 - exp(-uFogDensity * uFogDensity * mv.z * mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogCol;
        varying vec3 vCol;
        varying float vFog;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          if (dot(q, q) > 0.25) discard;
          gl_FragColor = vec4(mix(vCol, uFogCol, vFog), 1.0);
        }`,
    }),
  );
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.group.add(pts);
}
