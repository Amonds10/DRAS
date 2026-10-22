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
import { guessTier, loadPref, qualityFor, savePref, type GfxPref, type Quality, type Tier } from './quality';
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

/**
 * 빛줄기: 해(또는 일식 코로나)의 화면 위치로 밝은 픽셀을 끌어모으는 방사형 블러.
 * 지형·나무·캐릭터에 가린 부분은 어두운 줄로 남아 빛줄기가 생긴다. 렌즈 고스트도 몇 개 얹는다.
 */
const GODRAYS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uVisible: { value: 0 },
    uAspect: { value: 1 },
    uTint: { value: new THREE.Color(1, 0.9, 0.75) },
    uThreshold: { value: 2.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength, uVisible, uAspect, uThreshold; uniform vec3 uTint;
    varying vec2 vUv;
    const int SAMPLES = 48;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (uVisible <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 delta = (vUv - uSun) * (0.85 / float(SAMPLES));
      vec2 uv = vUv;
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        acc += s * smoothstep(uThreshold, uThreshold * 2.5, l) * decay;
        decay *= 0.955;
      }
      acc /= float(SAMPLES);
      // 해에서 멀어질수록 약하게
      vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
      float fall = exp(-dot(d, d) * 14.0);
      vec3 rays = acc * uTint * uStrength * uVisible * fall * 1.4;
      gl_FragColor = vec4(base + rays, 1.0);
    }`,
};

/**
 * 외곽선: 깊이가 크게 뛰는 곳(앞 물체의 실루엣)에 얇은 선을 긋는다. 일러스트처럼 형태를 또렷하게.
 * 풀잎과 땅처럼 붙어 있는 차이는 거리 비례 문턱으로 걸러 낸다.
 */
const OUTLINE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uThick: { value: 1.2 },
    uLine: { value: new THREE.Color(0x101018) },
    uStrength: { value: 0.85 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uThick, uStrength; uniform vec3 uLine;
    varying vec2 vUv;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 px = uThick / uRes;
      float z = dist(vUv);
      float zn = max(max(dist(vUv - vec2(px.x, 0.0)), dist(vUv + vec2(px.x, 0.0))), max(dist(vUv + vec2(0.0, px.y)), dist(vUv - vec2(0.0, px.y))));
      float thr = 0.7 + z * 0.08;
      float edge = smoothstep(thr, thr * 1.8, zn - z);
      edge *= mix(0.35, 1.0, smoothstep(220.0, 60.0, z));
      col = mix(col, uLine + col * 0.2, edge * uStrength);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** 렌더 패스가 그린 깊이를 외곽선 셰이더에 넘기는 패스 */
class OutlinePass extends ShaderPass {
  constructor(private cam: THREE.PerspectiveCamera) {
    super(OUTLINE_SHADER);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    this.uniforms.uNear.value = this.cam.near;
    this.uniforms.uFar.value = this.cam.far;
    this.uniforms.uRes.value.set(readBuffer.width, readBuffer.height);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: 1.05 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFlash: { value: 0 },
    uHaze: { value: 0 },
    uHorizon: { value: 0.5 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uContrast, uTime, uFlash, uHaze, uHorizon; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // 아지랑이: 지평선 근처만 일렁인다
      vec2 uv = vUv;
      float band = smoothstep(0.12, 0.0, abs(vUv.y - uHorizon));
      uv.x += sin(vUv.y * 260.0 + uTime * 4.0) * 0.0009 * uHaze * band;
      uv.y += sin(vUv.x * 180.0 + uTime * 3.0) * 0.0006 * uHaze * band;
      vec2 off = (uv - 0.5) * 0.0022;
      vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
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
  private godRays: ShaderPass | null = null;
  private outline: OutlinePass | null = null;
  private scene = new THREE.Scene();
  private pref: GfxPref = loadPref();
  private quality: Quality = qualityFor('low');
  /** 자동 품질: 장면을 만든 뒤 프레임을 재서 느리면 한 단계 내린다 */
  private probe: { start: number; frames: number } | null = null;
  /** 2D 캐릭터 판을 장면 빛에 맞추는 공용 uniform */
  private actorLight = {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uRimCol: { value: new THREE.Color(1, 1, 1) },
    uRimDir: { value: new THREE.Vector2(-0.7, 0.7) },
    uRimK: { value: 0 },
    /** 하늘빛 채움: 그늘진 면도 장면 색을 머금게 */
    uFill: { value: new THREE.Color(0, 0, 0) },
  };
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
      renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer = renderer;
      this.quality = qualityFor(this.pref === 'auto' ? guessTier(renderer) : this.pref);
      this.applyRendererQuality();
    }
    this.scene.add(this.actorGroup);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /** 현재 품질에 맞춰 픽셀 비율, 그림자, 후처리(MSAA 포함)를 다시 꾸린다 */
  private applyRendererQuality(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const q = this.quality;
    renderer.setPixelRatio(q.pixelRatio);
    renderer.shadowMap.enabled = q.shadows;
    this.composer?.dispose();
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.samples, depthTexture: new THREE.DepthTexture(1, 1) });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(this.camera);
    this.outline.uniforms.uThick.value = 1.1 * q.pixelRatio;
    this.composer.addPass(this.outline);
    this.godRays = new ShaderPass(GODRAYS_SHADER);
    this.godRays.enabled = false;
    this.composer.addPass(this.godRays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    for (const a of this.actors.values()) {
      const caster = a.mesh.getObjectByName('shadow-caster');
      if (caster) caster.castShadow = q.shadows;
    }
    this.resize();
  }

  /** 그래픽 설정: 자동/높음/낮음 */
  get graphics(): { pref: GfxPref; tier: Tier } {
    return { pref: this.pref, tier: this.quality.tier };
  }

  setGraphics(pref: GfxPref): void {
    this.pref = pref;
    savePref(pref);
    if (!this.renderer) return;
    this.setTier(pref === 'auto' ? guessTier(this.renderer) : pref);
  }

  private setTier(tier: Tier): void {
    this.quality = qualityFor(tier);
    this.applyRendererQuality();
    if (this.presetId) this.setScene(this.presetId, true);
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

  setScene(preset: ScenePreset, force = false): void {
    if (this.presetId === preset && this.env && !force) return;
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
    this.env = new Environment(preset, this.renderer, this.quality);
    this.scene.add(this.env.group);
    this.scene.fog = this.env.fog;
    this.fx = new FxSystem(this.camera, this.env.lights, this.env.staticLightCount);
    this.scene.add(this.fx.group);
    const p = this.env.preset;
    const g = p.grade;
    if (this.grade) {
      this.grade.uniforms.uTint.value.set(...g.tint);
      this.grade.uniforms.uContrast.value = g.contrast;
      this.grade.uniforms.uHaze.value = p.haze;
    }
    this.renderer.toneMappingExposure = g.exposure;
    if (this.bloom) {
      this.bloom.strength = g.bloom;
      this.bloom.threshold = g.bloomThreshold;
    }
    if (this.outline) this.outline.uniforms.uLine.value.set(p.outline);
    if (this.godRays) {
      this.godRays.enabled = this.quality.godRays && p.godRays > 0;
      this.godRays.uniforms.uStrength.value = p.godRays;
      this.godRays.uniforms.uTint.value.set(p.light?.color ?? 0xffffff);
      this.godRays.uniforms.uThreshold.value = p.light?.kind === 'eclipse' ? 0.9 : 2.0;
    }
    // 셰이더 컴파일이 끝날 때쯤부터 잰다
    const al = p.actor;
    this.actorLight.uTint.value.setRGB(...al.tint);
    this.actorLight.uRimCol.value.set(al.rim);
    this.actorLight.uRimK.value = al.rimStrength;
    this.actorLight.uFill.value.set(p.hemi.sky).multiplyScalar(p.hemi.intensity * 0.09);
    this.probe = this.pref === 'auto' && this.quality.tier === 'high' ? { start: performance.now() + 800, frames: 0 } : null;
  }

  /**
   * 화면에서 빛이 오는 방향(캐릭터 판의 텍스처 좌표 기준). 해를 등진 역광일수록 테두리를 밝게 한다.
   */
  private updateRimDir(): void {
    const dir = this.env?.sunDir ?? new THREE.Vector3(-0.5, 0.6, 0.3);
    this.camera.updateMatrixWorld();
    const v = dir.clone().transformDirection(this.camera.matrixWorldInverse);
    const d = new THREE.Vector2(v.x, Math.max(v.y, 0.25));
    if (d.lengthSq() < 1e-4) d.set(0, 1);
    this.actorLight.uRimDir.value.copy(d.normalize());
    const back = THREE.MathUtils.clamp(-v.z, 0, 1);
    const base = this.env?.preset.actor.rimStrength ?? 0;
    this.actorLight.uRimK.value = base * (0.45 + 0.55 * back);
  }

  /** 해의 화면 위치를 빛줄기 패스에 넘긴다. 카메라 뒤에 있으면 끈다. */
  private updateSun(): void {
    if (!this.godRays?.enabled || !this.env) return;
    const dir = this.env.sunDir;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const facing = fwd.dot(dir);
    const p = this.camera.position.clone().addScaledVector(dir, 300).project(this.camera);
    const u = this.godRays.uniforms;
    u.uSun.value.set((p.x + 1) / 2, (p.y + 1) / 2);
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    u.uVisible.value = facing > 0 ? THREE.MathUtils.clamp((1.6 - off) / 0.6, 0, 1) : 0;
    u.uAspect.value = this.camera.aspect;
    if (this.grade) {
      const horizon = this.camera.position.clone().add(new THREE.Vector3(0, 0, -500)).project(this.camera);
      this.grade.uniforms.uHorizon.value = THREE.MathUtils.clamp((horizon.y + 1) / 2, 0, 1);
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
      const caster = a.mesh.getObjectByName('shadow-caster') as THREE.Mesh | undefined;
      (caster?.material as THREE.Material | undefined)?.dispose();
    }
    this.actors.clear();
  }

  /**
   * 캐릭터 판 재질. 2D 그림이 3D 장면에서 떠 보이지 않도록
   * 장면 색조를 곱하고, 화면상 빛 방향 쪽 외곽에 역광 테두리를 더하고, 발밑을 살짝 어둡게 한다.
   */
  private actorMaterial(texture: THREE.Texture, w: number, h: number): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: true });
    const texel = new THREE.Vector2(3.5 / w, 3.5 / h);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.actorLight, { uTexel: { value: texel } });
      sh.fragmentShader = 'uniform vec3 uTint, uRimCol, uFill; uniform vec2 uRimDir, uTexel; uniform float uRimK;\n' + sh.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float aHere = diffuseColor.a;
        // 빛 쪽으로 몇 픽셀 옮긴 곳이 비어 있으면 빛을 받는 외곽
        float aToward = texture2D(map, vMapUv + uRimDir * uTexel).a;
        float aFar = texture2D(map, vMapUv + uRimDir * uTexel * 2.5).a;
        float rim = clamp(aHere - 0.5 * (aToward + aFar), 0.0, 1.0) * step(0.5, aHere);
        // 발밑 그늘: 그림 아래쪽 12%를 조금 어둡게
        float foot = mix(0.72, 1.0, smoothstep(0.06, 0.2, vMapUv.y));
        diffuseColor.rgb = (diffuseColor.rgb * uTint + uFill * smoothstep(0.3, 0.9, vMapUv.y)) * foot + uRimCol * rim * uRimK;`,
      );
    };
    return mat;
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
      const glow = isAlly ? 18 : 16;
      const pad = Math.round(glow * 1.5);
      const rim = isAlly ? characterAccent(spec.defId) : '#e0685a';
      const svg = isAlly ? characterSvg(spec.defId) : enemyFigure(spec.defId);
      const { texture } = svgTexture(svg, res[0], res[1], rim, glow);
      const mat = this.actorMaterial(texture, res[0] + pad * 2, res[1] + pad * 2);
      const mesh = new THREE.Mesh(plane, mat);
      // 그림자는 실루엣 모양 그대로: 화면에는 안 그리고 그림자만 드리우는 판을 겹친다.
      // (그림자 패스는 본 재질의 alphaTest를 따르므로, 빛 번짐까지 그림자가 되지 않게 따로 둔다)
      const caster = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
      caster.castShadow = this.quality.shadows;
      caster.name = 'shadow-caster';
      mesh.add(caster);
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
      // 하늘(별·마법 장식)이 더 보이도록 눈높이를 낮추고 시선을 조금 든다
      pos = new THREE.Vector3(cx, 1.9 + (dist - 15) * 0.1, dist);
      look = new THREE.Vector3(cx - 0.1, 2.15, 0);
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
    const ld = this.env?.lightDir ?? new THREE.Vector3(0, 1, 0);
    const lightYaw = Math.atan2(ld.x, ld.z);
    this.updateRimDir();
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
      // 세로축 빌보드: 카메라가 흔들리거나 다가가도 판이 비스듬히 찌그러지지 않게 항상 카메라를 본다.
      const yaw = Math.atan2(this.camera.position.x - a.mesh.position.x, this.camera.position.z - a.mesh.position.z);
      a.mesh.rotation.y = yaw;
      // 그림자 판은 빛을 정면으로 보게 돌려, 옆빛에서도 실루엣 그대로 그림자가 진다.
      const caster = a.mesh.children[0];
      if (caster) caster.rotation.y = lightYaw - yaw;
      a.flash = Math.max(0, a.flash - dt * 4);
      const tone = a.dead && isAlly ? 0.4 : 1;
      a.mat.color.setScalar(tone + a.flash * 2.2);
      a.mat.opacity = a.alpha;
      a.shadow.position.set(a.base.x + a.offset.x, 0.02, a.base.z);
      (a.shadow.material as THREE.MeshBasicMaterial).opacity = a.alpha * (a.hover > 0 ? 0.6 : 1) * (this.quality.shadows && this.env?.preset.scenery !== 'neon' ? 0.6 : 1);
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
    if (this.probe && this.canvas.isConnected && now > this.probe.start) {
      this.probe.frames++;
      const elapsed = (now - this.probe.start) / 1000;
      if (elapsed > 2.5) {
        const fps = this.probe.frames / elapsed;
        this.probe = null;
        if (fps < 38) this.setTier('low');
      }
    }
    this.updateSun();
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
