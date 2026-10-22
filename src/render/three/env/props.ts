import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildCtx } from './context';
import { detailMaps } from './maps';
import { fbm3, lcg, noise3, smoothstep } from './noise';

// ───────── 형태 생성기 ─────────

/** 정점색을 넣는다. fn은 (위치, 노멀) → 색 */
function paint(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    fn(p, n, c);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

/** 원통 좌표로 UV를 다시 준다(노멀 맵용) */
function cylUv(geo: THREE.BufferGeometry, sx = 2, sy = 1): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    uv[i * 2] = (a / (Math.PI * 2) + 0.5) * sx;
    uv[i * 2 + 1] = pos.getY(i) * sy;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function smoothGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  g.dispose();
  return m;
}

/** 바위: 노이즈로 일그러뜨린 20면체. 바닥은 눌러 땅에 앉힌다. */
export function rockGeometry(seed: number, detail: number, tone: { base: number; top?: number; topAmount?: number }): THREE.BufferGeometry {
  const g = smoothGeo(new THREE.IcosahedronGeometry(1, detail));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const disp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 1.1 + seed, v.y * 1.1, v.z * 1.1 - seed, 5, seed);
    const sharp = Math.abs(noise3(v.x * 2.4 + seed, v.y * 2.4, v.z * 2.4, seed + 3) - 0.5);
    const r = 0.72 + n * 0.55 - sharp * 0.25;
    disp[i] = r;
    v.multiplyScalar(r);
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  cylUv(g, 2, 1);
  const base = new THREE.Color(tone.base);
  const top = tone.top !== undefined ? new THREE.Color(tone.top) : null;
  let i = 0;
  paint(g, (p, n, c) => {
    const crevice = smoothstep(0.75, 1.05, disp[i++]);
    c.copy(base).multiplyScalar(0.55 + crevice * 0.55 + (noise3(p.x * 6, p.y * 6, p.z * 6, seed) - 0.5) * 0.25);
    if (top) c.lerp(top, smoothstep(0.35, 0.75, n.y) * (tone.topAmount ?? 1));
  });
  return g;
}

interface ColumnOpts {
  radial: number;
  rings: number;
  seed: number;
  rough: number;
  taper: number;
  strata?: number;
  /** 지층 턱의 깊이(기본: rough의 0.6배) */
  ledge?: number;
  flutes?: number;
  topJag?: number;
  colors: number[];
}

/** 기둥형: 바다 바위 기둥, 메사, 신전 기둥. 높이 0~1, 반지름 1. */
export function columnGeometry(o: ColumnOpts): THREE.BufferGeometry {
  const g = smoothGeo(new THREE.CylinderGeometry(1, 1, 1, o.radial, o.rings, false).translate(0, 0.5, 0));
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r0 = Math.hypot(x, z);
    if (r0 < 1e-4) {
      if (o.topJag && y > 0.99) pos.setY(i, 1 - o.topJag * 0.5);
      continue;
    }
    const a = Math.atan2(z, x);
    let r = 1 - o.taper * y;
    r += (fbm3(Math.cos(a) * 1.6 + o.seed, y * 2.5, Math.sin(a) * 1.6, 4, o.seed) - 0.5) * o.rough;
    if (o.strata) r += (noise3(0, Math.floor(y * o.strata) * 3.1, o.seed, o.seed + 1) - 0.5) * (o.ledge ?? o.rough * 0.6);
    if (o.flutes) r += Math.cos(a * o.flutes) * 0.035;
    let yy = y;
    if (o.topJag && y > 0.99) yy = 1 - noise3(Math.cos(a) * 2, o.seed, Math.sin(a) * 2, o.seed + 5) * o.topJag;
    pos.setXYZ(i, (x / r0) * r * (r0 > 0.999 ? 1 : r0), yy, (z / r0) * r * (r0 > 0.999 ? 1 : r0));
  }
  g.computeVertexNormals();
  cylUv(g, 3, 2);
  const cols = o.colors.map((c) => new THREE.Color(c));
  paint(g, (p, n, c) => {
    const band = o.strata ? Math.floor(p.y * o.strata + noise3(p.x * 2, p.y, p.z * 2, o.seed) * 1.2) : 0;
    c.copy(cols[Math.abs(band) % cols.length]);
    c.multiplyScalar(0.8 + noise3(p.x * 5, p.y * 9, p.z * 5, o.seed + 9) * 0.35);
    if (n.y > 0.6) c.multiplyScalar(1.12);
  });
  return g;
}

