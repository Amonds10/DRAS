import * as THREE from 'three';
import { BONES, DRAW_ORDER, characterMotion, characterSvg, partSvg, type Bone, type Motion } from '../rig';

/**
 * 컷아웃 인형: 술사 그림을 뼈대 조각마다 판 하나로 만들고 관절을 돌려 움직인다.
 * 대기(숨쉬기·머리카락 흔들림), 시전(무기별 동작), 예열(웅크렸다 일어남), 피격, 쓰러짐을 키프레임으로 만든다.
 */

/** viewBox 한 칸을 몇 픽셀로 굽는지 */
const RES = 2.4;

interface PartData {
  canvas: HTMLCanvasElement;
  /** 잘라낸 영역(viewBox 좌표) */
  x: number;
  y: number;
  w: number;
  h: number;
}

const partCache = new Map<string, Promise<PartData | null>>();
const fullCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(svg: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** 조각을 굽고 투명한 가장자리를 잘라낸다. 빛 쪽 외곽에 가는 테두리를 얹는다. */
function loadPart(id: string, bone: Bone, rim: string): Promise<PartData | null> {
  const key = `${id}:${bone}`;
  let hit = partCache.get(key);
  if (!hit) {
    hit = (async () => {
      const svg = partSvg(id, bone);
      if (!svg) return null;
      const img = await loadImage(svg);
      if (!img) return null;
      const W = 200 * RES;
      const H = 320 * RES;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] > 6) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < x0) return null;
      const pad = 6;
      x0 = Math.max(0, x0 - pad);
      y0 = Math.max(0, y0 - pad);
      x1 = Math.min(W - 1, x1 + pad);
      y1 = Math.min(H - 1, y1 + pad);
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1;
      out.height = y1 - y0 + 1;
      const o = out.getContext('2d')!;
      // 림라이트: 실루엣을 빛 색으로 칠해 왼쪽 위로 살짝 비켜 깔고 본체로 덮는다.
      const tint = document.createElement('canvas');
      tint.width = out.width;
      tint.height = out.height;
      const t = tint.getContext('2d')!;
      t.drawImage(c, -x0, -y0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = rim;
      t.fillRect(0, 0, tint.width, tint.height);
      o.globalAlpha = 0.9;
      o.drawImage(tint, -2, -1);
      o.globalAlpha = 1;
      o.drawImage(c, -x0, -y0);
      return { canvas: out, x: x0 / RES, y: y0 / RES, w: out.width / RES, h: out.height / RES };
    })();
    partCache.set(key, hit);
  }
  return hit;
}

function loadFull(id: string): Promise<HTMLImageElement | null> {
  let hit = fullCache.get(id);
  if (!hit) {
    hit = loadImage(characterSvg(id).replace('viewBox=', 'width="200" height="320" viewBox='));
    fullCache.set(id, hit);
  }
  return hit;
}

// ── 동작 키프레임 ──────────────────────────────────────────

type Channel = 'body' | 'head' | 'hair' | 'tail' | 'armF' | 'armB' | 'x' | 'y' | 'sq';
type Pose = Partial<Record<Channel, number>>;
interface Clip {
  keys: { t: number; p: Pose }[];
  /** 끝난 뒤에도 마지막 자세를 유지(쓰러짐) */
  hold?: boolean;
}

const smooth = (k: number) => k * k * (3 - 2 * k);

function clip(times: number[], poses: Pose[], hold = false): Clip {
  return { keys: times.map((t, i) => ({ t, p: poses[i] })), hold };
}

const Z: Pose = {};

