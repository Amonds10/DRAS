/**
 * 술사 6명의 일러스트를 뼈대별 조각으로 나눈 것.
 * 무대에서는 조각마다 판을 만들어 관절을 돌려 움직이고(컷아웃 애니메이션),
 * UI에서는 조각을 한 장으로 합쳐 그린다.
 *
 * 좌표: viewBox 0 0 200 320, 오른쪽(적 쪽)을 바라보는 3/4 측면, 발끝 y≈310.
 * 빛은 왼쪽 위에서 온다. 데이터에서 온 텍스트는 들어가지 않는 정적 마크업이다.
 */

export type Bone = 'root' | 'legs' | 'body' | 'tail' | 'armB' | 'head' | 'hair' | 'armF';

/** 관절 위치(viewBox 좌표)와 부모 */
export const BONES: Record<Bone, { pivot: [number, number]; parent: Bone | null }> = {
  root: { pivot: [100, 310], parent: null },
  legs: { pivot: [100, 168], parent: 'root' },
  body: { pivot: [100, 170], parent: 'root' },
  tail: { pivot: [100, 96], parent: 'body' },
  armB: { pivot: [86, 102], parent: 'body' },
  head: { pivot: [100, 88], parent: 'body' },
  hair: { pivot: [96, 52], parent: 'head' },
  armF: { pivot: [114, 102], parent: 'body' },
};

/** 뒤에서 앞으로 그리는 순서 */
export const DRAW_ORDER: Bone[] = ['tail', 'hair', 'armB', 'legs', 'body', 'head', 'armF'];

export type Motion = 'thrust' | 'raise' | 'shoot' | 'slash' | 'bash';

interface Palette {
  accent: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  coat: string;
  coatShade: string;
  cloth: string;
  clothShade: string;
  pants: string;
  boot: string;
  metal: string;
  eye: string;
}

interface CharArt {
  pal: Palette;
  motion: Motion;
  parts: Partial<Record<Bone, string>>;
}

const LINE = '#16131b';

