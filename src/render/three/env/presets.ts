/** 무대(배경) 프리셋: 메인 화면 + 층마다 다른 장소 */
export type ScenePreset = 'title' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5';

/** 장소 종류. 도시는 네온 운하 하나뿐이고 나머지는 자연 풍경이다. */
export type Scenery = 'coast' | 'meadow' | 'neon' | 'dunes' | 'snowfield' | 'skyruins';
export type GroundKind = 'stone' | 'asphalt' | 'sand' | 'snow' | 'water' | 'grass';
export type TerrainKind = 'headland' | 'hills' | 'dunes' | 'mountains' | 'island' | 'none';
export type ParticleKind = 'none' | 'ash' | 'embers' | 'snow' | 'motes' | 'dust';
/** 하늘에 걸린 거대한 마법 구조물 */
export type SkyRing = 'astrolabe' | 'runes' | 'broken' | 'none';

export interface PresetDef {
  /** 화면에 보여 줄 장소 이름 */
  place: string;
  scenery: Scenery;
  ground: { kind: GroundKind; color: number; wet: number };
  terrain: TerrainKind;
  /** 지형 정점색: 낮은 곳, 높은 곳, 가파른 곳 */
  palette: { low: number; high: number; steep: number; accent?: number };
  /** 하늘의 광원: 해, 달, 일식. dir은 장면에서 광원을 향하는 방향. size는 원반 반지름(라디안). */
  light: { kind: 'sun' | 'moon' | 'eclipse'; dir: [number, number, number]; size: number; color: number } | null;
  /** 그림 같은 하늘: 천정 → 중간 → 지평선 세 색과 지평선 빛 */
  sky: { zenith: number; mid: number; horizon: number; glow: number };
  cloudDark: number;
  cloudLit: number;
  clouds: number;
  /** 별 밀도, 별의 강(은하수) 세기, 별자리 개수 */
  stars: number;
  starRiver: number;
  constellations: number;
  aurora: number;
  nebula: number;
  /** 셀 셰이딩용 직사광과 하늘·땅 반사광 */
  sun: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  fog: number;
  fogDensity: number;
  /** 먼 능선 실루엣 층(먼 것 → 가까운 것) */
  layers: number[];
  /** 마법 장식: 주색, 보조색, 떠다니는 수정 수, 하늘 구조물, 빛기둥 수 */
  arcana: { color: number; accent: number; crystals: number; skyRing: SkyRing; pillars: number };
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
  /** 해 쪽 빛줄기 세기(작게) */
  godRays: number;
  /** 2D 캐릭터를 장면에 녹이는 빛: 전체 색조, 테두리 역광 색과 세기 */
  actor: { tint: [number, number, number]; rim: number; rimStrength: number };
  /** 지평선 아지랑이(사막) */
  haze: number;
  /** 외곽선 색(장면 그림자 색에 맞춘다) */
  outline: number;
  grade: { tint: [number, number, number]; contrast: number; exposure: number; bloom: number; bloomThreshold: number };
}

