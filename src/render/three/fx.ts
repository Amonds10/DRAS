import * as THREE from 'three';
import type { GroundLights } from './environment';
import { MAX_GROUND_LIGHTS } from './environment';
import { fxTexture, type FxName } from './textures';

type Curve = 'fade' | 'flash' | 'pulse' | 'grow';

interface Particle {
  obj: THREE.Sprite | THREE.Mesh;
  mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  age: number;
  life: number;
  delay: number;
  vel: THREE.Vector3;
  gravity: number;
  drag: number;
  s0: THREE.Vector2;
  s1: THREE.Vector2;
  spin: number;
  alpha: number;
  curve: Curve;
  /** 이동 경로가 있으면 위치를 경로로 정한다 */
  path?: (k: number) => THREE.Vector3;
}

interface Light {
  pos: THREE.Vector3;
  color: THREE.Color;
  age: number;
  life: number;
}

interface Arc {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  life: number;
  fading: boolean;
}

export interface SpriteOpts {
  tex: FxName;
  color: THREE.ColorRepresentation;
  pos: THREE.Vector3;
  size: number | [number, number];
  to?: number | [number, number];
  life: number;
  delay?: number;
  vel?: THREE.Vector3;
  gravity?: number;
  drag?: number;
  rot?: number;
  spin?: number;
  alpha?: number;
  curve?: Curve;
  additive?: boolean;
  /** 바닥에 눕힌다(마법진, 파문) */
  ground?: boolean;
  /** 인물 뒤에 둔다(시전 마법진). 기본은 인물 앞에 그린다. */
  behind?: boolean;
  path?: (k: number) => THREE.Vector3;
}

const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/**
 * 스프라이트 기반 VFX. Kenney Particle Pack(CC0) 텍스처를 색으로 물들이고 가산 혼합한다.
 * 섬광은 바닥 셰이더 조명으로도 넣어 주변 바닥이 함께 밝아진다.
 */
export class FxSystem {
  readonly group = new THREE.Group();
  private parts: Particle[] = [];
  private lights: Light[] = [];
  private arcs: Arc[] = [];
  private groundGeo = new THREE.PlaneGeometry(1, 1);

  constructor(
    private camera: THREE.Camera,
    private ground: GroundLights,
    private staticLights: number,
  ) {}

  sprite(o: SpriteOpts): void {
    const additive = o.additive ?? true;
    const s0 = Array.isArray(o.size) ? new THREE.Vector2(...o.size) : new THREE.Vector2(o.size, o.size);
    const to = o.to ?? o.size;
    const s1 = Array.isArray(to) ? new THREE.Vector2(...to) : new THREE.Vector2(to, to);
    let obj: THREE.Sprite | THREE.Mesh;
    let mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    if (o.ground) {
      mat = new THREE.MeshBasicMaterial({ map: fxTexture(o.tex), color: o.color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0 });
      obj = new THREE.Mesh(this.groundGeo, mat);
      obj.rotation.x = -Math.PI / 2;
      obj.rotation.z = o.rot ?? 0;
    } else {
      mat = new THREE.SpriteMaterial({ map: fxTexture(o.tex), color: o.color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0, rotation: o.rot ?? 0 });
      obj = new THREE.Sprite(mat);
    }
    obj.position.copy(o.pos);
    obj.scale.set(s0.x, s0.y, 1);
    obj.visible = false;
    // 바닥 효과는 인물 밑, 시전 마법진은 인물 뒤, 나머지(투사체·타격)는 인물 앞에 그린다.
    if (o.ground) obj.renderOrder = 20;
    else if (o.behind) obj.renderOrder = 30;
    else {
      obj.renderOrder = 5000;
      mat.depthTest = false;
    }
    this.group.add(obj);
    this.parts.push({
      obj,
      mat,
      age: 0,
      life: o.life,
      delay: o.delay ?? 0,
      vel: o.vel?.clone() ?? new THREE.Vector3(),
      gravity: o.gravity ?? 0,
      drag: o.drag ?? 0,
      s0,
      s1,
      spin: o.spin ?? 0,
      alpha: o.alpha ?? 1,
      curve: o.curve ?? 'fade',
      path: o.path,
    });
  }

