import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { fxTexture } from './textures';

/** 무대(배경) 프리셋: 메인 화면 + 층마다 다른 장소 */
export type ScenePreset = 'title' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5';

/** 장소 종류. 도시는 네온 운하 하나뿐이고 나머지는 자연 풍경이다. */
type Scenery = 'coast' | 'meadow' | 'neon' | 'dunes' | 'snowfield' | 'skyruins';
type GroundKind = 'stone' | 'asphalt' | 'sand' | 'snow' | 'water' | 'grass';
type ParticleKind = 'none' | 'ash' | 'embers' | 'snow' | 'motes' | 'dust';

interface PresetDef {
  /** 화면에 보여 줄 장소 이름 */
  place: string;
  scenery: Scenery;
  ground: { kind: GroundKind; color: number; wet: number };
  zenith: number;
  horizon: number;
  /** 지평선 근처 빛 번짐(노을, 도시 불빛) */
  glow: number;
  cloudDark: number;
  cloudLit: number;
  clouds: number;
  stars: number;
  /** 하늘의 광원: 해, 달, 일식 */
  light: { kind: 'sun' | 'moon' | 'eclipse'; dir: [number, number, number]; size: number; color: number } | null;
  aurora: number;
  nebula: number;
  fog: number;
  fogDensity: number;
  /** 바위, 나무, 건물 같은 지형지물의 그늘 색 */
  props: number;
  /** 빛 받는 면의 색 */
  lit: number;
  sunStrength: number;
  windows: number;
  windowDensity: number;
  /** 먼 능선: 뾰족한 산 또는 완만한 언덕·사구 */
  ridges: { color: number; shape: 'jagged' | 'smooth'; snow?: boolean } | null;
  ring: number;
  rain: number;
  lightning: boolean;
  particles: { kind: ParticleKind; color: number; count: number };
  lamps: number | null;
  grade: { tint: [number, number, number]; contrast: number; exposure: number };
}

export const PRESETS: Record<ScenePreset, PresetDef> = {
  title: {
    place: '노을 해안',
    scenery: 'coast',
    ground: { kind: 'water', color: 0x1a2430, wet: 1 },
    zenith: 0x2a3a66, horizon: 0xf0a070, glow: 0xff9a5a, cloudDark: 0x5a4a66, cloudLit: 0xffb48a, clouds: 0.45, stars: 0,
    light: { kind: 'sun', dir: [0.35, 0.05, -1], size: 0.035, color: 0xffd0a0 }, aurora: 0, nebula: 0,
    fog: 0x9a7a80, fogDensity: 0.011, props: 0x2a2430, lit: 0xb07a62, sunStrength: 0.6, windows: 0, windowDensity: 0,
    ridges: { color: 0x5a4a5e, shape: 'smooth' }, ring: 0xffc640, rain: 0, lightning: false,
    particles: { kind: 'motes', color: 0xffd0a0, count: 160 }, lamps: null,
    grade: { tint: [1.04, 0.99, 0.96], contrast: 1.04, exposure: 1.0 },
  },
  f1: {
    place: '새벽 안개 초원',
    scenery: 'meadow',
    ground: { kind: 'grass', color: 0x3a5236, wet: 0 },
    zenith: 0x5a80b0, horizon: 0xf2dcc8, glow: 0xffc8a0, cloudDark: 0x8a90a8, cloudLit: 0xfff0e4, clouds: 0.38, stars: 0,
    light: { kind: 'sun', dir: [-0.5, 0.1, -1], size: 0.03, color: 0xfff0d8 }, aurora: 0, nebula: 0,
    fog: 0x9aa8ac, fogDensity: 0.008, props: 0x24322a, lit: 0x8aa070, sunStrength: 0.6, windows: 0, windowDensity: 0,
    ridges: { color: 0x4a6070, shape: 'smooth' }, ring: 0xffe08a, rain: 0, lightning: false,
    particles: { kind: 'motes', color: 0xfff4c0, count: 220 }, lamps: null,
    grade: { tint: [1.0, 1.01, 1.0], contrast: 1.03, exposure: 0.95 },
  },
  f2: {
    place: '빗속 네온 운하',
    scenery: 'neon',
    ground: { kind: 'asphalt', color: 0x0c0f14, wet: 1 },
    zenith: 0x05070b, horizon: 0x1b222c, glow: 0x4a2840, cloudDark: 0x0a0d12, cloudLit: 0x56606e, clouds: 0.82, stars: 0.05,
    light: null, aurora: 0, nebula: 0,
    fog: 0x161c24, fogDensity: 0.02, props: 0x0b0e13, lit: 0x1a2030, sunStrength: 0, windows: 0xff6ab0, windowDensity: 0.18,
    ridges: null, ring: 0x3fe0ff, rain: 1.0, lightning: true,
    particles: { kind: 'none', color: 0xffffff, count: 0 }, lamps: 0x7ae8ff,
    grade: { tint: [0.96, 0.98, 1.06], contrast: 1.1, exposure: 1.05 },
  },
  f3: {
    place: '모래바람 사구',
    scenery: 'dunes',
    ground: { kind: 'sand', color: 0xc8a070, wet: 0 },
    zenith: 0x3a78c0, horizon: 0xf0d8a8, glow: 0xffe0a0, cloudDark: 0xc0a080, cloudLit: 0xfff4e0, clouds: 0.18, stars: 0,
    light: { kind: 'sun', dir: [0.4, 0.35, -1], size: 0.03, color: 0xfff6e0 }, aurora: 0, nebula: 0,
    fog: 0xe8c898, fogDensity: 0.011, props: 0x7a5038, lit: 0xe0a878, sunStrength: 0.8, windows: 0, windowDensity: 0,
    ridges: { color: 0xc89a6a, shape: 'smooth' }, ring: 0xd0582a, rain: 0, lightning: false,
    particles: { kind: 'dust', color: 0xf0d4a0, count: 700 }, lamps: null,
    grade: { tint: [1.04, 1.0, 0.94], contrast: 1.05, exposure: 0.9 },
  },
  f4: {
    place: '오로라 설원',
    scenery: 'snowfield',
    ground: { kind: 'snow', color: 0x7c8c9c, wet: 0.15 },
    zenith: 0x02070b, horizon: 0x0f2a33, glow: 0x0b2a2a, cloudDark: 0x08141a, cloudLit: 0x5f8a96, clouds: 0.15, stars: 1.0,
    light: { kind: 'moon', dir: [0.55, 0.22, -1], size: 0.025, color: 0xe6fbff }, aurora: 1.0, nebula: 0.1,
    fog: 0x1a3038, fogDensity: 0.013, props: 0x0c181c, lit: 0x3a5a62, sunStrength: 0.4, windows: 0, windowDensity: 0,
    ridges: { color: 0x2a3e4a, shape: 'jagged', snow: true }, ring: 0x6ff0e0, rain: 0, lightning: false,
    particles: { kind: 'snow', color: 0xeaf6ff, count: 650 }, lamps: null,
    grade: { tint: [0.96, 1.02, 1.05], contrast: 1.05, exposure: 1.05 },
  },
  f5: {
    place: '부서진 하늘섬',
    scenery: 'skyruins',
    ground: { kind: 'stone', color: 0x1c0c0d, wet: 0.5 },
    zenith: 0x0a0204, horizon: 0x4a0f12, glow: 0x6a1a10, cloudDark: 0x160406, cloudLit: 0x8a2a20, clouds: 0.5, stars: 0.15,
    light: { kind: 'eclipse', dir: [0.12, 0.2, -1], size: 0.075, color: 0xff6a3a }, aurora: 0, nebula: 0.2,
    fog: 0x4a1410, fogDensity: 0.014, props: 0x160707, lit: 0x5a1a12, sunStrength: 0.35, windows: 0, windowDensity: 0,
    ridges: null, ring: 0xff4d4d, rain: 0, lightning: false,
    particles: { kind: 'embers', color: 0xff7a3a, count: 520 }, lamps: null,
    grade: { tint: [1.06, 0.95, 0.92], contrast: 1.12, exposure: 1.05 },
  },
};