export const PRESETS: Record<ScenePreset, PresetDef> = {
  title: {
    place: '노을 해안',
    scenery: 'coast',
    ground: { kind: 'water', color: 0x1a2440, wet: 1 },
    terrain: 'headland',
    palette: { low: 0x2a2440, high: 0x4a3a5a, steep: 0x1e1a30 },
    light: { kind: 'sun', dir: [0.3, 0.04, -1], size: 0.02, color: 0xffd2a0 },
    sky: { zenith: 0x141a44, mid: 0x5a4a8e, horizon: 0xffa878, glow: 0xff8a5a },
    cloudDark: 0x4a3a70, cloudLit: 0xf0a890, clouds: 0.3,
    stars: 0.8, starRiver: 0.5, constellations: 5, aurora: 0, nebula: 0.25,
    sun: { color: 0xffc8a0, intensity: 2.2 },
    hemi: { sky: 0x8a7ab8, ground: 0x2a2038, intensity: 0.9 },
    fog: 0x6a4a6a, fogDensity: 0.0045,
    layers: [0x5a4a7a, 0x3e3260, 0x2a2246],
    arcana: { color: 0xffd27a, accent: 0x9ab8ff, crystals: 10, skyRing: 'runes', pillars: 2 },
    props: 0x2a2236, lit: 0xb07a62, windows: 0, windowDensity: 0,
    ring: 0xffc640, rain: 0, lightning: false,
    particles: { kind: 'motes', color: 0xffd8a8, count: 200 }, lamps: null,
    godRays: 0.25, haze: 0,
    actor: { tint: [1.0, 0.94, 0.95], rim: 0xffc08a, rimStrength: 1.1 },
    outline: 0x140e22,
    grade: { tint: [1.02, 0.99, 1.0], contrast: 1.05, exposure: 1.0, bloom: 0.45, bloomThreshold: 0.85 },
  },
  f1: {
    place: '새벽 안개 초원',
    scenery: 'meadow',
    ground: { kind: 'grass', color: 0x4a6a34, wet: 0 },
    terrain: 'hills',
    palette: { low: 0x2c4a48, high: 0x3e5e56, steep: 0x404a60, accent: 0x52705e },
    light: { kind: 'sun', dir: [0.15, 0.08, -1], size: 0.018, color: 0xfff0d0 },
    sky: { zenith: 0x1e2a62, mid: 0x6a7ec0, horizon: 0xffd6b0, glow: 0xffb890 },
    cloudDark: 0x6a6aa0, cloudLit: 0xf4d6c8, clouds: 0.28,
    stars: 0.55, starRiver: 0.35, constellations: 4, aurora: 0, nebula: 0.1,
    sun: { color: 0xffe2c0, intensity: 2.2 },
    hemi: { sky: 0x9ab0e8, ground: 0x3a5030, intensity: 1.0 },
    fog: 0x7a88b8, fogDensity: 0.004,
    layers: [0x8a90c8, 0x6a78a8, 0x4a6080],
    arcana: { color: 0xfff0a0, accent: 0xc8d8ff, crystals: 8, skyRing: 'astrolabe', pillars: 2 },
    props: 0x2c4430, lit: 0x8aa070, windows: 0, windowDensity: 0,
    ring: 0xffe08a, rain: 0, lightning: false,
    particles: { kind: 'motes', color: 0xfff4c0, count: 320 }, lamps: null,
    godRays: 0.2, haze: 0,
    actor: { tint: [1.0, 1.0, 1.0], rim: 0xfff0d0, rimStrength: 1.1 },
    outline: 0x16202a,
    grade: { tint: [1.0, 1.0, 1.02], contrast: 1.05, exposure: 1.0, bloom: 0.4, bloomThreshold: 0.85 },
  },
  f2: {
    place: '빗속 네온 운하',
    scenery: 'neon',
    ground: { kind: 'asphalt', color: 0x0c0f14, wet: 1 },
    terrain: 'none',
    palette: { low: 0x0c0f14, high: 0x0c0f14, steep: 0x0c0f14 },
    light: null,
    sky: { zenith: 0x05060e, mid: 0x14142a, horizon: 0x2a1a38, glow: 0x5a2850 },
    cloudDark: 0x0a0d16, cloudLit: 0x4a4a6e, clouds: 0.7,
    stars: 0.35, starRiver: 0.2, constellations: 3, aurora: 0, nebula: 0.15,
    sun: { color: 0x7a90c0, intensity: 0.4 },
    hemi: { sky: 0x34405a, ground: 0x10121a, intensity: 0.6 },
    fog: 0x161a2a, fogDensity: 0.014,
    layers: [],
    arcana: { color: 0x7ae8ff, accent: 0xff6ab0, crystals: 6, skyRing: 'runes', pillars: 2 },
    props: 0x0b0e13, lit: 0x1a2030, windows: 0xff6ab0, windowDensity: 0.2,
    ring: 0x3fe0ff, rain: 1.0, lightning: true,
    particles: { kind: 'none', color: 0xffffff, count: 0 }, lamps: 0x7ae8ff,
    godRays: 0, haze: 0,
    actor: { tint: [0.9, 0.94, 1.06], rim: 0x7ae8ff, rimStrength: 1.0 },
    outline: 0x05060c,
    grade: { tint: [0.97, 0.98, 1.05], contrast: 1.08, exposure: 1.05, bloom: 0.55, bloomThreshold: 0.82 },
  },
  f3: {
    place: '모래바람 사구',
    scenery: 'dunes',
    ground: { kind: 'sand', color: 0xd2a874, wet: 0 },
    terrain: 'dunes',
    palette: { low: 0xc8905a, high: 0xe8b47a, steep: 0x9a6448 },
    light: { kind: 'sun', dir: [0.5, 0.16, -1], size: 0.02, color: 0xffe0b0 },
    sky: { zenith: 0x1e1a4a, mid: 0x8a5a8a, horizon: 0xffb87a, glow: 0xff9a60 },
    cloudDark: 0x7a4a72, cloudLit: 0xf0c098, clouds: 0.22,
    stars: 0.7, starRiver: 0.6, constellations: 5, aurora: 0, nebula: 0.2,
    sun: { color: 0xffd8a8, intensity: 2.4 },
    hemi: { sky: 0x9a8ac0, ground: 0x8a5a3a, intensity: 1.0 },
    fog: 0xb08088, fogDensity: 0.0042,
    layers: [0x9a7090, 0x7a5478, 0x5a3c5a],
    arcana: { color: 0xffc86a, accent: 0xffe6c0, crystals: 8, skyRing: 'astrolabe', pillars: 2 },
    props: 0x7a4a3a, lit: 0xe0a878, windows: 0, windowDensity: 0,
    ring: 0xff8a4a, rain: 0, lightning: false,
    particles: { kind: 'dust', color: 0xf0d4a0, count: 500 }, lamps: null,
    godRays: 0.2, haze: 0.6,
    actor: { tint: [1.06, 1.0, 0.96], rim: 0xffe0b0, rimStrength: 1.1 },
    outline: 0x2a1424,
    grade: { tint: [1.02, 0.99, 0.98], contrast: 1.06, exposure: 1.0, bloom: 0.4, bloomThreshold: 0.85 },
  },
  f4: {
    place: '오로라 설원',
    scenery: 'snowfield',
    ground: { kind: 'snow', color: 0xc8d6e6, wet: 0.12 },
    terrain: 'mountains',
    palette: { low: 0xb8cce4, high: 0xe0eaf8, steep: 0x3a4a64 },
    light: { kind: 'moon', dir: [0.45, 0.2, -1], size: 0.022, color: 0xe6fbff },
    sky: { zenith: 0x020614, mid: 0x0e2040, horizon: 0x1e4a5a, glow: 0x1a5a5a },
    cloudDark: 0x08141e, cloudLit: 0x4a7a8a, clouds: 0.12,
    stars: 1.0, starRiver: 0.9, constellations: 6, aurora: 1.0, nebula: 0.15,
    sun: { color: 0xa8cff0, intensity: 1.8 },
    hemi: { sky: 0x3a6a98, ground: 0x18242c, intensity: 1.0 },
    fog: 0x10263a, fogDensity: 0.006,
    layers: [0x2a4a6a, 0x1e3a56, 0x142a42],
    arcana: { color: 0x9af0ff, accent: 0xc8d8ff, crystals: 10, skyRing: 'runes', pillars: 2 },
    props: 0x0e1c26, lit: 0x3a5a62, windows: 0, windowDensity: 0,
    ring: 0x6ff0e0, rain: 0, lightning: false,
    particles: { kind: 'snow', color: 0xeaf6ff, count: 600 }, lamps: null,
    godRays: 0, haze: 0,
    actor: { tint: [0.92, 0.98, 1.1], rim: 0xcfeaff, rimStrength: 1.1 },
    outline: 0x060c1a,
    grade: { tint: [0.97, 1.01, 1.05], contrast: 1.06, exposure: 1.05, bloom: 0.55, bloomThreshold: 0.8 },
  },
  f5: {
    place: '부서진 하늘섬',
    scenery: 'skyruins',
    ground: { kind: 'stone', color: 0x2a1a1a, wet: 0.35 },
    terrain: 'island',
    palette: { low: 0x4a2a2e, high: 0x5a3434, steep: 0x22121a, accent: 0x6a2a24 },
    light: { kind: 'eclipse', dir: [0.12, 0.2, -1], size: 0.034, color: 0xff7a4a },
    sky: { zenith: 0x08020c, mid: 0x2a0a1e, horizon: 0x6a1a1a, glow: 0x9a2a18 },
    cloudDark: 0x160408, cloudLit: 0x8a2a20, clouds: 0.4,
    stars: 0.8, starRiver: 0.5, constellations: 5, aurora: 0, nebula: 0.4,
    sun: { color: 0xff8a5a, intensity: 1.6 },
    hemi: { sky: 0x8a2a2a, ground: 0x140608, intensity: 0.8 },
    fog: 0x3a0e14, fogDensity: 0.0055,
    layers: [],
    arcana: { color: 0xff8a5a, accent: 0xffd27a, crystals: 8, skyRing: 'broken', pillars: 3 },
    props: 0x2a1c1c, lit: 0x8a3a2a, windows: 0, windowDensity: 0,
    ring: 0xff4d4d, rain: 0, lightning: false,
    particles: { kind: 'embers', color: 0xff8a4a, count: 450 }, lamps: null,
    godRays: 0.3, haze: 0,
    actor: { tint: [1.02, 0.88, 0.86], rim: 0xff8a5a, rimStrength: 1.3 },
    outline: 0x12040a,
    grade: { tint: [1.04, 0.97, 0.95], contrast: 1.08, exposure: 1.05, bloom: 0.55, bloomThreshold: 0.8 },
  },
};

const FLOOR_PRESETS: ScenePreset[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

/** 층 인덱스에 맞는 무대 */
export function floorPreset(floor: number): ScenePreset {
  return FLOOR_PRESETS[Math.max(0, Math.min(floor, FLOOR_PRESETS.length - 1))];
}
