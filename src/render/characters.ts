/**
 * 술사 6명의 2D 일러스트(SVG). 얼굴은 그림자 속에 두고, 머리 모양·외투·무기로 구분한다.
 * viewBox 0 0 200 320, 발끝이 아래쪽(y≈312)에 오도록 그린다.
 * 데이터에서 온 텍스트는 들어가지 않는 정적 마크업이다.
 */

const SHADOW = '#101217';
const BASE = '#1d2029';
const MID = '#2b3040';
const LIGHT = '#454c60';

interface Look {
  accent: string;
  /** 머리 모양 */
  hair: 'ponytail' | 'long' | 'beret' | 'short' | 'hood' | 'helm';
  /** 외투 */
  coat: 'short' | 'robe' | 'cape' | 'long' | 'cloak' | 'armor';
  /** 무기·소품 */
  weapon: 'spear' | 'staff' | 'orbs' | 'rifle' | 'dagger' | 'shield';
  /** 앞팔 자세 */
  arm: 'forward' | 'down' | 'raised';
}

const LOOKS: Record<string, Look> = {
  solea: { accent: '#efbe55', hair: 'ponytail', coat: 'short', weapon: 'spear', arm: 'forward' },
  lune: { accent: '#a9c2e8', hair: 'long', coat: 'robe', weapon: 'staff', arm: 'down' },
  nebia: { accent: '#e09bc4', hair: 'beret', coat: 'cape', weapon: 'orbs', arm: 'raised' },
  vela: { accent: '#74cdbd', hair: 'short', coat: 'long', weapon: 'rifle', arm: 'forward' },
  nox: { accent: '#a891e6', hair: 'hood', coat: 'cloak', weapon: 'dagger', arm: 'down' },
  astra: { accent: '#f1e6c8', hair: 'helm', coat: 'armor', weapon: 'shield', arm: 'forward' },
};

function legs(): string {
  return `
    <path d="M90 168 L80 238 L78 298 L74 308 L96 308 L94 298 L98 238 L102 172 Z" fill="${SHADOW}"/>
    <path d="M104 170 L112 238 L118 298 L116 308 L140 308 L134 298 L128 236 L120 168 Z" fill="${BASE}"/>
    <path d="M76 296 L98 296 L97 310 L72 310 Z" fill="${SHADOW}"/>
    <path d="M114 296 L136 296 L142 310 L112 310 Z" fill="${MID}"/>`;
}

function coat(kind: Look['coat'], a: string): string {
  switch (kind) {
    case 'short':
      return `
        <path d="M74 96 L126 96 L132 168 L124 196 L104 188 L86 198 L70 168 Z" fill="${BASE}"/>
        <path d="M100 98 L126 96 L132 168 L124 196 L104 188 Z" fill="${MID}"/>
        <path d="M70 168 L132 168" stroke="${a}" stroke-width="3"/>
        <path d="M78 100 C 60 120, 40 128, 22 150 C 44 140, 62 136, 82 118 Z" fill="${a}" opacity=".9"/>`;
    case 'robe':
      return `
        <path d="M74 96 L126 96 L140 200 L152 306 L48 306 L60 200 Z" fill="${BASE}"/>
        <path d="M100 98 L126 96 L140 200 L152 306 L104 306 Z" fill="${MID}"/>
        <path d="M100 100 L104 306" stroke="${a}" stroke-width="2" opacity=".8"/>
        <path d="M48 306 L152 306" stroke="${a}" stroke-width="3"/>`;
    case 'cape':
      return `
        <path d="M70 94 C 40 150, 36 230, 30 286 L84 268 L100 120 Z" fill="${SHADOW}"/>
        <path d="M76 98 L124 98 L130 172 L70 172 Z" fill="${BASE}"/>
        <path d="M100 98 L124 98 L130 172 L102 172 Z" fill="${MID}"/>
        <path d="M70 172 L130 172 L136 214 L64 214 Z" fill="${BASE}"/>
        <path d="M64 214 L136 214" stroke="${a}" stroke-width="3"/>`;
    case 'long':
      return `
        <path d="M74 96 L126 96 L136 180 L150 282 L112 270 L100 282 L84 268 L52 280 L64 180 Z" fill="${BASE}"/>
        <path d="M100 98 L126 96 L136 180 L150 282 L112 270 L102 280 Z" fill="${MID}"/>
        <path d="M100 98 L102 280" stroke="${SHADOW}" stroke-width="3"/>
        <path d="M64 176 L136 176" stroke="${a}" stroke-width="3"/>
        <path d="M126 96 L132 140" stroke="${a}" stroke-width="2"/>`;
    case 'cloak':
      return `
        <path d="M100 40 C 60 50, 54 110, 50 200 L42 300 L158 300 L150 200 C 146 110, 140 50, 100 40 Z" fill="${SHADOW}"/>
        <path d="M100 42 C 140 52, 146 110, 150 200 L158 300 L104 300 Z" fill="${BASE}"/>
        <path d="M42 300 L158 300" stroke="${a}" stroke-width="2.5" opacity=".9"/>
        <path d="M86 120 L118 120" stroke="${a}" stroke-width="2"/>`;
    case 'armor':
      return `
        <path d="M66 94 L134 94 L140 176 L126 224 L74 224 L60 176 Z" fill="${BASE}"/>
        <path d="M100 96 L134 94 L140 176 L126 224 L102 224 Z" fill="${MID}"/>
        <path d="M58 90 L84 86 L88 116 L56 118 Z" fill="${LIGHT}"/>
        <path d="M116 86 L144 90 L146 118 L114 116 Z" fill="${LIGHT}"/>
        <path d="M70 160 L130 160" stroke="${a}" stroke-width="3"/>
        <path d="M74 224 L126 224" stroke="${a}" stroke-width="2"/>`;
  }
}

