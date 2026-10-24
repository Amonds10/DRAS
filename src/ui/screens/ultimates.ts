import * as THREE from 'three';
import { sound } from '../../audio/sound';
import type { FrameShot, Stage } from '../../render/three/stage';
import { h } from '../dom';

/*
 * 극딜(궁극기) 연출: 술사마다 따로 짠 애니메이션 같은 한 장면.
 * 공통으로는 레터박스와 컷인 초상만 쓰고, 그 앞의 준비 동작(intro)과 타격마다의 박자(beat), 마지막 일격(climax)은 술사마다 다르다.
 * 카메라는 늘 정면(2D)에서 줌·패닝·높낮이만 바꾼다.
 */

export interface UltDeps {
  stage: Stage;
  scene: HTMLElement;
  wait: (ms: number) => Promise<void>;
  later: (ms: number, fn: () => void) => void;
  chest: (uid: string) => THREE.Vector3;
  feet: (uid: string) => THREE.Vector3;
  enemyCenter: () => THREE.Vector3;
  allies: () => string[];
}

/** 한 번의 극딜 타격 단계 */
export interface UltBeat {
  caster: string;
  color: string;
  element: string;
  index: number;
  total: number;
  last: boolean;
  tgt: string | null;
  aims: string[];
  p: THREE.Vector3;
}

interface Script {
  /** 컷인 앞의 준비 동작 */
  intro(uid: string, color: string, target: string | null): Promise<void>;
  /** 중간 타격 하나 */
  beat(b: UltBeat): Promise<void>;
  /** 마지막 일격 */
  climax(b: UltBeat): Promise<void>;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 카이렌의 화면 가르기: 검은 두 쪽(대각선으로 나뉜)과 그 사이를 긋는 빛줄 */
const SLICE = `<i class="sl-a"></i><i class="sl-b"></i><i class="sl-cut"></i><i class="sl-glint"></i>`;

/** 리코의 1인칭 총구: 화면 아래 양쪽에서 들어온 권총 두 자루(손·소매 포함). 총구는 각 그림의 왼쪽 위(16%, 18%)에 있다. */
const GUN = `<svg viewBox="0 0 300 300" aria-hidden="true"><g transform="rotate(28 150 150)">
  <path d="M170 150 L320 260 L320 360 L150 250 Z" fill="#0a0b0f"/>
  <path d="M150 128 L196 126 L222 232 L168 240 Z" fill="#14161c"/>
  <path d="M136 150 C 130 178, 150 190, 168 186 L 166 172 C 154 174, 146 166, 150 150 Z" fill="#14161c"/>
  <path d="M150 120 L200 118 L230 186 L182 214 L156 196 Z" fill="#1c1f27"/>
  <rect x="26" y="96" width="186" height="36" rx="5" fill="#252935"/>
  <rect x="36" y="132" width="150" height="12" fill="#1a1d25"/>
  <path d="M40 104 L200 104" stroke="var(--c)" stroke-width="5" stroke-linecap="round"/>
  <path d="M60 120 L84 120 M96 120 L120 120 M132 120 L156 120" stroke="#3a3f4d" stroke-width="3"/>
  <rect x="14" y="104" width="16" height="20" rx="3" fill="#0d0e12"/>
</g></svg><i class="fps-flash"></i>`;
const FPS_GUNS = `<div class="fps-gun r">${GUN}</div><div class="fps-gun l">${GUN}</div><i class="fps-dot"></i>`;

/** 아스트라의 별자리: 하늘에 별 여섯과 그 사이를 잇는 선(선이 차례로 그어진다) */
const CONSTELLATION = `<svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
  <polyline points="12,34 26,16 44,22 58,8 74,18 88,10" fill="none"/>
  <polyline points="44,22 50,40 74,18" fill="none"/>
  ${[[12, 34], [26, 16], [44, 22], [58, 8], [74, 18], [88, 10], [50, 40]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.2" style="animation-delay:${0.12 * i}s"/>`).join('')}
