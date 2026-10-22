import * as THREE from 'three';

/** Kenney Particle Pack(CC0)에서 골라 변환한 VFX 텍스처 이름 */
export const FX_NAMES = [
  'circle_01', 'circle_02', 'circle_03', 'circle_05', 'fire_01', 'flame_01', 'flame_02', 'flame_03', 'flare_01',
  'light_01', 'light_02', 'light_03', 'magic_01', 'magic_02', 'muzzle_01', 'muzzle_02', 'scorch_01', 'scorch_02',
  'scorch_03', 'scratch_01', 'slash_01', 'slash_02', 'slash_03', 'smoke_01', 'smoke_04', 'smoke_07', 'spark_01',
  'spark_02', 'spark_05', 'spark_06', 'spark_07', 'star_01', 'star_02', 'star_04', 'star_05', 'trace_01', 'trace_02',
  'trace_05', 'trace_06', 'twirl_01', 'twirl_02', 'twirl_03',
] as const;

export type FxName = (typeof FX_NAMES)[number] | 'soft' | 'blob';

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** VFX 텍스처. 흰색 + 알파라서 재질 색으로 물들인다. */
export function fxTexture(name: FxName): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  let tex: THREE.Texture;
  if (name === 'soft') {
    tex = canvasTexture(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  } else if (name === 'blob') {
    tex = canvasTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.75)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  } else {
    tex = loader.load(`${import.meta.env.BASE_URL}fx/${name}.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  cache.set(name, tex);
  return tex;
}

/**
 * SVG 일러스트를 역광 테두리가 있는 텍스처로 굽는다.
 * 어두운 배경에서도 실루엣이 읽히도록 외곽 발광과 왼쪽 림라이트를 더한다.
 */
export function svgTexture(svg: string, w: number, h: number, rim: string, glow = 22): { texture: THREE.Texture; ready: Promise<void> } {
  const pad = Math.round(glow * 1.5);
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const ready = new Promise<void>((resolve) => {
    img.onload = () => {
      const ctx = c.getContext('2d')!;
      // 외곽 발광
      ctx.save();
      ctx.shadowColor = rim;
      ctx.shadowBlur = glow;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, pad, pad, w, h);
      ctx.restore();
      // 림라이트: 밝게 칠한 실루엣을 살짝 비켜 그린 뒤 본체로 덮는다.
      const tmp = document.createElement('canvas');
      tmp.width = c.width;
      tmp.height = c.height;
      const t = tmp.getContext('2d')!;
      t.drawImage(img, pad, pad, w, h);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = rim;
      t.fillRect(0, 0, tmp.width, tmp.height);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(tmp, -2, -1);
      ctx.globalAlpha = 1;
      ctx.drawImage(img, pad, pad, w, h);
      tex.needsUpdate = true;
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => resolve();
  });
  img.src = url;
  return { texture: tex, ready };
}
