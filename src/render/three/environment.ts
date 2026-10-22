import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { fxTexture } from './textures';

/** 층별 무대(배경) 프리셋 */
export type ScenePreset = 'title' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5';

interface PresetDef {
  zenith: number;
  horizon: number;
  glow: number;
  cloudDark: number;
  cloudLit: number;
  clouds: number;
  stars: number;
  moon: { dir: [number, number, number]; size: number; color: number } | null;
  eclipse: boolean;
  aurora: number;
  nebula: number;
  fog: number;
  fogDensity: number;
  building: number;
  windows: number;
  windowDensity: number;
  ground: number;
  wet: number;
  ring: number;
  rain: number;
  lightning: boolean;
  particles: { kind: 'none' | 'ash' | 'embers' | 'snow' | 'motes'; color: number; count: number };
  lamp: number;
  grade: { tint: [number, number, number]; contrast: number };
}

export const PRESETS: Record<ScenePreset, PresetDef> = {
  title: {
    zenith: 0x05070d, horizon: 0x1a2232, glow: 0x3a2a24, cloudDark: 0x0b0e15, cloudLit: 0x6d7a90, clouds: 0.55, stars: 0.6,
    moon: { dir: [0.35, 0.32, -1], size: 0.05, color: 0xe8ecf2 }, eclipse: false, aurora: 0, nebula: 0.15,
    fog: 0x141a24, fogDensity: 0.016, building: 0x0c0f15, windows: 0xffc98a, windowDensity: 0.12, ground: 0x0e1117, wet: 0.85, ring: 0x3fc8e4,
    rain: 0.55, lightning: false, particles: { kind: 'none', color: 0xffffff, count: 0 }, lamp: 0xffb46a, grade: { tint: [0.96, 1.0, 1.06], contrast: 1.08 },
  },
  f1: {
    zenith: 0x070b16, horizon: 0x2a3550, glow: 0x2c2a38, cloudDark: 0x10141f, cloudLit: 0x7c89a6, clouds: 0.38, stars: 0.9,
    moon: { dir: [-0.42, 0.2, -1], size: 0.04, color: 0xdfe6f2 }, eclipse: false, aurora: 0, nebula: 0.25,
    fog: 0x1b2232, fogDensity: 0.014, building: 0x0d1018, windows: 0xffd29a, windowDensity: 0.07, ground: 0x111520, wet: 0.45, ring: 0x3fc8e4,
    rain: 0, lightning: false, particles: { kind: 'motes', color: 0x9fc4ff, count: 260 }, lamp: 0xffc07a, grade: { tint: [0.95, 1.0, 1.08], contrast: 1.05 },
  },
  f2: {
    zenith: 0x05070b, horizon: 0x1b222c, glow: 0x4a3324, cloudDark: 0x0a0d12, cloudLit: 0x56606e, clouds: 0.82, stars: 0.05,
    moon: null, eclipse: false, aurora: 0, nebula: 0,
    fog: 0x161c24, fogDensity: 0.02, building: 0x0b0e13, windows: 0xffb871, windowDensity: 0.16, ground: 0x0c0f14, wet: 1.0, ring: 0xffc640,
    rain: 1.0, lightning: true, particles: { kind: 'none', color: 0xffffff, count: 0 }, lamp: 0xffa860, grade: { tint: [0.94, 1.0, 1.05], contrast: 1.1 },
  },
  f3: {
    zenith: 0x0a0612, horizon: 0x2c1c3a, glow: 0x3a1f3a, cloudDark: 0x120b1a, cloudLit: 0x6a4f86, clouds: 0.45, stars: 0.7,
    moon: null, eclipse: false, aurora: 0, nebula: 1.0,
    fog: 0x1e1428, fogDensity: 0.018, building: 0x0e0b14, windows: 0xd59bff, windowDensity: 0.03, ground: 0x110d18, wet: 0.35, ring: 0xd59bff,
    rain: 0, lightning: false, particles: { kind: 'ash', color: 0xb9a8c8, count: 420 }, lamp: 0xc9a0ff, grade: { tint: [1.03, 0.96, 1.06], contrast: 1.06 },
  },
  f4: {
    zenith: 0x02070b, horizon: 0x0f2a33, glow: 0x0b2a2a, cloudDark: 0x08141a, cloudLit: 0x5f8a96, clouds: 0.18, stars: 1.0,
    moon: { dir: [0.55, 0.22, -1], size: 0.025, color: 0xe6fbff }, eclipse: false, aurora: 1.0, nebula: 0.1,
    fog: 0x0f2128, fogDensity: 0.015, building: 0x081016, windows: 0x9ff3ff, windowDensity: 0.02, ground: 0x0d1a20, wet: 0.6, ring: 0x6ff0e0,
    rain: 0, lightning: false, particles: { kind: 'snow', color: 0xeaf6ff, count: 650 }, lamp: 0x8ff0ff, grade: { tint: [0.95, 1.02, 1.05], contrast: 1.05 },
  },
  f5: {
    zenith: 0x0a0204, horizon: 0x4a0f12, glow: 0x6a1a10, cloudDark: 0x160406, cloudLit: 0x8a2a20, clouds: 0.5, stars: 0.15,
    moon: { dir: [0.12, 0.2, -1], size: 0.075, color: 0xff6a3a }, eclipse: true, aurora: 0, nebula: 0.2,
    fog: 0x2a0b0c, fogDensity: 0.02, building: 0x0b0405, windows: 0xff5a3a, windowDensity: 0.05, ground: 0x140809, wet: 0.5, ring: 0xff4d4d,
    rain: 0, lightning: false, particles: { kind: 'embers', color: 0xff7a3a, count: 520 }, lamp: 0xff6a40, grade: { tint: [1.06, 0.95, 0.92], contrast: 1.12 },
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

  constructor(
    readonly id: ScenePreset,
    renderer: THREE.WebGLRenderer,
  ) {
    const p = (this.preset = PRESETS[id]);
    this.lights = {
      pos: Array.from({ length: MAX_GROUND_LIGHTS }, () => new THREE.Vector3(0, -100, 0)),
      col: Array.from({ length: MAX_GROUND_LIGHTS }, () => new THREE.Color(0, 0, 0)),
    };
    this.buildSky();
    this.buildCity();
    this.buildProps();
    this.staticLightCount = this.buildLamps();
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

  private buildSky(): void {
    const p = this.preset;
    const u = this.shared();
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
          uMoonDir: { value: new THREE.Vector3(...(p.moon?.dir ?? [0, -1, 0])).normalize() },
          uMoonSize: { value: p.moon?.size ?? 0 },
          uMoonColor: { value: color(p.moon?.color ?? 0) },
          uEclipse: { value: p.eclipse ? 1 : 0 },
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
          uniform float uTime, uFlash, uClouds, uStars, uMoonSize, uEclipse, uAurora, uNebula;
          uniform vec3 uZenith, uHorizon, uGlow, uCloudDark, uCloudLit, uMoonDir, uMoonColor;
          varying vec3 vDir;
          ${NOISE_GLSL}
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
            col += uGlow * exp(-max(h, 0.0) * 12.0);
            float az = atan(d.x, -d.z);

            // 별
            vec2 sp = vec2(az, h) * 260.0;
            float st = hash(floor(sp));
            float star = step(0.9972, st) * smoothstep(0.02, 0.3, h) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0));
            star *= uStars;

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

            // 달 / 일식
            float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
            float halo = 0.0;
            if (uMoonSize > 0.0) {
              float disk = smoothstep(uMoonSize, uMoonSize * 0.92, ang);
              halo = exp(-ang * ang / (uMoonSize * uMoonSize * 30.0));
              if (uEclipse > 0.5) {
                float corona = exp(-pow((ang - uMoonSize) / (uMoonSize * 0.22), 2.0));
                col += uMoonColor * (corona * 2.2 + halo * 0.6);
                col = mix(col, vec3(0.0), disk);
              } else {
                float craters = fbm(d.xy * 90.0) * 0.25;
                col += uMoonColor * halo * 0.35;
                col = mix(col, uMoonColor * (1.2 - craters), disk);
              }
            }

            // 구름: 하늘을 평면에 투영해 흘린다.
            vec2 cp = d.xz / (h + 0.14) * 0.55 + vec2(uTime * 0.012, uTime * 0.004);
            float c = fbm(cp * 1.1 + fbm(cp * 0.6) * 0.8);
            c = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.38, c) * smoothstep(-0.04, 0.1, h);
            vec3 cloudCol = mix(uCloudDark, uCloudLit, clamp(halo * 1.4 + fbm(cp * 2.0) * 0.35, 0.0, 1.0));
            cloudCol += uFlash * vec3(0.55, 0.6, 0.75);
            col = mix(col + star * (1.0 - c), cloudCol, c * 0.95);
            col += uFlash * 0.08;

            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    const sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(400, 48, 24)), mat);
    sky.renderOrder = -10;
    this.group.add(sky);
  }

  private buildingMaterial(): THREE.ShaderMaterial {
    const p = this.preset;
    const u = this.shared();
    return this.track(
      new THREE.ShaderMaterial({
        uniforms: {
          ...u,
          uBase: { value: color(p.building) },
          uWin: { value: color(p.windows) },
          uWinDensity: { value: p.windowDensity },
          uFog: { value: color(p.fog) },
          uFogDensity: { value: p.fogDensity },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          varying vec3 vLocal;
          varying vec3 vNormal;
          varying float vSeed;
          varying float vDepth;
          void main() {
            vec3 scale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            vLocal = vec3((position.x + 0.5) * scale.x, position.y * scale.y, (position.z + 0.5) * scale.z);
            vNormal = normal;
            vSeed = aSeed;
            vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uBase, uWin, uFog;
          uniform float uWinDensity, uFogDensity, uTime, uFlash;
          varying vec3 vLocal;
          varying vec3 vNormal;
          varying float vSeed;
          varying float vDepth;
          ${NOISE_GLSL}
          void main() {
            vec3 col = uBase * (vNormal.y > 0.5 ? 1.4 : (abs(vNormal.x) > 0.5 ? 0.8 : 1.0));
            if (vNormal.y < 0.5) {
              vec2 uv = abs(vNormal.x) > 0.5 ? vLocal.zy : vLocal.xy;
              vec2 g = uv * vec2(1.4, 2.0);
              vec2 cell = floor(g);
              vec2 f = fract(g);
              float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78);
              float on = step(1.0 - uWinDensity, hash(cell + vSeed * 13.7));
              float flicker = 0.85 + 0.15 * sin(uTime * 0.7 + hash(cell) * 40.0);
              col += win * on * uWin * mix(0.5, 1.6, hash(cell * 1.7 + 3.0)) * flicker;
              col *= 0.85 + 0.15 * smoothstep(0.0, 8.0, vLocal.y);
            }
            col += uFlash * 0.05;
            float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
            gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
          }`,
      }),
    );
  }

  private buildCity(): void {
    const rand = lcg(this.id.charCodeAt(0) * 97 + this.id.length * 31 + 7);
    const geo = this.track(new THREE.BoxGeometry(1, 1, 1));
    geo.translate(0, 0.5, 0);
    const rows = [
      { z: -30, count: 22, h: [1.5, 5], w: [3, 6], spread: 80 },
      { z: -48, count: 30, h: [3, 9], w: [4, 8], spread: 130 },
      { z: -80, count: 38, h: [5, 15], w: [5, 11], spread: 220 },
    ];
    const total = rows.reduce((s, r) => s + r.count, 0);
    const mesh = new THREE.InstancedMesh(geo, this.buildingMaterial(), total);
    const seeds = new Float32Array(total);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const r of rows) {
      for (let k = 0; k < r.count; k++) {
        const x = (k / r.count - 0.5) * r.spread + (rand() - 0.5) * 4;
        // 무대 바로 뒤는 낮게 비워 하늘이 보이게 한다.
        const center = Math.abs(x) < 12 ? 0.55 : 1;
        const h = (r.h[0] + rand() * (r.h[1] - r.h[0])) * center;
        const w = r.w[0] + rand() * (r.w[1] - r.w[0]);
        const d = 3 + rand() * 5;
        m.compose(new THREE.Vector3(x, 0, r.z + (rand() - 0.5) * 6), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
        mesh.setMatrixAt(i, m);
        seeds[i] = rand() * 100;
        i++;
      }
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  private buildProps(): void {
    const p = this.preset;
    const mat = this.track(new THREE.MeshBasicMaterial({ color: p.building, fog: true }));
    // 무대 뒤 관측소 돔
    const dome = new THREE.Mesh(this.track(new THREE.SphereGeometry(5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), mat);
    dome.position.set(-6, 3.2, -34);
    const base = new THREE.Mesh(this.track(new THREE.CylinderGeometry(5.3, 5.6, 3.2, 32)), mat);
    base.position.set(-6, 1.6, -34);
    this.group.add(dome, base);
    // 송신탑: 꼭대기에 붉은 표시등
    const towerMat = mat;
    for (const x of [-16, 13]) {
      const tower = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.12, 0.35, 18, 6)), towerMat);
      tower.position.set(x, 9, -20);
      this.group.add(tower);
      const beacon = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: fxTexture('soft'), color: 0xff3a2a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
      beacon.position.set(x, 18.2, -20);
      beacon.scale.setScalar(1.4);
      beacon.userData.blink = Math.random() * 6;
      this.group.add(beacon);
    }
    // 무대 양옆 부서진 기둥
    for (const [x, z, h] of [[-10.5, -4.5, 4.2], [-13, -9, 6]] as const) {
      const pillar = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.9, h, 0.9)), mat);
      pillar.position.set(x, h / 2, z);
      pillar.rotation.y = 0.4;
      this.group.add(pillar);
    }
  }

  /** 가로등: 바닥 셰이더에 고정 조명으로 등록한다. 등록한 개수를 돌려준다. */
  private buildLamps(): number {
    const p = this.preset;
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
      const bulb = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: fxTexture('soft'), color: p.lamp, blending: THREE.AdditiveBlending, depthWrite: false })));
      bulb.position.set(x + (x < 0 ? 0.75 : -0.75), 4.25, z);
      bulb.scale.setScalar(0.7);
      this.group.add(pole, arm, bulb);
      this.lights.pos[i].set(x + (x < 0 ? 0.75 : -0.75), 1.2, z);
      this.lights.col[i].set(p.lamp).multiplyScalar(1.4);
    });
    return spots.length;
  }

  private buildGround(renderer: THREE.WebGLRenderer): void {
    const p = this.preset;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const mirror = new Reflector(this.track(new THREE.PlaneGeometry(260, 260)), {
      textureWidth: Math.max(256, Math.round(size.x * 0.5)),
      textureHeight: Math.max(256, Math.round(size.y * 0.5)),
      color: 0x8a8f99,
      clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = -0.002;
    this.track({ dispose: () => mirror.dispose() });
    this.group.add(mirror);

    const u = this.shared();
    const mat = this.track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...u,
          uGround: { value: color(p.ground) },
          uRing: { value: color(p.ring) },
          uFog: { value: color(p.fog) },
          uFogDensity: { value: p.fogDensity },
          uWet: { value: p.wet },
          uRain: { value: p.rain },
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
          uniform vec3 uGround, uRing, uFog;
          uniform float uFogDensity, uWet, uRain, uTime, uFlash;
          uniform vec3 uLightPos[${MAX_GROUND_LIGHTS}];
          uniform vec3 uLightCol[${MAX_GROUND_LIGHTS}];
          varying vec3 vWorld;
          varying float vDepth;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vWorld.xz;
            float n = fbm(p * 0.32 + 3.0);
            float puddle = smoothstep(0.42, 0.58, n) * uWet;
            float grain = fbm(p * 5.0) * 0.18 + fbm(p * 0.8) * 0.2;
            vec3 col = uGround * (0.75 + grain);

            // 무대 표식: 동심원, 눈금, 옅은 격자
            vec2 q = p - vec2(0.0, 0.2);
            float r = length(q);
            float ring = smoothstep(0.035, 0.0, abs(r - 7.0)) + 0.5 * smoothstep(0.02, 0.0, abs(r - 7.45));
            float ang = atan(q.y, q.x);
            float ticks = step(0.9, fract(ang * 36.0 / 6.2831)) * smoothstep(0.22, 0.0, abs(r - 7.22));
            vec2 gl = abs(fract(p * 0.5) - 0.5);
            float grid = smoothstep(0.015, 0.0, min(gl.x, gl.y)) * 0.08 * smoothstep(10.0, 5.0, r);
            float axis = smoothstep(0.03, 0.0, abs(q.x)) * smoothstep(7.0, 6.2, r) * 0.25;
            col += uRing * (ring * 0.55 + ticks * 0.5 + grid + axis);

            // 동적 조명(가로등, 스킬 섬광)
            vec3 light = vec3(0.0);
            for (int i = 0; i < ${MAX_GROUND_LIGHTS}; i++) {
              vec3 d = uLightPos[i] - vWorld;
              light += uLightCol[i] / (1.0 + dot(d, d) * 0.55);
            }
            col += light * (0.25 + puddle * 0.9);

            // 빗방울 파문
            if (uRain > 0.0) {
              vec2 cell = floor(p * 1.6);
              vec2 f = fract(p * 1.6) - 0.5;
              float ph = fract(uTime * 1.3 + hash(cell) * 7.0);
              float rip = smoothstep(0.04, 0.0, abs(length(f) - ph * 0.45)) * (1.0 - ph);
              col += rip * 0.18 * uRain * (0.4 + puddle);
            }

            col += uFlash * 0.06;
            float alpha = mix(0.93, 0.28, puddle);
            float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
            col = mix(col, uFog, fog);
            alpha = mix(alpha, 1.0, fog);
            gl_FragColor = vec4(col, alpha);
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
    const layers: [number, number, number, number][] = [
      [-7, 2.2, 70, 0.32],
      [-16, 3.5, 110, 0.4],
      [-32, 6, 180, 0.5],
    ];
    layers.forEach(([z, h, w, a], i) => {
      const u = this.shared();
      const mat = this.track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { ...u, uColor: { value: color(p.fog).multiplyScalar(1.6) }, uAlpha: { value: a }, uSeed: { value: i * 11.0 } },
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
    const kind = { ash: 0, embers: 1, snow: 2, motes: 3, none: 0 }[p.particles.kind];
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
            // 0 재: 천천히 떨어짐, 1 불씨: 올라감, 2 눈: 떨어짐, 3 먼지: 떠다님
            float dir = (uKind == 1.0 || uKind == 3.0) ? 1.0 : -1.0;
            float speed = uKind == 2.0 ? 1.2 : (uKind == 3.0 ? 0.25 : 0.6);
            p.y = mod(p.y + dir * t * speed * 4.0, 14.0);
            p.x += sin(t * 2.0 + aRand * 20.0) * 0.6;
            p.z += cos(t * 1.5 + aRand * 13.0) * 0.4;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float size = uKind == 1.0 ? 0.09 : (uKind == 2.0 ? 0.11 : (uKind == 3.0 ? 0.07 : 0.08));
            gl_PointSize = size * (0.6 + aRand) * 600.0 / -mv.z;
            vA = smoothstep(0.0, 1.5, p.y) * smoothstep(14.0, 10.0, p.y) * (0.4 + 0.6 * sin(uTime * 3.0 + aRand * 40.0) * 0.5 + 0.3);
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
    for (const o of this.group.children) {
      if (o.userData.blink !== undefined) (o as THREE.Sprite).material.opacity = 0.35 + 0.65 * (Math.sin(t * 2 + o.userData.blink) > 0.6 ? 1 : 0.2);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
