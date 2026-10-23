import * as THREE from 'three';

/**
 * 셀 셰이딩 효과: 부드러운 빛무리 대신 경계가 또렷한 색면(흰 핵 → 색 → 검은 테두리)으로 그린다.
 * 림버스 컴퍼니·애니메이션 전투처럼 베기 호, 충격파, 별 모양 섬광, 만화식 폭발, 방사 집중선을 만든다.
 * 모두 카메라를 보는 판(빌보드)이고, 진행도 uT(0→1)에 따라 셰이더가 모양을 바꾼다.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const COMMON = /* glsl */ `
  uniform float uT, uSeed;
  uniform vec3 uA, uB;
  varying vec2 vUv;
  const vec3 INK = vec3(0.03, 0.02, 0.05);
  // 흰 핵은 살짝 낮춰 빛 번짐이 화면 전체로 퍼지지 않게 한다
  const vec3 HOT = vec3(0.92, 0.9, 0.85);
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }`;

/** 효과 종류별 조각 셰이더 본문. col과 a를 정한다. */
const BODIES = {
  // 베기 호: 앞머리가 휙 지나가고 꼬리가 따라 사라진다. 양끝이 가늘다.
  slash: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float sweep = 2.4;
    float s = (ang + sweep * 0.5) / sweep;
    if (s < 0.0 || s > 1.0) discard;
    float head = min(1.0, uT * 3.2);
    float tail = max(0.0, (uT - 0.22) * 1.35);
    if (s > head || s < tail) discard;
    float w = 0.16 * sin(3.14159 * s) * (1.0 - uT * 0.5) + 0.004;
    float d = abs(r - 0.72 - (s - 0.5) * 0.06);
    float edge = noise(vec2(s * 20.0, uSeed)) * 0.03;
    if (d > w + 0.018 + edge) discard;
    vec3 col = d < w * 0.38 ? HOT : d < w * 0.8 ? uB : d < w + edge ? uA : INK;
    // 지나간 자리부터 잘게 부서지며 사라진다
    if (noise(vec2(s * 30.0, r * 30.0) + uSeed) < (uT - 0.55) * 2.2) discard;
    float a = 1.0;`,
  // 충격파 고리: 빠르게 퍼지며 얇아진다
  ring: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float e = 1.0 - pow(1.0 - uT, 3.0);
    float R = e * 0.92;
    float th = (1.0 - uT) * 0.07 + 0.005;
    float d = r - R;
    if (abs(d) > th + 0.015) discard;
    vec3 col = d < -th * 0.2 ? HOT : abs(d) < th ? uA : INK;
    float a = 1.0;`,
  // 별 모양 섬광: 튀어나왔다(과하게) 줄어든다
  star: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x) + uSeed;
    float n = 4.0 + floor(mod(uSeed * 7.0, 3.0)) * 2.0;
    float e = 0.28 + 0.72 * pow(abs(cos(ang * n * 0.5)), 9.0);
    float sc = uT < 0.18 ? uT / 0.18 * 1.15 : 1.15 * (1.0 - (uT - 0.18) / 0.82);
    float d = r / max(0.001, e * sc);
    if (d > 1.0) discard;
    vec3 col = d < 0.5 ? HOT : d < 0.84 ? uA : INK;
    float a = 1.0;`,
  // 만화식 폭발: 울퉁불퉁한 원, 흰 핵 → 밝은 색 → 진한 색 → 먹 테두리, 안쪽부터 구멍이 나며 사라진다
  blast: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float grow = 1.0 - pow(1.0 - min(1.0, uT * 2.2), 3.0);
    float bound = grow * 0.9 * (0.82 + 0.18 * noise(vec2(ang * 3.0, uSeed)));
    if (r > bound) discard;
    float k = r / max(0.001, bound);
    float hole = noise(p * 5.0 + uSeed * 3.0);
    if (hole < (uT - 0.35) * 1.6) discard;
    float core = 0.5 * (1.0 - uT);
    vec3 col = k < core ? HOT : k < 0.72 ? uB : k < 0.93 ? uA : INK;
    float a = 1.0;`,
  // 방사 집중선: 가운데서 바깥으로 뻗는 가는 선
  burst: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x) / 6.28318 + 0.5;
    float sector = floor(ang * 28.0);
    float rnd = hash(vec2(sector, uSeed));
    if (rnd < 0.6) discard;
    float f = fract(ang * 28.0);
    float wdt = 0.05 + rnd * 0.06;
    if (abs(f - 0.5) > wdt) discard;
    float inner = uT * 0.7 + rnd * 0.15;
    float outer = inner + 0.25 + rnd * 0.25;
    if (r < inner || r > outer || r > 1.0) discard;
    vec3 col = abs(f - 0.5) < wdt * 0.45 ? HOT : uA;
    float a = 1.0 - uT;`,
  // 광선: 가로로 늘인 판. 흰 핵과 색 띠, 가장자리가 일렁인다
  beam: /* glsl */ `
    float v = abs(vUv.y - 0.5) * 2.0;
    float w = (1.0 - uT) * 0.6 + 0.05;
    w *= 0.85 + 0.15 * noise(vec2(vUv.x * 18.0 - uT * 30.0, uSeed));
    float tip = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    w *= tip;
    if (v > w + 0.08) discard;
    vec3 col = v < w * 0.25 ? HOT : v < w ? uA : INK;
    float a = 1.0;`,
  // 전투 연출 배경: 장면을 어둡게 덮고 성속 색의 방사 무늬를 깐다
  backdrop: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 1.6;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float rays = smoothstep(0.55, 0.95, noise(vec2(ang * 6.0 + uSeed * 0.2, r * 0.6 - uSeed * 0.4)));
    vec3 col = mix(INK, uA * 0.2, smoothstep(1.5, 0.0, r));
    col += uA * rays * 0.09 * smoothstep(0.1, 0.9, r);
    float a = uT;`,
} as const;

