import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { characterAccent, characterSvg } from '../characters';
import { enemyFigure } from '../figures';
import { Environment, type ScenePreset } from './environment';
import { FxSystem } from './fx';
import { fxTexture, svgTexture } from './textures';

export type Framing = 'menu' | 'battle';
export type ActorPart = 'feet' | 'chest' | 'head' | 'top';
export type ActorAnim = 'cast' | 'act' | 'hit' | 'die';

export interface ActorSpec {
  uid: string;
  side: 'ally' | 'enemy';
  defId: string;
  dead?: boolean;
  boss?: boolean;
}

interface Actor {
  spec: ActorSpec;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  base: THREE.Vector3;
  /** 화면 비율 보정 전 가로 위치 */
  slotX: number;
  height: number;
  width: number;
  hover: number;
  phase: number;
  offset: THREE.Vector3;
  anim: { kind: ActorAnim; t: number } | null;
  flash: number;
  alpha: number;
  dead: boolean;
}

/** 아군 자리(x, z): 앞뒤로 엇갈려 선다 */
const ALLY_SLOTS: [number, number][] = [
  [-6.7, -1.0],
  [-4.9, 1.0],
  [-3.1, -1.0],
  [-1.3, 1.0],
];

function enemySlots(specs: ActorSpec[]): [number, number][] {
  const n = specs.length;
  if (n === 1) return [[4.2, 0]];
  if (n === 2) return specs[0].boss ? [[3.6, -0.8], [6.0, 1.0]] : [[3.0, -0.5], [5.5, 0.9]];
  return specs.map((_, i) => [2.6 + i * 1.8, i % 2 ? 0.9 : -0.5]);
}

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: 1.05 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uContrast, uTime, uFlash; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 off = (vUv - 0.5) * 0.0022;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c *= uTint;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.88);
      c = max(vec3(0.0), (c - 0.18) * uContrast + 0.18);
      float v = smoothstep(1.0, 0.3, length((vUv - 0.5) * vec2(1.1, 1.0)));
      c *= mix(0.45, 1.0, v);
      c += (hash(vUv * uRes + uTime) - 0.5) * 0.03;
      c += uFlash * vec3(1.0, 0.95, 0.85) * 0.25;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * 2.5D 무대. 3D 배경·조명·VFX 위에 2D 캐릭터 판을 세운다.
 * 캔버스 하나를 화면마다 옮겨 붙여 쓴다(메인 메뉴 배경, 전투 무대).
 */
export class Stage {
  readonly canvas = document.createElement('canvas');
  readonly ok: boolean;
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private scene = new THREE.Scene();
  private env: Environment | null = null;
  fx: FxSystem | null = null;
  private actors = new Map<string, Actor>();
  private actorGroup = new THREE.Group();
  private container: HTMLElement | null = null;
  private ro = new ResizeObserver(() => this.resize());
  private frameCbs = new Set<() => void>();
  private framing: Framing = 'menu';
  private t = 0;
  private last = performance.now();
  private shakeAmt = 0;
  private punchAmt = 0;
  private punchTarget = new THREE.Vector3();
  private screenFlash = 0;
  private size = new THREE.Vector2(1, 1);
  /** 세로 화면에서는 진영 간격을 좁혀 카메라를 당긴다 */
  private xScale = 1;
  presetId: ScenePreset | null = null;

