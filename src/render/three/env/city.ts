import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { fxTexture } from '../textures';
import { MAX_GROUND_LIGHTS, type BuildCtx } from './context';
import { FOG_GLSL, NOISE_GLSL } from './glsl';
import { lcg } from './noise';

const col = (n: number) => new THREE.Color(n);

/** 운하 위치(무대 뒤를 가로지른다) */
const CANAL = { z0: -27, z1: -19 };

/**
 * 빗속 네온 운하: 젖은 아스팔트(실시간 반사), 운하, 파사드가 있는 건물,
 * 네온 간판, 옥상 안테나, 가로등 빛 원뿔. 가로등과 간판은 바닥 고정 조명으로 등록한다.
 * 등록한 고정 조명 개수를 돌려준다.
 */
export function buildCity(ctx: BuildCtx): number {
  buildBuildings(ctx);
  const signs = buildSigns(ctx);
  const lamps = buildLamps(ctx, signs);
  buildGround(ctx);
  buildRails(ctx);
  return lamps;
}

interface Block {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

function layout(ctx: BuildCtx): Block[] {
  const rand = lcg(4242);
  const r = (a: number, b: number) => a + rand() * (b - a);
  const out: Block[] = [];
  // 운하 건너편 첫 줄은 낮고 촘촘하게, 뒤로 갈수록 높게
  const rows: [number, number, number, [number, number]][] = [
    [-32, 26, 96, [4, 10]],
    [-46, 30, 140, [8, 18]],
    [-66, 36, 200, [12, 30]],
    [-100, 40, 300, [20, 46]],
  ];
  rows.forEach(([z, count, spread, [h0, h1]], row) => {
    for (let k = 0; k < count; k++) {
      const x = (k / count - 0.5) * spread + r(-2, 2);
      const center = Math.abs(x) < 10 + row * 4 ? 0.6 : 1;
      out.push({ x, z: z + r(-3, 3), w: r(4, 8) + row, h: r(h0, h1) * center, d: r(4, 8) });
    }
  });
  // 운하 이쪽 양옆 건물(무대를 감싼다)
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) out.push({ x: side * (17 + k * 6 + r(0, 2)), z: -10 - k * 2.5, w: r(5, 7), h: r(7, 14), d: r(6, 9) });
  }
  void ctx;
  return out;
}

