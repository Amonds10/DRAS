/**
 * 마법·별 장식 SVG. 가는 금색 선, 눈금, 룬 띠, 별 모양으로 이루어진다.
 * 색은 currentColor를 따르므로 CSS에서 정한다.
 */

const RUNES = '✦☉☾✺☄◉✧⟡⊹✶';

function ticks(r1: number, r2: number, n: number, every = 0, r3 = 0): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const long = every && i % every === 0;
    const a1 = long && r3 ? r3 : r1;
    const c = Math.cos(a), s = Math.sin(a);
    d += `M${(50 + c * a1).toFixed(2)} ${(50 + s * a1).toFixed(2)}L${(50 + c * r2).toFixed(2)} ${(50 + s * r2).toFixed(2)}`;
  }
  return `<path d="${d}" stroke="currentColor" stroke-width=".4" fill="none"/>`;
}

function polygon(r: number, n: number, rot = -Math.PI / 2, step = 1): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + ((i * step) / n) * Math.PI * 2;
    pts.push(`${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width=".45"/>`;
}

/** 룬 글자를 원 둘레에 늘어놓는다(textPath 대신 각 글자를 회전 배치: 브라우저 차이가 적다) */
function runeRing(r: number, n: number, size: number, offset = 0): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const deg = (i / n) * 360;
    const ch = RUNES[(i + offset) % RUNES.length];
    out += `<text x="50" y="${(50 - r).toFixed(2)}" transform="rotate(${deg.toFixed(1)} 50 50)" font-size="${size}" text-anchor="middle" dominant-baseline="central" fill="currentColor">${ch}</text>`;
  }
  return out;
}

/**
 * 시전 인장: 바깥 눈금 고리(천천히 돎), 룬 띠(반대로 돎), 안쪽 육망성과 별.
 * 가운데는 비워 두고 HTML로 글자를 얹는다.
 */
export function sealSvg(): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true" class="seal-svg">
    <g class="seal-outer">
      <circle cx="50" cy="50" r="49" fill="none" stroke="currentColor" stroke-width=".6"/>
      <circle cx="50" cy="50" r="46.5" fill="none" stroke="currentColor" stroke-width=".3"/>
      ${ticks(46.5, 49, 120, 10, 44.5)}
    </g>
    <g class="seal-runes">
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width=".35" opacity=".8"/>
      ${runeRing(39.2, 24, 3.6)}
      <circle cx="50" cy="50" r="36.3" fill="none" stroke="currentColor" stroke-width=".35" opacity=".8"/>
    </g>
    <g class="seal-inner" opacity=".55">
      ${polygon(36, 3)}${polygon(36, 3, Math.PI / 2)}
      <circle cx="50" cy="50" r="18" fill="none" stroke="currentColor" stroke-width=".3"/>
    </g>
  </svg>`;
}

/** 작은 스킬 인장 고리: 눈금 원 하나와 점 넷(아이콘 둘레) */
export function sigilRingSvg(): string {
  let dots = '';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
    dots += `<circle cx="${(50 + Math.cos(a) * 47).toFixed(2)}" cy="${(50 + Math.sin(a) * 47).toFixed(2)}" r="1.6" fill="currentColor"/>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true" class="sigil-ring">
    <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" stroke-width="1"/>
    ${ticks(41, 44, 36)}
    ${dots}
  </svg>`;
}

/** 패널 네 귀퉁이 별 장식 */
export function cornerStars(): string {
  const star = (cls: string) => `<i class="corner ${cls}">✦</i>`;
  return star('tl') + star('tr') + star('bl') + star('br');
}
