import * as THREE from 'three';

/** Kenney Particle Pack(CC0)에서 골라 변환한 VFX 텍스처 이름 */
export const FX_NAMES = [
  'circle_01', 'circle_02', 'circle_03', 'circle_05', 'fire_01', 'flame_01', 'flame_02', 'flame_03', 'flare_01',
  'light_01', 'light_02', 'light_03', 'magic_01', 'magic_02', 'muzzle_01', 'muzzle_02', 'scorch_01', 'scorch_02',
  'scorch_03', 'scratch_01', 'slash_01', 'slash_02', 'slash_03', 'smoke_01', 'smoke_04', 'smoke_07', 'spark_01',
  'spark_02', 'spark_05', 'spark_06', 'spark_07', 'star_01', 'star_02', 'star_04', 'star_05', 'trace_01', 'trace_02',
  'trace_05', 'trace_06', 'twirl_01', 'twirl_02', 'twirl_03',
] as const;

/** 직접 그린 효과 텍스처(캔버스). 모두 흰색과 알파라 색으로 물들여 쓴다. */
export const DRAWN = ['rune', 'rune_hex', 'shard', 'flare4', 'trail', 'bloom', 'crescent', 'crack', 'petal', 'vortex', 'sunburst'] as const;
export type Drawn = (typeof DRAWN)[number];

export type FxName = (typeof FX_NAMES)[number] | 'soft' | 'blob' | Drawn;

/** 마법진: 동심원, 눈금, 별 다각형, 둘레의 작은 문자(획을 무작위로 엮은 룬) */
function drawRune(ctx: CanvasRenderingContext2D, s: number, points: number, skip: number, seed: number): void {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const c = s / 2;
  ctx.translate(c, c);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = s * 0.012;
  const ring = (rad: number, w: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(c * 0.96, s * 0.008);
  ring(c * 0.9, s * 0.003, 0.8);
  ring(c * 0.72, s * 0.006);
  ring(c * 0.66, s * 0.0025, 0.7);
  ring(c * 0.3, s * 0.005);
  // 바깥 눈금
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const long = i % 8 === 0;
    ctx.lineWidth = long ? s * 0.005 : s * 0.0025;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * c * 0.9, Math.sin(a) * c * 0.9);
    ctx.lineTo(Math.cos(a) * c * (long ? 0.8 : 0.86), Math.sin(a) * c * (long ? 0.8 : 0.86));
    ctx.stroke();
  }
  // 둘레의 룬: 칸마다 짧은 획 서너 개
  const glyphs = 24;
  for (let i = 0; i < glyphs; i++) {
    const a = (i / glyphs) * Math.PI * 2 + 0.06;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -c * 0.81);
    ctx.lineWidth = s * 0.004;
    ctx.globalAlpha = 0.95;
    const g = s * 0.022;
    ctx.beginPath();
    for (let k = 0; k < 3 + Math.floor(rnd() * 2); k++) {
      const x0 = (rnd() - 0.5) * g, y0 = (rnd() - 0.5) * g;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (rnd() - 0.5) * g * 1.4, y0 + (rnd() - 0.5) * g * 1.4);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 별 다각형
  ctx.lineWidth = s * 0.005;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = ((i * skip) / points) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * c * 0.72, y = Math.sin(a) * c * 0.72;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // 꼭짓점의 작은 원과 안쪽 원 둘레의 점
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = s * 0.004;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * c * 0.72, Math.sin(a) * c * 0.72, s * 0.022, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(Math.cos(a + Math.PI / points) * c * 0.3, Math.sin(a + Math.PI / points) * c * 0.3, s * 0.006, 0, Math.PI * 2);
    ctx.fill();
  }
  // 가운데 문양: 작은 원 둘과 십자
  ring(c * 0.14, s * 0.004);
  ctx.lineWidth = s * 0.004;
  ctx.beginPath();
  ctx.moveTo(-c * 0.24, 0); ctx.lineTo(c * 0.24, 0);
  ctx.moveTo(0, -c * 0.24); ctx.lineTo(0, c * 0.24);
  ctx.stroke();
}