  constructor() {
    this.canvas.className = 'stage-canvas';
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
      renderer = null;
    }
    this.ok = !!renderer;
    if (renderer) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer = renderer;
      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.82);
      this.composer.addPass(this.bloom);
      this.grade = new ShaderPass(GRADE_SHADER);
      this.composer.addPass(this.grade);
      this.composer.addPass(new OutputPass());
    }
    this.scene.add(this.actorGroup);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  mount(container: HTMLElement, framing: Framing): void {
    if (this.container !== container) {
      if (this.container) this.ro.unobserve(this.container);
      this.container = container;
      container.prepend(this.canvas);
      this.ro.observe(container);
    }
    this.framing = framing;
    container.classList.toggle('no-webgl', !this.ok);
    this.resize();
  }

  setScene(preset: ScenePreset): void {
    if (this.presetId === preset && this.env) return;
    this.presetId = preset;
    if (this.env) {
      this.scene.remove(this.env.group);
      this.env.dispose();
    }
    if (this.fx) {
      this.scene.remove(this.fx.group);
      this.fx.dispose();
    }
    if (!this.renderer) return;
    this.env = new Environment(preset, this.renderer);
    this.scene.add(this.env.group);
    this.fx = new FxSystem(this.camera, this.env.lights, this.env.staticLightCount);
    this.scene.add(this.fx.group);
    const g = this.env.preset.grade;
    if (this.grade) {
      this.grade.uniforms.uTint.value.set(...g.tint);
      this.grade.uniforms.uContrast.value = g.contrast;
    }
    this.renderer.toneMappingExposure = g.exposure;
    // 낮 장면은 하늘 자체가 밝으니 번짐을 줄여 뿌옇게 뜨지 않게 한다.
    if (this.bloom) {
      const day = this.env.preset.light?.kind === 'sun';
      this.bloom.strength = day ? 0.35 : 0.7;
      this.bloom.threshold = day ? 0.92 : 0.82;
    }
  }

  onFrame(cb: () => void): () => void {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  clearActors(): void {
    for (const a of this.actors.values()) {
      this.actorGroup.remove(a.mesh, a.shadow);
      a.mat.map?.dispose();
      a.mat.dispose();
      (a.shadow.material as THREE.Material).dispose();
    }
    this.actors.clear();
  }

  setActors(specs: ActorSpec[]): void {
    this.clearActors();
    const allies = specs.filter((s) => s.side === 'ally');
    const enemies = specs.filter((s) => s.side === 'enemy');
    const eSlots = enemySlots(enemies);
    const plane = new THREE.PlaneGeometry(1, 1);
    const add = (spec: ActorSpec, x: number, z: number) => {
      const isAlly = spec.side === 'ally';
      const keeper = spec.defId === 'fallen_keeper';
      const height = isAlly ? 2.75 : spec.boss ? 4.6 : keeper ? 3.4 : 2.3;
      const aspect = isAlly ? 200 / 320 : 1;
      const width = height * aspect;
      const res = isAlly ? [400, 640] : [360, 360];
      const glow = isAlly ? 40 : 34;
      const pad = Math.round(glow * 1.5);
      const rim = isAlly ? characterAccent(spec.defId) : '#e0685a';
      const svg = isAlly ? characterSvg(spec.defId) : enemyFigure(spec.defId);
      const { texture } = svgTexture(svg, res[0], res[1], rim, glow);
      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: true });
      const mesh = new THREE.Mesh(plane, mat);
      const sx = width * ((res[0] + pad * 2) / res[0]);
      const sy = height * ((res[1] + pad * 2) / res[1]);
      mesh.scale.set(sx, sy, 1);
      const padWorld = (pad / res[1]) * height;
      mesh.userData.yOffset = sy / 2 - padWorld;
      mesh.userData.sy = sy;
      const shadow = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: fxTexture('blob'), transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(width * 1.1, width * 0.45, 1);
      shadow.renderOrder = 2;
      const hover = isAlly || keeper ? 0 : 0.35;
      const base = new THREE.Vector3(x, 0, z);
      const actor: Actor = {
        spec,
        mesh,
        mat,
        shadow,
        base,
        slotX: x,
        height,
        width,
        hover,
        phase: Math.random() * 6,
        offset: new THREE.Vector3(),
        anim: null,
        flash: 0,
        alpha: spec.dead ? (isAlly ? 0.25 : 0) : 1,
        dead: !!spec.dead,
      };
      mesh.renderOrder = 10 + Math.round((z + 5) * 10);
      this.actors.set(spec.uid, actor);
      this.actorGroup.add(mesh, shadow);
    };
    allies.forEach((s, i) => add(s, ...ALLY_SLOTS[i]));
    enemies.forEach((s, i) => add(s, ...eSlots[i]));
  }

  /** 액터의 월드 좌표 */
  actorPos(uid: string, part: ActorPart = 'chest'): THREE.Vector3 {
    const a = this.actors.get(uid);
    if (!a) return new THREE.Vector3();
    const p = a.base.clone().add(a.offset);
    const y = a.hover + (part === 'feet' ? 0 : part === 'chest' ? a.height * 0.55 : part === 'head' ? a.height * 0.85 : a.height);
    p.y += y;
    if (part === 'feet') p.y = 0;
    return p;
  }

  /** 월드 좌표 → 컨테이너 기준 CSS 픽셀 */
  project(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * this.size.x, y: ((1 - p.y) / 2) * this.size.y };
  }

  /** 액터의 화면상 상자(DOM 오버레이용) */
  actorBox(uid: string): { left: number; top: number; width: number; height: number; feet: { x: number; y: number } } | null {
    const a = this.actors.get(uid);
    if (!a) return null;
    const feet = this.project(this.actorPos(uid, 'feet'));
    const top = this.project(this.actorPos(uid, 'top'));
    const base = this.project(a.base.clone().add(new THREE.Vector3(0, a.hover, 0)));
    const right = this.project(a.base.clone().add(new THREE.Vector3(a.width / 2, a.hover, 0)));
    const w = Math.abs(right.x - base.x) * 2;
    return { left: base.x - w / 2, top: top.y, width: w, height: base.y - top.y, feet };
  }

  anim(uid: string, kind: ActorAnim): void {
    const a = this.actors.get(uid);
    if (!a) return;
    a.anim = { kind, t: 0 };
    if (kind === 'hit') a.flash = 1.4;
    if (kind === 'cast') a.flash = 0.5;
    if (kind === 'die') a.dead = true;
  }

  setDead(uid: string, dead: boolean): void {
    const a = this.actors.get(uid);
    if (!a) return;
    a.dead = dead;
    a.alpha = dead ? (a.spec.side === 'ally' ? 0.25 : 0) : 1;
  }

  shake(amount = 0.25): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  punch(target: THREE.Vector3, amount = 1): void {
    this.punchTarget.copy(target);
    this.punchAmt = Math.max(this.punchAmt, amount);
  }

  flashScreen(amount = 1): void {
    this.screenFlash = Math.max(this.screenFlash, amount);
  }

  lightning(): void {
    this.env?.strike();
  }

  private resize(): void {
    if (!this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.size.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.renderer && this.composer) {
      this.renderer.setSize(w, h, false);
      this.composer.setSize(w, h);
      this.bloom?.setSize(w, h);
      this.grade!.uniforms.uRes.value.set(w, h);
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.camera;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.framing === 'battle') {
      // 좁은 화면에서도 양 진영이 다 들어오게 거리를 늘린다.
      this.xScale = cam.aspect < 1 ? 0.66 : cam.aspect < 1.45 ? 0.84 : 1;
      const halfWidth = 8.2 * this.xScale;
      const fov = 30;
      const dist = Math.max(15, halfWidth / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * cam.aspect) * 0.92);
      cam.fov = fov;
      // 진영 중심이 화면 가운데 오도록, 좁은 화면일수록 왼쪽으로 옮긴다.
      const cx = 0.4 - (1 - this.xScale) * 2;
      pos = new THREE.Vector3(cx, 2.3 + (dist - 15) * 0.12, dist);
      look = new THREE.Vector3(cx - 0.1, 1.45, 0);
    } else {
      cam.fov = 40;
      pos = new THREE.Vector3(0, 2.6, 17);
      look = new THREE.Vector3(0, 4.2, -12);
    }
    pos.x += Math.sin(this.t * 0.17) * 0.35;
    pos.y += Math.sin(this.t * 0.11) * 0.12;
    if (this.punchAmt > 0) {
      pos.lerp(this.punchTarget.clone().add(new THREE.Vector3(0, 1, 6)), 0.12 * this.punchAmt);
      look.lerp(this.punchTarget, 0.25 * this.punchAmt);
      this.punchAmt = Math.max(0, this.punchAmt - dt * 1.6);
    }
    if (this.shakeAmt > 0) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt;
      pos.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
  }

  private updateActors(dt: number): void {
    for (const a of this.actors.values()) {
      a.base.x = a.slotX * this.xScale;
      const isAlly = a.spec.side === 'ally';
      a.offset.set(0, 0, 0);
      if (a.anim) {
        a.anim.t += dt;
        const t = a.anim.t;
        switch (a.anim.kind) {
          case 'cast': {
            const k = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.4);
            a.offset.x = 0.55 * k;
            if (t > 0.6) a.anim = null;
            break;
          }
          case 'act': {
            const k = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.35);
            a.offset.x = -1.1 * k;
            if (t > 0.5) a.anim = null;
            break;
          }
          case 'hit':
            a.offset.x = Math.sin(t * 60) * 0.12 * Math.max(0, 1 - t / 0.3) * (isAlly ? -1 : 1);
            if (t > 0.3) a.anim = null;
            break;
          case 'die':
            a.offset.y = t * 0.5;
            a.alpha = Math.max(isAlly ? 0.25 : 0, 1 - t / 0.6);
            if (t > 0.6) a.anim = null;
            break;
        }
      }
      const bob = a.hover > 0 ? Math.sin(this.t * 1.4 + a.phase) * 0.08 : 0;
      const breathe = isAlly && !a.dead ? 1 + Math.sin(this.t * 1.8 + a.phase) * 0.008 : 1;
      a.mesh.position.set(a.base.x + a.offset.x, a.hover + bob + a.offset.y + (a.mesh.userData.yOffset as number) * breathe, a.base.z);
      a.mesh.scale.y = (a.mesh.userData.sy as number) * breathe;
      a.flash = Math.max(0, a.flash - dt * 4);
      const tone = a.dead && isAlly ? 0.4 : 1;
      a.mat.color.setScalar(tone + a.flash * 2.2);
      a.mat.opacity = a.alpha;
      a.shadow.position.set(a.base.x + a.offset.x, 0.02, a.base.z);
      (a.shadow.material as THREE.MeshBasicMaterial).opacity = a.alpha * (a.hover > 0 ? 0.6 : 1);
    }
  }

  private loop(now: number): void {
    requestAnimationFrame(this.loop);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.updateCamera(dt);
    this.updateActors(dt);
    this.env?.update(this.t, dt);
    this.fx?.update(dt, this.t);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 3);
    if (this.composer && this.container && this.canvas.isConnected) {
      this.grade!.uniforms.uTime.value = this.t;
      this.grade!.uniforms.uFlash.value = this.screenFlash;
      this.composer.render(dt);
    }
    for (const cb of this.frameCbs) cb();
  }
}

let shared: Stage | null = null;

/** 앱 전체가 함께 쓰는 무대 하나 */
export function getStage(): Stage {
  shared ??= new Stage();
  return shared;
}
