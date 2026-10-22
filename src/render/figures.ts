import type { Role } from '../core/types';

/**
 * 캐릭터 일러스트 대신 쓰는 '별자리 형상'.
 * 별(관절)과 선으로 이뤄진 실루엣이며, 데이터에 없는 텍스트는 들어가지 않는 정적 SVG 마크업이다.
 */

type P = [number, number];

interface Pose {
  head: P;
  neck: P;
  ls: P;
  rs: P;
  le: P;
  re: P;
  lh: P;
  rh: P;
  pelvis: P;
  lk: P;
  rk: P;
  lf: P;
  rf: P;
}

const BASE: Pose = {
  head: [50, 24],
  neck: [50, 38],
  ls: [39, 44],
  rs: [61, 44],
  le: [33, 64],
  re: [67, 62],
  lh: [31, 84],
  rh: [72, 80],
  pelvis: [50, 84],
  lk: [43, 114],
  rk: [58, 114],
  lf: [39, 146],
  rf: [63, 146],
};

const POSES: Record<Role, Partial<Pose>> = {
  striker: { re: [72, 50], rh: [88, 38], le: [34, 62], lh: [40, 78], rk: [62, 112], rf: [70, 145] },
  guardian: { re: [70, 58], rh: [76, 66], le: [34, 62], lh: [34, 82] },
  support: { le: [30, 50], lh: [22, 36], re: [70, 50], rh: [78, 36] },
  hexer: { re: [70, 56], rh: [84, 58], le: [40, 60], lh: [50, 66] },
};

const BONES: [keyof Pose, keyof Pose][] = [
  ['neck', 'ls'], ['neck', 'rs'], ['ls', 'le'], ['le', 'lh'], ['rs', 're'], ['re', 'rh'],
  ['neck', 'pelvis'], ['pelvis', 'lk'], ['lk', 'lf'], ['pelvis', 'rk'], ['rk', 'rf'],
];

function prop(role: Role, p: Pose, color: string): string {
  const [hx, hy] = p.rh;
  switch (role) {
    case 'striker':
      // 별빛 창
      return `<line x1="${hx - 26}" y1="${hy + 30}" x2="${hx + 10}" y2="${hy - 12}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity=".95"/>
        <path d="M${hx + 10} ${hy - 12} l4 -9 l-1 10 z" fill="${color}"/>`;
    case 'guardian':
      // 원형 방패(성반)
      return `<circle cx="${hx + 4}" cy="${hy}" r="15" fill="${color}" fill-opacity=".1" stroke="${color}" stroke-width="1.2"/>
        <circle cx="${hx + 4}" cy="${hy}" r="9" fill="none" stroke="${color}" stroke-width=".6" stroke-dasharray="2 2"/>
        <path d="M${hx + 4} ${hy - 6} l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6z" fill="${color}"/>`;
    case 'support':
      // 손 위에 떠 있는 별
      return `<circle cx="50" cy="8" r="5" fill="${color}" opacity=".9" class="fig-orb"/>
        <circle cx="50" cy="8" r="10" fill="none" stroke="${color}" stroke-width=".6" opacity=".6"/>`;
    case 'hexer':
      // 손끝의 궤도 구슬
      return `<circle cx="${hx + 6}" cy="${hy}" r="4" fill="${color}" class="fig-orb"/>
        <ellipse cx="${hx + 6}" cy="${hy}" rx="10" ry="4" fill="none" stroke="${color}" stroke-width=".7" transform="rotate(-25 ${hx + 6} ${hy})"/>`;
  }
}

/** 술사 형상(별자리 인간형). viewBox 0 0 100 160 */
export function allyFigure(role: Role, color: string, halo = false): string {
  const p: Pose = { ...BASE, ...POSES[role] };
  const bones = BONES.map(([a, b]) => `<line x1="${p[a][0]}" y1="${p[a][1]}" x2="${p[b][0]}" y2="${p[b][1]}"/>`).join('');
  const joints = (Object.keys(p) as (keyof Pose)[])
    .filter((k) => k !== 'head')
    .map((k) => `<circle cx="${p[k][0]}" cy="${p[k][1]}" r="${k === 'neck' || k === 'pelvis' ? 2.2 : 1.6}"/>`)
    .join('');
  const robe = `M${p.ls[0]} ${p.ls[1]} Q50 40 ${p.rs[0]} ${p.rs[1]} L${p.rk[0] + 8} ${p.rk[1] + 22} Q50 ${p.rk[1] + 30} ${p.lk[0] - 8} ${p.lk[1] + 22} Z`;
  return `<svg viewBox="0 0 100 160" class="fig fig-ally" aria-hidden="true">
    <defs>
      <radialGradient id="g-${role}-${color.slice(1)}" cx="50%" cy="45%" r="60%">
        <stop offset="0" stop-color="${color}" stop-opacity=".2"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="84" rx="40" ry="70" fill="url(#g-${role}-${color.slice(1)})"/>
    <path d="${robe}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-opacity=".35" stroke-width=".6"/>
    ${halo ? `<circle cx="${p.head[0]}" cy="${p.head[1]}" r="13" fill="none" stroke="${color}" stroke-width=".8" stroke-dasharray="1 3" class="fig-halo"/>` : ''}
    <g stroke="${color}" stroke-width="1.1" stroke-linecap="round" opacity=".85">${bones}</g>
    <circle cx="${p.head[0]}" cy="${p.head[1]}" r="7.5" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="1.2"/>
    <g fill="#fff8e6">${joints}</g>
    <circle cx="${p.neck[0]}" cy="${p.neck[1] + 12}" r="3" fill="#fff" class="fig-heart"/>
    ${prop(role, p, color)}
  </svg>`;
}

