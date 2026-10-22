import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { characterAccent } from '../characters';
import { enemyFigure } from '../figures';
import { Environment, type ScenePreset } from './environment';
import { FxSystem } from './fx';
import { guessTier, loadPref, qualityFor, savePref, type GfxPref, type Quality, type Tier } from './quality';
import { clipLength, Puppet } from './puppet';
import { fxTexture, svgTexture } from './textures';

export type Framing = 'menu' | 'battle';
export type ActorPart = 'feet' | 'chest' | 'head' | 'top';
export type ActorAnim = 'cast' | 'channel' | 'charge' | 'act' | 'hit' | 'die';

export interface ActorSpec {
  uid: string;
  side: 'ally' | 'enemy';
  defId: string;
  dead?: boolean;
  boss?: boolean;
}

interface Aura {
  level: number;
  /** 화면에 보이는 값(부드럽게 따라간다) */
  shown: number;
  max: number;
  color: THREE.Color;
  glow: THREE.Sprite;
  ring: THREE.Mesh;
  emit: number;
}

interface Actor {
  spec: ActorSpec;
  /** 장면에 놓인 물체: 술사는 인형 뿌리, 적은 판 */
  obj: THREE.Object3D;
  mesh?: THREE.Mesh;
  mat?: THREE.MeshBasicMaterial;
  puppet?: Puppet;
  aura: Aura | null;
  order: number;
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
    /** 배경 흐림: 이 거리부터 흐려지기 시작해 uBlurFar에서 최대(px) */
    uBlurNear: { value: 20 },
    uBlurFar: { value: 70 },
    uBlurMax: { value: 5 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uThick, uStrength, uBlurNear, uBlurFar, uBlurMax; uniform vec3 uLine;
    varying vec2 vUv;
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    float coc(float z) { return smoothstep(uBlurNear, uBlurFar, z); }
    void main() {
      // 배경 흐림: 먼 곳일수록 원판 표본을 넓게. 가까운(선명한) 이웃은 섞지 않아 캐릭터 둘레가 번지지 않는다.
      float zc = dist(vUv);
      float c0 = coc(zc);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (c0 > 0.01 && uBlurMax > 0.0) {
        vec3 acc = col;
        float wsum = 1.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float a = fi * 2.39996;
          float r = sqrt((fi + 0.5) / 12.0);
          vec2 o = vec2(cos(a), sin(a)) * r * c0 * uBlurMax / uRes;
          float w = coc(dist(vUv + o));
          acc += texture2D(tDiffuse, vUv + o).rgb * w;
          wsum += w;
        }
        col = acc / wsum;
      }
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

/**
 * 유화 필터(쿠와하라): 주변 네 구역 중 색이 가장 고른 구역의 평균을 고른다.
 * 가장자리는 살리고 면은 붓질처럼 뭉개서, 절차적 3D의 잔무늬(풀 노이즈 등)를 그림 같은 색면으로 바꾼다.
 */
const PAINT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 3 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uRadius;
    varying vec2 vUv;
    #define R 3
    void main() {
      vec2 px = 1.0 / uRes * (uRadius / 3.0);
      vec3 m[4]; vec3 s[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
      // 구역: 왼위, 오른위, 왼아래, 오른아래
      for (int j = -R; j <= R; j++) {
        for (int i = -R; i <= R; i++) {
          vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px).rgb;
          vec3 c2 = c * c;
          if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
          if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
          if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
          if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
        }
      }
      float n = float((R + 1) * (R + 1));
      float best = 1e9;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      for (int k = 0; k < 4; k++) {
        vec3 mean = m[k] / n;
        vec3 v = abs(s[k] / n - mean * mean);
        float sigma = v.r + v.g + v.b;
        if (sigma < best) { best = sigma; col = mean; }
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

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
      // 오래된 필름 같은 따뜻한 기운을 살짝
      c = mix(c, vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131))), 0.1);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.8);
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
  private paint: ShaderPass | null = null;
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
  private timeScale = 1;
  private slowLeft = 0;
  private size = new THREE.Vector2(1, 1);
  /** 세로 화면에서는 진영 간격을 좁혀 카메라를 당긴다 */
  private xScale = 1;
  /** 무대 아래쪽을 덮는 UI 높이(px). 이 절반만큼 화면을 위로 민다. */
  private safeBottom = 0;
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
    this.outline.uniforms.uBlurMax.value = (q.tier === 'high' ? 9 : 6) * q.pixelRatio;
    this.composer.addPass(this.outline);
    this.paint = new ShaderPass(PAINT_SHADER);
    this.paint.uniforms.uRadius.value = q.tier === 'high' ? 3 * q.pixelRatio : 2;
    this.composer.addPass(this.paint);
    this.godRays = new ShaderPass(GODRAYS_SHADER);
    this.godRays.enabled = false;
    this.composer.addPass(this.godRays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    for (const a of this.actors.values()) {
      const caster = a.obj.getObjectByName('shadow-caster');
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
    if (framing === 'menu') this.safeBottom = 0;
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

  /** 아래쪽 UI가 덮는 높이를 알려 준다(전투 화면 손패 오버레이) */
  setSafeArea(bottom: number): void {
    this.safeBottom = bottom;
  }

  onFrame(cb: () => void): () => void {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  clearActors(): void {
    for (const a of this.actors.values()) {
      this.actorGroup.remove(a.obj, a.shadow);
      if (a.puppet) a.puppet.dispose();
      else {
        a.mat!.map?.dispose();
        a.mat!.dispose();
        const caster = a.obj.getObjectByName('shadow-caster') as THREE.Mesh | undefined;
        (caster?.material as THREE.Material | undefined)?.dispose();
      }
      (a.shadow.material as THREE.Material).dispose();
      this.dropAura(a);
    }
    this.actors.clear();
  }

  /**
   * 캐릭터 판 재질. 2D 그림이 3D 장면에서 떠 보이지 않도록
   * 장면 색조를 곱하고, 화면상 빛 방향 쪽 외곽에 역광 테두리를 더하고, 발밑을 살짝 어둡게 한다.
   */
  private actorMaterial(texture: THREE.Texture, w: number, h: number, foot = true): THREE.MeshBasicMaterial {
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
        float foot = ${foot ? 'mix(0.72, 1.0, smoothstep(0.06, 0.2, vMapUv.y))' : '1.0'};
        diffuseColor.rgb = (diffuseColor.rgb * uTint + uFill * ${foot ? 'smoothstep(0.3, 0.9, vMapUv.y)' : '0.12'}) * foot + uRimCol * rim * uRimK * ${foot ? '1.0' : '0.4'};`,
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
      const width = isAlly ? height * (120 / 300) : height;
      const order = 10 + Math.round((z + 5) * 10) * 10;
      let obj: THREE.Object3D;
      let puppet: Puppet | undefined;
      let mesh: THREE.Mesh | undefined;
      let mat: THREE.MeshBasicMaterial | undefined;
      if (isAlly) {
        // 술사: 조각 인형(관절 애니메이션)
        puppet = new Puppet(spec.defId, height, characterAccent(spec.defId), (tex, w, h) => {
          const m = this.actorMaterial(tex, w, h, false);
          // 무대 앞에 선 인물은 안개에 덜 묻히게 한다(그림 색이 바래지 않도록)
          m.fog = false;
          return m;
        }, order, this.quality.shadows);
        obj = puppet.root;
      } else {
        const res = [360, 360];
        const glow = 16;
        const pad = Math.round(glow * 1.5);
        const { texture } = svgTexture(enemyFigure(spec.defId), res[0], res[1], '#e0685a', glow);
        mat = this.actorMaterial(texture, res[0] + pad * 2, res[1] + pad * 2);
        mesh = new THREE.Mesh(plane, mat);
        // 그림자는 실루엣 모양 그대로: 화면에는 안 그리고 그림자만 드리우는 판을 겹친다.
        const caster = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
        caster.castShadow = this.quality.shadows;
        caster.name = 'shadow-caster';
        mesh.add(caster);
        const sx = width * ((res[0] + pad * 2) / res[0]);
        const sy = height * ((res[1] + pad * 2) / res[1]);
        mesh.scale.set(sx, sy, 1);
        const padWorld = (pad / res[1]) * height;
        mesh.userData.yOffset = sy / 2 - padWorld;
        mesh.userData.sx = sx;
        mesh.userData.sy = sy;
        mesh.renderOrder = order;
        obj = mesh;
      }
      const shadow = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: fxTexture('blob'), transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(width * 1.4, width * 0.55, 1);
      shadow.renderOrder = 2;
      const hover = isAlly || keeper ? 0 : 0.35;
      const actor: Actor = {
        spec,
        obj,
        mesh,
        mat,
        puppet,
        shadow,
        base: new THREE.Vector3(x, 0, z),
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
        aura: null,
        order,
      };
      if (puppet && spec.dead) puppet.play('die');
      this.actors.set(spec.uid, actor);
      this.actorGroup.add(obj, shadow);
    };
    allies.forEach((s, i) => add(s, ...ALLY_SLOTS[i]));
    enemies.forEach((s, i) => add(s, ...eSlots[i]));
  }

  /** 액터의 월드 좌표 */
  actorPos(uid: string, part: ActorPart = 'chest'): THREE.Vector3 {
    const a = this.actors.get(uid);
    if (!a) return new THREE.Vector3();
    const p = a.base.clone().add(a.offset);
    if (a.puppet) p.x += a.puppet.reach;
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

  /** 액터의 화면상 상자(DOM 오버레이용). 동작으로 잠깐 움직여도 제자리 기준으로 둔다. */
  actorBox(uid: string): { left: number; top: number; width: number; height: number; feet: { x: number; y: number } } | null {
    const a = this.actors.get(uid);
    if (!a) return null;
    const feet = this.project(a.base);
    const top = this.project(a.base.clone().add(new THREE.Vector3(0, a.hover + a.height, 0)));
    const base = this.project(a.base.clone().add(new THREE.Vector3(0, a.hover, 0)));
    const right = this.project(a.base.clone().add(new THREE.Vector3(a.width / 2, a.hover, 0)));
    const w = Math.abs(right.x - base.x) * 2;
    return { left: base.x - w / 2, top: top.y, width: w, height: base.y - top.y, feet };
  }

  /** 동작 재생. 술사는 관절 동작, 적은 판을 기울이고 늘였다 줄인다. */
  anim(uid: string, kind: ActorAnim): void {
    const a = this.actors.get(uid);
    if (!a) return;
    a.anim = { kind, t: 0 };
    if (kind === 'hit') a.flash = 1.4;
    if (kind === 'cast' || kind === 'channel') a.flash = 0.35;
    if (kind === 'charge') a.flash = 0.6;
    if (kind === 'die') a.dead = true;
    if (a.puppet) a.puppet.play(kind === 'cast' || kind === 'act' ? 'attack' : kind);
  }

  /** 동작 길이(초): 연출 대기 시간 맞추기용 */
  animLength(uid: string, kind: ActorAnim): number {
    const a = this.actors.get(uid);
    if (!a?.puppet) return 0.5;
    return clipLength(kind === 'cast' || kind === 'act' ? 'attack' : kind, a.puppet.motion);
  }

  setDead(uid: string, dead: boolean): void {
    const a = this.actors.get(uid);
    if (!a) return;
    a.dead = dead;
    a.alpha = dead ? (a.spec.side === 'ally' ? 0.25 : 0) : 1;
    if (a.puppet) {
      if (dead) a.puppet.play('die');
      else a.puppet.revive();
    }
  }

  /**
   * 예열 오라: 중첩이 쌓일수록 몸 뒤 빛이 커지고, 발밑 마법진이 돌고, 불씨가 더 자주 피어오른다.
   * level 0이면 끈다. max에 닿으면 흰빛이 섞여 '준비됨'을 알린다.
   */
  setAura(uid: string, level: number, color: string, max = 6): void {
    const a = this.actors.get(uid);
    if (!a) return;
    if (level <= 0) {
      this.dropAura(a);
      return;
    }
    if (!a.aura) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('soft'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glow.renderOrder = a.order - 2;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: fxTexture('magic_02'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 3;
      this.actorGroup.add(glow, ring);
      a.aura = { level: 0, shown: 0, max, color: new THREE.Color(color), glow, ring, emit: 0 };
    }
    a.aura.level = level;
    a.aura.max = max;
    a.aura.color.set(color);
  }

  private dropAura(a: Actor): void {
    if (!a.aura) return;
    this.actorGroup.remove(a.aura.glow, a.aura.ring);
    a.aura.glow.material.dispose();
    (a.aura.ring.material as THREE.Material).dispose();
    a.aura.ring.geometry.dispose();
    a.aura = null;
  }

  /** 승리 자세 */
  victory(): void {
    for (const a of this.actors.values()) if (a.puppet && !a.dead) a.puppet.play('victory');
  }

  /** 잠깐 느리게(극딜 연출) */
  slowMo(scale: number, seconds: number): void {
    this.timeScale = scale;
    this.slowLeft = seconds;
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
      this.paint?.uniforms.uRes.value.set(w * (this.quality.pixelRatio || 1), h * (this.quality.pixelRatio || 1));
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
    // 배경 흐림은 무대(원점)까지 거리 기준: 무대 뒤쪽부터 흐려진다
    if (this.outline) {
      const d = pos.length();
      this.outline.uniforms.uBlurNear.value = d + 6;
      this.outline.uniforms.uBlurFar.value = d + 55;
    }
    // 아래 UI에 가려지는 만큼 시야 창을 내려, 장면이 남은 영역의 가운데에 오게 한다.
    const shift = this.framing === 'battle' ? Math.min(this.safeBottom * 0.5, this.size.y * 0.3) : 0;
    if (shift > 0) cam.setViewOffset(this.size.x, this.size.y, 0, shift, this.size.x, this.size.y);
    else cam.clearViewOffset();
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
      let roll = 0;
      let sx = 1;
      let sy = 1;
      if (a.anim) {
        a.anim.t += dt;
        const t = a.anim.t;
        // 술사는 인형이 직접 움직이고, 여기서는 적 판의 기울기와 늘임만 정한다.
        if (!a.puppet) {
          switch (a.anim.kind) {
            case 'act': {
              // 뒤로 몸을 젖혀 부풀었다가 아군 쪽으로 늘어나며 덮친다
              const wind = Math.min(1, t / 0.16);
              const lunge = t < 0.16 ? 0 : t < 0.26 ? (t - 0.16) / 0.1 : Math.max(0, 1 - (t - 0.26) / 0.34);
              a.offset.x = -1.5 * lunge + 0.25 * wind * (1 - lunge);
              roll = -0.16 * wind * (1 - lunge) + 0.22 * lunge;
              sx = 1 + 0.1 * wind * (1 - lunge) + 0.25 * lunge;
              sy = 1 + 0.08 * wind * (1 - lunge) - 0.15 * lunge;
              if (t > 0.62) a.anim = null;
              break;
            }
            case 'hit': {
              const k = Math.max(0, 1 - t / 0.35);
              a.offset.x = 0.3 * k * Math.min(1, t / 0.05);
              roll = -0.12 * k;
              sx = 1 - 0.12 * k;
              sy = 1 + 0.1 * k;
              if (t > 0.35) a.anim = null;
              break;
            }
            case 'die': {
              const k = Math.min(1, t / 0.7);
              roll = k * k * 5;
              sx = sy = 1 - k * 0.7;
              a.offset.y = -k * 0.4;
              a.alpha = Math.max(0, 1 - k);
              if (t > 0.7) a.anim = null;
              break;
            }
            default:
              if (t > 0.6) a.anim = null;
          }
        } else {
          if (a.anim.kind === 'die') a.alpha = Math.max(0.25, 1 - a.anim.t / 0.8);
          if (a.anim.t > 1.5) a.anim = null;
        }
      }
      const yaw = Math.atan2(this.camera.position.x - a.base.x, this.camera.position.z - a.base.z);
      a.flash = Math.max(0, a.flash - dt * 4);
      const tone = a.dead && isAlly ? 0.45 : 1;
      if (a.puppet) {
        a.puppet.update(this.t, dt, a.phase);
        a.obj.position.set(a.base.x + a.offset.x, a.hover + a.offset.y, a.base.z);
        a.obj.rotation.y = yaw;
        a.puppet.caster.rotation.y = lightYaw - yaw;
        a.puppet.setColor(tone + a.flash * 2.2, a.alpha);
      } else {
        const bob = a.hover > 0 ? Math.sin(this.t * 1.4 + a.phase) * 0.08 : 0;
        const breathe = 1 + Math.sin(this.t * 2 + a.phase) * 0.025;
        roll += Math.sin(this.t * 0.9 + a.phase) * 0.035;
        const m = a.mesh!;
        m.scale.set((m.userData.sx as number) * sx * (2 - breathe), (m.userData.sy as number) * sy * breathe, 1);
        // 판은 발끝을 축으로 기울고 늘어난다
        const yo = (m.userData.yOffset as number) * sy * breathe;
        m.position.set(a.base.x + a.offset.x - Math.sin(roll) * yo, a.hover + bob + a.offset.y + Math.cos(roll) * yo, a.base.z);
        m.rotation.set(0, yaw, roll);
        // 그림자 판은 빛을 정면으로 보게 돌려, 옆빛에서도 실루엣 그대로 그림자가 진다.
        const caster = m.children[0];
        if (caster) caster.rotation.y = lightYaw - yaw;
        a.mat!.color.setScalar(tone + a.flash * 2.2);
        a.mat!.opacity = a.alpha;
      }
      const reach = a.puppet ? a.puppet.reach : 0;
      a.shadow.position.set(a.base.x + a.offset.x + reach, 0.02, a.base.z);
      (a.shadow.material as THREE.MeshBasicMaterial).opacity = a.alpha * (a.hover > 0 ? 0.6 : 1) * (this.quality.shadows && this.env?.preset.scenery !== 'neon' ? 0.6 : 1);
      this.updateAura(a, dt);
    }
  }

  private updateAura(a: Actor, dt: number): void {
    const au = a.aura;
    if (!au) return;
    au.shown += (au.level - au.shown) * Math.min(1, dt * 5);
    const k = au.shown / au.max;
    const ready = au.level >= Math.min(3, au.max);
    const pulse = 0.8 + 0.2 * Math.sin(this.t * (4 + k * 6));
    const reach = a.puppet ? a.puppet.reach : 0;
    const x = a.base.x + reach;
    const col = au.color.clone().lerp(new THREE.Color(0xffffff), ready ? 0.25 : 0);
    au.glow.position.set(x, a.height * 0.5, a.base.z - 0.05);
    const s = a.height * (0.9 + k * 1.1) * pulse;
    au.glow.scale.set(s * 0.8, s * 1.15, 1);
    au.glow.material.color.copy(col);
    au.glow.material.opacity = (0.18 + k * 0.5) * a.alpha;
    au.ring.position.set(x, 0.05, a.base.z);
    au.ring.rotation.z += dt * (0.6 + k * 2.4);
    const rs = 1.4 + k * 1.6;
    au.ring.scale.set(rs, rs, 1);
    (au.ring.material as THREE.MeshBasicMaterial).color.copy(col);
    (au.ring.material as THREE.MeshBasicMaterial).opacity = (0.25 + k * 0.6) * a.alpha;
    // 불씨: 중첩당 초당 2개
    if (!this.fx || a.dead) return;
    au.emit += dt * au.shown * 2;
    while (au.emit >= 1) {
      au.emit -= 1;
      const p = new THREE.Vector3(x + (Math.random() - 0.5) * a.width * 1.4, Math.random() * a.height * 0.5, a.base.z + 0.1);
      this.fx.sprite({
        tex: Math.random() < 0.5 ? 'flame_02' : 'star_05',
        color: col,
        pos: p,
        size: 0.18 + k * 0.2,
        to: 0.04,
        life: 0.8 + Math.random() * 0.5,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.2 + k * 1.6, 0),
        curve: 'pulse',
      });
    }
  }

  private loop(now: number): void {
    requestAnimationFrame(this.loop);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.slowLeft > 0) {
      this.slowLeft -= raw;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    const dt = raw * this.timeScale;
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
