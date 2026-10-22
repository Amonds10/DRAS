import * as THREE from 'three';
import type { BuildCtx } from './context';
import { detailMaps, type DetailKind } from './maps';
import { fbm2, ridged2, smoothstep } from './noise';
import type { TerrainKind } from './presets';

/** 지형 범위: 무대(원점) 뒤로 길게 뻗는다. 카메라 뒤쪽은 거의 보이지 않는다. */
const X0 = -320, X1 = 320, Z0 = -380, Z1 = 40;

/** 무대 주변은 평평하게: 0(무대) ~ 1(먼 곳) */
function openness(x: number, z: number, inner = 13, outer = 36): number {
  const e = Math.hypot(x / 1.7, Math.min(z + 1, 0) * 1 + Math.max(z + 1, 0) * 0.5);
  return smoothstep(inner, outer, e);
}

/** 발밑 미세한 굴곡(무대 원 안은 0) */
function bumps(x: number, z: number, amp: number): number {
  const e = Math.hypot(x / 1.4, z + 0.5);
  return (fbm2(x * 0.18, z * 0.18, 3, 5) - 0.5) * amp * smoothstep(8, 13, e);
}

export function heightFn(kind: TerrainKind): (x: number, z: number) => number {
  switch (kind) {
    case 'hills':
      return (x, z) => {
        const m = openness(x, z);
        const hills = (fbm2(x * 0.011, z * 0.011, 5, 1) * 20 - 5) * m + smoothstep(30, 90, -z) * 6;
        const far = smoothstep(150, 260, -z) * (ridged2(x * 0.005 + 3, z * 0.005, 5, 2) * 70);
        return Math.max(hills, -2) + far + bumps(x, z, 0.35);
      };
    case 'dunes':
      return (x, z) => {
        const m = openness(x, z, 14, 40);
        const warp = fbm2(x * 0.008, z * 0.008, 3, 4) * 4;
        const u = (x * 0.55 - z * 0.83) / 46 + warp;
        const tri = Math.abs((u - Math.floor(u)) - 0.5) * 2; // 0 골, 1 마루
        // 바람 맞는 쪽은 완만, 반대쪽은 가파른 비대칭 사구
        const crest = Math.pow(tri, 1.8);
        const amp = 9 + smoothstep(60, 200, -z) * 22;
        return m * crest * amp * (0.55 + 0.45 * fbm2(x * 0.01, z * 0.01, 3, 6)) + bumps(x, z, 0.15);
      };
    case 'mountains':
      return (x, z) => {
        const m = openness(x, z);
        const mid = fbm2(x * 0.014, z * 0.014, 4, 7) * 7 * m;
        const far = smoothstep(90, 200, -z) * Math.pow(ridged2(x * 0.0055 + 1, z * 0.0055, 6, 8), 1.4) * 120;
        return mid + far + bumps(x, z, 0.25);
      };
    case 'headland':
      return (x, z) => {
        // 대부분 물 아래. 왼쪽과 오른쪽 먼 곳에 곶, 수평선 근처에 낮은 섬
        const w = fbm2(x * 0.01, z * 0.01, 4, 9) * 50;
        const left = smoothstep(-70, -130, x + w) * smoothstep(40, 140, -z);
        const right = smoothstep(110, 170, x - w) * smoothstep(80, 200, -z);
        const far = smoothstep(280, 340, -z) * 0.4;
        const land = Math.max(left, right, far);
        return -7 + land * (12 + ridged2(x * 0.012, z * 0.012, 5, 10) * 46);
      };
    case 'island':
      return (x, z) => {
        const r = Math.hypot(x / 1.35, z + 2);
        const a = Math.atan2(z, x);
        const R = 21 + (fbm2(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 4, 11) - 0.5) * 16;
        if (r <= R) return bumps(x, z, 0.3) + smoothstep(R - 6, R, r) * -0.6;
        return -Math.min(90, (r - R) * 4 + fbm2(x * 0.08, z * 0.08, 4, 12) * 14);
      };
    case 'none':
      return () => 0;
  }
}

const DETAIL: Record<string, DetailKind> = { grass: 'grass', sand: 'sand', snow: 'snow', stone: 'flagstone', water: 'rock', asphalt: 'asphalt' };

/** 높이맵 지형 메시. 높이 함수를 돌려줘 소품 배치에 쓴다. */
export function buildTerrain(ctx: BuildCtx): (x: number, z: number) => number {
  const p = ctx.p;
  const h = heightFn(p.terrain);
  if (p.terrain === 'none') return h;
  const island = p.terrain === 'island';
  const x0 = island ? -140 : X0, x1 = island ? 140 : X1, z0 = island ? -140 : Z0, z1 = island ? 40 : Z1;
  const W = x1 - x0, D = z1 - z0;
  const seg = ctx.q.terrainSeg;
  const sx = Math.round((island ? 220 : 320) * seg), sz = Math.round((island ? 150 : 210) * seg);
  const geo = new THREE.PlaneGeometry(W, D, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, h(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;

  // 정점색: 높이와 경사로 낮은 곳/높은 곳/가파른 곳을 섞고 노이즈로 얼룩을 준다.
  const low = new THREE.Color(p.palette.low), high = new THREE.Color(p.palette.high), steep = new THREE.Color(p.palette.steep);
  const accent = p.palette.accent !== undefined ? new THREE.Color(p.palette.accent) : null;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const hiRange = { hills: [0, 30], dunes: [0, 14], mountains: [10, 80], headland: [0, 40], island: [-20, 0], none: [0, 1] }[p.terrain];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    c.copy(low).lerp(high, smoothstep(hiRange[0], hiRange[1], y));
    const n = fbm2(x * 0.05, z * 0.05, 3, 21);
    if (accent) c.lerp(accent, smoothstep(0.55, 0.75, n) * 0.6);
    const slope = 1 - nrm.getY(i);
    const steepK = p.terrain === 'mountains' ? smoothstep(0.18, 0.4, slope) : p.terrain === 'dunes' ? smoothstep(0.2, 0.5, slope) * 0.5 : smoothstep(0.25, 0.55, slope);
    c.lerp(steep, steepK);
    // 사구는 바람받이(햇빛 쪽) 경사를 살짝 밝게
    if (p.terrain === 'mountains' && y > 40) c.lerp(high, smoothstep(0.2, 0.0, slope) * 0.8);
    c.multiplyScalar(0.88 + (fbm2(x * 0.21, z * 0.21, 2, 22) - 0.5) * 0.22 + (n - 0.5) * 0.16);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

  const d = detailMaps(DETAIL[p.ground.kind] ?? 'rock');
  const tile = p.ground.kind === 'stone' ? 3.2 : p.ground.kind === 'sand' ? 6 : 4.5;
  const map = d.map.clone();
  const normalMap = d.normal.clone();
  for (const t of [map, normalMap]) {
    t.repeat.set(W / tile, D / tile);
    t.needsUpdate = true;
    ctx.track(t);
  }
  const rough = { grass: 0.95, sand: 0.92, snow: 0.62, stone: 0.7, water: 0.9, asphalt: 0.6 }[p.ground.kind];
  const mat = ctx.track(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map,
      normalMap,
      normalScale: new THREE.Vector2(1, 1).multiplyScalar(p.ground.kind === 'sand' ? 0.45 : p.ground.kind === 'snow' ? 0.5 : 1.0),
      roughness: rough,
      metalness: 0,
    }),
  );
  const mesh = new THREE.Mesh(ctx.track(geo), mat);
  mesh.receiveShadow = ctx.q.shadows;
  ctx.group.add(mesh);
  return h;
}