export type ToonKind = keyof typeof BODIES;

function material(kind: ToonKind): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: { uT: { value: 0 }, uSeed: { value: Math.random() * 10 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } },
    vertexShader: VERT,
    fragmentShader: `${COMMON}\nvoid main() {\n${BODIES[kind]}\n  gl_FragColor = vec4(col, a);\n}`,
  });
}

interface Live {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  delay: number;
  life: number;
  roll: number;
  /** 매 프레임 위치를 바꾸고 싶을 때(날아가는 효과) */
  path?: (k: number) => THREE.Vector3;
  /** 빌보드 대신 정해진 방향으로 눕히기(광선) */
  face?: THREE.Quaternion;
}

export interface ToonOpts {
  pos: THREE.Vector3;
  size: number | [number, number];
  color: THREE.ColorRepresentation;
  /** 안쪽 밝은 색(없으면 color를 밝힌 색) */
  light?: THREE.ColorRepresentation;
  life: number;
  delay?: number;
  roll?: number;
  path?: (k: number) => THREE.Vector3;
}

export class ToonFx {
  readonly group = new THREE.Group();
  private live: Live[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);
  /** 동시에 살아 있는 효과 상한(느린 기기 보호) */
  max = 90;

  constructor(private camera: THREE.Camera) {
    this.group.renderOrder = 6000;
  }

  spawn(kind: ToonKind, o: ToonOpts): void {
    if (this.live.length >= this.max) return;
    const mat = material(kind);
    const a = new THREE.Color(o.color);
    mat.uniforms.uA.value.copy(a);
    mat.uniforms.uB.value.copy(o.light !== undefined ? new THREE.Color(o.light) : a.clone().lerp(new THREE.Color(0xffffff), 0.55));
    const mesh = new THREE.Mesh(this.geo, mat);
    const [w, h] = Array.isArray(o.size) ? o.size : [o.size, o.size];
    mesh.scale.set(w, h, 1);
    mesh.position.copy(o.pos);
    mesh.renderOrder = 6000 + this.live.length;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.live.push({ mesh, mat, age: 0, delay: o.delay ?? 0, life: o.life, roll: o.roll ?? 0, path: o.path });
  }

  // ── 조합 ──────────────────────────────────────────────

  /** 베기: 각도(roll)를 바꿔 가며 쓰면 연속 베기가 된다 */
  slash(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 3.2, roll = 0, delay = 0): void {
    this.spawn('slash', { pos, size, color, life: 0.32, roll, delay });
  }