function buildBuildings(ctx: BuildCtx): void {
  const p = ctx.p;
  const blocks = layout(ctx);
  const geo = ctx.track(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const seeds = new Float32Array(blocks.length);
  const mesh = new THREE.InstancedMesh(geo, buildingMaterial(ctx), blocks.length);
  const m = new THREE.Matrix4();
  const rand = lcg(77);
  blocks.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, 0, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    seeds[i] = rand() * 100;
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  ctx.group.add(mesh);

  // 옥상: 실외기, 물탱크, 안테나와 깜빡이는 항공등
  const boxes: THREE.Matrix4[] = [];
  const masts: THREE.Matrix4[] = [];
  const beacons: number[] = [];
  blocks.forEach((b) => {
    if (b.h < 6) return;
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = 0.6 + rand() * 1.4;
      boxes.push(new THREE.Matrix4().compose(new THREE.Vector3(b.x + (rand() - 0.5) * b.w * 0.6, b.h, b.z + (rand() - 0.5) * b.d * 0.6), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s)));
    }
    if (b.h > 14 && rand() < 0.5) {
      const mh = 3 + rand() * 6;
      masts.push(new THREE.Matrix4().compose(new THREE.Vector3(b.x, b.h, b.z), new THREE.Quaternion(), new THREE.Vector3(0.12, mh, 0.12)));
      beacons.push(b.x, b.h + mh, b.z);
    }
  });
  const darkMat = ctx.track(new THREE.MeshBasicMaterial({ color: col(p.props).multiplyScalar(0.8) }));
  for (const [list] of [[boxes], [masts]] as const) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, darkMat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.frustumCulled = false;
    ctx.group.add(im);
  }
  if (beacons.length) {
    const bg = ctx.track(new THREE.BufferGeometry());
    bg.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
    const tick = ctx.shared();
    const bm = ctx.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...tick, uMap: { value: fxTexture('soft') } },
        vertexShader: `uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 900.0 / -mv.z; vA = step(0.55, fract(uTime * 0.7 + position.x * 0.13)); }`,
        fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 0.15, 0.1) * 2.0, texture2D(uMap, gl_PointCoord).a * vA); }`,
      }),
    );
    const pts = new THREE.Points(bg, bm);
    pts.frustumCulled = false;
    ctx.group.add(pts);
  }
}

/** 건물 파사드: 층 띠, 창틀, 창 안쪽 밝기 차이, 1층 상가 불빛 */
function buildingMaterial(ctx: BuildCtx): THREE.ShaderMaterial {
  const p = ctx.p;
  return ctx.track(
    new THREE.ShaderMaterial({
      uniforms: {
        ...ctx.shared(),
        uBase: { value: col(p.props) },
        uWin: { value: col(p.windows) },
        uWinDensity: { value: p.windowDensity },
        uFog: { value: col(p.fog) },
        uFogDensity: { value: p.fogDensity * 0.75 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec3 vLocal;
        varying vec3 vNormalL;
        varying float vSeed;
        varying float vDepth;
        varying float vH;
        void main() {
          vec3 scale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vLocal = vec3((position.x + 0.5) * scale.x, position.y * scale.y, (position.z + 0.5) * scale.z);
          vNormalL = normal;
          vSeed = aSeed;
          vH = scale.y;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uBase, uWin, uFog;
        uniform float uWinDensity, uFogDensity, uTime, uFlash;
        varying vec3 vLocal;
        varying vec3 vNormalL;
        varying float vSeed;
        varying float vDepth;
        varying float vH;
        ${NOISE_GLSL}
        ${FOG_GLSL}
        void main() {
          float tone = 0.75 + 0.5 * hash(vec2(vSeed, 1.7));
          vec3 col = uBase * tone;
          if (abs(vNormalL.y) > 0.5) {
            gl_FragColor = vec4(applyFog(col * 0.8 + uFlash * 0.05, uFog, vDepth, uFogDensity), 1.0);
            return;
          }
          vec2 uv = abs(vNormalL.x) > 0.5 ? vLocal.zy : vLocal.xy;
          // 층 띠와 기둥
          float floorH = 3.4 + floor(hash(vec2(vSeed, 3.1)) * 2.0) * 0.6;
          float bayW = 2.2 + hash(vec2(vSeed, 5.3)) * 1.0;
          // 멀수록 창 하나하나 대신 평균 밝기로(깜빡이는 점무늬 방지)
          float far = smoothstep(22.0, 55.0, vDepth);
          vec2 g = vec2(uv.x / bayW, uv.y / floorH);
          vec2 cell = floor(g);
          vec2 f = fract(g);
          float slab = smoothstep(0.0, 0.04, f.y) * smoothstep(1.0, 0.92, f.y);
          col *= 0.75 + 0.25 * slab;
          col += vec3(0.02, 0.025, 0.035) * (noise(uv * 0.8 + vSeed) - 0.5);
          // 창: 안쪽은 아래가 밝고 위가 어둡다(실내 조명), 일부는 블라인드 줄무늬
          float win = smoothstep(0.12, 0.16, f.x) * smoothstep(0.88, 0.84, f.x) * smoothstep(0.22, 0.26, f.y) * smoothstep(0.86, 0.82, f.y);
          float on = step(1.0 - uWinDensity, hash(cell + vSeed * 13.7));
          float kind = hash(cell * 1.3 + vSeed);
          vec3 wc = kind < 0.45 ? vec3(1.0, 0.72, 0.42) : kind < 0.75 ? vec3(0.55, 0.85, 1.0) : uWin;
          float interior = mix(1.2, 0.55, f.y) * mix(0.5, 1.4, hash(cell * 1.7 + 3.0));
          float blinds = hash(cell + 9.1) < 0.25 ? 0.75 + 0.25 * step(0.5, fract(f.y * 6.0)) : 1.0;
          float flicker = hash(cell + 2.2) < 0.03 ? step(0.3, fract(uTime * 2.3 + hash(cell) * 7.0)) : 1.0;
          vec3 lit = win * on * wc * interior * blinds * flicker;
          vec3 avg = mix(vec3(1.0, 0.75, 0.5), uWin, 0.35) * uWinDensity * 0.45 * (0.6 + 0.8 * hash(vec2(floor(uv.y / 9.0), vSeed)));
          col = mix(col, vec3(0.03, 0.035, 0.05), win * 0.6 * (1.0 - far));
          col += mix(lit, avg, far) * 0.9;
          // 1층 상가: 진열창 띠
          float shop = smoothstep(0.5, 0.7, uv.y) * smoothstep(2.4, 2.2, uv.y) * step(0.65, hash(vec2(floor(uv.x / 4.0), vSeed)));
          vec3 shopCol = mix(vec3(1.0, 0.35, 0.65), vec3(0.3, 0.9, 1.0), hash(vec2(floor(uv.x / 4.0) + 1.0, vSeed)));
          col += shop * shopCol * 0.35;
          col += uFlash * 0.05;
          gl_FragColor = vec4(applyFog(col, uFog, vDepth, uFogDensity), 1.0);
        }`,
    }),
  );
}

