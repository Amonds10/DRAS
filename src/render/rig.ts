/**
 * 술사 8명의 2D 일러스트(SVG)를 뼈대별 조각으로 나눈 것.
 * 얼굴은 그림자 속에 두고, 머리 모양·외투·무기로 구분하는 검은 실루엣이다.
 * 무대에서는 조각마다 판을 만들어 관절을 돌려 움직이고(컷아웃 애니메이션),
 * UI에서는 조각을 한 장으로 합쳐 그린다.
 *
 * 좌표: viewBox 0 0 200 320, 오른쪽(적 쪽)을 바라본다, 발끝 y≈310.
 * 데이터에서 온 텍스트는 들어가지 않는 정적 마크업이다.
 */

export type Bone = 'root' | 'legs' | 'body' | 'tail' | 'armB' | 'head' | 'hair' | 'armF';

/** 관절 위치(viewBox 좌표)와 부모 */
export const BONES: Record<Bone, { pivot: [number, number]; parent: Bone | null }> = {
  root: { pivot: [100, 310], parent: null },
  legs: { pivot: [100, 168], parent: 'root' },
  body: { pivot: [100, 170], parent: 'root' },
  tail: { pivot: [100, 96], parent: 'body' },
  armB: { pivot: [80, 102], parent: 'body' },
  head: { pivot: [100, 88], parent: 'body' },
  hair: { pivot: [96, 52], parent: 'head' },
  armF: { pivot: [118, 102], parent: 'body' },
};

/** 뒤에서 앞으로 그리는 순서 */
export const DRAW_ORDER: Bone[] = ['tail', 'hair', 'armB', 'legs', 'body', 'head', 'armF'];

export type Motion = 'thrust' | 'raise' | 'shoot' | 'slash' | 'bash' | 'blade' | 'pistol';

const SHADOW = '#101217';
const BASE = '#1d2029';
const MID = '#2b3040';
const LIGHT = '#454c60';

interface Look {
  accent: string;
  /** 머리 모양 */
  hair: 'ponytail' | 'long' | 'beret' | 'short' | 'hood' | 'helm' | 'band' | 'hat';
  /** 외투 */
  coat: 'short' | 'robe' | 'cape' | 'long' | 'cloak' | 'armor' | 'haori' | 'vest';
  /** 무기·소품 */
  weapon: 'spear' | 'staff' | 'orbs' | 'rifle' | 'dagger' | 'shield' | 'sword' | 'pistols';
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
  kairen: { accent: '#c9d8f2', hair: 'band', coat: 'haori', weapon: 'sword', arm: 'forward' },
  riko: { accent: '#ff9a4a', hair: 'hat', coat: 'vest', weapon: 'pistols', arm: 'forward' },
};

const MOTION: Record<Look['weapon'], Motion> = { spear: 'thrust', staff: 'raise', orbs: 'raise', rifle: 'shoot', dagger: 'slash', shield: 'bash', sword: 'blade', pistols: 'pistol' };

function legs(): string {
  return `
    <path d="M90 168 L80 238 L78 298 L74 308 L96 308 L94 298 L98 238 L102 172 Z" fill="${SHADOW}"/>
    <path d="M104 170 L112 238 L118 298 L116 308 L140 308 L134 298 L128 236 L120 168 Z" fill="${BASE}"/>
    <path d="M76 296 L98 296 L97 310 L72 310 Z" fill="${SHADOW}"/>
    <path d="M114 296 L136 296 L142 310 L112 310 Z" fill="${MID}"/>`;
}

/** 리코의 목도리: 목에서 뒤로 날린다(따로 흔들린다) */
function scarf(a: string): string {
  return `<path d="M86 96 C 62 98, 44 110, 26 130 L32 138 C 50 122, 66 112, 90 106 Z" fill="${a}" opacity=".9"/>
    <path d="M84 102 C 66 110, 54 124, 46 142 L52 146 C 60 130, 70 118, 88 110 Z" fill="${a}" opacity=".7"/>`;
}