/** 활엽수: 줄기 + 노이즈로 일그러진 수관 여러 덩이 */
function broadleafGeometry(seed: number): THREE.BufferGeometry {
  const rand = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 1.6 + rand() * 0.8;
  const trunk = new THREE.CylinderGeometry(0.11, 0.2, trunkH, 7, 3).translate(0, trunkH / 2, 0);
  trunk.deleteAttribute('uv');
  paint(trunk, (_p, _n, c) => c.setRGB(0.09, 0.065, 0.045));
  parts.push(trunk);
  const blobs = 4 + Math.floor(rand() * 3);
  for (let b = 0; b < blobs; b++) {
    const s = 0.9 + rand() * 0.7;
    const ox = (rand() - 0.5) * 1.6, oz = (rand() - 0.5) * 1.4, oy = trunkH + 0.4 + rand() * 1.4;
    const g = smoothGeo(new THREE.IcosahedronGeometry(1, 2));
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(0.8 + fbm3(v.x * 1.8 + b, v.y * 1.8, v.z * 1.8, 3, seed + b) * 0.45);
      v.y *= 0.82;
      pos.setXYZ(i, v.x * s + ox, v.y * s + oy, v.z * s + oz);
    }
    g.computeVertexNormals();
    parts.push(g);
  }
  const merged = mergeGeometries(
    parts.map((p, i) => {
      if (i > 0) {
        // 수관: 아래와 안쪽은 어둡게(가림), 위는 밝게, 군데군데 노란 잎
        paint(p, (q, n, c) => {
          const up = smoothstep(-0.6, 0.9, n.y);
          const hue = noise3(q.x * 0.9, q.y * 0.9, q.z * 0.9, seed + i);
          c.setRGB(0.07 + hue * 0.05, 0.13 + hue * 0.05, 0.035).multiplyScalar(0.45 + up * 0.9);
        });
      }
      return p;
    }),
  )!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/** 침엽수: 들쭉날쭉한 원뿔 여러 단, 위쪽 면에 눈 */
function pineGeometry(seed: number, snow: boolean): THREE.BufferGeometry {
  const rand = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.08, 0.14, 1.2, 6).translate(0, 0.6, 0);
  trunk.deleteAttribute('uv');
  paint(trunk, (_p, _n, c) => c.setRGB(0.07, 0.05, 0.04));
  parts.push(trunk);
  const tiers = 4 + Math.floor(rand() * 2);
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const r = 1.35 * (1 - k * 0.75);
    const hgt = 1.5 * (1 - k * 0.3);
    const g = new THREE.ConeGeometry(r, hgt, 11, 2).translate(0, 0.8 + t * 0.95 + hgt / 2, 0);
    g.deleteAttribute('uv');
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const jag = 0.8 + noise3(Math.cos(a) * 3, t * 2.3, Math.sin(a) * 3, seed) * 0.45;
      pos.setX(i, x * jag);
      pos.setZ(i, z * jag);
    }
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    parts.push(flat);
  }
  const merged = mergeGeometries(
    parts.map((p, i) => {
      if (i > 0) {
        paint(p, (_q, n, c) => {
          c.setRGB(0.03, 0.075, 0.06).multiplyScalar(0.7 + smoothstep(-0.5, 0.6, n.y) * 0.6);
          if (snow) c.lerp(new THREE.Color(0.85, 0.9, 0.98), smoothstep(0.25, 0.65, n.y) * 0.9);
        });
      }
      return p.index ? p.toNonIndexed() : p;
    }),
  )!;
  parts.forEach((p) => p.dispose());
  return merged;
}

