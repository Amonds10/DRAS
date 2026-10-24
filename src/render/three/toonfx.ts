import * as THREE from 'three';

/**
 * 빛 효과: 검은 테두리·딱 끊기는 색면(만화풍) 대신, 부드럽게 번지는 빛(가산 혼합)으로 그린다.
 * 중심은 성속 색을 밝힌 고열 핵, 바깥은 가우스로 흐려지는 빛무리라 블룸과 함께 실제 빛처럼 보인다.
 * 베기 궤적, 충격파, 렌즈 섬광, 난류 폭발, 불티 줄기, 에너지 광선을 만든다.
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
  // 고열 핵: 성속 색을 살짝 밝힌 색(하얗게 날아가지 않게)
  #define HOT mix(uB, vec3(1.0), 0.15)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }
  float gauss(float d, float w) { return exp(-(d * d) / max(1e-5, w * w)); }`;

/** 효과 종류별 조각 셰이더 본문. col(빛의 색)과 a(세기)를 정한다. 가산 혼합이라 a가 곧 밝기다. */
const BODIES = {
  // 베기 궤적: 칼끝이 지나간 자리에 남는 빛의 띠. 앞머리가 가장 밝고 뒤로 갈수록 흩어진다.
  slash: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float sweep = 2.4;
    float s = (ang + sweep * 0.5) / sweep;
    float head = min(1.0, uT * 3.0);
    float inArc = step(0.0, s) * step(s, 1.0) * step(s, head);
    float trail = smoothstep(head - 0.75, head, s);
    float w = 0.075 * sin(3.14159 * clamp(s, 0.0, 1.0)) + 0.008;
    float d = abs(r - 0.72 - (s - 0.5) * 0.06);
    float streak = 0.65 + 0.35 * noise(vec2(s * 46.0 - uT * 18.0, r * 14.0 + uSeed));
    float core = gauss(d, w * 0.28);
    float glow = gauss(d, w * 1.9) * streak;
    float fade = 1.0 - smoothstep(0.45, 1.0, uT);
    vec3 col = uA * glow * 0.9 + HOT * core * 1.25;
    float a = inArc * trail * fade;`,
  // 충격파: 얇고 밝은 테가 퍼지고, 안쪽에 옅은 열기가 남는다
  ring: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float e = 1.0 - pow(1.0 - uT, 3.0);
    float R = e * 0.88;
    float th = (1.0 - uT) * 0.05 + 0.012;
    float d = r - R;
    float edge = gauss(d, th);
    float haze = smoothstep(R, 0.0, r) * 0.18 * (1.0 - uT);
    float wob = 0.75 + 0.25 * noise(vec2(atan(p.y, p.x) * 5.0, uSeed));
    vec3 col = mix(uA, HOT, gauss(d, th * 0.35)) * (edge * wob) + uA * haze;
    float a = pow(1.0 - uT, 1.4) * (1.0 - smoothstep(0.92, 1.0, r));`,
  // 렌즈 섬광: 부드러운 빛 핵 + 가로로 긴 줄기 + 가는 빛살. 확 켜졌다가 잦아든다.
  star: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float pop = uT < 0.12 ? uT / 0.12 : 1.0 - smoothstep(0.12, 1.0, uT);
    float core = exp(-r * r * 26.0);
    float halo = exp(-r * r * 5.5) * 0.45;
    float streakH = exp(-abs(p.y) * 52.0) * exp(-abs(p.x) * 3.6);
    float streakV = exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 4.0) * 0.5;
    float ang = atan(p.y, p.x) + uSeed;
    float rays = pow(abs(cos(ang * 3.0)), 24.0) * exp(-r * 3.2) * 0.5;
    vec3 col = HOT * core + uA * (halo + streakH * 0.8 + streakV + rays);
    float a = pop * (1.0 - smoothstep(0.85, 1.0, r));`,
  // 난류 폭발: 연기처럼 일렁이는 빛 덩어리. 고열 핵 → 성속 색 → 어두운 가장자리로 식으며 흩어진다.
  blast: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float grow = 1.0 - pow(1.0 - min(1.0, uT * 1.8), 3.0);
    vec2 q = p * 2.6 + vec2(uSeed, -uSeed);
    float turb = fbm(q + vec2(0.0, -uT * 2.2));
    float bound = grow * (0.55 + 0.35 * turb);
    float dens = smoothstep(bound, bound * 0.25, r);
    float cool = smoothstep(0.0, 1.0, uT);
    float heat = dens * (1.0 - cool * 0.85) * (0.6 + 0.6 * turb);
    vec3 col = mix(uA * 0.6, uB, smoothstep(0.4, 1.0, heat)) * heat;
    col += uA * exp(-r * r * 9.0) * (1.0 - uT) * 0.6;
    float a = (1.0 - smoothstep(0.5, 1.0, uT)) * (1.0 - smoothstep(0.85, 1.0, r));`,
  // 불티 줄기: 가운데서 바깥으로 튀는 가늘고 흐릿한 빛줄기
  burst: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x) / 6.28318 + 0.5;
    float n = 36.0;
    float sector = floor(ang * n);
    float rnd = hash(vec2(sector, uSeed));
    float f = fract(ang * n) - 0.5;
    float lit = step(0.55, rnd);
    float head = uT * 0.85 + rnd * 0.12;
    float len = 0.16 + rnd * 0.22;
    float along = smoothstep(head - len, head, r) * (1.0 - smoothstep(head, head + 0.04, r));
    float across = gauss(f, 0.06 + rnd * 0.05);
    vec3 col = mix(uA, HOT, 0.4) * along * across;
    float a = lit * (1.0 - uT) * (1.0 - smoothstep(0.9, 1.0, r));`,
  // 에너지 광선: 흐르는 무늬가 있는 빛 기둥. 끝이 가늘어진다.
  beam: /* glsl */ `
    float v = abs(vUv.y - 0.5) * 2.0;
    float tip = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
    float w = ((1.0 - uT) * 0.35 + 0.05) * tip;
    float flow = 0.7 + 0.3 * noise(vec2(vUv.x * 22.0 - uT * 40.0, uSeed));
    float core = gauss(v, w * 0.25);
    float glow = gauss(v, w * 1.4) * flow;
    vec3 col = HOT * core * 1.3 + uA * glow * 0.85;
    float a = 1.0 - smoothstep(0.55, 1.0, uT);`,
  // 검기: 초승달 모양의 빛 칼날이 통째로 날아간다(앞쪽 테가 가장 밝다)
  wave: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x);
    float sweep = 2.2;
    float s = (ang + sweep * 0.5) / sweep;
    float inArc = step(0.0, s) * step(s, 1.0);
    float w = 0.11 * sin(3.14159 * clamp(s, 0.0, 1.0)) + 0.01;
    float d = r - 0.7;
    float front = gauss(max(d, 0.0), w * 0.35) * step(-w * 2.5, d);
    float back = gauss(min(d, 0.0), w * 1.6);
    float flick = 0.8 + 0.2 * noise(vec2(s * 30.0 + uT * 25.0, uSeed));
    vec3 col = HOT * front * 1.2 + uA * back * flick;
    float a = inArc * (1.0 - smoothstep(0.75, 1.0, uT)) * smoothstep(0.0, 0.08, uT);`,
  // 빛기둥: 위에서 내려와 발밑을 적시는 기둥. 빛 알갱이 무늬가 위로 흐른다(치유·축복)
  pillar: /* glsl */ `
    float x = abs(vUv.x - 0.5) * 2.0;
    float grow = smoothstep(0.0, 0.25, uT);
    float w = 0.22 + 0.25 * (1.0 - uT);
    float flow = 0.6 + 0.4 * noise(vec2(vUv.x * 9.0, vUv.y * 7.0 - uT * 6.0 + uSeed));
    float core = gauss(x, w * 0.3);
    float glow = gauss(x, w) * flow;
    float ground = smoothstep(0.0, 0.12, vUv.y);
    vec3 col = HOT * core * 0.9 + uA * glow * 0.8;
    float a = (1.0 - smoothstep(0.6, 1.0, uT)) * ground * (0.35 + 0.65 * smoothstep(1.0, 0.2, vUv.y)) * grow;`,
  // 전투 연출 배경: 장면을 어둡게 덮고 성속 색의 옅은 안개를 깐다(보통 혼합)
  backdrop: /* glsl */ `
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= 1.6;
    float r = length(p);
    float mist = fbm(p * 1.6 + vec2(uSeed * 0.05, -uSeed * 0.03));
    vec3 col = mix(INK, uA * 0.16, smoothstep(1.6, 0.0, r));
    col += uA * mist * 0.07 * smoothstep(0.2, 1.0, r);
    float a = uT;`,
} as const;