</svg>`;

export function makeUltimates(d: UltDeps) {
  const { stage, wait, later, chest, feet } = d;
  const fx = () => stage.fx;
  const shot = (uids: string[], o: Omit<FrameShot, 'uids'>) => {
    stage.cinematic(null);
    stage.frameShot({ uids, ...o });
  };
  /** 화면 위 DOM 장식(조준경, 일섬, 집중선 …). html은 이 파일 안의 정적 마크업만 넣는다. */
  const overlay = (cls: string, life: number, html = '', color = '#ffffff') => {
    const el = h('div', { class: `ult-ov ${cls}`, style: { '--c': color } });
    if (html) el.innerHTML = html;
    d.scene.append(el);
    later(life, () => {
      el.classList.add('out');
      later(300, () => el.remove());
    });
    return el;
  };
  const sky = (b: UltBeat, y = 6) => b.p.clone().add(V(-1.2, y, 0));
  /** 애니메이션식 집중선: 화면 가장자리에서 가운데로 몰리는 선 */
  const speedLines = (color: string, life = 700) => overlay('ult-speed', life, '', color);
  /** 무대 그림을 잠깐 반전(음화)시킨다 */
  const invert = (ms: number) => {
    d.scene.classList.add('ult-invert');
    later(ms, () => d.scene.classList.remove('ult-invert'));
  };

  const SCRIPTS: Record<string, Script> = {
    // ── 솔레아: 태양 낙하. 하늘 높이 뛰어올라 태양을 등지고, 창을 내리꽂는다 ──
    solea: {
      async intro(uid, color) {
        shot([uid], { push0: 0.9, push1: 0.8, lift: 0.3, pad: 1.4 });
        stage.anim(uid, 'charge');
        sound.ultCharge('sol');
        fx()?.castAura('sol', feet(uid), color, true);
        await wait(520);
        stage.anim(uid, 'slam');
        shot([uid], { push0: 1, push1: 1.1, lift: 3.2, pitch: 0.1, pad: 2 });
        fx()?.sprite({ tex: 'sunburst', color, pos: chest(uid).add(V(0, 4.5, -0.5)), size: 2, to: 9, life: 1.2, spin: 0.4, curve: 'pulse', alpha: 0.7, behind: true });
        await wait(420);
      },
      async beat(b) {
        // 하늘에서 창 그림자가 먼저 떨어진다
        for (const t of b.aims) {
          fx()?.comet(sky(b, 7), d.chest(t), b.color, 0.18);
          fx()?.embers(d.chest(t), b.color, 10, 1.4);
        }
        stage.shake(0.2);
        await wait(150);
      },
      async climax(b) {
        if (b.tgt) shot([b.caster, b.tgt], { push0: 0.95, push1: 0.72, dur: 0.7, lift: 1.2, pitch: 0.12 });
        stage.anim(b.caster, 'finish');
        // 태양을 등지고 내리꽂힌다: 위에서 아래로 긋는 낙하선과 눈부신 역광
        overlay('ult-dive', 520, '', b.color);
        overlay('ult-glare', 900, '', b.color);
        await wait(180);
        speedLines(b.color, 600);
        for (const t of b.aims) {
          stage.toon.beam(sky(b, 10), d.feet(t), b.color, 1.6, 0.5);
          stage.toon.pillar(d.feet(t), b.color, 10, 3, 0.9);
          fx()?.groundCrack(d.feet(t), b.color, 1.6);
          fx()?.sprite({ tex: 'sunburst', color: b.color, pos: d.chest(t), size: 1, to: 9, life: 0.7, spin: 1, curve: 'flash' });
        }
        stage.impactFrame(b.color);
        stage.flashScreen(0.22);
        stage.shake(0.8);
        await wait(240);
      },
    },

    // ── 루네: 그믐의 달. 밤이 내려앉고 거대한 초승달이 떠올라 적진을 가로로 벤다 ──
    lune: {
      async intro(uid, color, target) {
        stage.setBackdrop('#0b1024', 0.96);
        shot(target ? [uid, target] : [uid], { push0: 1.1, push1: 1, lift: 1.4, pad: 1.6 });
        stage.anim(uid, 'heal');
        sound.ultCharge('luna');
        overlay('ult-night', 2600, '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>', color);
        const c = d.enemyCenter();
        fx()?.sprite({ tex: 'crescent', color, pos: c.clone().add(V(0, 2, -2)), size: 9, to: 8, life: 2.2, rot: -0.5, curve: 'pulse', behind: true, alpha: 0.8, path: (k) => c.clone().add(V(0, 1 + k * 4, -2)) });
        fx()?.lightRain(d.feet(uid), '#dfe8ff', 16, 2.4);
        await wait(760);
      },
      async beat(b) {
        for (const t of b.aims) {
          fx()?.lightRain(d.feet(t), b.color, 10, 1.6);
          fx()?.crescent(d.chest(t), b.color, 1.8, Math.random() * 6);
        }
        await wait(160);
      },
      async climax(b) {
        const c = d.enemyCenter();
        shot([b.caster, ...b.aims], { push0: 1.05, push1: 0.96, lift: 0.8, dur: 0.9 });
        stage.anim(b.caster, 'cast2');
        // 달이 내려와 가로로 크게 그어진다
        stage.toon.wave(c.clone().add(V(-6, 0.8, 0.4)), c.clone().add(V(6, 0.6, 0.4)), b.color, 7, 0.32, 0, Math.PI / 2);
        overlay('ult-moonsweep', 700, '', b.color);
        fx()?.sweep(c, b.color, 9);
        await wait(240);
        for (const t of b.aims) fx()?.crescent(d.chest(t), '#ffffff', 3.4, 0.4);
        for (const a of d.allies()) fx()?.motes(d.chest(a), '#cfe0ff');
        stage.flashScreen(0.15);
        stage.shake(0.5);
        await wait(220);
      },
    },

    // ── 네비아: 성운 개화. 구슬이 고리를 이뤄 돌다가 별 떼가 되어 날아가고, 꽃처럼 터진다 ──
    nebia: {
      async intro(uid, color) {
        shot([uid], { push0: 0.95, push1: 0.86, lift: 0.6, pad: 1.6 });
        stage.anim(uid, 'cast2');
        sound.ultCharge('nebula');
        overlay('ult-galaxy', 1400, '', color);
        const c = chest(uid).add(V(0, 0.6, 0));
        for (let i = 0; i < 8; i++) {
          const ph = (i / 8) * Math.PI * 2;
          fx()?.sprite({ tex: 'soft', color, pos: c, size: 0.6, to: 0.5, life: 1.2, curve: 'pulse', path: (k) => c.clone().add(V(Math.cos(ph + k * 8) * (1.6 - k * 0.4), Math.sin(ph + k * 8) * 0.6 + k * 0.6, 0.3)) });
        }
        fx()?.vortex(d.feet(uid).add(V(0, 0.05, 0)), color, 4, 1.2, true);
        await wait(700);
      },
      async beat(b) {
        const from = chest(b.caster).add(V(0.6, 1, 0));
        for (const t of b.aims) for (let i = 0; i < 4; i++) fx()?.projectile(from, d.chest(t), b.color, 0.3, 0.6 + i * 0.5, i * 0.05);
        await wait(170);
      },
      async climax(b) {
        shot([b.caster, ...b.aims], { push0: 0.9, push1: 1.05, dur: 1, lift: 0.6 });
        overlay('ult-bloom', 1000, '<i></i><i></i><i></i>', b.color);
        for (const t of b.aims) {
          const p = d.chest(t);
          fx()?.sprite({ tex: 'bloom', color: b.color, pos: p, size: 1, to: 6, life: 0.9, spin: 1.2, curve: 'flash' });
          fx()?.petals(p, b.color, 26, 7);
          fx()?.nova(p, b.color, '#ffd6ee', 1.2);
        }
        stage.flashScreen(0.15);
        stage.shake(0.5);
        await wait(260);
      },
    },

    // ── 벨라: 종언의 별. 조준경 너머로 숨을 멈추고, 한 발이 화면을 꿰뚫는다 ──
    vela: {
      async intro(uid, color, target) {
        if (target) shot([target], { push0: 0.7, push1: 0.6, fov: 20, pad: 1.4 });
        overlay('ult-scope', 1700, '<i class="sc-ring"></i>', color);
        stage.anim(uid, 'aim');
        sound.ultCharge('comet');
        if (target) fx()?.sprite({ tex: 'circle_02', color, pos: chest(target), size: 3, to: 0.6, life: 0.9, curve: 'pulse' });
        stage.slowMo(0.4, 0.8);
        await wait(820);
      },
      async beat(b) {
        const from = chest(b.caster).add(V(0.8, 0.15, 0.1));
        for (const t of b.aims) stage.toon.beam(from, d.chest(t), b.color, 0.06, 0.3);
        stage.anim(b.caster, 'fire');
        sound.swing('shoot', false);
        await wait(140);
      },
      async climax(b) {
        const from = chest(b.caster).add(V(0.8, 0.15, 0.1));
        shot([b.caster, ...b.aims], { push0: 1.08, push1: 1, dur: 0.6 });
        stage.anim(b.caster, 'fire');
        for (const t of b.aims) {
          stage.toon.beam(from, d.chest(t).add(V(9, 0, 0)), b.color, 1.4, 0.45);
          fx()?.muzzle(from, b.color, d.chest(t));
        }
        overlay('ult-tracer', 500, '', b.color);
        speedLines(b.color, 500);
        stage.hitStop(0.22);
        stage.kick(-0.06, -1);
        // 한 박자 늦게 별이 터진다
        later(260, () => {
          for (const t of b.aims) {
            fx()?.sprite({ tex: 'flare4', color: '#ffffff', pos: d.chest(t), size: 1, to: 7, life: 0.5, curve: 'flash' });
            fx()?.shards(d.chest(t), b.color, 16, 9);
          }
          stage.flashScreen(0.2);
          stage.shake(0.6);
        });
        await wait(420);
      },
    },

    // ── 녹스: 심연의 만찬. 녹스가 어둠 속으로 사라지고 사방에서 칼날이 스친 뒤, 공허의 아가리가 닫힌다 ──
    nox: {
      async intro(uid, color, target) {
        stage.setBackdrop('#06030c', 0.98);
        shot(target ? [uid, target] : [uid], { push0: 1, push1: 0.9 });
        stage.anim(uid, 'hex');
        sound.ultCharge('void');
        fx()?.vortex(d.feet(uid).add(V(0, 0.05, 0)), color, 3.4, 0.9, true);
        await wait(380);
        // 사라진다: 화면 가장자리부터 어둠이 조여 든다
        overlay('ult-dark', 1800, '', color);
        stage.afterimage(uid, color, 3);
        stage.spotlight(target ? [target] : []);
        await wait(360);
      },
      async beat(b) {
        for (const t of b.aims) {
          const p = d.chest(t);
          const a = Math.random() * Math.PI * 2;
          const off = V(Math.cos(a) * 3, Math.sin(a) * 1.6, 0.3);
          fx()?.speedLines(p.clone().add(off), p.clone().sub(off), b.color, 4);
          stage.toon.slash(p, b.color, 3.4, a);
        }
        stage.hitStop(0.05);
        await wait(110);
      },
      async climax(b) {
        if (b.tgt) stage.dash(b.caster, b.tgt, 0.06, -1.6);
        stage.spotlight([b.caster, ...b.aims]);
        shot([b.caster, ...b.aims], { push0: 0.9, push1: 0.74, dur: 0.7 });
        stage.anim(b.caster, 'finish');
        // 공허의 아가리: 위아래 검은 턱이 닫히는 순간 화면이 음화로 뒤집힌다
        overlay('ult-maw', 900, '<i class="jaw-t"></i><i class="jaw-b"></i>', b.color);
        later(330, () => invert(140));
        for (const t of b.aims) {
          const p = d.chest(t);
          fx()?.sprite({ tex: 'soft', color: '#000000', pos: p, size: 0.4, to: 4, life: 0.7, additive: false, alpha: 0.9, curve: 'pulse' });
          fx()?.vortex(p, b.color, 6, 0.7);
          fx()?.gather(p, b.color, 30, 0.5);
        }
        await wait(300);
        stage.impactFrame(b.color);
        stage.shake(0.7);
        await wait(160);
      },
    },

    // ── 아스트라: 별의 심판. 방패를 하늘로 들면 별자리가 그어지고, 빛의 기둥과 함께 방패로 대지를 친다 ──
    astra: {
      async intro(uid, color, target) {
        shot(target ? [uid, target] : [uid], { push0: 1.05, push1: 1, lift: 1.6, pad: 1.4 });
        stage.anim(uid, 'empower');
        sound.ultCharge('star');
        overlay('ult-stars', 1700, CONSTELLATION, color);
        const top = (target ? chest(target) : d.enemyCenter()).add(V(-1.5, 3.6, 0));
        fx()?.signature('star', top, color, 3);
        fx()?.magicCircle(d.feet(uid), color, 5, 1.6, 'rune');
        await wait(760);
      },
      async beat(b) {
        for (const t of b.aims) {
          fx()?.comet(sky(b, 8), d.chest(t), '#fff6d8', 0.2);
          fx()?.twinkle(d.chest(t), '#ffffff', 5, 1.6);
        }
        await wait(160);
      },
      async climax(b) {
        shot([b.caster, ...b.aims], { push0: 1, push1: 0.88, dur: 0.8, pitch: -0.04, lift: 0.6 });
        stage.anim(b.caster, 'slam');
        await wait(200);
        speedLines(b.color, 600);
        overlay('ult-glare', 700, '', b.color);
        for (const t of b.aims) {
          stage.toon.pillar(d.feet(t), b.color, 11, 4, 0.9);
          fx()?.groundCrack(d.feet(t), b.color, 1.4);
        }
        const from = d.feet(b.caster);
        for (const t of b.aims) stage.toon.wave(new THREE.Vector3(from.x, 0.6, from.z), new THREE.Vector3(d.feet(t).x, 0.6, d.feet(t).z), b.color, 4, 0.2);
        stage.flashScreen(0.2);
        stage.shake(0.8);
        await wait(240);
      },
    },

    // ── 카이렌: 월하일섬. 숨을 멈춘 정적 속에 빛줄 하나 — 지나간 뒤에야 칼자국이 피어난다 ──
    kairen: {
      async intro(uid, color) {
        stage.setBackdrop('#05070d', 0.97);
        shot([uid], { push0: 0.85, push1: 0.78, lift: 0.2, pad: 1.4 });
        stage.anim(uid, 'guard');
        sound.ultCharge('luna');
        // 칼끝에 달빛 한 점이 맺힌다
        fx()?.sprite({ tex: 'flare4', color, pos: chest(uid).add(V(1.1, 0.5, 0.3)), size: 0.2, to: 1.6, life: 0.4, delay: 0.5, curve: 'flash' });
        await wait(900);
      },
      async beat(b) {
        if (b.index === 0) {
          // 일섬: 화면이 한 번 새까맣게 꺼지고 → 흰 빛줄이 화면을 가르고 → 갈라진 화면이 벌어지면 카이렌은 이미 대상 너머에 있다
          const cut = overlay('ult-slice', 1250, SLICE, b.color);
          // 빛줄은 검은 두 쪽의 경계(왼쪽 63% → 오른쪽 37%)를 그대로 따라 긋는다
          const r = d.scene.getBoundingClientRect();
          cut.style.setProperty('--ang', `${(-Math.atan2(0.26 * r.height, r.width) * 180) / Math.PI}deg`);
          await wait(300);
          if (b.tgt) stage.dash(b.caster, b.tgt, 0.02, -2.2);
          stage.anim(b.caster, 'lunge');
          if (b.tgt) shot([b.caster, b.tgt], { push0: 1, push1: 0.94, dur: 1, smooth: 0.05 });
          await wait(160);
          sound.swing('slash', true);
          stage.hitStop(0.2);
          await wait(420);
        } else {
          const rolls = [0.6, -0.8, 1.5];
          for (const t of b.aims) stage.toon.slash(d.chest(t), b.color, 3.2, rolls[b.index % 3]);
          await wait(120);
        }
      },
      async climax(b) {
        shot([b.caster, ...b.aims], { push0: 0.9, push1: 0.78, dur: 0.6 });
        stage.anim(b.caster, 'recover');
        // 칼을 거두는 순간 늦게 따라온 칼자국이 화면째 엇갈려 그어진다
        overlay('ult-slashline', 600, '', b.color);
        overlay('ult-slashline rev', 600, '', b.color);
        for (const t of b.aims) {
          const p = d.chest(t);
          stage.toon.slash(p, '#ffffff', 4.6, 0.7);
          stage.toon.slash(p, b.color, 4.6, -0.7, 0.04);
          fx()?.crescent(p, b.color, 4, 0.2);
          fx()?.shards(p, b.color, 14, 8);
        }
        stage.flashScreen(0.18);
        stage.shake(0.6);
        await wait(260);
      },
    },

    // ── 리코: 태양 탄막. 총을 돌리며 건카타로 쏟아붓고, 두 자루를 겹쳐 마지막 한 발 ──
    riko: {
      async intro(uid, color) {
        shot([uid], { push0: 0.88, push1: 0.8, pad: 1.4, roll: 0.04 });
        stage.anim(uid, 'spin1');
        sound.ultCharge('sol');
        fx()?.embers(chest(uid), color, 16, 1.4);
        await wait(300);
        stage.anim(uid, 'spin2');
        await wait(300);
      },
      async beat(b) {
        const back = b.index % 2 === 1;
        const hand = back ? chest(b.caster).add(V(-0.25, -0.3, 0.05)) : chest(b.caster).add(V(0.8, 0.15, 0.1));
        stage.anim(b.caster, back ? 'rapid' : 'fire');
        // 박자마다 화면이 좌우로 흔들리듯 옮겨 간다
        if (b.tgt) shot([b.caster, b.tgt], { pan0: back ? 0.3 : -0.3, pan1: back ? 0.35 : -0.35, push0: 0.9, push1: 0.88, dur: 0.3, roll: back ? -0.03 : 0.03, smooth: 0.1 });
        for (const t of b.aims) {
          const to = d.chest(t).add(V(0, (Math.random() - 0.5) * 0.6, 0));
          fx()?.muzzle(hand, b.color, to);
          stage.toon.shot(hand, to, b.color, 0.08);
        }
        sound.swing('shoot', false);
        await wait(80);
      },
      async climax(b) {
        const from = chest(b.caster).add(V(0.8, 0.15, 0.1));
        // 마지막 한 발 직전: 리코의 눈으로 — 화면 앞에 두 자루 총구가 들어오고 대상을 겨눈다
        if (b.tgt) shot([b.tgt], { push0: 0.72, push1: 0.6, fov: 24, pad: 1.4, smooth: 0.1 });
        stage.spotlight(b.aims);
        const fps = overlay('ult-fps', 1150, FPS_GUNS, b.color);
        stage.slowMo(0.5, 0.7);
        await wait(700);
        fps.classList.add('fire');
        sound.swing('shoot', true);
        stage.flashScreen(0.22);
        await wait(140);
        stage.spotlight([b.caster, ...b.aims]);
        if (b.tgt) shot([b.caster, b.tgt], { push0: 0.95, push1: 0.8, dur: 0.5 });
        speedLines(b.color, 500);
        stage.anim(b.caster, 'fire');
        for (const t of b.aims) {
          stage.toon.beam(from, d.chest(t), b.color, 0.9, 0.35);
          stage.toon.beam(from.clone().add(V(0, -0.3, 0)), d.chest(t), '#ffffff', 0.5, 0.3);
          fx()?.sprite({ tex: 'sunburst', color: b.color, pos: d.chest(t), size: 1, to: 6, life: 0.6, curve: 'flash' });
        }
        stage.kick(-0.06, -0.9);
        stage.flashScreen(0.15);
        stage.shake(0.6);
        await wait(300);
        // 총구 연기를 분다
        fx()?.sprite({ tex: 'smoke_04', color: '#d8d0c8', pos: from, size: 0.4, to: 1.6, life: 1.2, additive: false, alpha: 0.4, vel: V(0, 0.8, 0) });
        await wait(160);
      },
    },
  };

  const pick = (defId: string) => SCRIPTS[defId] ?? SCRIPTS.solea;
  return {
    intro: (defId: string, uid: string, color: string, target: string | null) => pick(defId).intro(uid, color, target),
    play: (defId: string, b: UltBeat) => (b.last ? pick(defId).climax(b) : pick(defId).beat(b)),
  };
}