const FLOOR_PRESETS: ScenePreset[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

/** 층 인덱스에 맞는 무대 */
export function floorPreset(floor: number): ScenePreset {
  return FLOOR_PRESETS[Math.max(0, Math.min(floor, FLOOR_PRESETS.length - 1))];
}

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

const FOG_GLSL = /* glsl */ `
  vec3 applyFog(vec3 col, vec3 fogCol, float depth, float density) {
    float f = 1.0 - exp(-pow(depth * density, 2.0));
    return mix(col, fogCol, f);
  }
`;

function color(c: number): THREE.Color {
  return new THREE.Color(c);
}

/** 결정적인 난수(층마다 같은 도시가 나오도록) */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type PieceGeo = 'box' | 'cone' | 'cyl' | 'rock' | 'ball';

interface Piece {
  geo: PieceGeo;
  pos: [number, number, number];
  scale: [number, number, number];
  rotY?: number;
  tilt?: number;
  /** 그늘 색(없으면 프리셋 기본값) */
  col?: number;
}

export interface GroundLights {
  pos: THREE.Vector3[];
  col: THREE.Color[];
}

export const MAX_GROUND_LIGHTS = 8;

/** 한 프리셋의 배경 전체. update()로 시간을 흘리고 dispose()로 정리한다. */
export class Environment {
  readonly group = new THREE.Group();
  readonly preset: PresetDef;
  readonly lights: GroundLights;
  private uniforms: { uTime: { value: number }; uFlash: { value: number } }[] = [];
  private disposables: { dispose(): void }[] = [];
  private flash = 0;
  private nextBolt = 4;
  private bolt: THREE.Sprite | null = null;
  private boltT = 0;
  readonly staticLightCount: number;
  private sunDir: THREE.Vector3;

  constructor(
    readonly id: ScenePreset,
    renderer: THREE.WebGLRenderer,
  ) {
    const p = (this.preset = PRESETS[id]);
    this.sunDir = new THREE.Vector3(...(p.light?.dir ?? [0.3, 0.6, -1])).normalize();
    this.lights = {
      pos: Array.from({ length: MAX_GROUND_LIGHTS }, () => new THREE.Vector3(0, -100, 0)),
      col: Array.from({ length: MAX_GROUND_LIGHTS }, () => new THREE.Color(0, 0, 0)),
    };
    this.buildSky();
    if (p.ridges) this.buildRidges(p.ridges);
    this.buildProps();
    this.staticLightCount = p.lamps !== null ? this.buildLamps(p.lamps) : 0;
    this.buildGround(renderer);
    this.buildFog();
    if (p.rain > 0) this.buildRain();
    if (p.particles.kind !== 'none') this.buildParticles();
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private shared() {
    const u = { uTime: { value: 0 }, uFlash: { value: 0 } };
    this.uniforms.push(u);
    return u;
  }

  // ───────── 하늘 ─────────
  private buildSky(): void {
    const p = this.preset;
    const u = this.shared();
    const mode = p.light ? { sun: 1, moon: 0, eclipse: 2 }[p.light.kind] : -1;
    const mat = this.track(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          ...u,
          uZenith: { value: color(p.zenith) },
          uHorizon: { value: color(p.horizon) },
          uGlow: { value: color(p.glow) },
          uCloudDark: { value: color(p.cloudDark) },
          uCloudLit: { value: color(p.cloudLit) },
          uClouds: { value: p.clouds },
          uStars: { value: p.stars },
          uLightDir: { value: this.sunDir },
          uLightSize: { value: p.light?.size ?? 0 },
          uLightColor: { value: color(p.light?.color ?? 0) },
          uMode: { value: mode },
          uAurora: { value: p.aurora },
          uNebula: { value: p.nebula },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vDir = wp.xyz - cameraPosition;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uFlash, uClouds, uStars, uLightSize, uMode, uAurora, uNebula;
          uniform vec3 uZenith, uHorizon, uGlow, uCloudDark, uCloudLit, uLightDir, uLightColor;
          varying vec3 vDir;
          ${NOISE_GLSL}
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            float az = atan(d.x, -d.z);
            vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.5, h));
            float ang = acos(clamp(dot(d, uLightDir), -1.0, 1.0));
            // 지평선 빛 번짐은 광원 쪽으로 더 진하다(노을)
            float toward = mode_sun_bias(ang);
            col += uGlow * exp(-max(h, 0.0) * 9.0) * (0.45 + toward);

            // 별
            vec2 sp = vec2(az, h) * 260.0;
            float st = hash(floor(sp));
            float star = step(0.9972, st) * smoothstep(0.02, 0.3, h) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0)) * uStars;

            // 성운
            vec2 np = vec2(az * 1.7, h * 3.2);
            float neb = fbm(np * 1.4 + vec2(uTime * 0.004, 0.0));
            vec3 nebCol = mix(vec3(0.45, 0.18, 0.55), vec3(0.15, 0.25, 0.6), fbm(np * 3.0 + 4.0));
            col += uNebula * nebCol * smoothstep(0.4, 0.8, neb) * smoothstep(-0.02, 0.15, h) * 0.9;

            // 오로라
            if (uAurora > 0.0) {
              float band = 0.0;
              for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float y = 0.1 + 0.045 * fi + 0.03 * sin(az * 3.0 + uTime * 0.15 + fi * 2.0) + 0.03 * fbm(vec2(az * 4.0 + fi, uTime * 0.05));
                float w = 0.025 + 0.02 * fi;
                band += exp(-pow((h - y) / w, 2.0)) * (0.5 + 0.5 * fbm(vec2(az * 12.0 + uTime * 0.2, fi)));
              }
              vec3 aur = mix(vec3(0.1, 0.9, 0.6), vec3(0.3, 0.5, 1.0), smoothstep(0.08, 0.3, h));
              col += aur * band * uAurora * 0.35;
            }

            // 해 / 달 / 일식
            float halo = 0.0;
            if (uMode >= 0.0) {
              float disk = smoothstep(uLightSize, uLightSize * 0.9, ang);
              halo = exp(-ang * ang / (uLightSize * uLightSize * 30.0));
              if (uMode > 1.5) {
                float corona = exp(-pow((ang - uLightSize) / (uLightSize * 0.22), 2.0));
                col += uLightColor * (corona * 2.2 + halo * 0.6);
                col = mix(col, vec3(0.0), disk);
              } else if (uMode > 0.5) {
                float wide = exp(-ang * 5.0);
                col += uLightColor * (halo * 0.9 + wide * 0.35);
                col = mix(col, uLightColor * 2.2, disk);
              } else {
                float craters = fbm(d.xy * 90.0) * 0.25;
                col += uLightColor * halo * 0.35;
                col = mix(col, uLightColor * (1.2 - craters), disk);
              }
            }

            // 구름: 하늘을 평면에 투영해 흘리고, 광원 쪽을 밝게 칠한다.
            vec2 cp = d.xz / (h + 0.14) * 0.55 + vec2(uTime * 0.012, uTime * 0.004);
            float c = fbm(cp * 1.1 + fbm(cp * 0.6) * 0.8);
            c = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.38, c) * smoothstep(-0.04, 0.1, h);
            float lit = clamp(halo * 1.4 + exp(-ang * 2.5) * 0.6 + fbm(cp * 2.0) * 0.3, 0.0, 1.0);
            vec3 cloudCol = mix(uCloudDark, uCloudLit, lit);
            cloudCol += uFlash * vec3(0.55, 0.6, 0.75);
            col = mix(col + star * (1.0 - c), cloudCol, c * 0.92);
            col += uFlash * 0.08;
            gl_FragColor = vec4(col, 1.0);
          }`.replace('mode_sun_bias(ang)', '(uMode > 0.5 && uMode < 1.5 ? exp(-ang * 1.8) * 1.4 : 0.3)'),
      }),
    );
    const sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(400, 48, 24)), mat);
    sky.renderOrder = -10;
    this.group.add(sky);
  }

  // ───────── 먼 능선 ─────────
  private buildRidges(r: NonNullable<PresetDef['ridges']>): void {
    const p = this.preset;
    const rand = lcg(this.id.length * 131 + 17);
    const smooth = r.shape === 'smooth';
    const layers = [
      { z: -150, amp: smooth ? 14 : 34, base: smooth ? 3 : 6, seg: 120, col: color(r.color).lerp(color(p.horizon), 0.5) },
      { z: -105, amp: smooth ? 9 : 22, base: smooth ? 1 : 2, seg: 100, col: color(r.color) },
    ];
    for (const L of layers) {
      const geo = this.track(new THREE.PlaneGeometry(520, 1, L.seg, 1));
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const off = rand() * 100;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const top = pos.getY(i) > 0;
        const n = smooth
          ? 0.5 + 0.3 * Math.sin(x * 0.018 + off) + 0.2 * Math.sin(x * 0.047 + off * 1.7)
          : Math.abs(Math.sin(x * 0.021 + off)) * 0.6 + Math.abs(Math.sin(x * 0.057 + off * 2)) * 0.3 + rand() * 0.12;
        pos.setY(i, top ? L.base + n * L.amp : -2);
      }
      const u = this.shared();
      const mat = this.track(
        new THREE.ShaderMaterial({
          uniforms: { ...u, uCol: { value: L.col }, uSnow: { value: r.snow ? 1 : 0 }, uFog: { value: color(p.fog) }, uTop: { value: L.base + L.amp } },
          vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: /* glsl */ `
            uniform vec3 uCol, uFog; uniform float uSnow, uTop;
            varying float vY;
            void main() {
              vec3 col = uCol;
              col = mix(col, vec3(0.85, 0.92, 1.0) * 0.55, uSnow * smoothstep(uTop * 0.55, uTop * 0.75, vY));
              col = mix(uFog, col, smoothstep(-2.0, uTop * 0.5, vY) * 0.85 + 0.15);
              gl_FragColor = vec4(col, 1.0);
            }`,
        }),
      );
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, 0, L.z);
      this.group.add(m);
    }
  }

  // ───────── 지형지물(바위, 나무, 건물) ─────────
  private propMaterial(windows: boolean): THREE.ShaderMaterial {
    const p = this.preset;
    const u = this.shared();
    return this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          ...u,
                    uLit: { value: color(p.lit) },
          uSun: { value: this.sunDir },
          uSunStrength: { value: p.sunStrength },
          uWin: { value: color(p.windows) },
          uWinDensity: { value: windows ? p.windowDensity : 0 },
          uFog: { value: color(p.fog) },
          uFogDensity: { value: p.fogDensity * 0.85 },
          uNeon: { value: p.scenery === 'neon' ? 1 : 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          attribute vec3 aCol;
          varying vec3 vCol;
          varying vec3 vLocal;
          varying vec3 vNormalL;
          varying vec3 vNormalW;
          varying float vSeed;
          varying float vDepth;
          void main() {
            vec3 scale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vLocal = vec3((position.x + 0.5) * scale.x, position.y * scale.y, (position.z + 0.5) * scale.z);
            vNormalL = normal;
            vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
            vSeed = aSeed;
            vCol = aCol;
            vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uLit, uSun, uWin, uFog;
          varying vec3 vCol;
          uniform float uSunStrength, uWinDensity, uFogDensity, uTime, uFlash, uNeon;
          varying vec3 vLocal;
          varying vec3 vNormalL;
          varying vec3 vNormalW;
          varying float vSeed;
          varying float vDepth;
          ${NOISE_GLSL}
          ${FOG_GLSL}
          void main() {
            vec3 n = normalize(vNormalW);
            float tone = 0.8 + 0.4 * hash(vec2(vSeed, 1.7));
            vec3 col = vCol * tone;
            float diff = max(dot(n, normalize(uSun)), 0.0);
            col = mix(col, mix(uLit, vCol * 2.2, 0.35) * tone, diff * uSunStrength);
            col *= n.y > 0.5 ? 1.15 : 1.0;
            if (uWinDensity > 0.0 && abs(vNormalL.y) < 0.5) {
              vec2 uv = abs(vNormalL.x) > 0.5 ? vLocal.zy : vLocal.xy;
              vec2 g = uv * vec2(1.4, 2.0);
              vec2 cell = floor(g);
              vec2 f = fract(g);
              float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78);
              float on = step(1.0 - uWinDensity, hash(cell + vSeed * 13.7));
              float flicker = 0.85 + 0.15 * sin(uTime * 0.7 + hash(cell) * 40.0);
              vec3 wc = uWin;
              if (uNeon > 0.5) wc = mix(uWin, vec3(0.25, 0.9, 1.0), step(0.5, hash(cell * 0.37 + vSeed)));
              col += win * on * wc * mix(0.5, 1.6, hash(cell * 1.7 + 3.0)) * flicker;
            }
            col += uFlash * 0.05;
            gl_FragColor = vec4(applyFog(col, uFog, vDepth, uFogDensity), 1.0);
          }`,
      }),
    );
  }

  private pieces(): Piece[] {
    const p = this.preset;
    const rand = lcg(this.id.charCodeAt(0) * 97 + this.id.length * 31 + 7);
    const r = (a: number, b: number) => a + rand() * (b - a);
    const out: Piece[] = [];
    // 무대 바로 뒤는 낮게 비워 하늘과 광원이 보이게 한다.
    const lowCenter = (x: number) => (Math.abs(x) < 12 ? 0.55 : 1);
    const rows = (z: number[], count: number[], spread: number[], fn: (x: number, z: number, row: number) => void) => {
      z.forEach((zz, row) => {
        for (let k = 0; k < count[row]; k++) fn((k / count[row] - 0.5) * spread[row] + r(-2, 2), zz + r(-3, 3), row);
      });
    };
    const rock = (x: number, z: number, w: number, h: number, d: number, col?: number) =>
      out.push({ geo: 'rock', pos: [x, h * 0.45, z], scale: [w, h, d], rotY: r(0, 6.28), col });
    switch (p.scenery) {
      case 'neon':
        rows([-30, -48, -80], [22, 30, 38], [80, 130, 220], (x, z, row) => {
          const h = r([1.5, 3, 5][row], [5, 10, 18][row]) * lowCenter(x);
          out.push({ geo: 'box', pos: [x, 0, z], scale: [r(3, 7), h, r(3, 7)] });
        });
        break;
      case 'coast':
        // 바다 위에 솟은 바위 기둥들
        for (const [x, z, h] of [[-30, -38, 12], [-22, -52, 8], [-44, -62, 15], [24, -42, 10], [36, -34, 6], [16, -70, 13], [48, -60, 9]] as const) {
          rock(x, z, r(2.5, 4), h, r(2.5, 4));
          rock(x + r(-4, 4), z + r(-3, 3), r(1, 2), h * 0.35, r(1, 2));
        }
        for (let k = 0; k < 10; k++) rock(r(-40, 40), r(-26, -18), r(0.6, 1.6), r(0.4, 1.2), r(0.6, 1.6));
        break;
      case 'meadow':
        // 둥근 활엽수 숲 띠, 왼쪽 언덕 위 선돌 무리
        rows([-26, -38, -54], [12, 18, 26], [80, 120, 180], (x, z, row) => {
          if (row === 0 && Math.abs(x) < 10) return;
          if (rand() < 0.25) return;
          const h = r(1.6, 3) + row * 0.4;
          const c = r(1.6, 2.8) + row * 0.3;
          out.push({ geo: 'cyl', pos: [x, 0, z], scale: [0.22, h, 0.22], col: 0x2a2018 });
          out.push({ geo: 'ball', pos: [x, h + c * 0.5, z], scale: [c, c * r(0.8, 1.1), c], rotY: r(0, 6.28) });
        });
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          out.push({ geo: 'box', pos: [-16 + Math.cos(a) * 4.5, 0, -32 + Math.sin(a) * 2.5], scale: [1.1, r(2.4, 3.8), 0.6], rotY: a, tilt: r(-0.08, 0.08), col: 0x4a4e52 });
        }
        break;
      case 'dunes':
        // 바람에 깎인 바위 대지(메사)와 흩어진 바위
        for (const [x, z, w, h] of [[-40, -80, 14, 9], [-18, -110, 20, 7], [34, -76, 12, 11], [58, -100, 18, 8]] as const) {
          out.push({ geo: 'rock', pos: [x, h * 0.3, z], scale: [w, h, w * 0.55], rotY: r(-0.4, 0.4) });
        }
        for (let k = 0; k < 14; k++) rock(r(-40, 40), r(-40, -20), r(0.8, 2.4), r(0.5, 1.6), r(0.8, 2.4));
        break;
      case 'snowfield':
        // 침엽수 군락
        rows([-24, -34, -48], [14, 20, 28], [80, 110, 160], (x, z, row) => {
          if (row === 0 && Math.abs(x) < 9) return;
          if (rand() < 0.3) return;
          const s = r(0.8, 1.4) + row * 0.15;
          out.push({ geo: 'cyl', pos: [x, 0, z], scale: [0.2 * s, 1 * s, 0.2 * s], col: 0x1a1210 });
          out.push({ geo: 'cone', pos: [x, 0.7 * s, z], scale: [1.4 * s, 2.4 * s, 1.4 * s] });
          out.push({ geo: 'cone', pos: [x, 2 * s, z], scale: [1.05 * s, 2 * s, 1.05 * s] });
          out.push({ geo: 'cone', pos: [x, 3.2 * s, z], scale: [0.7 * s, 1.7 * s, 0.7 * s] });
        });
        for (let k = 0; k < 8; k++) rock(r(-40, 40), r(-30, -18), r(0.8, 2), r(0.5, 1.2), r(0.8, 2), 0x3a4a56);
        break;
      case 'skyruins':
        // 부러진 기둥과 하늘에 떠 있는 바위섬
        for (const [x, z, h] of [[-26, -30, 9], [-18, -42, 6], [-34, -50, 12], [20, -34, 7], [30, -46, 11], [12, -56, 5], [40, -30, 4]] as const) {
          out.push({ geo: 'cyl', pos: [x, 0, z], scale: [0.9, h, 0.9], tilt: r(-0.12, 0.12) });
          out.push({ geo: 'box', pos: [x, 0, z], scale: [2.6, 0.6, 2.6] });
        }
        for (const [x, y, z, s] of [[-40, 12, -100, 4], [-16, 17, -130, 6], [30, 13, -110, 4.5], [56, 19, -140, 7], [10, 8, -90, 1.8], [-62, 16, -130, 5]] as const) {
          out.push({ geo: 'rock', pos: [x, y, z], scale: [s * 1.5, s * 0.4, s], rotY: r(0, 6.28) });
          out.push({ geo: 'cone', pos: [x, y, z], scale: [s * 1.1, s * 1.6, s * 0.8], rotY: r(0, 6.28), tilt: Math.PI });
        }
        for (let k = 0; k < 12; k++) rock(r(-40, 40), r(-28, -18), r(0.6, 1.8), r(0.4, 1.4), r(0.6, 1.8));
        break;
    }
    return out;
  }

  private buildProps(): void {
    const p = this.preset;
    const geos: Record<PieceGeo, THREE.BufferGeometry> = {
      box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0),
      rock: new THREE.IcosahedronGeometry(1, 0),
      ball: new THREE.IcosahedronGeometry(1, 1),
    };
    const pieces = this.pieces();
    const rand = lcg(911);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    for (const kind of Object.keys(geos) as PieceGeo[]) {
      const list = pieces.filter((pc) => pc.geo === kind);
      const geo = this.track(geos[kind]);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geo, this.propMaterial(kind === 'box' && p.windowDensity > 0), list.length);
      const seeds = new Float32Array(list.length);
      const cols = new Float32Array(list.length * 3);
      list.forEach((pc, i) => {
        e.set(0, pc.rotY ?? 0, pc.tilt ?? 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(...pc.pos), q, new THREE.Vector3(...pc.scale));
        mesh.setMatrixAt(i, m);
        seeds[i] = rand() * 100;
        c.set(pc.col ?? p.props).toArray(cols, i * 3);
      });
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(cols, 3));
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** 가로등: 바닥 셰이더에 고정 조명으로 등록한다. 등록한 개수를 돌려준다. */
  private buildLamps(lamp: number): number {
    const poleMat = this.track(new THREE.MeshBasicMaterial({ color: 0x07080b }));
    const spots: [number, number][] = [
      [-8.8, -7],
      [9.2, -8],
    ];
    spots.forEach(([x, z], i) => {
      const pole = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.06, 0.09, 4.4, 6)), poleMat);
      pole.position.set(x, 2.2, z);
      const arm = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.8, 0.07, 0.07)), poleMat);
      arm.position.set(x + (x < 0 ? 0.4 : -0.4), 4.35, z);
      const bulb = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: fxTexture('soft'), color: lamp, blending: THREE.AdditiveBlending, depthWrite: false })));
      bulb.position.set(x + (x < 0 ? 0.75 : -0.75), 4.25, z);
      bulb.scale.setScalar(0.7);
      this.group.add(pole, arm, bulb);
      this.lights.pos[i].set(x + (x < 0 ? 0.75 : -0.75), 1.2, z);
      this.lights.col[i].set(lamp).multiplyScalar(1.4);
    });
    return spots.length;
  }

  // ───────── 바닥 ─────────
  private buildGround(renderer: THREE.WebGLRenderer): void {
    const p = this.preset;
    const g = p.ground;
    if (g.wet > 0) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const mirror = new Reflector(this.track(new THREE.PlaneGeometry(260, 260)), {
        textureWidth: Math.max(256, Math.round(size.x * 0.5)),
        textureHeight: Math.max(256, Math.round(size.y * 0.5)),
        color: g.kind === 'water' ? 0x9aa4b0 : 0x8a8f99,
        clipBias: 0.003,
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = -0.002;
      this.track({ dispose: () => mirror.dispose() });
      this.group.add(mirror);
    }

    const kind = { stone: 0, asphalt: 1, sand: 2, snow: 3, water: 4, grass: 5 }[g.kind];
    const u = this.shared();
    const mat = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...u,
          uGround: { value: color(g.color) },
          uRing: { value: color(p.ring) },
          uFog: { value: color(p.fog) },
          uFogDensity: { value: p.fogDensity },
          uWet: { value: g.wet },
          uKind: { value: kind },
          uRain: { value: p.rain },
          uSun: { value: this.sunDir },
          uSunStrength: { value: p.sunStrength },
          uLightPos: { value: this.lights.pos },
          uLightCol: { value: this.lights.col },
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
          uniform vec3 uGround, uRing, uFog, uSun;
          uniform float uFogDensity, uWet, uKind, uRain, uTime, uFlash, uSunStrength;
          uniform vec3 uLightPos[${MAX_GROUND_LIGHTS}];
          uniform vec3 uLightCol[${MAX_GROUND_LIGHTS}];
          varying vec3 vWorld;
          varying float vDepth;
          ${NOISE_GLSL}
          ${FOG_GLSL}
          void main() {
            vec2 p = vWorld.xz;
            vec3 col = uGround;
            float puddle = smoothstep(0.42, 0.58, fbm(p * 0.32 + 3.0)) * uWet;
            if (uKind > 4.5) {
              // 풀밭: 큰 얼룩과 잔디 결
              col *= 0.72 + fbm(p * 0.3) * 0.38 + fbm(p * vec2(3.0, 9.0)) * 0.1;
              col += vec3(0.06, 0.05, -0.02) * smoothstep(0.55, 0.8, fbm(p * 0.9 + 7.0));
            } else if (uKind < 0.5) {
              // 돌바닥: 엇갈린 포석
              vec2 g = p * vec2(1.1, 1.6);
              g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
              vec2 f = fract(g);
              float edge = smoothstep(0.0, 0.06, f.x) * smoothstep(1.0, 0.94, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
              col *= (0.55 + 0.45 * edge) * (0.8 + 0.4 * hash(floor(g)));
            } else if (uKind < 1.5) {
              col *= 0.75 + fbm(p * 5.0) * 0.18 + fbm(p * 0.8) * 0.2;
            } else if (uKind < 2.5) {
              // 모래: 바람 물결
              float w = sin(p.x * 1.6 + fbm(p * 0.4) * 6.0) * 0.5 + 0.5;
              col *= 0.82 + w * 0.12 + fbm(p * 6.0) * 0.1;
            } else if (uKind < 3.5) {
              // 눈: 밝고 반짝인다
              col *= 0.88 + fbm(p * 1.5) * 0.15;
              col += step(0.995, hash(floor(p * 18.0))) * 0.6 * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(p * 18.0)) * 20.0));
            } else {
              // 물: 일렁이는 띠, 대부분 반사가 비친다
              float wave = sin(p.x * 0.8 + uTime * 0.7 + fbm(p * 0.5 + uTime * 0.05) * 5.0) * 0.5 + 0.5;
              col *= 0.6 + wave * 0.25;
              puddle = 0.85;
            }
            // 해가 있으면 바닥도 살짝 밝힌다
            col *= 0.8 + uSunStrength * 0.35 * max(uSun.y + 0.3, 0.0);

            // 무대 표식: 동심원, 눈금, 옅은 격자
            vec2 q = p - vec2(0.0, 0.2);
            float r = length(q);
            float ring = smoothstep(0.035, 0.0, abs(r - 7.0)) + 0.5 * smoothstep(0.02, 0.0, abs(r - 7.45));
            float ang = atan(q.y, q.x);
            float ticks = step(0.9, fract(ang * 36.0 / 6.2831)) * smoothstep(0.22, 0.0, abs(r - 7.22));
            vec2 gl = abs(fract(p * 0.5) - 0.5);
            float grid = smoothstep(0.015, 0.0, min(gl.x, gl.y)) * 0.06 * smoothstep(10.0, 5.0, r);
            col += uRing * (ring * 0.5 + ticks * 0.45 + grid);

            vec3 light = vec3(0.0);
            for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
              vec3 d = uLightPos[i] - vWorld;
              light += uLightCol[i] / (1.0 + dot(d, d) * 0.55);
            }
            col += light * (0.25 + puddle * 0.9);

            if (uRain > 0.0) {
              vec2 cell = floor(p * 1.6);
              vec2 f = fract(p * 1.6) - 0.5;
              float ph = fract(uTime * 1.3 + hash(cell) * 7.0);
              float rip = smoothstep(0.04, 0.0, abs(length(f) - ph * 0.45)) * (1.0 - ph);
              col += rip * 0.18 * uRain * (0.4 + puddle);
            }

            col += uFlash * 0.06;
            float alpha = uWet > 0.0 ? mix(0.94, 0.3, puddle) : 1.0;
            float f = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
            col = mix(col, uFog, f);
            gl_FragColor = vec4(col, mix(alpha, 1.0, f));
          }`,
      }),
    );
    const ground = new THREE.Mesh(this.track(new THREE.PlaneGeometry(260, 260)), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    ground.renderOrder = -1;
    this.group.add(ground);
  }

  /** 낮게 깔리는 안개 띠 */
  private buildFog(): void {
    const p = this.preset;
    const geo = this.track(new THREE.PlaneGeometry(1, 1));
    const strength = p.scenery === 'meadow' ? 0.8 : 1;
    const layers: [number, number, number, number][] = [
      [-7, 2.2, 70, 0.3],
      [-16, 3.5, 110, 0.38],
      [-32, 6, 180, 0.48],
    ];
    layers.forEach(([z, h, w, a], i) => {
      const u = this.shared();
      const mat = this.track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { ...u, uColor: { value: color(p.fog).multiplyScalar(1.15) }, uAlpha: { value: Math.min(0.85, a * strength) }, uSeed: { value: i * 11.0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: /* glsl */ `
            uniform vec3 uColor; uniform float uAlpha, uTime, uSeed;
            varying vec2 vUv;
            ${NOISE_GLSL}
            void main() {
              float n = fbm(vec2(vUv.x * 6.0 + uTime * 0.03 + uSeed, vUv.y * 2.0));
              float a = smoothstep(0.35, 0.8, n) * smoothstep(1.0, 0.2, vUv.y) * smoothstep(0.0, 0.25, vUv.y);
              a *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
              gl_FragColor = vec4(uColor, a * uAlpha);
            }`,
        }),
      );
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(w, h * 2, 1);
      m.position.set(0, h * 0.6, z);
      this.group.add(m);
    });
  }

  private buildRain(): void {
    const p = this.preset;
    const count = Math.round(3200 * p.rain);
    const pos = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    const rnd = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 50;
      const y = Math.random() * 22;
      const z = -22 + Math.random() * 32;
      const r = Math.random();
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        pos.set([x, y, z], j * 3);
        end[j] = k;
        rnd[j] = r;
      }
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    const u = this.shared();
    const mat = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...u, uIntensity: { value: p.rain } },
        vertexShader: /* glsl */ `
          attribute float aEnd; attribute float aRand;
          uniform float uTime;
          varying float vA;
          void main() {
            vec3 p = position;
            float speed = 16.0 + aRand * 9.0;
            float y = mod(p.y - uTime * speed, 22.0);
            float len = 0.45 + aRand * 0.5;
            p.y = y - aEnd * len;
            p.x += -0.12 * aEnd * len + y * 0.06;
            vA = (1.0 - aEnd * 0.9) * (0.18 + aRand * 0.3);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uIntensity, uFlash;
          varying float vA;
          void main() { gl_FragColor = vec4(vec3(0.62, 0.7, 0.82) * (1.0 + uFlash * 2.0), vA * uIntensity); }`,
      }),
    );
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    this.group.add(rain);
  }

  private buildParticles(): void {
    const p = this.preset;
    const n = p.particles.count;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 40, Math.random() * 14, -16 + Math.random() * 26], i * 3);
      rnd[i] = Math.random();
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    const kind = { ash: 0, embers: 1, snow: 2, motes: 3, dust: 4, none: 0 }[p.particles.kind];
    const u = this.shared();
    const mat = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: kind === 1 || kind === 3 ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { ...u, uColor: { value: color(p.particles.color) }, uKind: { value: kind }, uMap: { value: fxTexture('soft') } },
        vertexShader: /* glsl */ `
          attribute float aRand;
          uniform float uTime, uKind;
          varying float vA;
          void main() {
            vec3 p = position;
            float t = uTime * (0.25 + aRand * 0.35);
            if (uKind == 4.0) {
              // 모래바람: 옆으로 빠르게 흩날린다
              p.x = mod(p.x + uTime * (6.0 + aRand * 6.0) + 20.0, 40.0) - 20.0;
              p.y = mod(p.y * 0.35 + sin(t * 3.0 + aRand * 9.0) * 0.4, 5.0);
            } else {
              // 0 재: 떨어짐, 1 불씨: 올라감, 2 눈: 떨어짐, 3 먼지: 떠다님
              float dir = (uKind == 1.0 || uKind == 3.0) ? 1.0 : -1.0;
              float speed = uKind == 2.0 ? 1.2 : (uKind == 3.0 ? 0.25 : 0.6);
              p.y = mod(p.y + dir * t * speed * 4.0, 14.0);
              p.x += sin(t * 2.0 + aRand * 20.0) * 0.6;
            }
            p.z += cos(t * 1.5 + aRand * 13.0) * 0.4;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float size = uKind == 1.0 ? 0.09 : (uKind == 2.0 ? 0.11 : (uKind == 3.0 ? 0.07 : (uKind == 4.0 ? 0.06 : 0.08)));
            gl_PointSize = size * (0.6 + aRand) * 600.0 / -mv.z;
            float top = uKind == 4.0 ? 5.0 : 14.0;
            vA = smoothstep(0.0, 1.0, p.y) * smoothstep(top, top * 0.7, p.y) * (0.35 + 0.35 * sin(uTime * 3.0 + aRand * 40.0) + 0.3);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform sampler2D uMap;
          varying float vA;
          void main() {
            float a = texture2D(uMap, gl_PointCoord).a;
            gl_FragColor = vec4(uColor, a * vA);
          }`,
      }),
    );
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  /** 번개: 하늘 섬광과 먼 번개 줄기 */
  strike(): void {
    this.flash = 1;
    if (!this.bolt) {
      this.bolt = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: fxTexture('spark_05'), color: 0xcfe0ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
      this.group.add(this.bolt);
    }
    this.bolt.position.set((Math.random() - 0.5) * 80, 22, -70);
    this.bolt.scale.set(18, 34, 1);
    this.bolt.material.rotation = (Math.random() - 0.5) * 0.4;
    this.boltT = 0.35;
  }

  update(t: number, dt: number): void {
    if (this.preset.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.strike();
        this.nextBolt = 5 + Math.random() * 8;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const f = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(t * 60)) : 0;
    for (const u of this.uniforms) {
      u.uTime.value = t;
      u.uFlash.value = f;
    }
    if (this.bolt) {
      this.boltT = Math.max(0, this.boltT - dt);
      this.bolt.visible = this.boltT > 0 && Math.sin(t * 50) > -0.3;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