/** 적 형상. viewBox 0 0 160 160, 왼쪽(아군 쪽)을 바라본다. */
export function enemyFigure(id: string): string {
  const eye = (x: number, y: number, r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r}" class="fig-eye"/><circle cx="${x}" cy="${y}" r="${r * 2.6}" class="fig-eye-glow"/>`;
  const body = (() => {
    switch (id) {
      case 'stray_shard':
        return `<path class="fig-ink" d="M80 30 L98 78 L80 128 L62 78Z"/>
          <path class="fig-ink" d="M52 62 L62 84 L50 110 L40 86Z"/>
          <path class="fig-ink" d="M110 58 L120 80 L110 104 L100 80Z"/>
          <path class="fig-rim" d="M80 30 L98 78 L80 128 L62 78Z"/>
          ${eye(76, 72)}`;
      case 'shadow_comet':
        return `<path class="fig-ink" d="M60 92 C 80 60, 130 40, 156 20 C 140 50, 120 80, 84 108 Z" opacity=".75"/>
          <circle class="fig-ink" cx="58" cy="100" r="28"/>
          <circle class="fig-rim" cx="58" cy="100" r="28"/>
          ${eye(48, 96)}${eye(64, 92, 2.4)}`;
      case 'dark_nebula':
        return `<path class="fig-ink" d="M30 100 C 18 70, 50 40, 76 52 C 92 26, 132 36, 132 66 C 156 74, 150 120, 120 120 C 104 140, 60 140, 50 122 C 30 126, 22 112, 30 100Z"/>
          <path class="fig-rim" d="M30 100 C 18 70, 50 40, 76 52 C 92 26, 132 36, 132 66 C 156 74, 150 120, 120 120 C 104 140, 60 140, 50 122 C 30 126, 22 112, 30 100Z"/>
          ${eye(62, 84)}${eye(84, 74, 2.6)}${eye(100, 96, 2.2)}`;
      case 'eclipse_eye':
        return `<g class="fig-rays">${Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return `<line x1="${80 + Math.cos(a) * 42}" y1="${80 + Math.sin(a) * 42}" x2="${80 + Math.cos(a) * 58}" y2="${80 + Math.sin(a) * 58}"/>`;
        }).join('')}</g>
          <path class="fig-ink" d="M24 80 Q80 28 136 80 Q80 132 24 80Z"/>
          <path class="fig-rim" d="M24 80 Q80 28 136 80 Q80 132 24 80Z"/>
          <circle cx="76" cy="80" r="18" fill="none" class="fig-iris"/>
          ${eye(76, 80, 7)}`;
      case 'fallen_keeper':
        return `<path class="fig-ink" d="M80 26 C 96 26, 100 46, 92 58 L116 150 L44 150 L68 58 C 60 46, 64 26, 80 26Z"/>
          <path class="fig-rim" d="M80 26 C 96 26, 100 46, 92 58 L116 150 L44 150 L68 58 C 60 46, 64 26, 80 26Z"/>
          <path d="M60 20 A 22 10 0 0 1 104 22" class="fig-halo-broken"/>
          <line x1="40" y1="20" x2="48" y2="152" class="fig-staff"/>
          <circle cx="40" cy="18" r="6" class="fig-eye"/>
          ${eye(74, 42, 2.4)}${eye(86, 42, 2.4)}`;
      case 'star_devourer':
        return `<g class="fig-rays">${Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r2 = i % 2 ? 76 : 66;
          return `<line x1="${80 + Math.cos(a) * 50}" y1="${80 + Math.sin(a) * 50}" x2="${80 + Math.cos(a) * r2}" y2="${80 + Math.sin(a) * r2}"/>`;
        }).join('')}</g>
          <circle class="fig-ink" cx="80" cy="80" r="50"/>
          <circle class="fig-rim" cx="80" cy="80" r="50"/>
          <g class="fig-teeth">${Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const x = 80 + Math.cos(a) * 40;
          const y = 80 + Math.sin(a) * 40;
          const tx = 80 + Math.cos(a) * 28;
          const ty = 80 + Math.sin(a) * 28;
          return `<path d="M${x + Math.sin(a) * 4} ${y - Math.cos(a) * 4} L${tx} ${ty} L${x - Math.sin(a) * 4} ${y + Math.cos(a) * 4}Z"/>`;
        }).join('')}</g>
          <circle cx="80" cy="80" r="22" class="fig-maw"/>
          ${eye(80, 80, 5)}`;
      default:
        return `<circle class="fig-ink" cx="80" cy="80" r="40"/>${eye(70, 76)}`;
    }
  })();
  return `<svg viewBox="0 0 160 160" class="fig fig-enemy" aria-hidden="true">${body}</svg>`;
}