function backArm(): string {
  return `<path d="M78 100 L64 150 L62 186 L74 188 L78 152 L90 108 Z" fill="${SHADOW}"/>`;
}

function frontArm(pose: Look['arm']): string {
  switch (pose) {
    case 'forward':
      return `<path d="M118 100 L146 128 L170 132 L170 144 L142 142 L112 116 Z" fill="${MID}"/>
              <circle cx="172" cy="138" r="6" fill="${LIGHT}"/>`;
    case 'raised':
      return `<path d="M118 100 L144 82 L160 60 L170 66 L152 92 L124 116 Z" fill="${MID}"/>
              <circle cx="164" cy="60" r="6" fill="${LIGHT}"/>`;
    case 'down':
      return `<path d="M118 100 L134 150 L140 184 L128 186 L122 154 L110 108 Z" fill="${MID}"/>
              <circle cx="135" cy="188" r="6" fill="${LIGHT}"/>`;
  }
}

function head(hair: Look['hair'], a: string): string {
  const face = `<rect x="94" y="76" width="12" height="18" fill="${SHADOW}"/>
    <ellipse cx="100" cy="62" rx="16" ry="19" fill="${SHADOW}"/>
    <path d="M108 60 L116 60" stroke="${a}" stroke-width="2" stroke-linecap="round" opacity=".9"/>`;
  switch (hair) {
    case 'ponytail':
      return `${face}
        <path d="M82 60 C 80 36, 118 34, 118 56 L114 52 C 104 46, 92 48, 86 66 Z" fill="${MID}"/>
        <path d="M84 50 C 60 46, 44 64, 30 92 C 52 78, 66 68, 86 62 Z" fill="${MID}"/>
        <path d="M86 44 L114 44" stroke="${a}" stroke-width="2.5"/>`;
    case 'long':
      return `<path d="M80 54 C 78 30, 124 30, 120 56 L124 140 L98 120 L76 140 Z" fill="${MID}"/>${face}
        <path d="M82 58 C 80 34, 120 34, 118 56 L112 50 C 100 46, 90 50, 86 70 Z" fill="${MID}"/>
        <circle cx="86" cy="48" r="3" fill="${a}"/>`;
    case 'beret':
      return `${face}
        <path d="M82 66 C 80 52, 92 44, 104 46 L118 58 L112 70 C 104 56, 92 58, 86 72 Z" fill="${MID}"/>
        <ellipse cx="96" cy="42" rx="26" ry="9" fill="${BASE}" transform="rotate(-10 96 42)"/>
        <circle cx="74" cy="44" r="4" fill="${a}"/>`;
    case 'short':
      return `${face}
        <path d="M82 62 C 78 34, 122 32, 118 58 L112 52 L106 60 L100 50 L92 60 L86 54 Z" fill="${MID}"/>
        <path d="M80 52 L118 52" stroke="${SHADOW}" stroke-width="3"/>
        <rect x="76" y="56" width="10" height="5" fill="${a}"/>`;
    case 'hood':
      return `<path d="M100 36 C 70 36, 72 80, 78 92 L122 92 C 128 80, 130 36, 100 36 Z" fill="${BASE}"/>
        <path d="M100 38 C 124 40, 128 76, 122 92 L104 92 C 112 70, 112 50, 100 38 Z" fill="${MID}"/>
        <ellipse cx="104" cy="66" rx="12" ry="15" fill="#07080b"/>
        <path d="M106 64 L114 64" stroke="${a}" stroke-width="2" stroke-linecap="round"/>`;
    case 'helm':
      return `${face}
        <path d="M80 64 C 78 36, 122 34, 120 62 L120 70 L80 70 Z" fill="${LIGHT}"/>
        <path d="M100 36 L104 70" stroke="${a}" stroke-width="2.5"/>
        <path d="M84 70 L118 70" stroke="${SHADOW}" stroke-width="3"/>`;
  }
}

