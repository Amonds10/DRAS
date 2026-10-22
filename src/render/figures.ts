/**
 * 적 형상(SVG). 캐릭터 일러스트는 characters.ts에 있다.
 * 데이터에서 온 텍스트는 들어가지 않는 정적 마크업이다.
 */

/** 적 형상. viewBox 0 0 160 160, 왼쪽(아군 쪽)을 바라본다. 텍스처로도 굽기 때문에 스타일을 속성으로 넣는다. */
export function enemyFigure(id: string): string {
  const INK = 'fill="#07070a"';
  const RIM = 'fill="none" stroke="#e0685a" stroke-width="1.6"';
  const eye = (x: number, y: number, r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r * 2.4}" fill="#ff5a3a" opacity=".25"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ffe2c0"/>`;
  const rays = (n: number, r1: number, r2: (i: number) => number, color = '#b0372c') =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return `<line x1="${80 + Math.cos(a) * r1}" y1="${80 + Math.sin(a) * r1}" x2="${80 + Math.cos(a) * r2(i)}" y2="${80 + Math.sin(a) * r2(i)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    }).join('');
  const body = (() => {
    switch (id) {
      case 'stray_shard':
        return `<path ${INK} d="M80 30 L98 78 L80 128 L62 78Z"/><path ${INK} d="M52 62 L62 84 L50 110 L40 86Z"/><path ${INK} d="M110 58 L120 80 L110 104 L100 80Z"/>
          <path ${RIM} d="M80 30 L98 78 L80 128 L62 78Z"/><path ${RIM} d="M52 62 L62 84 L50 110 L40 86Z" opacity=".6"/>${eye(76, 72)}`;
      case 'shadow_comet':
        return `<path ${INK} d="M60 92 C 80 60, 130 40, 156 20 C 140 50, 120 80, 84 108 Z" opacity=".85"/>
          <path d="M70 86 C 96 62, 128 44, 150 28" fill="none" stroke="#e0685a" stroke-width="1" opacity=".5"/>
          <circle ${INK} cx="58" cy="100" r="28"/><circle ${RIM} cx="58" cy="100" r="28"/>${eye(48, 96)}${eye(64, 92, 2.4)}`;
      case 'dark_nebula': {
        const d = 'M30 100 C 18 70, 50 40, 76 52 C 92 26, 132 36, 132 66 C 156 74, 150 120, 120 120 C 104 140, 60 140, 50 122 C 30 126, 22 112, 30 100Z';
        return `<path ${INK} d="${d}"/><path ${RIM} d="${d}"/>${eye(62, 84)}${eye(84, 74, 2.6)}${eye(100, 96, 2.2)}`;
      }
      case 'eclipse_eye':
        return `${rays(16, 42, () => 58)}<path ${INK} d="M24 80 Q80 28 136 80 Q80 132 24 80Z"/><path ${RIM} d="M24 80 Q80 28 136 80 Q80 132 24 80Z"/>
          <circle cx="76" cy="80" r="18" fill="none" stroke="#e0685a" stroke-width="2"/>${eye(76, 80, 7)}`;
      case 'fallen_keeper': {
        const d = 'M80 26 C 96 26, 100 46, 92 58 L116 150 L44 150 L68 58 C 60 46, 64 26, 80 26Z';
        return `<path ${INK} d="${d}"/><path ${RIM} d="${d}"/><path d="M60 20 A 22 10 0 0 1 104 22" fill="none" stroke="#c9a55e" stroke-width="2" stroke-dasharray="10 6"/>
          <line x1="40" y1="20" x2="48" y2="152" stroke="#6c675d" stroke-width="3"/><circle cx="40" cy="18" r="6" fill="#ffe2c0"/>${eye(74, 42, 2.4)}${eye(86, 42, 2.4)}`;
      }
      case 'star_devourer': {
        const teeth = Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const x = 80 + Math.cos(a) * 40;
          const y = 80 + Math.sin(a) * 40;
          const tx = 80 + Math.cos(a) * 28;
          const ty = 80 + Math.sin(a) * 28;
          return `<path fill="#d8d0c0" d="M${x + Math.sin(a) * 4} ${y - Math.cos(a) * 4} L${tx} ${ty} L${x - Math.sin(a) * 4} ${y + Math.cos(a) * 4}Z"/>`;
        }).join('');
        return `${rays(24, 50, (i) => (i % 2 ? 76 : 66))}<circle ${INK} cx="80" cy="80" r="50"/><circle ${RIM} cx="80" cy="80" r="50"/>${teeth}
          <circle cx="80" cy="80" r="22" fill="#000" stroke="#e0685a" stroke-width="2"/>${eye(80, 80, 5)}`;
      }
      default:
        return `<circle ${INK} cx="80" cy="80" r="40"/>${eye(70, 76)}`;
    }
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" class="fig fig-enemy" aria-hidden="true">${body}</svg>`;
}
