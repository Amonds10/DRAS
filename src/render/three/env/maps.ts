import * as THREE from 'three';

/**
 * 절차적 텍스처. 외부 텍스처를 받을 수 없어 시작할 때 노이즈로 굽는다.
 * 모두 이음매 없이 반복되도록 주기를 맞춘 노이즈를 쓴다. 한 번 만들면 계속 재사용한다.
 */

const SIZE = 256;
const cache = new Map<string, THREE.Texture>();

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 주기 period로 반복되는 값 노이즈 */
function tnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = (a: number) => ((a % period) + period) % period;
  const a = hash(m(xi), m(yi), seed), b = hash(m(xi + 1), m(yi), seed);
  const c = hash(m(xi), m(yi + 1), seed), d = hash(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 반복되는 fbm. (x, y)는 0~1 텍스처 좌표. */
function tfbm(x: number, y: number, base: number, octaves: number, seed: number): number {
  let v = 0, a = 0.5, n = 0, f = base;
  for (let i = 0; i < octaves; i++) {
    v += a * tnoise(x * f, y * f, f, seed + i * 7);
    n += a;
    f *= 2;
    a *= 0.5;
  }
  return v / n;
}

/** 반복되는 보로노이: 가장 가까운 점까지 거리와 두 번째 거리의 차(경계에서 0) */
function tvoronoi(x: number, y: number, cells: number, seed: number): { edge: number; id: number } {
  const px = x * cells, py = y * cells;
  const xi = Math.floor(px), yi = Math.floor(py);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const mx = ((cx % cells) + cells) % cells, my = ((cy % cells) + cells) % cells;
      const ox = cx + hash(mx, my, seed), oy = cy + hash(mx, my, seed + 1);
      const d = Math.hypot(px - ox, py - oy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(mx, my, seed + 2);
      } else if (d < d2) d2 = d;
    }
  }
  return { edge: d2 - d1, id };
}

function makeTexture(data: Uint8Array, srgb = false): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 높이 함수 → 노멀 맵 + 밝기 맵 */
function bake(key: string, height: (u: number, v: number) => number, albedo: (u: number, v: number, h: number) => number, strength: number): { map: THREE.Texture; normal: THREE.Texture } {
  const hit = cache.get(key + ':n');
  if (hit) return { map: cache.get(key + ':a')!, normal: hit };
  const H = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) H[y * SIZE + x] = height(x / SIZE, y / SIZE);
  const nrm = new Uint8Array(SIZE * SIZE * 4);
  const alb = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => H[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      nrm[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nrm[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nrm[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;
      const a = Math.max(0, Math.min(1, albedo(x / SIZE, y / SIZE, at(x, y)))) * 255;
      alb[i] = alb[i + 1] = alb[i + 2] = a;
      alb[i + 3] = 255;
    }
  }
  const map = makeTexture(alb);
  const normal = makeTexture(nrm);
  cache.set(key + ':a', map);
  cache.set(key + ':n', normal);
  return { map, normal };
}

export type DetailKind = 'grass' | 'sand' | 'snow' | 'flagstone' | 'rock' | 'leaf' | 'bark' | 'asphalt';

/** 표면 질감: map은 1 근처의 밝기 변화(정점색에 곱한다), normal은 미세한 요철 */
export function detailMaps(kind: DetailKind): { map: THREE.Texture; normal: THREE.Texture } {
  switch (kind) {
    case 'grass':
      return bake(
        kind,
        (u, v) => tfbm(u, v * 1, 16, 4, 3) * 0.6 + tfbm(u * 1, v, 64, 2, 9) * 0.4,
        (u, v, h) => 0.72 + h * 0.3 + (tfbm(u, v, 4, 3, 21) - 0.5) * 0.35,
        5,
      );
    case 'sand':
      // 바람이 만든 물결: 사인 띠를 노이즈로 휘게 한다
      return bake(
        kind,
        (u, v) => {
          const warp = tfbm(u, v, 4, 3, 5) * 6;
          return Math.pow(Math.sin((v * 12 + warp) * Math.PI) * 0.5 + 0.5, 1.6) * 0.6 + tfbm(u, v, 32, 3, 11) * 0.4;
        },
        (u, v, h) => 0.86 + h * 0.12 + (tfbm(u, v, 8, 3, 2) - 0.5) * 0.1,
        6,
      );
    case 'snow':
      return bake(
        kind,
        (u, v) => tfbm(u, v, 8, 5, 4),
        (u, v, h) => 0.9 + h * 0.1 + (hash(Math.floor(u * SIZE), Math.floor(v * SIZE), 77) > 0.996 ? 0.4 : 0),
        3,
      );
    case 'flagstone':
      return bake(
        kind,
        (u, v) => {
          const c = tvoronoi(u, v, 6, 13);
          return Math.min(1, c.edge * 6) * 0.8 + tfbm(u, v, 32, 3, 8) * 0.2;
        },
        (u, v, h) => {
          const c = tvoronoi(u, v, 6, 13);
          return 0.55 + c.id * 0.35 + (h - 0.5) * 0.25 - (c.edge < 0.06 ? 0.3 : 0);
        },
        5,
      );
    case 'rock':
      return bake(
        kind,
        (u, v) => {
          const c = tvoronoi(u, v, 5, 41);
          return tfbm(u, v, 8, 5, 6) * 0.75 + Math.min(1, c.edge * 4) * 0.25;
        },
        (u, v, h) => 0.65 + h * 0.45 + (tfbm(u, v, 3, 3, 19) - 0.5) * 0.3,
        7,
      );
    case 'leaf':
      return bake(
        kind,
        (u, v) => {
          const c = tvoronoi(u, v, 18, 23);
          return Math.min(1, c.edge * 3);
        },
        (u, v) => 0.7 + tvoronoi(u, v, 18, 23).id * 0.45,
        4,
      );
    case 'bark':
      return bake(
        kind,
        (u, v) => tfbm(u * 1, v, 8, 4, 31) * 0.4 + Math.abs(Math.sin((u * 24 + tfbm(u, v, 4, 3, 2) * 3) * Math.PI)) * 0.6,
        (_u, _v, h) => 0.6 + h * 0.4,
        5,
      );
    case 'asphalt':
      return bake(
        kind,
        (u, v) => tfbm(u, v, 64, 2, 51),
        (u, v, h) => 0.8 + h * 0.3 + (tfbm(u, v, 4, 3, 7) - 0.5) * 0.3,
        3,
      );
  }
}

/** Water.js용 물결 노멀 */
export function waterNormals(): THREE.Texture {
  return bake('water', (u, v) => tfbm(u, v, 4, 6, 91) * 0.6 + tfbm(u, v, 16, 3, 92) * 0.4, () => 1, 18).normal;
}