/** 무기별 공격 동작(크게, 화면 너머까지 읽히게). 회전은 라디안(+는 반시계: 몸은 뒤로 젖힘, 팔은 앞·위로 듦), 이동은 viewBox 단위. */
const ATTACK: Record<Motion, Clip> = {
  // 창: 웅크려 뒤로 당겼다가(예비 동작) 앞으로 튀어 나가 찌르고, 살짝 지나쳤다 돌아온다(여운)
  thrust: clip([0, 0.17, 0.24, 0.3, 0.44, 0.8], [Z, { body: 0.18, armF: 0.52, armB: -0.24, x: -12.5, y: -7.0, sq: -0.09 }, { body: -0.29, armF: -0.4, armB: 0.42, x: 97.5, tail: 0.35, sq: 0.1 }, { body: -0.21, armF: -0.32, x: 105.0, sq: 0.03 }, { body: -0.13, armF: -0.17, x: 77.5 }, Z]),
  // 지팡이·구슬: 들어 올려 빛을 모았다가 앞으로 내민다
  raise: clip([0, 0.22, 0.3, 0.38, 0.62, 0.95], [Z, { armF: 0.92, head: 0.19, body: 0.08, y: 11.2, tail: -0.21, hair: -0.17, sq: 0.07 }, { armF: 0.57, head: 0.05, body: -0.13, y: 14.0, x: 10.0, sq: -0.04 }, { armF: 0.63, body: -0.08, y: 12.6, x: 7.5 }, { armF: 0.34, y: 5.6 }, Z]),
  // 총: 겨누고, 반동에 몸이 뒤로 튄다
  shoot: clip([0, 0.16, 0.2, 0.3, 0.42, 0.72], [Z, { armF: 0.07, body: -0.07, head: -0.05, sq: -0.04 }, { armF: 0.41, body: 0.16, head: 0.1, x: -22.5, tail: 0.2, sq: 0.05 }, { armF: 0.25, body: 0.1, x: -17.5 }, { armF: 0.07, body: 0.03, x: -6.25 }, Z]),
  // 단검: 높이 들었다가 뛰어들며 내리긋는다
  slash: clip([0, 0.16, 0.23, 0.3, 0.46, 0.82], [Z, { armF: 1.72, body: 0.16, head: 0.07, x: -10.0, sq: 0.08 }, { armF: -0.75, body: -0.31, x: 110.0, tail: 0.42, y: -8.4, sq: -0.08 }, { armF: -0.83, body: -0.26, x: 115.0, y: -7.0 }, { armF: -0.46, body: -0.16, x: 85.0 }, Z]),
  // 방패: 웅크렸다가 몸으로 들이받는다
  bash: clip([0, 0.2, 0.28, 0.34, 0.5, 0.85], [Z, { body: 0.16, armF: 0.25, x: -15.0, y: -11.2, sq: -0.1 }, { body: -0.23, armF: -0.16, x: 87.5, tail: 0.28, sq: 0.09 }, { body: -0.18, x: 92.5 }, { body: -0.13, x: 70.0 }, Z]),
};

