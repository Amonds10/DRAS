import type * as THREE from 'three';

/** 그래픽 품질 등급. 'auto'는 기기를 보고 고른 뒤, 실제 프레임이 낮으면 한 단계 내린다. */
export type Tier = 'high' | 'low';
export type GfxPref = 'auto' | Tier;

export interface Quality {
  tier: Tier;
  pixelRatio: number;
  /** 컴포저 MSAA 샘플 수 */
  samples: number;
  shadows: boolean;
  shadowSize: number;
  grass: number;
  trees: number;
  /** 반사 텍스처 해상도 배율 */
  reflect: number;
  godRays: boolean;
  terrainSeg: number;
  particles: number;
  rockDetail: number;
}

export function qualityFor(tier: Tier): Quality {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return tier === 'high'
    ? { tier, pixelRatio: Math.min(dpr, 1.75), samples: 4, shadows: true, shadowSize: 2048, grass: 26000, trees: 1, reflect: 0.6, godRays: true, terrainSeg: 1, particles: 1, rockDetail: 3 }
    : { tier, pixelRatio: Math.min(dpr, 1.5), samples: 0, shadows: false, shadowSize: 1024, grass: 5000, trees: 0.5, reflect: 0.35, godRays: false, terrainSeg: 0.5, particles: 0.5, rockDetail: 2 };
}

const KEY = 'starweaver.gfx';

export function loadPref(): GfxPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'high' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function savePref(pref: GfxPref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // 저장소를 못 쓰면 이번 세션에서만 적용한다.
  }
}

/** 기기 정보로 첫 등급을 추정한다. 소프트웨어 렌더러와 저사양 모바일은 낮음. */
export function guessTier(renderer: THREE.WebGLRenderer): Tier {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low';
  } catch {
    // 정보를 못 읽으면 아래 기준으로 판단한다.
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  if (mem <= 3 || cores <= 3) return 'low';
  if (mobile && (mem <= 4 || cores <= 6)) return 'low';
  return 'high';
}