function weapon(kind: Look['weapon'], a: string): string {
  switch (kind) {
    case 'spear':
      return `<path d="M60 212 L188 92" stroke="${LIGHT}" stroke-width="4" stroke-linecap="round"/>
        <path d="M186 94 L198 70 L176 88 Z" fill="${a}"/>
        <circle cx="188" cy="88" r="9" fill="none" stroke="${a}" stroke-width="2"/>`;
    case 'staff':
      return `<path d="M140 40 L136 304" stroke="${LIGHT}" stroke-width="4" stroke-linecap="round"/>
        <path d="M150 26 C 128 26, 124 52, 140 60 C 130 50, 134 34, 150 26 Z" fill="${a}"/>
        <circle cx="142" cy="44" r="3" fill="${a}"/>`;
    case 'orbs':
      return `<circle cx="176" cy="44" r="8" fill="${a}"/>
        <circle cx="152" cy="30" r="5" fill="${a}" opacity=".85"/>
        <circle cx="186" cy="74" r="4" fill="${a}" opacity=".7"/>
        <circle cx="168" cy="52" r="20" fill="none" stroke="${a}" stroke-width="1.2" opacity=".6"/>`;
    case 'rifle':
      return `<path d="M96 150 L196 128 L198 136 L100 160 Z" fill="${LIGHT}"/>
        <path d="M120 152 L112 176 L122 178 L128 156 Z" fill="${MID}"/>
        <path d="M150 138 L196 128" stroke="${a}" stroke-width="2.5"/>
        <rect x="140" y="128" width="16" height="6" fill="${MID}"/>`;
    case 'dagger':
      return `<path d="M136 186 L160 214" stroke="${LIGHT}" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M158 212 L178 236 L164 216 Z" fill="${a}"/>
        <circle cx="66" cy="182" r="10" fill="${a}" opacity=".85"/>
        <circle cx="66" cy="182" r="16" fill="none" stroke="${a}" stroke-width="1.2" opacity=".6"/>`;
    case 'shield':
      return `<path d="M140 92 L188 100 L186 220 L160 254 L136 226 Z" fill="${LIGHT}"/>
        <path d="M146 100 L182 106 L180 216 L160 242 L142 220 Z" fill="${MID}"/>
        <path d="M162 140 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5z" fill="${a}"/>`;
  }
}

export function characterSvg(id: string): string {
  const L = LOOKS[id] ?? LOOKS.solea;
  const a = L.accent;
  // 망토·후드처럼 몸을 덮는 외투는 다리 위에 그린다.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320" class="fig fig-ally" aria-hidden="true">
    ${L.coat === 'cape' ? '' : backArm()}
    ${legs()}
    ${coat(L.coat, a)}
    ${L.coat === 'cape' ? backArm() : ''}
    ${head(L.hair, a)}
    ${L.weapon === 'shield' ? frontArm(L.arm) + weapon(L.weapon, a) : weapon(L.weapon, a) + frontArm(L.arm)}
  </svg>`;
}

export function characterAccent(id: string): string {
  return (LOOKS[id] ?? LOOKS.solea).accent;
}

/** 머리와 어깨만 보이게 자른 초상(편성 슬롯, 전투 하단 막대용) */
export function characterBust(id: string): string {
  return characterSvg(id).replace('viewBox="0 0 200 320" class="fig fig-ally"', 'viewBox="46 26 108 108" class="fig fig-bust" preserveAspectRatio="xMidYMin slice"');
}