const CLIPS = {
  // 보조 주문: 가볍게 손을 들어 올린다
  channel: clip([0, 0.25, 0.55, 0.9], [Z, { armF: 0.62, head: 0.16, y: 9.6, tail: -0.16, sq: 0.04 }, { armF: 0.47, y: 6.4 }, Z]),
  // 예열: 웅크려 힘을 모았다가 솟구친다
  charge: clip([0, 0.22, 0.5, 0.62, 0.75, 1.05], [Z, { y: -16.0, body: -0.19, head: -0.18, armF: -0.35, armB: 0.36, tail: 0.19, sq: -0.12 }, { y: -17.6, body: -0.22, head: -0.21, armF: -0.4, armB: 0.42, sq: -0.14 }, { y: 19.2, body: 0.13, head: 0.16, armF: 0.5, tail: -0.4, hair: -0.32, sq: 0.12 }, { y: 9.6, body: 0.06, armF: 0.31, sq: 0.03 }, Z]),
  hit: clip([0, 0.05, 0.16, 0.45], [Z, { body: 0.2, head: 0.16, x: -20, armF: 0.14, tail: -0.2, sq: -0.06 }, { body: 0.12, head: 0.08, x: -14 }, Z]),
  die: clip([0, 0.25, 0.6], [Z, { body: 0.2, head: 0.2, x: -10 }, { body: -0.3, head: -0.35, armF: -0.4, armB: 0.3, y: -36, x: -6 }], true),
  victory: clip([0, 0.3, 1.2], [Z, { armF: 1.1, head: 0.12, y: 4 }, { armF: 1.0, head: 0.1, y: 3 }], true),

  // ── 연속기(타격마다 자세가 바뀐다). 끝 자세를 유지하고, 다음 동작이 그 자세에서 이어 받는다 ──
  // 돌진: 몸을 앞으로 숙이고 망토가 뒤로 날린다
  dash: clip([0, 0.1], [Z, { body: -0.45, armF: -0.44, armB: 0.59, tail: 0.64, hair: 0.4, x: 13.6, sq: -0.06 }], true),
  // 내려베기
  combo1: clip([0, 0.06, 0.13, 0.26], [Z, { armF: 1.69, body: 0.16, x: -6.8, sq: 0.08 }, { armF: -0.94, body: -0.35, x: 27.2, tail: 0.4, sq: -0.09 }, { armF: -0.75, body: -0.26, x: 20.4 }], true),
  // 올려베기(반대 방향)
  combo2: clip([0, 0.06, 0.13, 0.26], [{ armF: -0.75, body: -0.26 }, { armF: -1.12, body: 0.13, x: 6.8, sq: -0.08 }, { armF: 1.75, body: -0.29, x: 30.6, y: 9.6, tail: -0.32, sq: 0.09 }, { armF: 1.5, body: -0.16, x: 23.8, y: 6.4 }], true),
  // 찌르기
  combo3: clip([0, 0.07, 0.13, 0.26], [Z, { armF: 0.38, body: 0.22, x: -17.0, sq: -0.09 }, { armF: -0.31, body: -0.42, x: 57.8, tail: 0.48, sq: 0.11 }, { armF: -0.25, body: -0.32, x: 47.6 }], true),
  // 마무리: 뛰어올라 내리꽂는다
  finish: clip([0, 0.1, 0.18, 0.26, 0.42], [Z, { y: 54.4, armF: 2.0, body: 0.26, x: 10.2, sq: 0.12, tail: -0.48, hair: -0.48 }, { y: 48.0, armF: 2.12, body: 0.32, x: 17.0 }, { y: -16.0, armF: -1.12, body: -0.51, x: 44.2, sq: -0.15, tail: 0.56 }, { y: -9.6, armF: -0.94, body: -0.42, x: 37.4 }], true),
  // 원거리 한 발: 짧은 반동
  fire: clip([0, 0.04, 0.16], [{ armF: 0.06 }, { armF: 0.47, body: 0.19, x: -20.4, head: 0.1, sq: 0.06 }, { armF: 0.12, body: 0.05, x: -5.1 }], true),
  // 주문 내밀기
  cast1: clip([0, 0.07, 0.2], [Z, { armF: 0.88, body: -0.19, x: 17.0, y: 6.4, sq: 0.06, tail: -0.24 }, { armF: 0.69, body: -0.13, x: 13.6, y: 4.8 }], true),
  // 주문 높이 들기
  cast2: clip([0, 0.07, 0.2], [Z, { armF: 1.62, head: 0.23, body: 0.13, y: 16.0, sq: 0.09, hair: -0.32 }, { armF: 1.38, head: 0.16, y: 12.8 }], true),
  // ── 스킬별 동작 ──
  // 치유: 두 팔을 벌려 하늘을 우러르며 떠오른다
  heal: clip([0, 0.25, 0.6, 1.1], [Z, { armF: 1.9, armB: 0.9, head: 0.3, body: 0.12, y: 14, tail: -0.3, hair: -0.3, sq: 0.06 }, { armF: 2.1, armB: 1.0, head: 0.34, body: 0.14, y: 20, tail: -0.36, hair: -0.36 }, { armF: 1.7, armB: 0.8, head: 0.26, y: 16 }], true),
  // 방어: 몸을 낮추고 무기·방패를 앞으로 세워 버틴다
  guard: clip([0, 0.12, 0.3, 0.6], [Z, { y: -14, body: -0.24, armF: 1.0, armB: 0.5, x: -6, sq: -0.1, head: -0.08 }, { y: -12, body: -0.2, armF: 0.95, armB: 0.45, x: -4, sq: -0.08 }, { y: -12, body: -0.22, armF: 0.98, armB: 0.48, x: -5, sq: -0.09 }], true),
  // 강화: 웅크렸다가 팔을 치켜들며 솟구친다
  empower: clip([0, 0.14, 0.3, 0.5, 0.8], [Z, { y: -14, body: -0.16, armF: -0.4, head: -0.16, sq: -0.12 }, { y: 18, body: 0.14, armF: 2.2, armB: 0.6, head: 0.28, tail: -0.4, hair: -0.4, sq: 0.12 }, { y: 14, armF: 2.0, armB: 0.5, head: 0.22 }, { y: 10, armF: 1.8, head: 0.18 }], true),
  // 저주: 손을 내밀어 비틀며 움켜쥔다
  hex: clip([0, 0.12, 0.24, 0.36, 0.6], [Z, { armF: 1.1, body: -0.2, x: 14, head: -0.12, sq: 0.04 }, { armF: 0.7, body: -0.28, x: 18, head: -0.18, sq: -0.05 }, { armF: 0.95, body: -0.24, x: 16 }, { armF: 0.8, body: -0.22, x: 15 }], true),
  // 회전 베기 두 박자(몸이 좌우로 크게 돈다)
  spin1: clip([0, 0.06, 0.16], [{ armF: -0.6, body: -0.2 }, { armF: 2.2, body: 0.45, x: 6, tail: -0.5, hair: -0.5, sq: 0.08 }, { armF: -1.3, body: -0.5, x: 22, tail: 0.6, hair: 0.5, sq: -0.08 }], true),
  spin2: clip([0, 0.06, 0.16], [{ armF: -1.3, body: -0.5 }, { armF: -1.4, body: 0.4, x: 10, y: 6, tail: 0.5, sq: -0.06 }, { armF: 2.1, body: -0.45, x: 26, y: 4, tail: -0.5, hair: -0.4, sq: 0.08 }], true),
  // 뛰어올라 내리찍기
  slam: clip([0, 0.1, 0.24, 0.32, 0.5], [Z, { y: -14, body: -0.18, armF: -0.6, sq: -0.12 }, { y: 80, body: 0.3, armF: 2.3, armB: 0.8, x: 14, tail: -0.6, hair: -0.6, sq: 0.12 }, { y: -18, body: -0.55, armF: -1.3, x: 40, tail: 0.6, sq: -0.16 }, { y: -12, body: -0.45, armF: -1.1, x: 36 }], true),
  // 올려치기: 낮게 숙였다가 위로 퍼 올린다
  uppercut: clip([0, 0.08, 0.2, 0.36], [Z, { y: -16, body: -0.3, armF: -1.2, x: 10, sq: -0.12 }, { y: 36, body: 0.34, armF: 2.3, x: 30, head: 0.24, tail: -0.5, hair: -0.5, sq: 0.12 }, { y: 28, body: 0.26, armF: 2.0, x: 26 }], true),
  // 관통 돌격: 몸을 길게 뻗어 꿰뚫는다
  lunge: clip([0, 0.1, 0.2, 0.4], [Z, { body: 0.2, armF: 0.5, x: -16, y: -6, sq: -0.1 }, { body: -0.55, armF: -0.4, armB: 0.6, x: 120, tail: 0.7, hair: 0.6, sq: 0.12 }, { body: -0.45, armF: -0.3, x: 110 }], true),
  // 연사: 짧은 반동을 빠르게
  rapid: clip([0, 0.03, 0.08, 0.12], [{ armF: 0.1 }, { armF: 0.3, body: 0.1, x: -10, sq: 0.03 }, { armF: 0.12, body: 0.03, x: -3 }, { armF: 0.25, body: 0.08, x: -8 }], true),
  // 조준: 숨을 멈추고 몸을 고정한다
  aim: clip([0, 0.2, 0.5], [Z, { armF: 0.08, body: -0.08, head: -0.08, y: -4, sq: -0.04, x: -4 }, { armF: 0.08, body: -0.09, head: -0.09, y: -5, sq: -0.05, x: -5 }], true),
  // 하늘로 쏘기
  skyshot: clip([0, 0.08, 0.2, 0.36], [Z, { armF: 1.5, body: 0.3, head: 0.34, y: -6, sq: -0.05 }, { armF: 1.8, body: 0.42, head: 0.4, x: -14, y: -10, sq: 0.06 }, { armF: 1.6, body: 0.34, head: 0.34, x: -8 }], true),
  // 제자리로(유지하던 자세를 풀고 대기로)
  recover: clip([0, 0.3], [Z, Z]),
};