/** 떠 있는 섬: 윗면은 평평한 땅, 아래는 불규칙하게 늘어진 바위 덩어리 */
function islandGeometry(seed: number, top: number, rock: number): THREE.BufferGeometry {
  const g = smoothGeo(new THREE.IcosahedronGeometry(1, 4));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4, 5, seed);
    v.multiplyScalar(0.75 + n * 0.5);
    if (v.y > 0.15) v.y = 0.15 + (v.y - 0.15) * 0.12;
    else {
      // 아래로 갈수록 가늘고 길게, 몇 갈래는 더 처진다
      const drip = Math.pow(noise3(v.x * 2.2, 0, v.z * 2.2, seed + 3), 2) * 2.2;
      v.y = v.y * (1.5 + drip);
      const pinch = 1 / (1 + Math.max(0, -v.y) * 0.35);
      v.x *= pinch;
      v.z *= pinch;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  cylUv(g, 3, 1);
  const tc = new THREE.Color(top), rc = new THREE.Color(rock);
  paint(g, (p, n, c) => {
    c.copy(rc).multiplyScalar(0.55 + noise3(p.x * 4, p.y * 6, p.z * 4, seed) * 0.6);
    c.lerp(tc, smoothstep(0.55, 0.85, n.y));
  });
  return g;
}

// ───────── 재질 ─────────