  light(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, life: number): void {
    this.lights.push({ pos: new THREE.Vector3(pos.x, 0.6, pos.z), color: new THREE.Color(color).multiplyScalar(intensity), age: 0, life });
  }

  /** 화면상 두 점 사이 각도(스프라이트 회전용) */
  screenAngle(a: THREE.Vector3, b: THREE.Vector3): number {
    const pa = a.clone().project(this.camera);
    const pb = b.clone().project(this.camera);
    const aspect = (this.camera as THREE.PerspectiveCamera).aspect ?? 1;
    return Math.atan2(pb.y - pa.y, (pb.x - pa.x) * aspect);
  }

  // ───────── 조합 효과 ─────────

  flare(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 1.6, life = 0.35): void {
    this.sprite({ tex: 'soft', color, pos, size: size * 0.4, to: size, life: life * 1.2, curve: 'flash', alpha: 0.7 });
    this.sprite({ tex: 'light_01', color, pos, size: size * 0.6, to: size * 1.8, life: life * 1.3, curve: 'flash', alpha: 0.6, rot: Math.random() * 3 });
    this.sprite({ tex: 'star_04', color: 0xffffff, pos, size: size * 0.4, to: size * 1.1, life: life * 0.9, curve: 'flash', rot: Math.random() * 3, spin: 1.5, alpha: 0.7 });
  }

