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
      case 'dusk_moth': {
        const wing = 'M80 78 C 60 40, 18 30, 20 62 C 22 88, 52 96, 80 84Z';
        const low = 'M80 86 C 62 96, 34 118, 46 132 C 58 142, 76 112, 80 92Z';
        const mirror = (d: string) => `<g transform="translate(160 0) scale(-1 1)">${d}</g>`;
        const wings = `<path ${INK} d="${wing}"/><path ${INK} d="${low}"/><path ${RIM} d="${wing}"/><path ${RIM} d="${low}" opacity=".6"/>`;
        return `${wings}${mirror(wings)}<ellipse ${INK} cx="80" cy="86" rx="8" ry="26"/>
          <circle cx="42" cy="62" r="7" fill="none" stroke="#e0685a" stroke-width="1.4"/><circle cx="118" cy="62" r="7" fill="none" stroke="#e0685a" stroke-width="1.4"/>
          <path d="M76 62 C 70 46, 64 40, 58 38 M84 62 C 90 46, 96 40, 102 38" fill="none" stroke="#e0685a" stroke-width="1.4"/>${eye(76, 70, 2.2)}${eye(84, 70, 2.2)}`;
      }
      case 'star_leech': {
        const d = 'M138 96 C 140 70, 116 58, 96 66 C 78 72, 66 62, 48 62 C 26 62, 14 80, 20 98 C 26 116, 52 120, 70 112 C 90 104, 102 120, 120 116 C 132 112, 138 106, 138 96Z';
        const mouth = Array.from({ length: 7 }, (_, i) => {
          const a = Math.PI * 0.5 + (i / 7) * Math.PI * 2;
          return `<path fill="#d8d0c0" d="M${30 + Math.cos(a) * 12} ${88 + Math.sin(a) * 12} L${30 + Math.cos(a + 0.25) * 5} ${88 + Math.sin(a + 0.25) * 5} L${30 + Math.cos(a + 0.5) * 12} ${88 + Math.sin(a + 0.5) * 12}Z"/>`;
        }).join('');
        return `<path ${INK} d="${d}"/><path ${RIM} d="${d}"/><circle cx="30" cy="88" r="13" fill="#000" stroke="#e0685a" stroke-width="1.6"/>${mouth}
          <path d="M60 70 C 80 78, 100 70, 124 82" fill="none" stroke="#e0685a" stroke-width="1" opacity=".5" stroke-dasharray="3 5"/>${eye(54, 74, 2.6)}`;
      }
      case 'shard_golem': {
        const torso = 'M48 52 L112 52 L122 98 L100 122 L60 122 L38 98Z';
        return `<path ${INK} d="M28 58 L46 54 L40 104 L22 98Z"/><path ${INK} d="M132 58 L114 54 L120 104 L138 98Z"/>
          <path ${INK} d="${torso}"/><path ${RIM} d="${torso}"/><path ${INK} d="M64 22 L96 22 L102 48 L58 48Z"/><path ${RIM} d="M64 22 L96 22 L102 48 L58 48Z"/>
          <path ${INK} d="M58 122 L74 122 L70 152 L52 152Z"/><path ${INK} d="M86 122 L102 122 L108 152 L90 152Z"/>
          <path d="M80 60 L92 80 L80 100 L68 80Z" fill="none" stroke="#e0685a" stroke-width="2"/>${eye(80, 80, 4)}${eye(72, 34, 2)}${eye(88, 34, 2)}`;
      }
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
