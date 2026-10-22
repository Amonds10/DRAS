/** 무대(배경) 프리셋: 메인 화면 + 층마다 다른 장소 */
export type ScenePreset = 'title' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5';

/** 장소 종류. 도시는 네온 운하 하나뿐이고 나머지는 자연 풍경이다. */
export type Scenery = 'coast' | 'meadow' | 'neon' | 'dunes' | 'snowfield' | 'skyruins';
export type GroundKind = 'stone' | 'asphalt' | 'sand' | 'snow' | 'water' | 'grass';
export type TerrainKind = 'headland' | 'hills' | 'dunes' | 'mountains' | 'island' | 'none';
export type ParticleKind = 'none' | 'ash' | 'embers' | 'snow' | 'motes' | 'dust';

export interface PresetDef {
  /** 화면에 보여 줄 장소 이름 */
  place: string;
  scenery: Scenery;
  ground: { kind: GroundKind; color: number; wet: number };
  terrain: TerrainKind;
  /** 지형 정점색: 낮은 곳, 높은 곳, 가파른 곳 */
  palette: { low: number; high: number; steep: number; accent?: number };
  /** 하늘의 광원: 해, 달, 일식. dir은 장면에서 광원을 향하는 방향. */
  light: { kind: 'sun' | 'moon' | 'eclipse'; dir: [number, number, number]; size: number; color: number } | null;
  /** 낮 하늘은 Preetham 산란 모델(Sky.js)로 그린다 */
  physical?: { turbidity: number; rayleigh: number; mie: number; mieG: number; gain: number; cover: number; density: number };
  /** 밤 하늘(직접 만든 셰이더) */
  zenith: number;
  horizon: number;
  glow: number;
  cloudDark: number;
  cloudLit: number;
  clouds: number;
  stars: number;
  aurora: number;
  nebula: number;
  /** 직사광(해, 달)과 하늘·땅 반사광 */
  sun: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  /** 하늘로 구운 환경광 세기 */
  envIntensity: number;
  fog: number;
  fogDensity: number;
  /** 바위, 나무, 건물 같은 지형지물의 기본 색 */
  props: number;
  lit: number;
  windows: number;
  windowDensity: number;
  ring: number;
  rain: number;
  lightning: boolean;
  particles: { kind: ParticleKind; color: number; count: number };
  lamps: number | null;
  /** 해 쪽에서 퍼지는 빛줄기 세기 */
  godRays: number;
  /** 지평선 아지랑이(사막) */
  haze: number;
  grade: { tint: [number, number, number]; contrast: number; exposure: number; bloom: number; bloomThreshold: number };
}