function drawFx(name: Drawn, ctx: CanvasRenderingContext2D, s: number): void {
  const c = s / 2;
  switch (name) {
    case 'rune':
      drawRune(ctx, s, 8, 3, 7);
      break;
    case 'rune_hex':
      drawRune(ctx, s, 6, 2, 31);
      break;
    case 'shard': {
      // 결정 조각: 길쭉한 마름모, 한쪽 면이 더 밝다
      ctx.translate(c, c);
      const g = ctx.createLinearGradient(-c * 0.3, 0, c * 0.3, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -c * 0.95);
      ctx.lineTo(c * 0.32, -c * 0.1);
      ctx.lineTo(0, c * 0.95);
      ctx.lineTo(-c * 0.26, c * 0.05);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flare4': {
      // 렌즈 섬광: 부드러운 핵 + 네 줄기 회절광 + 가는 사선 줄기
      const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.5);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(0.25, 'rgba(255,255,255,0.5)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, s, s);
      ctx.translate(c, c);
      const spike = (len: number, w: number, a: number, alpha: number) => {
        ctx.save();
        ctx.rotate(a);
        const g = ctx.createLinearGradient(-len, 0, len, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.quadraticCurveTo(0, -w, len, 0);
        ctx.quadraticCurveTo(0, w, -len, 0);
        ctx.fill();
        ctx.restore();
      };
      spike(c, s * 0.03, 0, 1);
      spike(c * 0.8, s * 0.025, Math.PI / 2, 0.9);
      spike(c * 0.45, s * 0.012, Math.PI / 4, 0.6);
      spike(c * 0.45, s * 0.012, -Math.PI / 4, 0.6);
      break;
    }
    case 'trail': {
      // 칼날 궤적: 바깥 테가 날카롭고 안쪽으로 번지는 초승달 띠
      ctx.translate(c, c);
      for (let i = 0; i < 18; i++) {
        const k = i / 17;
        ctx.globalAlpha = Math.pow(1 - k, 1.6) * 0.9;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = s * (0.012 + 0.05 * (1 - k));
        ctx.beginPath();
        ctx.arc(0, 0, c * (0.82 - k * 0.22), -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
      }
      break;
    }
    case 'bloom': {
      // 축복의 꽃: 여섯 잎이 겹친 부드러운 문양(치유)
      ctx.translate(c, c);
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * Math.PI * 2);
        const g = ctx.createRadialGradient(0, -c * 0.45, 0, 0, -c * 0.45, c * 0.42);
        g.addColorStop(0, 'rgba(255,255,255,0.8)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, -c * 0.45, c * 0.2, c * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.35);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'crescent': {
      // 초승달: 큰 원에서 어긋난 원을 도려내고, 바깥 테를 은은히 번지게
      ctx.translate(c, c);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = s * 0.06;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.shadowBlur = s * 0.03;
      ctx.beginPath();
      ctx.arc(c * 0.3, -c * 0.12, c * 0.64, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'crack': {
      // 갈라진 땅: 가운데서 뻗어 나가며 가지 치는 금
      let r = 91;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      ctx.translate(c, c);
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = s * 0.02;
      const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
        let px = x, py = y;
        const steps = 5;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let i = 0; i < steps; i++) {
          a += (rnd() - 0.5) * 0.8;
          px += Math.cos(a) * (len / steps);
          py += Math.sin(a) * (len / steps);
          ctx.lineTo(px, py);
          if (depth > 0 && rnd() < 0.35) {
            ctx.stroke();
            branch(px, py, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * 0.45, w * 0.6, depth - 1);
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(px, py);
          }
        }
        ctx.stroke();
      };
      for (let i = 0; i < 7; i++) branch(0, 0, (i / 7) * Math.PI * 2 + rnd() * 0.5, c * (0.6 + rnd() * 0.35), s * 0.014, 2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.25);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-c, -c, s, s);
      break;
    }
    case 'petal': {
      // 꽃잎(성운): 끝이 뾰족한 잎, 가운데 결이 밝다
      ctx.translate(c, c);
      const g = ctx.createLinearGradient(0, -c * 0.9, 0, c * 0.9);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0.5)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -c * 0.9);
      ctx.bezierCurveTo(c * 0.55, -c * 0.4, c * 0.45, c * 0.5, 0, c * 0.9);
      ctx.bezierCurveTo(-c * 0.45, c * 0.5, -c * 0.55, -c * 0.4, 0, -c * 0.9);
      ctx.fill();
      break;
    }
    case 'vortex': {
      // 소용돌이(공허): 가운데로 말려 드는 팔 넷
      ctx.translate(c, c);
      ctx.strokeStyle = '#fff';
      ctx.lineCap = 'round';
      for (let arm = 0; arm < 4; arm++) {
        for (let i = 0; i < 40; i++) {
          const k = i / 40;
          const a = arm * (Math.PI / 2) + k * Math.PI * 2.2;
          const rad = c * (0.1 + 0.82 * k);
          const a2 = a + 0.09;
          const rad2 = c * (0.1 + 0.82 * (k + 0.025));
          ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
          ctx.lineWidth = s * (0.008 + 0.03 * (1 - k));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
          ctx.lineTo(Math.cos(a2) * rad2, Math.sin(a2) * rad2);
          ctx.stroke();
        }
      }
      break;
    }
    case 'sunburst': {
      // 햇살(태양): 길고 짧은 빛살이 번갈아 뻗는 원반
      ctx.translate(c, c);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const len = c * (i % 2 ? 0.55 : 0.95);
        const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = s * (i % 2 ? 0.012 : 0.022);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.3);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = core;
      ctx.fillRect(-c, -c, s, s);
      break;
    }
  }
}

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
  } else if ((DRAWN as readonly string[]).includes(name)) {
    tex = canvasTexture(name === 'rune' || name === 'rune_hex' ? 512 : 256, (ctx, s) => drawFx(name as Drawn, ctx, s));
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