  /** 타격 뒤에 천천히 떠도는 별가루(여운) */
  linger(pos: THREE.Vector3, color: THREE.ColorRepresentation, n = 10, spread = 1.2): void {
    for (let i = 0; i < n; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, 0.2));
      this.sprite({ tex: i % 2 ? 'star_05' : 'star_01', color: i % 3 ? color : 0xffffff, pos: p, size: 0.12 + Math.random() * 0.14, to: 0.02, life: 1 + Math.random() * 0.8, delay: 0.05 + Math.random() * 0.25, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, 0), drag: 0.8, curve: 'pulse' });
    }
  }

  sparks(pos: THREE.Vector3, color: THREE.ColorRepresentation, n = 10, speed = 5, size = 0.18): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.3, (Math.random() - 0.5) * 0.6).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.sprite({ tex: 'star_05', color, pos, size, to: size * 0.3, life: 0.35 + Math.random() * 0.3, vel: v, gravity: -9, drag: 2.5 });
    }
  }

  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, from = 0.5, to = 4, life = 0.5, tex: FxName = 'circle_02'): void {
    this.sprite({ tex, color, pos: new THREE.Vector3(pos.x, 0.03, pos.z), size: from, to, life, ground: true, curve: 'fade' });
  }

  magicCircle(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 2.4, life = 1.2, tex: FxName = 'magic_02'): void {
    this.sprite({ tex, color, pos: new THREE.Vector3(pos.x, 0.04, pos.z), size: size * 0.8, to: size, life, ground: true, curve: 'pulse', spin: 1.2 });
    this.light(pos, color, 1.4, life);
  }

  impact(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1): void {
    const scorch = (['scorch_01', 'scorch_02', 'scorch_03'] as const)[Math.floor(Math.random() * 3)];
    this.sprite({ tex: scorch, color, pos, size: 0.8 * scale, to: 2.8 * scale, life: 0.42, rot: Math.random() * 6, curve: 'flash' });
    // 충격파 고리 두 겹과 방사광
    this.sprite({ tex: 'circle_03', color, pos, size: 0.5 * scale, to: 3.8 * scale, life: 0.45, alpha: 0.9 });
    this.sprite({ tex: 'circle_01', color: 0xffffff, pos, size: 0.3 * scale, to: 1.6 * scale, life: 0.25, alpha: 0.35 });
    this.sprite({ tex: 'light_03', color, pos, size: 1 * scale, to: 3.4 * scale, life: 0.5, spin: 2, curve: 'flash', alpha: 0.8 });
    this.flare(pos, color, 1.8 * scale, 0.3);
    this.sparks(pos, color, 14, 6.5 * scale, 0.22);
    // 빛줄기처럼 길게 튀는 불티
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sprite({ tex: 'spark_06', color: 0xffffff, pos, size: [0.08, 0.6 * scale], to: [0.02, 1.4 * scale], life: 0.28, rot: a - Math.PI / 2, vel: new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(5 * scale), drag: 4, curve: 'flash' });
    }
    this.linger(pos, color, Math.round(5 * scale), 1.2 * scale);
    this.light(pos, color, 2.6 * scale, 0.5);
  }

  /** 시전자 → 대상 투사체. 도착 시점은 travel초 뒤. */
  projectile(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, travel = 0.34, arc = 0.6, delay = 0): void {
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, arc, 0));
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
    const rot = this.screenAngle(from, to) - Math.PI / 2;
    const path = (k: number) => curve.getPoint(ease(k));
    // 빛 구슬: 흰 핵, 색 빛무리, 돌아가는 별빛 고리
    this.sprite({ tex: 'trace_02', color, pos: from, size: [0.5, 2.4], life: travel, delay, rot, curve: 'pulse', path });
    this.sprite({ tex: 'soft', color, pos: from, size: 1.2, life: travel, delay, curve: 'pulse', path, alpha: 0.75 });
    this.sprite({ tex: 'soft', color: 0xffffff, pos: from, size: 0.4, life: travel, delay, curve: 'pulse', path, alpha: 0.6 });
    this.sprite({ tex: 'star_04', color, pos: from, size: 1.1, life: travel, delay, spin: 9, curve: 'pulse', path });
    // 꼬리: 지나간 자리에 오래 남는 별가루
    for (let i = 0; i < 14; i++) {
      const k0 = i / 14;
      this.sprite({ tex: i % 3 ? 'star_05' : 'spark_05', color: i % 4 ? color : 0xffffff, pos: curve.getPoint(ease(k0)), size: 0.32, to: 0.04, life: 0.5 + Math.random() * 0.3, delay: delay + travel * k0, vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.3) * 0.8, 0), drag: 1.2 });
    }
    this.flare(from, color, 1.2, 0.25);
  }

  /** 관통: 화면을 가로지르는 광선 */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation): void {
    const dir = to.clone().sub(from);
    const far = to.clone().add(dir.clone().normalize().multiplyScalar(4));
    const center = from.clone().lerp(far, 0.5);
    const len = from.distanceTo(far);
    const rot = this.screenAngle(from, far) - Math.PI / 2;
    this.sprite({ tex: 'trace_06', color, pos: center, size: [0.3, len], to: [1.6, len], life: 0.5, rot, curve: 'flash' });
    this.sprite({ tex: 'trace_06', color: 0xffffff, pos: center, size: [0.12, len], to: [0.5, len], life: 0.35, rot, curve: 'flash' });
    this.sprite({ tex: 'trace_01', color, pos: center, size: [0.6, len], to: [2.4, len], life: 0.6, rot, curve: 'flash', alpha: 0.5 });
    // 광선을 따라 흩어지는 빛 알갱이
    for (let i = 0; i < 12; i++) {
      const p = from.clone().lerp(far, Math.random());
      this.sprite({ tex: 'star_05', color: i % 2 ? color : 0xffffff, pos: p, size: 0.3, to: 0.03, life: 0.6, delay: Math.random() * 0.15, vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0), drag: 1.5 });
    }
    this.flare(from, color, 1.8, 0.35);
    this.light(to, color, 3.5, 0.5);
  }

  /** 광역 베기: 커다란 호가 적진을 휩쓴다 */
  sweep(center: THREE.Vector3, color: THREE.ColorRepresentation, width = 6): void {
    this.sprite({ tex: 'slash_02', color, pos: center.clone().add(new THREE.Vector3(0, 0.6, 0)), size: width * 0.6, to: width * 1.1, life: 0.5, rot: -0.3, curve: 'flash', spin: -2 });
    this.sprite({ tex: 'slash_03', color: 0xffffff, pos: center.clone().add(new THREE.Vector3(0, 0.4, 0)), size: width * 0.5, to: width, life: 0.36, rot: 1.2, curve: 'flash' });
    this.sprite({ tex: 'slash_01', color, pos: center.clone().add(new THREE.Vector3(0, 0.9, 0)), size: width * 0.4, to: width * 0.95, life: 0.45, rot: 2.6, delay: 0.08, curve: 'flash', spin: 2 });
    this.sprite({ tex: 'light_03', color, pos: center.clone().add(new THREE.Vector3(0, 0.6, 0)), size: width * 0.3, to: width * 0.9, life: 0.6, spin: 1, curve: 'flash', alpha: 0.6 });
    this.ring(center, color, 1, width * 1.3, 0.7, 'circle_03');
    this.ring(center, color, 0.5, width * 0.8, 0.9, 'magic_02');
    this.linger(center.clone().add(new THREE.Vector3(0, 0.8, 0)), color, 16, width * 0.6);
    this.light(center, color, 5, 0.6);
  }

  /** 처단·적의 할퀴기 같은 날카로운 베기 */
  slash(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 2.4): void {
    this.sprite({ tex: 'scratch_01', color, pos, size: size * 0.6, to: size, life: 0.3, rot: Math.random() * 0.6 - 0.3, curve: 'flash' });
    this.sprite({ tex: 'slash_01', color: 0xffffff, pos, size: size * 0.5, to: size * 1.1, life: 0.22, rot: 0.8, curve: 'flash' });
    this.sparks(pos, color, 6, 4);
    this.light(pos, color, 2.5, 0.3);
  }

  /** 위에서 떨어지는 폭격 */
  meteor(to: THREE.Vector3, color: THREE.ColorRepresentation): void {
    const from = to.clone().add(new THREE.Vector3(-3, 12, -2));
    const rot = this.screenAngle(from, to) - Math.PI / 2;
    this.sprite({ tex: 'trace_05', color, pos: from, size: [0.8, 4], life: 0.25, rot, path: (k) => from.clone().lerp(to, k * k) });
    this.sprite({ tex: 'soft', color, pos: from, size: 1.6, life: 0.25, path: (k) => from.clone().lerp(to, k * k) });
    this.impact(to, color, 1.8);
    this.ring(to, color, 1, 6, 0.7, 'circle_03');
    this.sprite({ tex: 'smoke_07', color: 0x2a2a30, pos: to, size: 1.5, to: 4, life: 1.2, additive: false, alpha: 0.7, delay: 0.1, vel: new THREE.Vector3(0, 0.6, 0) });
  }

  burn(pos: THREE.Vector3, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 5; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.4 + Math.random() * 0.6, 0.1));
      this.sprite({ tex: (['flame_01', 'flame_02', 'flame_03'] as const)[i % 3], color, pos: p, size: 0.5, to: 1.1, life: 0.6, delay: i * 0.05, vel: new THREE.Vector3(0, 1.4, 0), curve: 'pulse' });
    }
    this.light(pos, color, 1.5, 0.6);
  }

  heal(pos: THREE.Vector3, feet: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.ring(feet, color, 0.5, 2.4, 0.7, 'circle_02');
    for (let i = 0; i < 10; i++) {
      const p = feet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.6, (Math.random() - 0.5) * 0.4));
      this.sprite({ tex: i % 2 ? 'star_01' : 'star_02', color, pos: p, size: 0.3, to: 0.12, life: 0.9, delay: i * 0.04, vel: new THREE.Vector3(0, 2.2, 0), curve: 'pulse' });
    }
    this.sprite({ tex: 'soft', color, pos, size: 1.2, to: 2, life: 0.5, alpha: 0.6 });
    this.light(feet, color, 1.6, 0.6);
  }

  shield(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 2.6): void {
    this.sprite({ tex: 'circle_03', color, pos, size: size * 0.8, to: size, life: 0.7, curve: 'pulse', alpha: 0.9 });
    this.sprite({ tex: 'light_02', color, pos, size: size * 0.7, to: size * 1.05, life: 0.6, curve: 'flash', alpha: 0.6 });
  }

  buff(pos: THREE.Vector3, feet: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.sprite({ tex: 'trace_06', color, pos: feet.clone().add(new THREE.Vector3(0, 1.6, 0)), size: [0.4, 3.6], to: [1.4, 4.2], life: 0.6, curve: 'flash' });
    this.magicCircle(feet, color, 2.2, 0.8, 'magic_01');
    for (let i = 0; i < 8; i++) {
      const p = feet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1, Math.random() * 0.4, 0));
      this.sprite({ tex: 'star_05', color, pos: p, size: 0.22, to: 0.08, life: 0.7, delay: i * 0.05, vel: new THREE.Vector3(0, 3, 0) });
    }
    this.flare(pos, color, 1.2, 0.3);
  }

  debuff(pos: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.sprite({ tex: 'twirl_02', color, pos, size: 1.2, to: 2.4, life: 0.7, spin: 6, curve: 'pulse' });
    this.sprite({ tex: 'twirl_03', color, pos, size: 2.2, to: 1.0, life: 0.7, spin: -5, curve: 'pulse', rot: 1 });
    this.sprite({ tex: 'smoke_04', color: 0x1a1420, pos, size: 1.2, to: 2.6, life: 0.9, additive: false, alpha: 0.6 });
  }

  // ───────── 시전 준비와 성속 고유 연출 ─────────

  /** 기 모으기: 주위에서 빛 알갱이가 손끝으로 빨려 든다 */
  gather(at: THREE.Vector3, color: THREE.ColorRepresentation, n = 16, time = 0.32): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 1.2;
      const from = at.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.8, 0.2));
      this.sprite({ tex: i % 3 ? 'star_05' : 'spark_05', color, pos: from, size: 0.22, to: 0.08, life: time, delay: Math.random() * 0.08, curve: 'pulse', path: (k) => from.clone().lerp(at, ease(k)) });
    }
    this.sprite({ tex: 'soft', color, pos: at, size: 0.2, to: 1.0, life: time + 0.1, curve: 'grow', alpha: 0.55 });
  }

  /** 시전자 뒤에 세워지는 마법진(리버스 1999식): 커지며 돌고, 앞뒤로 두 겹 */
  castCircle(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 3): void {
    const back = pos.clone().add(new THREE.Vector3(-0.15, 0, -0.35));
    this.sprite({ tex: 'magic_02', color, pos: back, size: size * 0.4, to: size, life: 0.9, spin: 2.4, curve: 'pulse', behind: true });
    this.sprite({ tex: 'magic_01', color: 0xffffff, pos: back, size: size * 0.3, to: size * 0.75, life: 0.8, spin: -3.2, curve: 'pulse', alpha: 0.55, behind: true });
    this.sprite({ tex: 'light_01', color, pos: back, size: size * 0.6, to: size * 1.3, life: 0.6, curve: 'flash', alpha: 0.5, behind: true });
    // 발밑에서 솟는 빛기둥과 피어오르는 별
    const feet = new THREE.Vector3(pos.x, 0, pos.z);
    this.sprite({ tex: 'trace_06', color, pos: feet.clone().add(new THREE.Vector3(0, 2.2, -0.2)), size: [0.6, 4.6], to: [1.8, 5.2], life: 0.9, curve: 'pulse', alpha: 0.55, behind: true });
    this.ring(feet, color, size * 0.4, size * 0.9, 1.0, 'magic_02');
    for (let i = 0; i < 10; i++) {
      const p = feet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.4, 0.1));
      this.sprite({ tex: 'star_05', color, pos: p, size: 0.22, to: 0.04, life: 0.9, delay: i * 0.04, vel: new THREE.Vector3(0, 2.4 + Math.random() * 1.5, 0), drag: 0.6 });
    }
    this.light(feet, color, 2, 0.9);
  }

  /** 잔상: 인물 실루엣을 빛 색으로 남겨 빠르게 흩어지게 한다 */
  ghost(tex: THREE.Texture, pos: THREE.Vector3, size: [number, number], color: THREE.ColorRepresentation, life = 0.3, delay = 0): void {
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const obj = new THREE.Sprite(mat);
    obj.position.copy(pos);
    obj.scale.set(size[0], size[1], 1);
    obj.visible = false;
    obj.renderOrder = 30;
    this.group.add(obj);
    const s = new THREE.Vector2(size[0], size[1]);
    this.parts.push({ obj, mat, age: 0, life, delay, vel: new THREE.Vector3(-1.2, 0, 0), gravity: 0, drag: 2, s0: s, s1: s.clone().multiplyScalar(1.04), spin: 0, alpha: 0.55, curve: 'fade' });
  }

  /**
   * 성속 고유 타격 연출. 같은 단일 공격이라도 성속마다 모양이 다르다.
   * 태양: 햇살 방사 / 달: 초승달 베기 / 성운: 소용돌이 / 혜성: 꼬리 폭발 / 공허: 안으로 빨려 드는 붕괴 / 별: 별자리 선
   */
  signature(element: string, pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1): void {
    scale *= 1.35;
    this.linger(pos, color, Math.round(3 * scale), 1.4 * scale);
    switch (element) {
      case 'sol':
        for (let i = 0; i < 8; i++) this.sprite({ tex: 'trace_06', color, pos, size: [0.25 * scale, 0.4], to: [0.12 * scale, 3.4 * scale], life: 0.35, rot: (i / 8) * Math.PI * 2, curve: 'flash' });
        this.sprite({ tex: 'light_02', color: 0xfff2c0, pos, size: 0.6, to: 2.6 * scale, life: 0.4, curve: 'flash' });
        break;
      case 'luna':
        this.sprite({ tex: 'slash_02', color, pos, size: 1.2 * scale, to: 3.2 * scale, life: 0.4, rot: 0.6, curve: 'flash', spin: -4 });
        this.sprite({ tex: 'slash_03', color: 0xeaf2ff, pos, size: 0.8 * scale, to: 2.4 * scale, life: 0.3, rot: 2.4, curve: 'flash' });
        for (let i = 0; i < 6; i++) this.sprite({ tex: 'star_01', color, pos, size: 0.3, to: 0.05, life: 0.8, vel: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, 0), drag: 1.5 });
        break;
      case 'nebula':
        this.sprite({ tex: 'twirl_01', color, pos, size: 0.8 * scale, to: 3 * scale, life: 0.7, spin: 7, curve: 'pulse' });
        this.sprite({ tex: 'twirl_03', color: 0xffd6ee, pos, size: 2.6 * scale, to: 0.6, life: 0.6, spin: -6, curve: 'pulse', alpha: 0.7 });
        this.sprite({ tex: 'smoke_04', color, pos, size: 1 * scale, to: 3 * scale, life: 0.9, alpha: 0.5, spin: 1 });
        break;
      case 'comet':
        this.sprite({ tex: 'flare_01', color, pos, size: 0.6, to: 3.2 * scale, life: 0.35, curve: 'flash' });
        this.sparks(pos, color, 14, 7 * scale, 0.2);
        this.sprite({ tex: 'scorch_02', color, pos, size: 1 * scale, to: 2.8 * scale, life: 0.4, rot: Math.random() * 6, curve: 'flash' });
        break;
      case 'void':
        this.sprite({ tex: 'circle_05', color, pos, size: 3.4 * scale, to: 0.2, life: 0.35, curve: 'grow', alpha: 0.9 });
        this.sprite({ tex: 'smoke_07', color: 0x0a0612, pos, size: 2.4 * scale, to: 0.6, life: 0.4, additive: false, alpha: 0.85 });
        this.sprite({ tex: 'light_03', color, pos, size: 0.4, to: 3 * scale, life: 0.45, delay: 0.3, curve: 'flash' });
        this.sparks(pos, color, 10, 5, 0.2);
        break;
      default: {
        // 별: 대상 둘레에 별 다섯 개를 찍고 선으로 잇는다
        const pts = Array.from({ length: 5 }, (_, i) => pos.clone().add(new THREE.Vector3(Math.cos(i * 1.256) * 1.1 * scale, Math.sin(i * 1.256) * 0.9 * scale, 0.1)));
        pts.forEach((p0, i) => {
          this.sprite({ tex: 'star_04', color, pos: p0, size: 0.2, to: 0.7, life: 0.6, delay: i * 0.04, curve: 'flash' });
          const p1 = pts[(i + 2) % 5];
          this.sprite({ tex: 'trace_06', color, pos: p0.clone().lerp(p1, 0.5), size: [0.05, p0.distanceTo(p1)], to: [0.12, p0.distanceTo(p1)], life: 0.5, delay: 0.1 + i * 0.04, rot: this.screenAngle(p0, p1) - Math.PI / 2, curve: 'flash' });
        });
      }
    }
    this.light(pos, color, 2.4 * scale, 0.45);
  }

  /** 혜성처럼 긴 꼬리를 남기는 투사체(벨라의 사격, 혜성 성속) */
  comet(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, travel = 0.22, delay = 0): void {
    const rot = this.screenAngle(from, to) - Math.PI / 2;
    const path = (k: number) => from.clone().lerp(to, ease(k));
    this.sprite({ tex: 'trace_05', color, pos: from, size: [0.5, 3.2], life: travel, delay, rot, curve: 'pulse', path });
    this.sprite({ tex: 'soft', color: 0xffffff, pos: from, size: 0.7, life: travel, delay, curve: 'pulse', path });
    for (let i = 0; i < 10; i++) {
      const k0 = i / 10;
      this.sprite({ tex: 'spark_05', color, pos: path(k0), size: 0.3, to: 0.04, life: 0.35, delay: delay + travel * k0, vel: new THREE.Vector3(-1, (Math.random() - 0.5) * 1.5, 0) });
    }
    this.sprite({ tex: 'muzzle_02', color, pos: from, size: 0.4, to: 1.6, life: 0.16, delay, rot, curve: 'flash' });
  }

  /** 지연 폭격 예고: 대상 머리 위 표식 */
  mark(pos: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.sprite({ tex: 'magic_01', color, pos: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), size: 2.4, to: 1.4, life: 0.9, spin: 3, curve: 'pulse' });
  }

  drainReturn(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 8; i++) {
      const off = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, 0);
      const mid = from.clone().lerp(to, 0.5).add(off.add(new THREE.Vector3(0, 1, 0)));
      const c = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
      this.sprite({ tex: 'soft', color, pos: from, size: 0.35, to: 0.15, life: 0.5, delay: i * 0.04, path: (k) => c.getPoint(ease(k)) });
    }
  }

  motes(from: THREE.Vector3, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3((Math.random() - 0.2) * 2, 2 + Math.random() * 3, 0);
      this.sprite({ tex: 'star_05', color, pos: from, size: 0.28, to: 0.05, life: 0.9, delay: i * 0.03, vel: v, drag: 0.6 });
    }
    this.flare(from, color, 1.4, 0.4);
  }

  death(pos: THREE.Vector3, color: THREE.ColorRepresentation): void {
    this.sprite({ tex: 'smoke_01', color: 0x15151a, pos, size: 1.4, to: 3.6, life: 1.1, additive: false, alpha: 0.75, vel: new THREE.Vector3(0, 0.5, 0) });
    this.sparks(pos, color, 16, 6, 0.22);
    this.sprite({ tex: 'circle_05', color, pos, size: 0.6, to: 3, life: 0.45, curve: 'flash' });
    this.light(pos, color, 3, 0.5);
  }

  /** 반응·성좌 완성 같은 큰 폭발 */
  nova(pos: THREE.Vector3, colorA: THREE.ColorRepresentation, colorB: THREE.ColorRepresentation, scale = 1): void {
    this.sprite({ tex: 'circle_01', color: colorA, pos, size: 0.5, to: 7 * scale, life: 0.6 });
    this.sprite({ tex: 'light_03', color: colorB, pos, size: 1, to: 5 * scale, life: 0.7, spin: 1 });
    this.sprite({ tex: 'star_04', color: 0xffffff, pos, size: 1, to: 3.5 * scale, life: 0.4, curve: 'flash', alpha: 0.7 });
    this.ring(pos, colorA, 1, 9 * scale, 0.8, 'circle_03');
    this.sparks(pos, colorB, 22, 8, 0.24);
    this.light(pos, colorA, 2.6, 0.8);
  }

  lightning(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation): void {
    const center = from.clone().lerp(to, 0.5);
    const len = from.distanceTo(to);
    const rot = this.screenAngle(from, to);
    this.sprite({ tex: 'spark_07', color, pos: center, size: [len, 0.9], to: [len, 1.2], life: 0.28, rot, curve: 'flash' });
  }

  /**
   * 스킬 간 연계: 두 시전자의 가슴을 잇는 흐르는 에너지 호.
   * 적 차례가 시작되면 fadeArcs()로 지운다.
   */
  arc(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, preview = false): THREE.Mesh {
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 1.1 + from.distanceTo(to) * 0.12, 0.2));
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
    const geo = new THREE.TubeGeometry(curve, 48, preview ? 0.025 : 0.06, 8, false);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uReveal: { value: preview ? 1 : 0 }, uAlpha: { value: preview ? 0.55 : 1 }, uDash: { value: preview ? 1 : 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime, uReveal, uAlpha, uDash;
        varying vec2 vUv;
        void main() {
          float x = vUv.x;
          if (x > uReveal) discard;
          float flow = 0.55 + 0.45 * sin(x * 40.0 - uTime * 14.0);
          float dash = uDash > 0.5 ? step(0.5, fract(x * 18.0 - uTime * 1.5)) : 1.0;
          float edge = smoothstep(0.0, 0.06, x) * smoothstep(1.0, 0.94, x);
          float head = smoothstep(uReveal - 0.08, uReveal, x) * (1.0 - uDash);
          vec3 c = uColor * (1.2 + head * 3.0) * flow;
          gl_FragColor = vec4(c, edge * dash * uAlpha);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 25;
    this.group.add(mesh);
    if (!preview) {
      this.arcs.push({ mesh, mat, age: 0, life: 0.35, fading: false });
      this.lightning(from, to, color);
      this.sprite({ tex: 'star_04', color, pos: to, size: 0.4, to: 1.4, life: 0.45, curve: 'flash', delay: 0.3 });
    }
    return mesh;
  }

  fadeArcs(): void {
    for (const a of this.arcs) {
      a.fading = true;
      a.age = 0;
    }
  }

  /** 성좌 완성: 잇던 선을 금색으로 바꾼다 */
  goldArcs(): void {
    for (const a of this.arcs) a.mat.uniforms.uColor.value.set(0xffd27a);
  }

  removeMesh(m: THREE.Mesh): void {
    this.group.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }

  update(dt: number, t: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.obj.visible = true;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      if (p.path) p.obj.position.copy(p.path(k));
      else {
        p.vel.y += p.gravity * dt;
        p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.obj.position.addScaledVector(p.vel, dt);
      }
      const e = ease(k);
      p.obj.scale.set(p.s0.x + (p.s1.x - p.s0.x) * e, p.s0.y + (p.s1.y - p.s0.y) * e, 1);
      if (p.spin) {
        if (p.obj instanceof THREE.Sprite) (p.mat as THREE.SpriteMaterial).rotation += p.spin * dt;
        else p.obj.rotation.z += p.spin * dt;
      }
      let a: number;
      switch (p.curve) {
        case 'flash':
          a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          break;
        case 'pulse':
          a = Math.sin(k * Math.PI);
          break;
        case 'grow':
          a = k;
          break;
        default:
          a = 1 - k;
      }
      p.mat.opacity = Math.max(0, a) * p.alpha;
      if (k >= 1) {
        this.group.remove(p.obj);
        p.mat.dispose();
        this.parts.splice(i, 1);
      }
    }

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.age += dt;
      a.mat.uniforms.uTime.value = t;
      if (!a.fading) a.mat.uniforms.uReveal.value = Math.min(1, ease(a.age / a.life));
      else {
        a.mat.uniforms.uAlpha.value = Math.max(0, 1 - a.age / 0.6);
        if (a.age > 0.6) {
          this.removeMesh(a.mesh);
          this.arcs.splice(i, 1);
        }
      }
    }
    for (const m of this.group.children) {
      const mat = (m as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (mat?.uniforms?.uDash?.value === 1) mat.uniforms.uTime.value = t;
    }

    // 동적 조명을 바닥 셰이더 슬롯에 채운다(고정 조명 다음 칸부터).
    for (let i = this.lights.length - 1; i >= 0; i--) {
      this.lights[i].age += dt;
      if (this.lights[i].age >= this.lights[i].life) this.lights.splice(i, 1);
    }
    const slots = MAX_GROUND_LIGHTS - this.staticLights;
    const live = this.lights.slice(-slots);
    for (let s = 0; s < slots; s++) {
      const idx = this.staticLights + s;
      const l = live[s];
      if (l) {
        const k = l.age / l.life;
        this.ground.pos[idx].copy(l.pos);
        this.ground.col[idx].copy(l.color).multiplyScalar(1 - k);
      } else {
        this.ground.col[idx].setRGB(0, 0, 0);
      }
    }
  }

  dispose(): void {
    for (const p of this.parts) p.mat.dispose();
    for (const a of this.arcs) this.removeMesh(a.mesh);
    this.parts = [];
    this.arcs = [];
    this.groundGeo.dispose();
  }
}