export const PRESETS: Record<ScenePreset, PresetDef> = {
  title: {
    place: '노을 해안',
    scenery: 'coast',
    ground: { kind: 'water', color: 0x0d1a26, wet: 1 },
    terrain: 'headland',
    palette: { low: 0x3a3236, high: 0x5a4a44, steep: 0x2a2226 },
    light: { kind: 'sun', dir: [0.3, 0.035, -1], size: 0.03, color: 0xffc89a },
    physical: { turbidity: 4.5, rayleigh: 2.2, mie: 0.0035, mieG: 0.78, gain: 0.42, cover: 0.42, density: 0.45 },
    zenith: 0x2a3a66, horizon: 0xf0a070, glow: 0xff9a5a, cloudDark: 0x5a4a66, cloudLit: 0xffb48a, clouds: 0.45, stars: 0, aurora: 0, nebula: 0,
    sun: { color: 0xffb27a, intensity: 2.6 },
    hemi: { sky: 0xffb08a, ground: 0x2a2030, intensity: 0.7 },
    envIntensity: 0.8,
    fog: 0xb88470, fogDensity: 0.0042, props: 0x3a3034, lit: 0xb07a62, windows: 0, windowDensity: 0,
    ring: 0xffc640, rain: 0, lightning: false,
    particles: { kind: 'motes', color: 0xffd0a0, count: 160 }, lamps: null,
    godRays: 0.9, haze: 0,
    grade: { tint: [1.03, 0.99, 0.96], contrast: 1.06, exposure: 0.85, bloom: 0.3, bloomThreshold: 1.1 },
  },
  f1: {
    place: '새벽 안개 초원',
    scenery: 'meadow',
    ground: { kind: 'grass', color: 0x4a6a34, wet: 0 },
    terrain: 'hills',
    palette: { low: 0x4c6a32, high: 0x6a8440, steep: 0x5a5444, accent: 0x8a9a50 },
    light: { kind: 'sun', dir: [0.12, 0.13, -1], size: 0.03, color: 0xfff0d8 },
    physical: { turbidity: 4, rayleigh: 1.6, mie: 0.0035, mieG: 0.78, gain: 0.42, cover: 0.38, density: 0.35 },
    zenith: 0x5a80b0, horizon: 0xf2dcc8, glow: 0xffc8a0, cloudDark: 0x8a90a8, cloudLit: 0xfff0e4, clouds: 0.38, stars: 0, aurora: 0, nebula: 0,
    sun: { color: 0xffd9b0, intensity: 2.8 },
    hemi: { sky: 0xbcd0f0, ground: 0x3a4a28, intensity: 0.9 },
    envIntensity: 0.9,
    fog: 0xc4c6c4, fogDensity: 0.0075, props: 0x2c3a24, lit: 0x8aa070, windows: 0, windowDensity: 0,
    ring: 0xffe08a, rain: 0, lightning: false,
    particles: { kind: 'motes', color: 0xfff4c0, count: 260 }, lamps: null,
    godRays: 0.4, haze: 0,
    grade: { tint: [1.0, 1.0, 1.0], contrast: 1.06, exposure: 0.85, bloom: 0.25, bloomThreshold: 1.1 },
  },
  f2: {
    place: '빗속 네온 운하',
    scenery: 'neon',
    ground: { kind: 'asphalt', color: 0x0c0f14, wet: 1 },
    terrain: 'none',
    palette: { low: 0x0c0f14, high: 0x0c0f14, steep: 0x0c0f14 },
    light: null,
    zenith: 0x05070b, horizon: 0x1b222c, glow: 0x4a2840, cloudDark: 0x0a0d12, cloudLit: 0x56606e, clouds: 0.82, stars: 0.05, aurora: 0, nebula: 0,
    sun: { color: 0x7a90c0, intensity: 0.2 },
    hemi: { sky: 0x34405a, ground: 0x10121a, intensity: 0.5 },
    envIntensity: 0.3,
    fog: 0x161c24, fogDensity: 0.016, props: 0x0b0e13, lit: 0x1a2030, windows: 0xff6ab0, windowDensity: 0.2,
    ring: 0x3fe0ff, rain: 1.0, lightning: true,
    particles: { kind: 'none', color: 0xffffff, count: 0 }, lamps: 0x7ae8ff,
    godRays: 0, haze: 0,
    grade: { tint: [0.96, 0.98, 1.06], contrast: 1.1, exposure: 1.05, bloom: 0.75, bloomThreshold: 0.8 },
  },
  f3: {
    place: '모래바람 사구',
    scenery: 'dunes',
    ground: { kind: 'sand', color: 0xd2a874, wet: 0 },
    terrain: 'dunes',
    palette: { low: 0xc89a66, high: 0xe0b47c, steep: 0xa8784c },
    light: { kind: 'sun', dir: [0.55, 0.42, -0.8], size: 0.03, color: 0xfff6e0 },
    physical: { turbidity: 3.5, rayleigh: 1.0, mie: 0.003, mieG: 0.75, gain: 0.45, cover: 0.2, density: 0.3 },
    zenith: 0x3a78c0, horizon: 0xf0d8a8, glow: 0xffe0a0, cloudDark: 0xc0a080, cloudLit: 0xfff4e0, clouds: 0.18, stars: 0, aurora: 0, nebula: 0,
    sun: { color: 0xfff0d8, intensity: 3.4 },
    hemi: { sky: 0x9ab8e0, ground: 0xb08050, intensity: 0.85 },
    envIntensity: 0.8,
    fog: 0xdcc2a0, fogDensity: 0.0045, props: 0x8a5a3a, lit: 0xe0a878, windows: 0, windowDensity: 0,
    ring: 0xd0582a, rain: 0, lightning: false,
    particles: { kind: 'dust', color: 0xf0d4a0, count: 700 }, lamps: null,
    godRays: 0.35, haze: 1,
    grade: { tint: [1.03, 1.0, 0.95], contrast: 1.08, exposure: 0.78, bloom: 0.22, bloomThreshold: 1.15 },
  },
  f4: {
    place: '오로라 설원',
    scenery: 'snowfield',
    ground: { kind: 'snow', color: 0xc8d6e6, wet: 0.12 },
    terrain: 'mountains',
    palette: { low: 0xc4d2e2, high: 0xdfe8f4, steep: 0x2c3640 },
    light: { kind: 'moon', dir: [0.45, 0.2, -1], size: 0.03, color: 0xe6fbff },
    zenith: 0x02070b, horizon: 0x0f2a33, glow: 0x0b2a2a, cloudDark: 0x08141a, cloudLit: 0x5f8a96, clouds: 0.12, stars: 1.0, aurora: 1.0, nebula: 0.1,
    sun: { color: 0xa8cff0, intensity: 1.7 },
    hemi: { sky: 0x3a8088, ground: 0x18242c, intensity: 0.9 },
    envIntensity: 0.5,
    fog: 0x10262e, fogDensity: 0.0065, props: 0x0e1c1e, lit: 0x3a5a62, windows: 0, windowDensity: 0,
    ring: 0x6ff0e0, rain: 0, lightning: false,
    particles: { kind: 'snow', color: 0xeaf6ff, count: 650 }, lamps: null,
    godRays: 0, haze: 0,
    grade: { tint: [0.96, 1.02, 1.05], contrast: 1.06, exposure: 1.0, bloom: 0.6, bloomThreshold: 0.82 },
  },
  f5: {
    place: '부서진 하늘섬',
    scenery: 'skyruins',
    ground: { kind: 'stone', color: 0x2a1a1a, wet: 0.35 },
    terrain: 'island',
    palette: { low: 0x3a2624, high: 0x4a302a, steep: 0x1c1012, accent: 0x5a2a20 },
    light: { kind: 'eclipse', dir: [0.12, 0.2, -1], size: 0.075, color: 0xff6a3a },
    zenith: 0x0a0204, horizon: 0x4a0f12, glow: 0x6a1a10, cloudDark: 0x160406, cloudLit: 0x8a2a20, clouds: 0.5, stars: 0.15, aurora: 0, nebula: 0.2,
    sun: { color: 0xff7a4a, intensity: 1.6 },
    hemi: { sky: 0x6a1a14, ground: 0x0a0406, intensity: 0.6 },
    envIntensity: 0.6,
    fog: 0x4a1410, fogDensity: 0.006, props: 0x2a1c1c, lit: 0x8a3a2a, windows: 0, windowDensity: 0,
    ring: 0xff4d4d, rain: 0, lightning: false,
    particles: { kind: 'embers', color: 0xff7a3a, count: 520 }, lamps: null,
    godRays: 0.8, haze: 0,
    grade: { tint: [1.05, 0.96, 0.93], contrast: 1.12, exposure: 1.05, bloom: 0.7, bloomThreshold: 0.8 },
  },
};

const FLOOR_PRESETS: ScenePreset[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

/** 층 인덱스에 맞는 무대 */
export function floorPreset(floor: number): ScenePreset {
  return FLOOR_PRESETS[Math.max(0, Math.min(floor, FLOOR_PRESETS.length - 1))];
}
