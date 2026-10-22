/** CPU 쪽 노이즈: 지형 높이, 바위 변위, 정점색에 쓴다. 모두 시드로 결정된다. */

/** 결정적인 난수 */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hash3(x: number, y: number, z: number, seed: number): number {
  return hash2(x + Math.imul(z | 0, 1013), y - Math.imul(z | 0, 7919), seed);
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** 2D 값 노이즈, 0~1 */
export function noise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 3D 값 노이즈, 0~1 */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const l = (dz: number) => {
    const a = hash3(xi, yi, zi + dz, seed), b = hash3(xi + 1, yi, zi + dz, seed);
    const c = hash3(xi, yi + 1, zi + dz, seed), d = hash3(xi + 1, yi + 1, zi + dz, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const z0 = l(0), z1 = l(1);
  return z0 + (z1 - z0) * w;
}

/** 2D 프랙탈 노이즈, 대략 0~1 */
export function fbm2(x: number, y: number, octaves = 5, seed = 0): number {
  let v = 0, a = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2(x, y, seed + i * 17);
    norm += a;
    x = x * 2.03 + 1.7;
    y = y * 2.03 - 3.1;
    a *= 0.5;
  }
  return v / norm;
}

/** 3D 프랙탈 노이즈, 대략 0~1 */
export function fbm3(x: number, y: number, z: number, octaves = 4, seed = 0): number {
  let v = 0, a = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise3(x, y, z, seed + i * 31);
    norm += a;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return v / norm;
}

/** 능선 노이즈: 봉우리가 날카롭다, 0~1 */
export function ridged2(x: number, y: number, octaves = 5, seed = 0): number {
  let v = 0, a = 0.5, norm = 0, w = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2(x, y, seed + i * 13) * 2 - 1);
    n = n * n * w;
    w = Math.min(1, n * 2);
    v += a * n;
    norm += a;
    x *= 2.1;
    y *= 2.1;
    a *= 0.5;
  }
  return v / norm;
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