/** 망토의 뒷자락(따로 흔들린다) */
function capeBack(): string {
  return `<path d="M70 94 C 40 150, 36 230, 30 286 L84 268 L100 120 Z" fill="${SHADOW}"/>`;
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
    case 'haori':
      // 카이렌: 소매 넓은 겉옷, 허리띠, 등 뒤로 비스듬한 칼집
      return `
        <path d="M70 152 L26 200" stroke="${LIGHT}" stroke-width="6" stroke-linecap="round"/>
        <path d="M72 96 L128 96 L138 176 L144 238 L104 228 L96 238 L56 238 L62 176 Z" fill="${BASE}"/>
        <path d="M100 98 L128 96 L138 176 L144 238 L104 228 Z" fill="${MID}"/>
        <path d="M100 98 L90 152" stroke="${SHADOW}" stroke-width="3"/>
        <path d="M64 148 L136 148 L136 160 L64 160 Z" fill="${a}" opacity=".9"/>
        <path d="M120 160 L130 184" stroke="${a}" stroke-width="3" opacity=".8"/>`;
    case 'vest':
      // 리코: 짧은 조끼, 탄띠, 허리 권총집, 짧은 치마
      return `
        <path d="M76 96 L124 96 L128 162 L72 162 Z" fill="${BASE}"/>
        <path d="M100 98 L124 96 L128 162 L102 162 Z" fill="${MID}"/>
        <path d="M80 98 L74 132 L88 112 Z" fill="${LIGHT}"/>
        <path d="M78 104 L122 146" stroke="${a}" stroke-width="3" opacity=".85"/>
        <path d="M70 158 L130 158 L130 168 L70 168 Z" fill="${a}"/>
        <path d="M70 168 L130 168 L138 200 L62 200 Z" fill="${BASE}"/>
        <rect x="122" y="166" width="11" height="22" rx="2" fill="${SHADOW}"/>`;
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

/** 머리 뒤로 늘어져 흔들리는 머리카락(꽁지, 긴 머리) */
function hairBack(hair: Look['hair'], a: string): string {
  switch (hair) {
    case 'ponytail':
      return `<path d="M84 50 C 60 46, 44 64, 30 92 C 52 78, 66 68, 86 62 Z" fill="${MID}"/>`;
    case 'long':
      return `<path d="M80 54 C 78 30, 124 30, 120 56 L124 140 L98 120 L76 140 Z" fill="${MID}"/>`;
    case 'band':
      // 머리띠 끈 두 가닥
      return `<path d="M84 48 C 66 48, 50 58, 36 76 L42 80 C 56 66, 70 58, 86 56 Z" fill="${a}"/>
        <path d="M84 52 C 70 58, 60 70, 54 88 L60 90 C 66 74, 74 64, 86 58 Z" fill="${a}" opacity=".75"/>`;
    case 'hat':
      // 모자 밑으로 묶은 짧은 꽁지
      return `<path d="M86 60 C 70 62, 62 74, 58 92 C 68 82, 76 74, 90 68 Z" fill="${MID}"/>`;
    default:
      return '';
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
        <path d="M86 44 L114 44" stroke="${a}" stroke-width="2.5"/>`;
    case 'long':
      return `${face}
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
    case 'band':
      return `${face}
        <path d="M82 62 C 78 36, 120 32, 120 58 L114 50 L110 62 L104 50 L98 60 L92 50 L86 60 Z" fill="${MID}"/>
        <path d="M82 50 L120 46" stroke="${a}" stroke-width="3.5"/>`;
    case 'hat':
      return `${face}
        <path d="M86 62 C 84 52, 92 48, 100 48 L116 56 L112 68 C 104 58, 94 58, 88 70 Z" fill="${MID}"/>
        <path d="M80 46 C 82 24, 116 22, 120 46 Z" fill="${MID}"/>
        <ellipse cx="100" cy="47" rx="36" ry="6.5" fill="${BASE}"/>
        <path d="M82 42 L118 42" stroke="${a}" stroke-width="3"/>`;
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
        <path d="M158 212 L178 236 L164 216 Z" fill="${a}"/>`;
    case 'sword':
      // 카타나: 손에서 앞위로 길게 뻗은 칼날, 칼날 등에 달빛
      return `<path d="M166 142 L158 164" stroke="${SHADOW}" stroke-width="6" stroke-linecap="round"/>
        <path d="M160 136 L178 142" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
        <path d="M170 138 C 182 110, 190 80, 198 50 L194 50 C 186 80, 178 108, 166 136 Z" fill="${LIGHT}"/>
        <path d="M168 134 C 180 108, 188 80, 196 52" stroke="${a}" stroke-width="1.5" fill="none" opacity=".9"/>`;
    case 'pistols':
      // 앞손 권총(뒷손 권총은 backProp)
      return `<path d="M164 130 L194 130 L194 139 L178 139 L176 152 L166 152 L168 139 L164 139 Z" fill="${LIGHT}"/>
        <path d="M168 133 L192 133" stroke="${a}" stroke-width="2"/>
        <circle cx="172" cy="141" r="2.5" fill="${SHADOW}"/>`;
    case 'shield':
      return `<path d="M140 92 L188 100 L186 220 L160 254 L136 226 Z" fill="${LIGHT}"/>
        <path d="M146 100 L182 106 L180 216 L160 242 L142 220 Z" fill="${MID}"/>
        <path d="M162 140 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5z" fill="${a}"/>`;
  }
}

/** 뒷손 소품: 녹스의 공허 구슬, 리코의 두 번째 권총 */
function backProp(L: Look): string {
  if (L.weapon === 'dagger') return `<circle cx="66" cy="182" r="10" fill="${L.accent}" opacity=".85"/><circle cx="66" cy="182" r="16" fill="none" stroke="${L.accent}" stroke-width="1.2" opacity=".6"/>`;
  if (L.weapon === 'pistols') return `<path d="M60 180 L86 180 L86 188 L74 188 L72 200 L62 200 L64 188 L60 188 Z" fill="${MID}"/><path d="M64 183 L84 183" stroke="${L.accent}" stroke-width="1.5"/>`;
  return '';
}

const cache = new Map<string, Partial<Record<Bone, string>>>();

function parts(id: string): Partial<Record<Bone, string>> {
  let p = cache.get(id);
  if (!p) {
    const L = LOOKS[id] ?? LOOKS.solea;
    const a = L.accent;
    p = {
      tail: L.coat === 'cape' ? capeBack() : L.coat === 'vest' ? scarf(a) : '',
      hair: hairBack(L.hair, a),
      armB: backArm() + backProp(L),
      legs: legs(),
      body: coat(L.coat, a),
      head: head(L.hair, a),
      armF: L.weapon === 'shield' ? frontArm(L.arm) + weapon(L.weapon, a) : weapon(L.weapon, a) + frontArm(L.arm),
    };
    cache.set(id, p);
  }
  return p;
}

/** 조각 하나를 독립된 SVG로(무대 텍스처용) */
export function partSvg(id: string, bone: Bone): string | null {
  const body = parts(id)[bone];
  if (!body) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320" width="200" height="320">${body}</svg>`;
}

export function characterMotion(id: string): Motion {
  return MOTION[(LOOKS[id] ?? LOOKS.solea).weapon];
}

export function characterAccent(id: string): string {
  return (LOOKS[id] ?? LOOKS.solea).accent;
}

/** 조각을 합친 전신 그림 */
export function characterSvg(id: string, cls = 'fig fig-ally', viewBox = '0 0 200 320', extra = ''): string {
  const p = parts(id);
  const body = DRAW_ORDER.map((b) => p[b] ?? '').join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="${cls}" aria-hidden="true"${extra}>${body}</svg>`;
}

/** 머리와 어깨만 보이게 자른 초상(편성 슬롯, 전투 하단 막대용) */
export function characterBust(id: string): string {
  return characterSvg(id, 'fig fig-bust', '46 26 108 108', ' preserveAspectRatio="xMidYMin slice"');
}