export type ToonKind = keyof typeof BODIES;

/** 효과별 밝기. 폭발은 넓게 퍼지므로 가장 낮게 둔다. */
const GAIN: Record<ToonKind, number> = { slash: 0.8, ring: 0.5, star: 0.45, blast: 0.24, burst: 0.65, beam: 0.4, wave: 0.55, pillar: 0.32, backdrop: 1 };

function material(kind: ToonKind): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    // 빛 효과는 가산 혼합(겹칠수록 밝아진다). 배경 덮개만 보통 혼합으로 어둡게 깐다.
    blending: kind === 'backdrop' ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSeed: { value: Math.random() * 10 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() } },
    vertexShader: VERT,
    // 가산 혼합은 스프라이트 빛무리(fx.ts)와 겹쳐 쌓이므로, 이 층은 모양을 잡는 정도로만 밝게 둔다
    fragmentShader: `${COMMON}\nvoid main() {\n${BODIES[kind]}\n  gl_FragColor = vec4(col, a * ${kind === 'backdrop' ? '1.0' : GAIN[kind].toFixed(2)});\n}`,
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
    this.spawn('slash', { pos, size, color, life: 0.4, roll, delay });
  }

  /** 타격점: 렌즈 섬광 + 충격파 + 튀는 불티 */
  hit(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1, delay = 0): void {
    this.spawn('star', { pos, size: 1.9 * scale, color, life: 0.26, roll: (Math.random() - 0.5) * 0.5, delay });
    this.spawn('ring', { pos, size: 3 * scale, color, life: 0.42, delay });
    this.spawn('burst', { pos, size: 2.6 * scale, color, life: 0.34, roll: Math.random() * 3, delay });
  }

  /** 마무리 일격: 난류 폭발 + 불티 + 큰 충격파 + 섬광 */
  finale(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1): void {
    this.spawn('blast', { pos, size: 2.2 * scale, color, life: 0.6 });
    this.spawn('burst', { pos, size: 5.2 * scale, color, life: 0.5, roll: Math.random() * 3 });
    this.spawn('ring', { pos, size: 5.4 * scale, color, life: 0.6 });
    this.spawn('star', { pos, size: 4.2 * scale, color, life: 0.38 });
  }

  /** 날아가는 탄: 빛 덩어리가 꼬리를 끌며 대상까지 날아간다 */
  shot(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, travel = 0.14, delay = 0): void {
    const path = (k: number) => from.clone().lerp(to, 1 - Math.pow(1 - k, 2));
    this.spawn('star', { pos: from, size: 1.1, color, life: travel, path, delay });
    this.beam(from, to, color, 0.18, travel * 1.4, delay);
  }

  /** 검기 투사체: 초승달 빛 칼날이 from에서 to로 날아가며, 꼬리에 잔광이 남는다 */
  wave(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, size = 2.6, travel = 0.16, delay = 0, tilt = 0): void {
    const path = (k: number) => from.clone().lerp(to, 1 - Math.pow(1 - k, 1.6));
    // 칼날은 날아가는 방향을 향해 열린다(화면에서 from→to 각도)
    const a = from.clone().project(this.camera);
    const b = to.clone().project(this.camera);
    const aspect = (this.camera as THREE.PerspectiveCamera).aspect ?? 1;
    const dir = Math.atan2(b.y - a.y, (b.x - a.x) * aspect);
    this.spawn('wave', { pos: from, size, color, life: travel * 1.6, path: (k) => path(Math.min(1, k * 1.6)), roll: dir + tilt, delay });
    for (let i = 1; i <= 2; i++) this.spawn('wave', { pos: from, size: size * (1 - i * 0.15), color, life: travel * 1.6, path: (k) => path(Math.max(0, Math.min(1, k * 1.6 - i * 0.14))), roll: dir + tilt, delay: delay + i * 0.02 });
  }

  /** 빛기둥(치유·축복): 대상 발밑에서 위로 솟는 기둥 */
  pillar(feet: THREE.Vector3, color: THREE.ColorRepresentation, height = 5, width = 1.6, life = 0.9, delay = 0): void {
    this.spawn('pillar', { pos: feet.clone().add(new THREE.Vector3(0, height / 2, 0)), size: [width, height], color, life, delay });
  }

  /** 마법 폭발: 빛 덩어리가 부풀고, 충격파 두 겹과 불티, 섬광 */
  magicBlast(pos: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1, delay = 0): void {
    this.spawn('blast', { pos, size: 3 * scale, color, life: 0.7, delay });
    this.spawn('ring', { pos, size: 4.6 * scale, color, life: 0.55, delay });
    this.spawn('ring', { pos, size: 3 * scale, color, life: 0.4, delay: delay + 0.08 });
    this.spawn('burst', { pos, size: 4.4 * scale, color, life: 0.45, roll: Math.random() * 3, delay });
    this.spawn('star', { pos, size: 3.2 * scale, color, life: 0.3, delay });
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