interface Sign {
  pos: THREE.Vector3;
  color: THREE.Color;
}

/** 네온 간판: 세로 간판과 가로 간판. 글자처럼 보이는 획을 셰이더로 그린다. */
function buildSigns(ctx: BuildCtx): Sign[] {
  const tick = ctx.shared();
  const list: { x: number; y: number; z: number; w: number; h: number; c: number; rot: number }[] = [
    { x: -13.6, y: 6.5, z: -12.5, w: 1.1, h: 5.2, c: 0xff3d9a, rot: Math.PI / 2 },
    { x: 14.2, y: 7.2, z: -13.5, w: 1.1, h: 6, c: 0x3fe6ff, rot: -Math.PI / 2 },
    { x: -6, y: 7.5, z: -29.2, w: 5.5, h: 1.3, c: 0xffb23a, rot: 0 },
    { x: 9, y: 5.5, z: -29.2, w: 4.2, h: 1.1, c: 0x9a6aff, rot: 0 },
    { x: -24, y: 12, z: -43, w: 1.6, h: 8, c: 0x3fe6ff, rot: 0 },
    { x: 26, y: 14, z: -43, w: 1.6, h: 9, c: 0xff3d9a, rot: 0 },
    { x: 2, y: 18, z: -63, w: 9, h: 2.2, c: 0xff5a4a, rot: 0 },
  ];
  const out: Sign[] = [];
  list.forEach((s, i) => {
    const mat = ctx.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { ...tick, uColor: { value: col(s.c) }, uSeed: { value: i * 3.7 }, uVert: { value: s.h > s.w ? 1 : 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uTime, uSeed, uVert, uFlash;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            vec2 uv = uVert > 0.5 ? vUv.yx : vUv;
            float n = uVert > 0.5 ? 4.0 : 6.0;
            vec2 g = vec2(uv.x * n, uv.y);
            vec2 cell = floor(g);
            vec2 f = fract(g);
            // 글자 획: 칸마다 무작위 가로·세로 막대
            float h1 = step(0.5, hash(cell + uSeed)) * smoothstep(0.08, 0.0, abs(f.y - 0.3));
            float h2 = step(0.4, hash(cell + uSeed + 1.0)) * smoothstep(0.08, 0.0, abs(f.y - 0.7));
            float v1 = step(0.4, hash(cell + uSeed + 2.0)) * smoothstep(0.07, 0.0, abs(f.x - 0.25)) * step(0.2, f.y) * step(f.y, 0.8);
            float v2 = step(0.5, hash(cell + uSeed + 3.0)) * smoothstep(0.07, 0.0, abs(f.x - 0.72)) * step(0.2, f.y) * step(f.y, 0.8);
            float glyph = clamp(h1 + h2 + v1 + v2, 0.0, 1.0) * step(0.12, f.x) * step(f.x, 0.88);
            float frame = 1.0 - step(0.04, uv.y) * step(uv.y, 0.96) * step(0.02, uv.x) * step(uv.x, 0.98);
            float flick = step(0.04, fract(sin(floor(uTime * 8.0) + uSeed) * 43758.5)) * (0.9 + 0.1 * sin(uTime * 50.0 + uSeed));
            float a = max(glyph, frame * 0.8);
            vec3 c = uColor * (2.2 * a + 0.12) * flick;
            gl_FragColor = vec4(c + uFlash * 0.05, max(a, 0.82));
          }`,
      }),
    );
    const mesh = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(s.w, s.h)), mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.rot;
    ctx.group.add(mesh);
    out.push({ pos: new THREE.Vector3(s.x, 0.6, s.z + (s.rot ? 0 : 1.5)), color: col(s.c) });
  });
  return out;
}

/** 가로등과 빛 원뿔. 가로등 둘 + 가까운 간판 둘을 바닥 고정 조명으로 등록한다. */
function buildLamps(ctx: BuildCtx, signs: Sign[]): number {
  const lamp = ctx.p.lamps ?? 0xffffff;
  const poleMat = ctx.track(new THREE.MeshBasicMaterial({ color: 0x07080b }));
  const spots: [number, number][] = [
    [-9.6, -8],
    [10, -9],
  ];
  const tick = ctx.shared();
  const coneMat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...tick, uColor: { value: col(lamp) } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime;
        varying float vY; varying vec3 vN; varying vec3 vV;
        void main() {
          float edge = pow(abs(dot(vN, vV)), 1.5);
          float a = edge * pow(vY, 1.4) * 0.22;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    }),
  );
  spots.forEach(([x, z], i) => {
    const hx = x + (x < 0 ? 0.85 : -0.85);
    const pole = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.06, 0.1, 5.2, 8)), poleMat);
    pole.position.set(x, 2.6, z);
    const arm = new THREE.Mesh(ctx.track(new THREE.BoxGeometry(1, 0.08, 0.08)), poleMat);
    arm.position.set(x + (x < 0 ? 0.5 : -0.5), 5.15, z);
    const head = new THREE.Mesh(ctx.track(new THREE.BoxGeometry(0.5, 0.12, 0.26)), poleMat);
    head.position.set(hx, 5.08, z);
    const bulb = new THREE.Sprite(ctx.track(new THREE.SpriteMaterial({ map: fxTexture('soft'), color: col(lamp).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false })));
    bulb.position.set(hx, 4.98, z);
    bulb.scale.setScalar(0.9);
    const cone = new THREE.Mesh(ctx.track(new THREE.ConeGeometry(2.4, 5, 24, 1, true)), coneMat);
    cone.position.set(hx, 2.5, z);
    ctx.group.add(pole, arm, head, bulb, cone);
    ctx.lights.pos[i].set(hx, 1.4, z);
    ctx.lights.col[i].set(lamp).multiplyScalar(1.6);
  });
  // 가까운 간판 두 개도 바닥에 색 번짐을 남긴다
  const near = signs.slice(0, 2);
  near.forEach((s, k) => {
    const i = spots.length + k;
    if (i >= MAX_GROUND_LIGHTS) return;
    ctx.lights.pos[i].copy(s.pos).add(new THREE.Vector3(s.pos.x < 0 ? 1.5 : -1.5, 0, 1.5));
    ctx.lights.col[i].copy(s.color).multiplyScalar(0.9);
  });
  return spots.length + near.length;
}

/** 젖은 아스팔트: 실시간 반사 위에 웅덩이, 빗방울 파문, 운하, 무대 표식, 동적 조명 */
function buildGround(ctx: BuildCtx): void {
  const p = ctx.p;
  // 실시간 반사는 장면을 한 번 더 그리므로 높음 등급에서만. 낮음(모바일)에서는 어두운 젖은 바닥 한 장으로 대신한다.
  if (ctx.q.tier === 'high') {
    const size = ctx.renderer.getDrawingBufferSize(new THREE.Vector2());
    const mirror = new Reflector(ctx.track(new THREE.PlaneGeometry(320, 320)), {
      textureWidth: Math.max(256, Math.round(size.x * ctx.q.reflect)),
      textureHeight: Math.max(256, Math.round(size.y * ctx.q.reflect)),
      color: 0x8a8f99,
      clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.002;
    ctx.track({ dispose: () => mirror.dispose() });
    ctx.group.add(mirror);
  } else {
    const base = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(320, 320)), ctx.track(new THREE.MeshBasicMaterial({ color: 0x0c0f16 })));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.002;
    ctx.group.add(base);
  }

  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...ctx.shared(),
        uGround: { value: col(p.ground.color) },
        uRing: { value: col(p.ring) },
        uFog: { value: col(p.fog) },
        uFogDensity: { value: p.fogDensity },
        uRain: { value: p.rain },
        uLightPos: { value: ctx.lights.pos },
        uLightCol: { value: ctx.lights.col },
        uCanal: { value: new THREE.Vector2(CANAL.z0, CANAL.z1) },
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
        uniform vec3 uGround, uRing, uFog;
        uniform float uFogDensity, uRain, uTime, uFlash;
        uniform vec2 uCanal;
        uniform vec3 uLightPos[${MAX_GROUND_LIGHTS}];
        uniform vec3 uLightCol[${MAX_GROUND_LIGHTS}];
        varying vec3 vWorld;
        varying float vDepth;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz;
          vec3 col = uGround;
          // 보도 블록과 아스팔트 결
          vec2 tile = p * vec2(0.9, 0.9);
          vec2 tf = fract(tile);
          float seam = smoothstep(0.0, 0.03, tf.x) * smoothstep(1.0, 0.97, tf.x) * smoothstep(0.0, 0.03, tf.y) * smoothstep(1.0, 0.97, tf.y);
          col *= (0.7 + 0.3 * seam) * (0.8 + fbm(p * 4.0) * 0.25 + hash(floor(tile)) * 0.15);
          float puddle = smoothstep(0.45, 0.6, fbm(p * 0.28 + 3.0));
          float canal = step(uCanal.x, p.y) * step(p.y, uCanal.y);
          float edge = smoothstep(0.35, 0.0, abs(p.y - uCanal.y)) + smoothstep(0.35, 0.0, abs(p.y - uCanal.x));
          if (canal > 0.5) {
            float wave = fbm(vec2(p.x * 0.6 + uTime * 0.25, p.y * 1.2 - uTime * 0.1));
            col = vec3(0.01, 0.015, 0.02) * (0.7 + wave);
            puddle = 1.0;
          }
          col += vec3(0.06) * edge;

          vec2 q = p - vec2(0.0, 0.2);
          float r = length(q);
          float ring = smoothstep(0.035, 0.0, abs(r - 7.0)) + 0.5 * smoothstep(0.02, 0.0, abs(r - 7.45));
          float ang = atan(q.y, q.x);
          float ticks = step(0.9, fract(ang * 36.0 / 6.2831)) * smoothstep(0.22, 0.0, abs(r - 7.22));
          col += uRing * (ring * 0.5 + ticks * 0.45) * (1.0 - canal);

          vec3 light = vec3(0.0);
          for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
            vec3 d = uLightPos[i] - vWorld;
            light += uLightCol[i] / (1.0 + dot(d, d) * 0.45);
          }
          col += light * (0.22 + puddle * 0.9);

          if (uRain > 0.0) {
            vec2 cell = floor(p * 1.6);
            vec2 f = fract(p * 1.6) - 0.5;
            float ph = fract(uTime * 1.3 + hash(cell) * 7.0);
            float rip = smoothstep(0.04, 0.0, abs(length(f) - ph * 0.45)) * (1.0 - ph);
            col += rip * 0.2 * uRain * (0.4 + puddle);
          }
          col += uFlash * 0.06;
          float alpha = mix(0.93, 0.22, puddle);
          float fogK = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
          col = mix(col, uFog, fogK);
          gl_FragColor = vec4(col, mix(alpha, 1.0, fogK));
        }`,
    }),
  );
  const ground = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(320, 320)), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  ground.renderOrder = -1;
  ctx.group.add(ground);
}

/** 운하 난간 */
function buildRails(ctx: BuildCtx): void {
  const mat = ctx.track(new THREE.MeshBasicMaterial({ color: 0x0a0c10 }));
  const geo = ctx.track(new THREE.BoxGeometry(1, 1, 1));
  const posts: THREE.Matrix4[] = [];
  for (let x = -60; x <= 60; x += 2.4) posts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.5, CANAL.z1 + 0.2), new THREE.Quaternion(), new THREE.Vector3(0.08, 1, 0.08)));
  const im = new THREE.InstancedMesh(geo, mat, posts.length + 2);
  posts.forEach((m, i) => im.setMatrixAt(i, m));
  im.setMatrixAt(posts.length, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.0, CANAL.z1 + 0.2), new THREE.Quaternion(), new THREE.Vector3(120, 0.06, 0.06)));
  im.setMatrixAt(posts.length + 1, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.55, CANAL.z1 + 0.2), new THREE.Quaternion(), new THREE.Vector3(120, 0.04, 0.04)));
  im.frustumCulled = false;
  ctx.group.add(im);
}