/** 바람에 흔들리는 표준 재질(나무, 풀 덤불) */
function windMaterial(ctx: BuildCtx, amp: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = ctx.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...extra }));
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
      transformed.x += sin(uTime * 1.3 + ip.x * 0.35 + ip.z * 0.2) * ${amp.toFixed(3)} * sway * gust;
      transformed.z += cos(uTime * 1.07 + ip.x * 0.21) * ${(amp * 0.5).toFixed(3)} * sway * gust;`,
    );
  };
  return mat;
}

function rockMaterial(ctx: BuildCtx, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const d = detailMaps('rock');
  return ctx.track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, normalMap: d.normal, normalScale: new THREE.Vector2(1.2, 1.2), ...extra }));
}

interface Inst {
  pos: [number, number, number];
  scale: [number, number, number];
  rotY?: number;
  tilt?: number;
  roll?: number;
  tint?: number;
}

function instanced(ctx: BuildCtx, geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], shadow = true): THREE.InstancedMesh | null {
  if (!list.length) return null;
  ctx.track(geo);
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  list.forEach((it, i) => {
    e.set(it.tilt ?? 0, it.rotY ?? 0, it.roll ?? 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...it.pos), q, new THREE.Vector3(...it.scale));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(it.tint ?? 0xffffff));
  });
  mesh.castShadow = shadow && ctx.q.shadows;
  mesh.receiveShadow = ctx.q.shadows;
  mesh.computeBoundingSphere();
  ctx.group.add(mesh);
  return mesh;
}

/** 무대와 카메라 사이는 비워 둔다 */
function clearOfStage(x: number, z: number, pad = 0): boolean {
  if (z > 6) return false;
  return Math.hypot(x / 1.6, z + 1) > 11 + pad;
}

// ───────── 장면별 배치 ─────────

export function buildProps(ctx: BuildCtx): void {
  const p = ctx.p;
  const rand = lcg(ctx.id.charCodeAt(0) * 131 + ctx.id.length * 7 + 3);
  const r = (a: number, b: number) => a + rand() * (b - a);
  const hAt = ctx.heightAt;
  const detail = ctx.q.rockDetail;

  /** 바위 흩뿌리기: 변형 4종을 나눠 쓴다 */
  const scatterRocks = (count: number, area: { x: [number, number]; z: [number, number] }, size: [number, number], tone: { base: number; top?: number; topAmount?: number }, sink = 0.25) => {
    const variants = [0, 1, 2, 3].map(() => [] as Inst[]);
    for (let k = 0; k < count; k++) {
      const x = r(...area.x), z = r(...area.z);
      if (!clearOfStage(x, z, 1)) continue;
      const s = r(...size);
      variants[k % 4].push({ pos: [x, hAt(x, z) - s * sink, z], scale: [s * r(0.8, 1.4), s * r(0.6, 1), s * r(0.8, 1.3)], rotY: r(0, 6.28), tint: new THREE.Color(1, 1, 1).multiplyScalar(r(0.8, 1.1)).getHex() });
    }
    const mat = rockMaterial(ctx);
    variants.forEach((list, v) => instanced(ctx, rockGeometry(v * 7.3 + ctx.id.length, detail, tone), mat, list));
  };

  switch (p.scenery) {
    case 'coast': {
      // 바다에서 솟은 바위 기둥들과 그 둘레의 작은 바위
      const stacks: Inst[] = [];
      for (const [x, z, h, w] of [[-34, -46, 24, 6], [-24, -70, 16, 4.5], [-52, -86, 30, 7], [30, -54, 20, 5], [44, -40, 11, 3.5], [18, -96, 26, 6.5], [62, -84, 18, 5], [-8, -130, 14, 5]] as const) {
        stacks.push({ pos: [x, -3, z], scale: [w, h + 3, w * r(0.8, 1.1)], rotY: r(0, 6.28) });
      }
      const stackGeo = columnGeometry({ radial: 32, rings: 48, seed: 4, rough: 0.6, taper: 0.3, strata: 14, ledge: 0.1, topJag: 0.22, colors: [0x4a3c3a, 0x56463f, 0x40363a, 0x5e4c46] });
      instanced(ctx, stackGeo, rockMaterial(ctx), stacks);
      scatterRocks(40, { x: [-70, 70], z: [-110, -18] }, [0.8, 3], { base: 0x4a3e3c }, 0.45);
      break;
    }
    case 'meadow': {
      // 활엽수 숲 띠: 앞줄은 듬성듬성, 뒤로 갈수록 빽빽
      const n = Math.round(110 * ctx.q.trees);
      const variants = [0, 1, 2].map(() => [] as Inst[]);
      for (let k = 0; k < n; k++) {
        const z = -r(22, 95);
        const x = r(-70, 70) * (1 + (-z - 22) / 80);
        if (!clearOfStage(x, z, 4)) continue;
        if (Math.abs(x) < 9 && z > -40) continue;
        const s = r(0.9, 1.5) * (1 + (-z - 22) / 160);
        const g = r(0.85, 1.1);
        variants[k % 3].push({ pos: [x, hAt(x, z) - 0.1, z], scale: [s, s * r(0.9, 1.2), s], rotY: r(0, 6.28), tint: new THREE.Color(g, g * r(0.95, 1.05), g * 0.95).getHex() });
      }
      const mat = windMaterial(ctx, 0.05);
      variants.forEach((list, v) => instanced(ctx, broadleafGeometry(11 + v * 5), mat, list));
      // 선돌 고리
      const stones: Inst[] = [];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const x = -21 + Math.cos(a) * 5.5, z = -30 + Math.sin(a) * 3.2;
        if (k === 4) continue;
        stones.push({ pos: [x, hAt(x, z) - 0.3, z], scale: [0.9, r(2.6, 4), 0.55], rotY: a + Math.PI / 2, tilt: r(-0.06, 0.06), roll: r(-0.08, 0.08) });
      }
      const stoneGeo = columnGeometry({ radial: 8, rings: 10, seed: 9, rough: 0.25, taper: 0.2, topJag: 0.12, colors: [0x6a6a66, 0x5e605a] });
      instanced(ctx, stoneGeo, rockMaterial(ctx), stones);
      scatterRocks(26, { x: [-50, 50], z: [-60, -14] }, [0.4, 1.4], { base: 0x6a6862, top: 0x4a5a2a, topAmount: 0.7 }, 0.4);
      break;
    }
    case 'dunes': {
      // 바람에 깎인 지층 바위 대지(메사)
      const mesas: Inst[] = [];
      for (const [x, z, w, h] of [[-46, -96, 18, 15], [-20, -140, 26, 11], [40, -88, 14, 19], [70, -126, 24, 13], [8, -190, 34, 9], [-90, -150, 22, 16]] as const) {
        mesas.push({ pos: [x, hAt(x, z) - 2, z], scale: [w, h, w * r(0.6, 0.8)], rotY: r(0, 6.28) });
      }
      const mesaGeo = columnGeometry({ radial: 30, rings: 28, seed: 21, rough: 0.35, taper: 0.22, strata: 7, colors: [0xb8784a, 0xd09a66, 0x9a5e3a, 0xc88a5a] });
      instanced(ctx, mesaGeo, rockMaterial(ctx, { roughness: 0.95 }), mesas);
      scatterRocks(22, { x: [-50, 50], z: [-50, -16] }, [0.5, 2.2], { base: 0x9a6a46, top: 0xd8b07c, topAmount: 0.5 }, 0.5);
      break;
    }
    case 'snowfield': {
      // 침엽수 군락: 노이즈로 숲 덩어리를 만든다
      const n = Math.round(420 * ctx.q.trees);
      const variants = [0, 1, 2].map(() => [] as Inst[]);
      for (let k = 0; k < n; k++) {
        const z = -r(20, 120);
        const x = r(-90, 90) * (1 + (-z - 20) / 120);
        if (!clearOfStage(x, z, 3)) continue;
        if (Math.abs(x) < 10 && z > -36) continue;
        if (fbm3(x * 0.03, 0, z * 0.03, 3, 7) < 0.45) continue;
        const s = r(0.8, 1.7) * (1 + (-z - 20) / 200);
        variants[k % 3].push({ pos: [x, hAt(x, z) - 0.2, z], scale: [s, s * r(0.9, 1.3), s], rotY: r(0, 6.28), tint: new THREE.Color(1, 1, 1).multiplyScalar(r(0.8, 1.05)).getHex() });
      }
      const mat = windMaterial(ctx, 0.02);
      variants.forEach((list, v) => instanced(ctx, pineGeometry(31 + v * 3, true), mat, list));
      scatterRocks(18, { x: [-50, 50], z: [-50, -16] }, [0.6, 2], { base: 0x3a4650, top: 0xe4eef8, topAmount: 1 }, 0.4);
      break;
    }
    case 'skyruins': {
      // 섬 둘레의 부러진 기둥(몇 개는 쓰러져 있다)
      const pillars: Inst[] = [];
      const plinths: Inst[] = [];
      const ring: [number, number, number, number][] = [[-22, -18, 9, 0], [-14, -26, 6, 0], [-30, -10, 12, 0], [18, -22, 7, 0], [27, -12, 10, 0], [8, -30, 4, 0], [-6, -24, 3.5, 1.45], [34, -24, 3.5, 1.5]];
      for (const [x, z, h, fall] of ring) {
        const y = hAt(x, z);
        if (fall) pillars.push({ pos: [x, y + 0.9, z], scale: [0.9, h * 2.2, 0.9], rotY: r(0, 6.28), roll: fall });
        else {
          pillars.push({ pos: [x, y + 0.5, z], scale: [0.85, h, 0.85], rotY: r(0, 6.28), tilt: r(-0.05, 0.05) });
          plinths.push({ pos: [x, y - 0.6, z], scale: [1.4, 1.1, 1.4], rotY: r(0, 6.28) });
        }
      }
      const pillarGeo = columnGeometry({ radial: 32, rings: 12, seed: 5, rough: 0.05, taper: 0.06, flutes: 18, topJag: 0.35, colors: [0x8a7a72, 0x7a6c66] });
      const stoneMat = rockMaterial(ctx, { roughness: 0.75 });
      instanced(ctx, pillarGeo, stoneMat, pillars);
      const plinthGeo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).translate(0, 0.5, 0);
      paint(plinthGeo, (q, _n, c) => c.setRGB(0.24, 0.2, 0.19).multiplyScalar(0.8 + noise3(q.x * 4, q.y * 4, q.z * 4, 2) * 0.4));
      instanced(ctx, plinthGeo, stoneMat, plinths);
      // 떠 있는 섬: 천천히 오르내린다
      const isles: Inst[] = [];
      for (const [x, y, z, s] of [[-52, 12, -110, 5.5], [-14, 21, -160, 8], [40, 14, -120, 5], [80, 25, -175, 10], [14, 6, -78, 2.2], [-95, 17, -150, 7], [115, 9, -130, 4.5], [-30, 30, -210, 9]] as const) {
        isles.push({ pos: [x, y, z], scale: [s * 1.4, s, s * 1.1], rotY: r(0, 6.28) });
      }
      const isleMesh = instanced(ctx, islandGeometry(3, 0x5a2a20, 0x2e1c1c), rockMaterial(ctx), isles, false);
      if (isleMesh) {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
        const base = isles.map((it) => it.pos[1]);
        ctx.onUpdate((t) => {
          isles.forEach((_it, i) => {
            isleMesh.getMatrixAt(i, m);
            m.decompose(pos, q, sc);
            pos.y = base[i] + Math.sin(t * 0.25 + i * 1.7) * 0.6;
            m.compose(pos, q, sc);
            isleMesh.setMatrixAt(i, m);
          });
          isleMesh.instanceMatrix.needsUpdate = true;
        });
      }
      scatterRocks(28, { x: [-30, 30], z: [-26, -12] }, [0.4, 1.4], { base: 0x4a3432 }, 0.4);
      break;
    }
    case 'neon':
      break;
  }
}