/** 조각마다 같이 넣는 그라데이션 정의 */
function defs(id: string, p: Palette): string {
  const lin = (name: string, a: string, b: string, x2 = 1, y2 = 0.35) =>
    `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  return `<defs>
    ${lin('skin', p.skin, p.skinShade, 0.9, 0.5)}
    ${lin('hair', p.hair, p.hairShade, 0.8, 0.9)}
    ${lin('coat', p.coat, p.coatShade)}
    ${lin('cloth', p.cloth, p.clothShade)}
    ${lin('metal', '#f4efe2', p.metal, 0.7, 0.9)}
    ${lin('pants', p.pants, '#0c0b10', 1, 0.2)}
    <radialGradient id="${id}-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient>
  </defs>`;
}

const g = (id: string, name: string) => `url(#${id}-${name})`;

/** 3/4 측면 얼굴: 피부, 귀, 두 눈(먼 눈은 작게), 코, 입, 볼 */
function face(id: string, p: Palette, eyes: 'open' | 'calm' | 'shadow' = 'open'): string {
  const eye = (cx: number, w: number) => {
    if (eyes === 'calm') return `<path d="M${cx - w} 61 Q${cx} 63.6 ${cx + w} 60.6" stroke="${LINE}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    return `<path d="M${cx - w} 60.4 Q${cx} 56.6 ${cx + w} 59.6 Q${cx + w * 0.4} 63.4 ${cx - w} 60.4Z" fill="${LINE}"/>
      <ellipse cx="${cx + 0.5}" cy="60.6" rx="${w * 0.42}" ry="2.1" fill="${p.eye}"/>
      <circle cx="${cx + 1.1}" cy="59.6" r=".75" fill="#fff"/>`;
  };
  return `
    <path d="M95 76 L106 76 L106 94 L95 94Z" fill="${p.skinShade}"/>
    <path d="M85 56 C85 43 95 38 104 39 C115 40 120 50 119 61 C118 71 114 79 106 82 C97 84 89 77 86 67Z" fill="${g(id, 'skin')}"/>
    <ellipse cx="90.5" cy="64" rx="3.2" ry="4.6" fill="${p.skinShade}"/>
    ${eyes === 'shadow' ? '' : eye(110.5, 4.2) + eye(98.8, 2.8)}
    <path d="M106 54.2 Q111 52 115.6 54" stroke="${p.hairShade}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M116.5 63.4 L118.6 67.6 L116 68.2" stroke="${p.skinShade}" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M108.4 73.6 Q111.6 74.8 114 73.2" stroke="#8a4f4a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <ellipse cx="111" cy="68" rx="3.4" ry="1.5" fill="#e48d84" opacity=".35"/>`;
}

/** 다리 두 개와 장화 */
function legs(id: string, p: Palette): string {
  return `
    <path d="M92 164 L86 236 L84 286 L98 286 L101 236 L105 168Z" fill="${p.pants}"/>
    <path d="M82 278 L100 278 L101 300 L103 309 L76 309 L78 296Z" fill="${p.boot}"/>
    <path d="M104 164 L110 236 L115 286 L130 286 L125 234 L121 164Z" fill="${g(id, 'pants')}"/>
    <path d="M113 276 L131 276 L132 294 L146 302 L146 309 L113 309Z" fill="${p.boot}"/>
    <path d="M113 280 L131 280" stroke="${p.accent}" stroke-width="1.6" opacity=".8"/>
    <path d="M114 300 L146 302" stroke="#000" stroke-width="1" opacity=".35"/>`;
}

/** 소매 달린 팔. 어깨(sx,sy)에서 손(hx,hy)까지, 굵기 w. 손은 피부색. */
function arm(id: string, p: Palette, sx: number, sy: number, hx: number, hy: number, w = 9, sleeve = 'coat', cuff?: string): string {
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * w;
  const ny = (dx / len) * w;
  const ex = sx + dx * 0.88;
  const ey = sy + dy * 0.88;
  const f = (n: number) => n.toFixed(1);
  const cuffLine = cuff ? `<path d="M${f(ex + nx * 0.8)} ${f(ey + ny * 0.8)} L${f(ex - nx * 0.8)} ${f(ey - ny * 0.8)}" stroke="${cuff}" stroke-width="3"/>` : '';
  return `<path d="M${f(sx + nx)} ${f(sy + ny)} L${f(ex + nx * 0.75)} ${f(ey + ny * 0.75)} L${f(ex - nx * 0.75)} ${f(ey - ny * 0.75)} L${f(sx - nx)} ${f(sy - ny)} Z" fill="${g(id, sleeve)}"/>
    ${cuffLine}
    <ellipse cx="${f(hx)}" cy="${f(hy)}" rx="5.4" ry="5" fill="${g(id, 'skin')}" stroke="${p.skinShade}" stroke-width=".8"/>`;
}

const sparkle = (x: number, y: number, r: number, c: string) =>
  `<path d="M${x} ${y - r} L${x + r * 0.25} ${y - r * 0.25} L${x + r} ${y} L${x + r * 0.25} ${y + r * 0.25} L${x} ${y + r} L${x - r * 0.25} ${y + r * 0.25} L${x - r} ${y} L${x - r * 0.25} ${y - r * 0.25}Z" fill="${c}"/>`;

// ── 캐릭터별 그림 ────────────────────────────────────────────

function solea(id: string): CharArt {
  const p: Palette = {
    accent: '#efbe55', skin: '#f3d6bd', skinShade: '#cf9f86', hair: '#f2c76a', hairShade: '#b5772f',
    coat: '#a2402c', coatShade: '#5e2119', cloth: '#f4ead8', clothShade: '#c9b89c', pants: '#2a2230', boot: '#4a2e22', metal: '#a98a52', eye: '#c46a1c',
  };
  return {
    pal: p,
    motion: 'thrust',
    parts: {
      hair: `<path d="M86 50 C70 44 56 56 46 82 C42 96 40 112 46 126 C50 108 58 92 70 80 C64 98 66 112 74 124 C76 104 82 84 92 66Z" fill="${g(id, 'hair')}"/>
        <path d="M84 50 L92 46 L94 58 L86 60Z" fill="${p.accent}"/>`,
      legs: legs(id, p),
      armB: arm(id, p, 86, 102, 70, 176, 8.5, 'coat', p.accent),
      body: `
        <path d="M76 96 L124 96 L130 140 L126 172 L74 172 L70 140Z" fill="${g(id, 'cloth')}"/>
        <path d="M74 94 L98 96 L96 150 L88 196 L66 188 L70 140Z" fill="${g(id, 'coat')}"/>
        <path d="M104 96 L126 94 L132 140 L136 192 L112 198 L106 150Z" fill="${g(id, 'coat')}"/>
        <path d="M74 166 L128 166 L130 176 L72 176Z" fill="#3a2a22"/>
        <rect x="96" y="165" width="10" height="12" rx="2" fill="${p.accent}"/>
        <path d="M66 188 L88 196 M112 198 L136 192" stroke="${p.accent}" stroke-width="2.4"/>
        <path d="M98 96 L96 150 M104 96 L106 150" stroke="${p.accent}" stroke-width="1.8"/>
        <path d="M90 92 L100 104 L110 92 L106 88 L100 96 L94 88Z" fill="${p.cloth}"/>
        <path d="M100 104 L97 116 L100 122 L103 116Z" fill="${p.accent}"/>
        ${sparkle(118, 118, 5, p.accent)}`,
      head: `${face(id, p)}
        <path d="M84 60 C80 34 106 28 118 42 C122 48 122 56 120 60 C114 50 108 47 100 48 C96 54 92 60 86 66Z" fill="${g(id, 'hair')}"/>
        <path d="M100 47 C108 50 114 56 118 64 C116 54 110 46 100 47Z" fill="${p.hairShade}"/>
        <path d="M86 44 C94 38 108 37 116 42" stroke="${p.accent}" stroke-width="2.6" fill="none"/>
        ${sparkle(87, 46, 4.5, '#fff6d8')}`,
      armF: `
        <path d="M70 214 L196 86" stroke="#6d5236" stroke-width="4.4" stroke-linecap="round"/>
        <path d="M70 214 L196 86" stroke="#c9a46a" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
        <circle cx="190" cy="92" r="10" fill="none" stroke="${p.accent}" stroke-width="2.2"/>
        ${sparkle(190, 92, 6, p.accent)}
        <path d="M196 86 L210 62 L189 80Z" fill="${g(id, 'metal')}"/>
        ${arm(id, p, 114, 102, 150, 136, 8.5, 'coat', p.accent)}`,
    },
  };
}

function lune(id: string): CharArt {
  const p: Palette = {
    accent: '#a9c2e8', skin: '#f4dfd2', skinShade: '#c9a69a', hair: '#e2e8f4', hairShade: '#8590b4',
    coat: '#34406a', coatShade: '#161b33', cloth: '#e9edf6', clothShade: '#a7b0c8', pants: '#1c2038', boot: '#232846', metal: '#8c9ac0', eye: '#5d7ec4',
  };
  return {
    pal: p,
    motion: 'raise',
    parts: {
      hair: `<path d="M84 46 C70 56 68 90 70 130 C72 150 76 166 82 176 L96 166 C92 150 92 120 96 90 L104 50Z" fill="${g(id, 'hair')}"/>
        <path d="M80 70 C76 100 78 140 84 168" stroke="${p.hairShade}" stroke-width="1.4" fill="none" opacity=".7"/>`,
      tail: `<path d="M76 100 C60 160 52 230 46 300 L84 300 C80 230 84 160 92 104Z" fill="${p.coatShade}"/>`,
      legs: `<path d="M86 290 L102 290 L102 309 L82 309Z" fill="${p.boot}"/><path d="M110 290 L128 290 L136 309 L110 309Z" fill="${p.boot}"/>`,
      armB: arm(id, p, 86, 102, 74, 178, 9, 'coat', p.accent),
      body: `
        <path d="M74 94 L126 94 L136 190 L152 302 L48 302 L62 190Z" fill="${g(id, 'coat')}"/>
        <path d="M94 96 L106 96 L112 200 L118 302 L84 302 L88 200Z" fill="${g(id, 'cloth')}"/>
        <path d="M48 302 L152 302" stroke="${p.accent}" stroke-width="3"/>
        <path d="M54 280 L146 280" stroke="${p.accent}" stroke-width="1" opacity=".6"/>
        <path d="M84 302 L88 200 L94 96 M118 302 L112 200 L106 96" stroke="${p.accent}" stroke-width="1.6" fill="none"/>
        <path d="M70 160 L132 160" stroke="${p.metal}" stroke-width="3"/>
        <path d="M86 92 L100 108 L114 92" stroke="${p.accent}" stroke-width="2.4" fill="none"/>
        <path d="M100 236 a8 8 0 1 0 6 13 a6 6 0 1 1 -6 -13Z" fill="${p.accent}"/>
        ${sparkle(76, 250, 3, p.accent)}${sparkle(124, 226, 2.6, p.accent)}`,
      head: `${face(id, p, 'calm')}
        <path d="M83 62 C78 34 108 28 120 46 C122 52 121 58 119 60 C112 50 104 48 96 50 C92 56 90 62 86 70Z" fill="${g(id, 'hair')}"/>
        <path d="M118 52 C120 60 120 68 116 78 C114 66 112 58 110 52Z" fill="${g(id, 'hair')}"/>
        <path d="M86 40 a7 7 0 1 0 6 11 a5 5 0 1 1 -6 -11Z" fill="${p.accent}"/>`,
      armF: `
        <path d="M144 36 L138 306" stroke="#5b6584" stroke-width="4.2" stroke-linecap="round"/>
        <path d="M144 36 L138 306" stroke="#c7d2ec" stroke-width="1.2" opacity=".6"/>
        <path d="M156 18 C130 16 124 48 142 58 C132 46 136 26 156 18Z" fill="${p.accent}"/>
        <circle cx="146" cy="40" r="4" fill="#fff"/>
        <circle cx="146" cy="40" r="10" fill="${g(id, 'glow')}" opacity=".8"/>
        ${arm(id, p, 114, 102, 140, 150, 9, 'coat', p.accent)}`,
    },
  };
}

function nebia(id: string): CharArt {
  const p: Palette = {
    accent: '#e09bc4', skin: '#f6dccd', skinShade: '#d0a093', hair: '#e8a3c4', hairShade: '#9a4e78',
    coat: '#5a3362', coatShade: '#26132c', cloth: '#f6e6ee', clothShade: '#c7a6b8', pants: '#2b1d32', boot: '#3b2340', metal: '#b98fb0', eye: '#a24c9a',
  };
  return {
    pal: p,
    motion: 'raise',
    parts: {
      tail: `<path d="M74 92 C40 150 34 230 28 290 L70 276 L86 270 C82 200 90 140 100 100Z" fill="${p.coatShade}"/>
        <path d="M70 120 C52 170 44 230 40 280" stroke="${p.accent}" stroke-width="1" fill="none" opacity=".6"/>
        ${sparkle(52, 200, 3, p.accent)}${sparkle(44, 250, 2.4, '#fff')}${sparkle(62, 160, 2, p.accent)}`,
      legs: legs(id, p),
      armB: arm(id, p, 86, 102, 72, 172, 8, 'coat'),
      body: `
        <path d="M76 96 L124 96 L130 172 L70 172Z" fill="${g(id, 'cloth')}"/>
        <path d="M70 168 L130 168 L140 218 L60 218Z" fill="${g(id, 'coat')}"/>
        <path d="M60 218 L140 218" stroke="${p.accent}" stroke-width="3"/>
        <path d="M66 206 L134 206" stroke="#fff" stroke-width="1" opacity=".4"/>
        <path d="M74 96 C70 110 72 124 80 130 L100 118 L120 130 C128 124 130 110 126 96 L100 106Z" fill="${g(id, 'coat')}"/>
        <path d="M92 112 L100 124 L108 112 L100 116Z" fill="${p.accent}"/>
        <path d="M82 140 L118 140 M84 152 L116 152" stroke="${p.clothShade}" stroke-width="1.2"/>`,
      head: `${face(id, p)}
        <path d="M84 66 C80 50 90 42 104 44 L120 56 L116 70 C110 56 98 56 90 64 L88 76Z" fill="${g(id, 'hair')}"/>
        <path d="M116 58 C122 66 120 74 114 80 C116 72 116 66 112 60Z" fill="${g(id, 'hair')}"/>
        <ellipse cx="98" cy="41" rx="28" ry="9.5" fill="${g(id, 'coat')}" transform="rotate(-10 98 41)"/>
        <path d="M74 46 C88 38 108 34 124 36" stroke="${p.accent}" stroke-width="1.6" fill="none"/>
        <circle cx="76" cy="44" r="4.4" fill="${p.accent}"/>`,
      armF: `
        <circle cx="176" cy="40" r="16" fill="${g(id, 'glow')}" opacity=".9"/>
        <circle cx="176" cy="40" r="7" fill="${p.accent}"/>
        <circle cx="152" cy="26" r="5" fill="${p.accent}" opacity=".85"/>
        <circle cx="188" cy="72" r="4" fill="${p.accent}" opacity=".7"/>
        <circle cx="168" cy="50" r="24" fill="none" stroke="${p.accent}" stroke-width="1" opacity=".55"/>
        ${arm(id, p, 114, 102, 160, 64, 8, 'coat', p.accent)}`,
    },
  };
}

function vela(id: string): CharArt {
  const p: Palette = {
    accent: '#74cdbd', skin: '#efd0b8', skinShade: '#c49880', hair: '#3a5a5e', hairShade: '#16282b',
    coat: '#4f6f66', coatShade: '#1e302c', cloth: '#d9dccf', clothShade: '#9aa293', pants: '#232a2c', boot: '#2b2420', metal: '#7b8a88', eye: '#2e8f80',
  };
  return {
    pal: p,
    motion: 'shoot',
    parts: {
      tail: `<path d="M74 150 L64 200 L52 282 L86 270 L100 280 L100 160Z" fill="${p.coatShade}"/>`,
      legs: legs(id, p),
      armB: arm(id, p, 86, 102, 108, 150, 8.5, 'coat', p.accent),
      body: `
        <path d="M74 94 L126 94 L134 176 L148 280 L112 268 L102 280 L100 170 L66 176Z" fill="${g(id, 'coat')}"/>
        <path d="M92 96 L108 96 L106 160 L94 160Z" fill="${g(id, 'cloth')}"/>
        <path d="M94 96 L100 112 L106 96" fill="${p.clothShade}"/>
        <path d="M66 166 L134 166 L134 176 L66 176Z" fill="#2c2420"/>
        <rect x="112" y="164" width="12" height="14" rx="1.5" fill="#4a3a30"/>
        <path d="M108 96 L112 270 M126 94 L132 140" stroke="${p.accent}" stroke-width="1.8"/>
        <path d="M76 96 L70 120 L88 116Z M124 96 L130 120 L112 116Z" fill="${p.coatShade}"/>`,
      head: `${face(id, p)}
        <path d="M84 62 C78 34 120 30 120 56 L114 50 L108 58 L102 48 L94 58 L88 52Z" fill="${g(id, 'hair')}"/>
        <path d="M84 46 L120 44 L120 52 L84 54Z" fill="#3b3430"/>
        <circle cx="96" cy="48" r="5.4" fill="${p.accent}" stroke="#2a2522" stroke-width="2"/>
        <circle cx="110" cy="47" r="5.4" fill="${p.accent}" stroke="#2a2522" stroke-width="2"/>
        <circle cx="94.6" cy="46.6" r="1.4" fill="#fff"/>`,
      armF: `
        <path d="M92 150 L198 126 L200 136 L96 162Z" fill="#3e3a38"/>
        <path d="M150 136 L198 126" stroke="${p.accent}" stroke-width="2.4"/>
        <path d="M118 152 L110 178 L122 180 L128 156Z" fill="#5a4636"/>
        <rect x="136" y="124" width="20" height="7" rx="1" fill="${p.metal}"/>
        <circle cx="200" cy="131" r="3" fill="${p.accent}"/>
        ${arm(id, p, 114, 102, 140, 140, 8.5, 'coat', p.accent)}`,
    },
  };
}

function nox(id: string): CharArt {
  const p: Palette = {
    accent: '#a891e6', skin: '#dcc4bc', skinShade: '#a48a86', hair: '#3a2f4e', hairShade: '#140f1e',
    coat: '#3a2f52', coatShade: '#120d1c', cloth: '#5b4a7a', clothShade: '#2a2140', pants: '#1a1424', boot: '#1e1828', metal: '#6c5e8e', eye: '#c7a8ff',
  };
  return {
    pal: p,
    motion: 'slash',
    parts: {
      tail: `<path d="M84 60 C56 90 50 180 42 300 L104 300 L100 70Z" fill="${p.coatShade}"/>`,
      legs: legs(id, p),
      armB: `<circle cx="64" cy="176" r="18" fill="${g(id, 'glow')}" opacity=".9"/><circle cx="64" cy="176" r="7" fill="#120d1c" stroke="${p.accent}" stroke-width="1.6"/>
        ${arm(id, p, 86, 102, 68, 170, 9, 'coat')}`,
      body: `
        <path d="M100 44 C62 54 56 116 54 200 L48 300 L156 300 L150 200 C146 116 140 54 100 44Z" fill="${g(id, 'coat')}"/>
        <path d="M100 96 L112 300 L96 300Z" fill="${p.coatShade}"/>
        <path d="M48 300 L156 300" stroke="${p.accent}" stroke-width="2.4"/>
        <path d="M60 280 L150 280" stroke="${p.accent}" stroke-width=".8" opacity=".5"/>
        <path d="M84 120 L120 120" stroke="${p.metal}" stroke-width="2.4"/>
        <circle cx="100" cy="120" r="4" fill="${p.accent}"/>
        ${sparkle(130, 220, 2.4, p.accent)}${sparkle(76, 250, 2, p.accent)}`,
      head: `<path d="M100 32 C68 32 70 80 76 94 L124 94 C130 80 132 32 100 32Z" fill="${g(id, 'coat')}"/>
        <path d="M100 34 C126 36 130 76 124 94 L106 94 C114 72 114 50 100 34Z" fill="${p.coatShade}"/>
        <path d="M92 56 C92 46 114 46 118 58 C120 70 114 82 104 84 C96 84 92 74 92 66Z" fill="${g(id, 'skin')}"/>
        <path d="M90 44 C100 40 116 44 120 60 L114 62 C110 52 100 50 92 58Z" fill="${p.hairShade}"/>
        <path d="M106 64 Q110 61.5 114 63.4" stroke="${p.eye}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M106 64 Q110 61.5 114 63.4" stroke="#fff" stroke-width=".7" fill="none" stroke-linecap="round"/>
        <path d="M107 76 Q110.5 77.4 113 76" stroke="#6a4a50" stroke-width="1" fill="none" stroke-linecap="round"/>`,
      armF: `
        <path d="M140 186 L170 216" stroke="#8a7aa8" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M166 212 L190 240 L172 218Z" fill="${p.accent}"/>
        <path d="M134 182 L146 192" stroke="${p.metal}" stroke-width="5" stroke-linecap="round"/>
        ${arm(id, p, 114, 102, 136, 182, 9, 'coat')}`,
    },
  };
}

function astra(id: string): CharArt {
  const p: Palette = {
    accent: '#f1e6c8', skin: '#f0d3be', skinShade: '#c69a86', hair: '#d9c7a4', hairShade: '#8c7650',
    coat: '#b9c0cf', coatShade: '#4e5568', cloth: '#efe7d2', clothShade: '#b7aa8a', pants: '#2c2f3a', boot: '#3a3e4c', metal: '#5e6678', eye: '#7a8fb8',
  };
  return {
    pal: p,
    motion: 'bash',
    parts: {
      hair: `<path d="M92 30 C80 14 60 16 48 30 C62 26 74 30 82 40Z" fill="${p.accent}"/>
        <path d="M90 32 C74 24 58 30 50 44 C64 36 76 38 86 44Z" fill="#d8c9a4"/>`,
      tail: `<path d="M78 98 C60 150 56 220 54 270 L90 262 L96 110Z" fill="#6a2f36"/>`,
      legs: legs(id, p).replace(new RegExp(p.boot, 'g'), p.metal),
      armB: arm(id, p, 86, 102, 78, 176, 10, 'coat', p.accent),
      body: `
        <path d="M68 94 L132 94 L138 176 L126 226 L74 226 L62 176Z" fill="${g(id, 'coat')}"/>
        <path d="M84 108 L116 108 L118 240 L82 240Z" fill="${g(id, 'cloth')}"/>
        <path d="M82 240 L118 240" stroke="${p.accent}" stroke-width="2"/>
        ${sparkle(100, 150, 10, '#c9a55e')}
        <path d="M58 90 L86 84 L90 118 L56 120Z" fill="${g(id, 'metal')}"/>
        <path d="M66 162 L134 162" stroke="#7a6a4a" stroke-width="5"/>
        <rect x="94" y="158" width="12" height="9" fill="#c9a55e"/>`,
      head: `${face(id, p)}
        <path d="M82 66 C78 34 122 32 121 62 L121 70 L112 70 L112 60 C104 54 94 56 88 62 L88 72 L82 72Z" fill="${g(id, 'metal')}"/>
        <path d="M100 34 L102 56" stroke="${p.accent}" stroke-width="2.4"/>
        <path d="M86 62 L121 60" stroke="${p.metal}" stroke-width="2.4"/>`,
      armF: `
        ${arm(id, p, 114, 102, 146, 140, 10, 'coat', p.accent)}
        <path d="M140 90 L190 98 L188 222 L162 258 L136 226Z" fill="${g(id, 'metal')}"/>
        <path d="M146 100 L184 106 L182 218 L162 246 L142 222Z" fill="#3a4258"/>
        <path d="M146 100 L184 106 L182 218 L162 246 L142 222Z" fill="none" stroke="#c9a55e" stroke-width="2"/>
        ${sparkle(164, 162, 16, p.accent)}
        <circle cx="164" cy="162" r="4" fill="#c9a55e"/>`,
    },
  };
}

const MAKERS: Record<string, (id: string) => CharArt> = { solea, lune, nebia, vela, nox, astra };
const cache = new Map<string, CharArt>();

function art(id: string): CharArt {
  let a = cache.get(id);
  if (!a) {
    a = (MAKERS[id] ?? solea)(`c-${id}`);
    cache.set(id, a);
  }
  return a;
}

/** 조각 하나를 독립된 SVG로(무대 텍스처용) */
export function partSvg(id: string, bone: Bone): string | null {
  const a = art(id);
  const body = a.parts[bone];
  if (!body) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320" width="200" height="320">${defs(`c-${id}`, a.pal)}${body}</svg>`;
}

export function characterMotion(id: string): Motion {
  return art(id).motion;
}

export function characterAccent(id: string): string {
  return art(id).pal.accent;
}

/** 조각을 합친 전신 그림 */
export function characterSvg(id: string, cls = 'fig fig-ally', viewBox = '0 0 200 320', extra = ''): string {
  const a = art(id);
  const body = DRAW_ORDER.map((b) => a.parts[b] ?? '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="${cls}" aria-hidden="true"${extra}>${defs(`c-${id}`, a.pal)}${body}</svg>`;
}

/** 머리와 어깨만 보이게 자른 초상(편성 슬롯, 전투 하단 막대용) */
export function characterBust(id: string): string {
  return characterSvg(id, 'fig fig-bust', '58 28 96 96', ' preserveAspectRatio="xMidYMin slice"');
}