/** 새 동작이 직전 자세에서 이어지는 시간(초). 제자리로 돌아올 때는 길게. */
const BLEND: Partial<Record<string, number>> = { recover: 0.3, dash: 0.1 };

export type PuppetAnim = 'attack' | keyof typeof CLIPS;

function sample(c: Clip, t: number): Pose {
  const k = c.keys;
  if (t >= k[k.length - 1].t) return k[k.length - 1].p;
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1].t) i++;
  const a = k[i];
  const b = k[i + 1];
  const u = smooth(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  const out: Pose = {};
  const keys = new Set([...Object.keys(a.p), ...Object.keys(b.p)]) as Set<Channel>;
  for (const ch of keys) out[ch] = (a.p[ch] ?? 0) * (1 - u) + (b.p[ch] ?? 0) * u;
  return out;
}

export function clipLength(anim: PuppetAnim, motion: Motion): number {
  const c = anim === 'attack' ? ATTACK[motion] : CLIPS[anim];
  return c.keys[c.keys.length - 1].t;
}

// ── 인형 ─────────────────────────────────────────────────

export class Puppet {
  readonly root = new THREE.Group();
  readonly mats: THREE.MeshBasicMaterial[] = [];
  private depthMats: THREE.MeshBasicMaterial[] = [];
  readonly bones = {} as Record<Bone, THREE.Object3D>;
  readonly glow: THREE.Mesh;
  readonly caster: THREE.Mesh;
  readonly motion: Motion;
  /** viewBox 한 칸의 월드 길이 */
  private k: number;
  private anim: { kind: PuppetAnim; t: number } | null = null;
  private held: Pose | null = null;
  private disposed = false;
  private textures: THREE.Texture[] = [];