  /** 타격점: 별 섬광 + 충격파 고리 */
  hit(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1, delay = 0): void {
    this.spawn('star', { pos, size: 2.2 * scale, color, life: 0.22, roll: Math.random() * 3, delay });
    this.spawn('ring', { pos, size: 3.4 * scale, color, life: 0.34, delay });
  }

  /** 마무리 일격: 만화식 폭발 + 집중선 + 큰 고리 */
  finale(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1): void {
    this.spawn('blast', { pos, size: 2.7 * scale, color, life: 0.6 });
    this.spawn('burst', { pos, size: 7 * scale, color, life: 0.42, roll: Math.random() * 3 });
    this.spawn('ring', { pos, size: 5 * scale, color, life: 0.45 });
    this.spawn('star', { pos, size: 3 * scale, color, life: 0.28, roll: Math.random() * 3 });
  }

  /** 날아가는 탄: 별 모양이 대상까지 날아간 뒤 터진다 */
  shot(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, travel = 0.14, delay = 0): void {
    const path = (k: number) => from.clone().lerp(to, 1 - Math.pow(1 - k, 2));
    this.spawn('star', { pos: from, size: 1.1, color, life: travel, path, delay });
    this.beam(from, to, color, 0.2, travel * 1.4, delay);
  }

  /** 광선: from에서 to까지 늘인 판 */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, width = 0.8, life = 0.35, delay = 0): void {
    const mid = from.clone().lerp(to, 0.5);
    const len = from.distanceTo(to);
    this.spawn('beam', { pos: mid, size: [len, width], color, life, delay });
    const l = this.live[this.live.length - 1];
    if (l) {
      // 화면에서 from→to 방향으로 눕힌다(빌보드 위에 회전)
      const a = from.clone().project(this.camera);
      const b = to.clone().project(this.camera);
      const aspect = (this.camera as THREE.PerspectiveCamera).aspect ?? 1;
      l.roll = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
    }
  }

  update(dt: number): void {
    const q = this.camera.quaternion;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      if (l.delay > 0) {
        l.delay -= dt;
        continue;
      }
      l.age += dt;
      const k = Math.min(1, l.age / l.life);
      l.mesh.visible = true;
      l.mat.uniforms.uT.value = k;
      if (l.path) l.mesh.position.copy(l.path(k));
      l.mesh.quaternion.copy(q);
      if (l.roll) l.mesh.rotateZ(l.roll);
      if (k >= 1) {
        this.group.remove(l.mesh);
        l.mat.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const l of this.live) {
      this.group.remove(l.mesh);
      l.mat.dispose();
    }
    this.live = [];
  }
}

/**
 * 연출 배경: 시전하는 동안 무대 뒤를 어둡게 덮고 성속 색 방사 무늬를 깐다.
 * 인물과 효과만 또렷이 떠오르게 한다(림버스 컴퍼니 스킬 연출처럼).
 */
export class Backdrop {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private goal = 0;
  private cur = 0;

  constructor(private camera: THREE.Camera) {
    this.mat = material('backdrop');
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  set(color: THREE.ColorRepresentation | null, strength = 0.8): void {
    if (color !== null) this.mat.uniforms.uA.value.set(color);
    this.goal = color === null ? 0 : strength;
  }

  update(dt: number, t: number): void {
    this.cur += (this.goal - this.cur) * Math.min(1, dt * 9);
    this.mesh.visible = this.cur > 0.01;
    if (!this.mesh.visible) return;
    this.mat.uniforms.uT.value = this.cur;
    this.mat.uniforms.uSeed.value = t;
    // 카메라 앞, 무대 뒤쪽 거리에 화면을 덮는 크기로 둔다
    const cam = this.camera as THREE.PerspectiveCamera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const dist = cam.position.length() + 4;
    this.mesh.position.copy(cam.position).addScaledVector(dir, dist);
    this.mesh.quaternion.copy(cam.quaternion);
    const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.3;
    this.mesh.scale.set(h * cam.aspect, h, 1);
  }

  dispose(): void {
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}