  constructor(
    readonly id: string,
    height: number,
    rim: string,
    makeMat: (tex: THREE.Texture, w: number, h: number) => THREE.MeshBasicMaterial,
    private baseOrder: number,
    castShadow: boolean,
  ) {
    this.k = height / 300;
    this.motion = characterMotion(id);
    for (const name of Object.keys(BONES) as Bone[]) {
      const o = new THREE.Object3D();
      o.name = name;
      this.bones[name] = o;
    }
    for (const name of Object.keys(BONES) as Bone[]) {
      const { pivot, parent } = BONES[name];
      const o = this.bones[name];
      if (!parent) {
        this.root.add(o);
        continue;
      }
      const pp = BONES[parent].pivot;
      o.position.set((pivot[0] - pp[0]) * this.k, -(pivot[1] - pp[1]) * this.k, 0);
      this.bones[parent].add(o);
    }
    const plane = new THREE.PlaneGeometry(1, 1);
    // 외곽 발광: 전신 실루엣을 흐리게 번진 판 하나(몸통에 붙여 같이 숨쉰다)
    const glowCanvas = document.createElement('canvas');
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    this.glow.renderOrder = baseOrder - 1;
    this.glow.visible = false;
    this.root.add(this.glow);
    // 그림자: 전신 그림으로 그림자만 드리운다(화면에는 안 그린다)
    const casterCanvas = document.createElement('canvas');
    const casterTex = new THREE.CanvasTexture(casterCanvas);
    this.caster = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: casterTex, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
    this.caster.castShadow = castShadow;
    this.caster.name = 'shadow-caster';
    this.caster.visible = false;
    this.root.add(this.caster);
    this.textures.push(glowTex, casterTex);

    void loadFull(id).then((img) => {
      if (!img || this.disposed) return;
      const glowPx = 18;
      const W = 200 * 2, H = 320 * 2, pad = glowPx * 2;
      glowCanvas.width = W + pad * 2;
      glowCanvas.height = H + pad * 2;
      const g = glowCanvas.getContext('2d')!;
      g.shadowColor = rim;
      g.shadowBlur = glowPx;
      g.shadowOffsetX = 10000;
      g.drawImage(img, pad - 10000, pad, W, H);
      glowTex.needsUpdate = true;
      casterCanvas.width = W;
      casterCanvas.height = H;
      casterCanvas.getContext('2d')!.drawImage(img, 0, 0, W, H);
      casterTex.needsUpdate = true;
      const ww = 200 * this.k, hh = 320 * this.k;
      this.glow.scale.set(ww * (glowCanvas.width / W), hh * (glowCanvas.height / H), 1);
      this.glow.position.set(0, -(160 - 310) * this.k, -0.01);
      this.glow.visible = true;
      this.caster.scale.set(ww, hh, 1);
      this.caster.position.set(0, -(160 - 310) * this.k, 0);
      this.caster.visible = true;
    });

    DRAW_ORDER.forEach((bone, order) => {
      void loadPart(id, bone, rim).then((part) => {
        if (!part || this.disposed) return;
        const tex = new THREE.CanvasTexture(part.canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        this.textures.push(tex);
        const mat = makeMat(tex, part.canvas.width, part.canvas.height);
        this.mats.push(mat);
        const mesh = new THREE.Mesh(plane, mat);
        const pv = BONES[bone].pivot;
        mesh.scale.set(part.w * this.k, part.h * this.k, 1);
        mesh.position.set((part.x + part.w / 2 - pv[0]) * this.k, -(part.y + part.h / 2 - pv[1]) * this.k, order * 0.003);
        mesh.renderOrder = this.baseOrder + order;
        this.bones[bone].add(mesh);
        // 깊이만 쓰는 판: 후처리 흐림·붓질이 인물을 배경으로 보고 뭉개지 않게
        const depthMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, colorWrite: false });
        this.depthMats.push(depthMat);
        const depth = new THREE.Mesh(plane, depthMat);
        depth.position.copy(mesh.position);
        depth.scale.copy(mesh.scale);
        depth.renderOrder = this.baseOrder + order;
        this.bones[bone].add(depth);
      });
    });
  }

  play(kind: PuppetAnim): void {
    // 직전 자세에서 부드럽게 이어 받는다(연속기 사이가 툭 끊기지 않게)
    this.blendFrom = { ...this.lastPose };
    this.blendTime = BLEND[kind] ?? 0.06;
    this.anim = { kind, t: 0 };
    if (kind !== 'die' && kind !== 'victory') this.held = null;
  }

  private lastPose: Pose = {};
  private blendFrom: Pose | null = null;
  private blendTime = 0.06;

  revive(): void {
    this.anim = null;
    this.held = null;
  }

  /** 동작 중에 앞으로 나간 거리(월드), DOM 오버레이 위치 보정용 */
  get reach(): number {
    return this.bones.body.position.x;
  }

  update(time: number, dt: number, phase: number): void {
    let act: Pose = this.held ?? {};
    if (this.anim) {
      this.anim.t += dt;
      const c = this.anim.kind === 'attack' ? ATTACK[this.motion] : CLIPS[this.anim.kind];
      act = sample(c, this.anim.t);
      if (this.blendFrom && this.anim.t < this.blendTime) {
        const u = smooth(this.anim.t / this.blendTime);
        const from = this.blendFrom;
        const mixed: Pose = {};
        for (const ch of new Set([...Object.keys(from), ...Object.keys(act)]) as Set<Channel>) mixed[ch] = (from[ch] ?? 0) * (1 - u) + (act[ch] ?? 0) * u;
        act = mixed;
      }
      if (this.anim.t >= c.keys[c.keys.length - 1].t) {
        if (c.hold) this.held = act;
        this.anim = null;
        this.blendFrom = null;
      }
    }
    this.lastPose = act;
    const t = time + phase;
    const calm = this.held && this.anim === null && this.held.y !== undefined && this.held.y < -20 ? 0.2 : 1;
    const v = (ch: Channel) => act[ch] ?? 0;
    const k = this.k;
    const B = this.bones;
    const rootY = BONES.body.pivot;
    B.body.position.set((rootY[0] - 100) * k + v('x') * k, -(rootY[1] - 310) * k + v('y') * k + Math.sin(t * 1.8) * 0.6 * k * calm, 0);
    B.legs.position.x = v('x') * k * 0.92;
    B.body.rotation.z = v('body') + Math.sin(t * 1.6) * 0.012 * calm;
    B.body.scale.y = 1 + Math.sin(t * 1.8) * 0.01 * calm + v('sq');
    B.body.scale.x = 1 - v('sq') * 0.6;
    B.head.rotation.z = v('head') + Math.sin(t * 1.1 + 1) * 0.03 * calm;
    B.hair.rotation.z = v('hair') + Math.sin(t * 1.4 + 2) * 0.07 * calm;
    B.tail.rotation.z = v('tail') + Math.sin(t * 1.25) * 0.045 * calm;
    B.armF.rotation.z = v('armF') + Math.sin(t * 1.6 + 0.5) * 0.035 * calm;
    B.armB.rotation.z = v('armB') - Math.sin(t * 1.6) * 0.03 * calm;
    this.glow.position.x = B.body.position.x;
    this.glow.position.y = -(160 - 310) * k + v('y') * k;
    this.caster.position.x = B.body.position.x;
  }

  setColor(c: number, opacity: number): void {
    for (const m of this.mats) {
      m.color.setScalar(c);
      m.opacity = opacity;
    }
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.55 * opacity;
  }

  dispose(): void {
    this.disposed = true;
    for (const m of this.mats) m.dispose();
    for (const m of this.depthMats) m.dispose();
    for (const t of this.textures) t.dispose();
    (this.glow.material as THREE.Material).dispose();
    (this.caster.material as THREE.Material).dispose();
  }
}
