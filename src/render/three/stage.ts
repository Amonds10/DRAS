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
import { Backdrop, ToonFx } from './toonfx';

export type Framing = 'menu' | 'battle';
export type ActorPart = 'feet' | 'chest' | 'head' | 'top';
export type ActorAnim = 'cast' | 'channel' | 'charge' | 'act' | 'hit' | 'die' | 'dash' | 'combo1' | 'combo2' | 'combo3' | 'finish' | 'fire' | 'cast1' | 'cast2' | 'recover';

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
  /** 돌진으로 제자리에서 벗어난 거리(월드 x) */
  travelX: number;
  travel: { from: number; to: number; t: number; dur: number } | null;
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
  anim: { kind: ActorAnim; t: number; power: number } | null;
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
    /** 유화 붓질(쿠와하라) 반경(px)과 적용 거리: 무대와 인물은 붓질 없이 또렷하게 */
    uPaint: { value: 3 },
    uPaintNear: { value: 20 },
    uPaintFar: { value: 40 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uThick, uStrength, uBlurNear, uBlurFar, uBlurMax, uPaint, uPaintNear, uPaintFar; uniform vec3 uLine;
    varying vec2 vUv;
    /**
     * 유화 필터(쿠와하라): 주변 네 구역 중 색이 가장 고른 구역의 평균을 고른다.
     * 가장자리는 살리고 면은 붓질처럼 뭉개서, 먼 배경의 잔무늬를 그림 같은 색면으로 바꾼다.
     */
    vec3 kuwahara(vec2 uv, vec2 px) {
      vec3 m[4]; vec3 s[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
      for (int j = -3; j <= 3; j++) {
        for (int i = -3; i <= 3; i++) {
          vec3 c = texture2D(tDiffuse, uv + vec2(float(i), float(j)) * px).rgb;
          vec3 c2 = c * c;
          if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
          if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
          if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
          if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
        }
      }
      float best = 1e9;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      for (int k = 0; k < 4; k++) {
        vec3 mean = m[k] / 16.0;
        vec3 v = abs(s[k] / 16.0 - mean * mean);
        float sigma = v.r + v.g + v.b;
        if (sigma < best) { best = sigma; col = mean; }
      }
      return col;
    }
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    float coc(float z) { return smoothstep(uBlurNear, uBlurFar, z); }
    void main() {
      // 배경 흐림: 먼 곳일수록 원판 표본을 넓게. 가까운(선명한) 이웃은 섞지 않아 캐릭터 둘레가 번지지 않는다.
      float zc = dist(vUv);
      float c0 = coc(zc);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float pk = smoothstep(uPaintNear, uPaintFar, zc);
      if (pk > 0.01 && uPaint > 0.0) col = mix(col, kuwahara(vUv, pk * uPaint / (3.0 * uRes)), pk);
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

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: 1.05 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFlash: { value: 0 },
    /** 임팩트 프레임: 한두 프레임 동안 흑백 판화처럼 뒤집는다 */
    uImpact: { value: 0 },
    uImpactCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uHaze: { value: 0 },
    uHorizon: { value: 0.5 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uTint, uImpactCol; uniform float uContrast, uTime, uFlash, uHaze, uHorizon, uImpact; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // 아지랑이: 지평선 근처만 일렁인다
      vec2 uv = vUv;
      float band = smoothstep(0.12, 0.0, abs(vUv.y - uHorizon));
      uv.x += sin(vUv.y * 260.0 + uTime * 4.0) * 0.0009 * uHaze * band;
      uv.y += sin(vUv.x * 180.0 + uTime * 3.0) * 0.0006 * uHaze * band;
      vec2 off = (uv - 0.5) * 0.0008;
      vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      c *= uTint;
      // 오래된 필름 같은 따뜻한 기운을 살짝
      c = mix(c, vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131))), 0.1);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.8);
      c = max(vec3(0.0), (c - 0.18) * uContrast + 0.18);
      float v = smoothstep(1.0, 0.3, length((vUv - 0.5) * vec2(1.1, 1.0)));
      c *= mix(0.45, 1.0, v);
      c += (hash(vUv * uRes + uTime) - 0.5) * 0.014;
      c += uFlash * vec3(1.0, 0.95, 0.85) * 0.25;
      // 큰 타격: 만화식 흑백 반전 대신, 노출이 잠깐 튀며 빛 색이 번지는 순간
      c += (c * 0.45 + uImpactCol * 0.05) * uImpact;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** 임계 감쇠 스프링(유니티 SmoothDamp). 목표로 미끄러지듯 다가가며 넘치지 않는다. */
function smoothDamp(cur: number, target: number, vel: number, time: number, dt: number): [number, number] {
  if (dt <= 0) return [cur, vel];
  const omega = 2 / time;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * exp, (vel - omega * temp) * exp];
}

function smoothDampV(cur: THREE.Vector3, target: THREE.Vector3, vel: THREE.Vector3, time: number, dt: number): void {
  for (const k of ['x', 'y', 'z'] as const) [cur[k], vel[k]] = smoothDamp(cur[k], target[k], vel[k], time, dt);
}

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
  private timeScale = 1;
  private slowLeft = 0;
  private stopLeft = 0;
  /** 멈춤·느림과 상관없이 흐르는 실제 시간(카메라 흔들림용) */
  private rt = 0;
  private impact = 0;
  private focusPt = new THREE.Vector3();
  private focusCur = new THREE.Vector3();
  private focusVel = new THREE.Vector3();
  private focusK = 0;
  private focusKV = 0;
  private focusGoal = 0;
  private punchK = 0;
  private punchKV = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camVel = new THREE.Vector3();
  private lookVel = new THREE.Vector3();
  private camInit = false;
  private camFraming: Framing | null = null;
  private bloomBase = 0.5;
  private toonFx: ToonFx;
  /** 그래픽이 끊겼다 돌아오면 다시 세우기 위해 기억하는 배우 목록 */
  private lastSpecs: ActorSpec[] = [];
  /** 안전 모드: 후처리 없이 장면만 바로 그린다(후처리가 이 기기에서 실패할 때) */
  private safe = false;
  private blackStrikes = 0;
  private nextCheck = 3;
  private backdrop: Backdrop;
  private kickRoll = 0;
  private kickRollV = 0;
  private kickZoom = 0;
  private kickZoomV = 0;
  private bloomBoost = 0;
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
    // 휴대폰에서 메모리가 모자라면 브라우저가 WebGL을 끊는다. 끊김을 막고, 돌아오면 낮은 등급으로 다시 세운다.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('[stage] WebGL context lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      console.warn('[stage] WebGL context restored');
      this.recover();
    });
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
    this.toonFx = new ToonFx(this.camera);
    this.backdrop = new Backdrop(this.camera);
    this.scene.add(this.toonFx.group, this.backdrop.mesh);
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
    this.outline.uniforms.uBlurMax.value = (q.tier === 'high' ? 4 : 3) * q.pixelRatio;
    this.composer.addPass(this.outline);
    this.outline.uniforms.uPaint.value = q.tier === 'high' ? 3 * q.pixelRatio : 2;
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

  /** 그래픽이 끊겼다 돌아왔을 때: 낮은 등급으로 후처리·장면·배우를 다시 만든다 */
  private recover(): void {
    if (!this.renderer) return;
    this.quality = qualityFor('low');
    this.applyRendererQuality();
    if (this.presetId) this.setScene(this.presetId, true);
    if (this.lastSpecs.length) this.setActors(this.lastSpecs);
  }

  /**
   * 검은 화면 감시: 몇 초마다 화면 몇 점을 읽어 완전히 검으면(하늘도 안 그려짐) 후처리가 이 기기에서
   * 실패한 것으로 보고, 낮은 등급과 안전 모드(후처리 없이 바로 그리기)로 바꾼다.
   */
  private watchBlack(): void {
    const r = this.renderer;
    if (!r || this.safe) return;
    const gl = r.getContext();
    if (gl.isContextLost()) return;
    // 셰이더 컴파일에 실패한 프로그램이 있으면 바로 안전 모드
    const failed = (r.info.programs ?? []).some((pr) => (pr as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    let lit = 0;
    for (const [fx, fy] of [[0.5, 0.75], [0.2, 0.6], [0.8, 0.4], [0.5, 0.3]]) {
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[0] + px[1] + px[2] > 0) lit++;
    }
    this.blackStrikes = lit === 0 ? this.blackStrikes + 1 : 0;
    if (failed || this.blackStrikes >= 2) {
      console.warn('[stage] black frame or failed shader, switching to safe mode');
      this.safe = true;
      if (this.quality.tier !== 'low') this.setTier('low');
    }
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
    this.fx.maxParts = this.quality.tier === 'high' ? 420 : 220;
    this.toonFx.dispose();
    this.backdrop.set(null);
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
      this.bloomBase = g.bloom;
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
        // 그림자 판과 깊이 판
        for (const c of a.obj.children) ((c as THREE.Mesh).material as THREE.Material).dispose();
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
        diffuseColor.rgb = (diffuseColor.rgb * uTint + uFill * ${foot ? 'smoothstep(0.3, 0.9, vMapUv.y)' : '0.12'}) * foot + uRimCol * rim * uRimK * ${foot ? '1.0' : '0.8'};`,
      );
    };
    return mat;
  }

  setActors(specs: ActorSpec[]): void {
    this.lastSpecs = specs;
    this.clearActors();
    const allies = specs.filter((s) => s.side === 'ally');
    const enemies = specs.filter((s) => s.side === 'enemy');
    const eSlots = enemySlots(enemies);
    const plane = new THREE.PlaneGeometry(1, 1);
    const add = (spec: ActorSpec, x: number, z: number) => {
      const isAlly = spec.side === 'ally';
      const keeper = spec.defId === 'fallen_keeper' || spec.defId === 'shard_golem';
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
          return this.actorMaterial(tex, w, h, false);
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
        // 깊이만 쓰는 판: 후처리(배경 흐림·붓질)가 인물을 배경으로 착각해 뭉개지 않게 한다
        const depth = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, colorWrite: false }));
        depth.renderOrder = order + 1;
        mesh.add(depth);
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
        travelX: 0,
        travel: null,
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
    p.x += a.travelX;
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
  anim(uid: string, kind: ActorAnim, power = 1): void {
    const a = this.actors.get(uid);
    if (!a) return;
    a.anim = { kind, t: 0, power };
    if (kind === 'hit') a.flash = 1.4;
    if (kind === 'cast' || kind === 'channel') a.flash = 0.35;
    if (kind === 'charge') a.flash = 0.6;
    if (kind === 'die') a.dead = true;
    if (a.puppet) a.puppet.play(kind === 'cast' || kind === 'act' ? 'attack' : kind);
    if (kind === 'die') this.dash(uid, null, 0.2);
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

  /** 연출 카메라를 이 지점으로(null이면 원래 자리로) */
  focus(point: THREE.Vector3 | null, strength = 1): void {
    if (point) {
      // 처음 다가갈 때는 그 자리에서 시작해, 옆에서 미끄러져 들어오지 않게 한다
      if (this.focusK < 0.05) this.focusCur.copy(point);
      this.focusPt.copy(point);
      this.focusGoal = strength;
    } else this.focusGoal = 0;
  }

  /** 잠깐 빛 번짐을 키운다(큰 타격의 화려함) */
  glowPulse(amount = 0.6): void {
    this.bloomBoost = Math.min(0.3, Math.max(this.bloomBoost, amount * 0.6));
  }

  /** 돌진: 대상 바로 앞(gap만큼 떨어진 곳)으로. null이면 제자리로 돌아온다. */
  dash(uid: string, targetUid: string | null, dur = 0.18, gap = 1.5): void {
    const a = this.actors.get(uid);
    if (!a) return;
    let to = 0;
    if (targetUid) {
      const t = this.actors.get(targetUid);
      if (!t) return;
      to = t.base.x - gap - a.base.x;
    }
    a.travel = { from: a.travelX, to, t: 0, dur };
  }

  /** 셀 셰이딩 효과(베기 호·충격파·폭발) */
  get toon(): ToonFx {
    return this.toonFx;
  }

  /** 연출 배경: 색을 주면 무대 뒤가 어두워지며 그 색 무늬가 깔리고, null이면 걷힌다 */
  setBackdrop(color: THREE.ColorRepresentation | null, strength = 0.82): void {
    this.backdrop.set(color, strength);
  }

  /** 타격 반동: roll(라디안)만큼 기울이고 zoom만큼 앞으로 튕긴다 */
  kick(roll: number, zoom = 0.6): void {
    this.kickRoll += roll;
    this.kickZoom += zoom;
  }

  /** 역경직(초) */
  hitStop(seconds: number): void {
    this.stopLeft = Math.max(this.stopLeft, seconds);
  }

  /** 임팩트 프레임: 화면이 한순간 흑백 판화로 뒤집힌다 */
  impactFrame(color: THREE.ColorRepresentation = 0xfff2d8): void {
    this.impact = 1;
    this.grade?.uniforms.uImpactCol.value.set(color);
  }

  /** 잔상: 돌진하는 술사 뒤로 실루엣이 몇 겹 남는다 */
  afterimage(uid: string, color: THREE.ColorRepresentation, count = 3): void {
    const a = this.actors.get(uid);
    const tex = (a?.puppet?.caster.material as THREE.MeshBasicMaterial | undefined)?.map;
    if (!a?.puppet || !tex || !this.fx) return;
    const c = a.puppet.caster;
    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(a.base.x + a.puppet.reach - i * 0.25, a.hover + c.position.y, a.base.z + 0.05);
      this.fx.ghost(tex, pos, [c.scale.x, c.scale.y], color, 0.28, i * 0.045);
    }
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
    this.screenFlash = Math.max(this.screenFlash, amount * 0.5);
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
    // 연출 카메라: 시전자 → 대상 순서로 다가갔다가 돌아온다. 세로 화면에서는 약하게.
    // 바라보는 점과 다가가는 정도 모두 스프링으로 따라가서, 대상이 바뀌어도 화면이 튀지 않는다.
    if (this.focusGoal > 0) smoothDampV(this.focusCur, this.focusPt, this.focusVel, 0.16, dt);
    [this.focusK, this.focusKV] = smoothDamp(this.focusK, this.focusGoal, this.focusKV, 0.2, dt);
    if (this.focusK > 0.002) {
      const k = this.focusK * (cam.aspect < 1 ? 0.45 : 1);
      pos.lerp(this.focusCur.clone().add(new THREE.Vector3(0, 0.9, 9)), 0.3 * k);
      look.lerp(this.focusCur, 0.38 * k);
    }
    // 반응·컷인의 짧은 당김도 스프링으로
    [this.punchK, this.punchKV] = smoothDamp(this.punchK, this.punchAmt, this.punchKV, 0.08, dt);
    this.punchAmt = Math.max(0, this.punchAmt - dt * 1.2);
    if (this.punchK > 0.002) {
      pos.lerp(this.punchTarget.clone().add(new THREE.Vector3(0, 1, 6)), 0.12 * this.punchK);
      look.lerp(this.punchTarget, 0.22 * this.punchK);
    }
    // 마지막으로 카메라 자체도 한 번 더 부드럽게 따라가게 한다(첫 화면이나 화면 전환 때는 바로 맞춘다)
    if (!this.camInit || this.camFraming !== this.framing) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camVel.set(0, 0, 0);
      this.lookVel.set(0, 0, 0);
      this.camInit = true;
      this.camFraming = this.framing;
    } else {
      smoothDampV(this.camPos, pos, this.camVel, 0.07, dt);
      smoothDampV(this.camLook, look, this.lookVel, 0.07, dt);
    }
    // 흔들림: 프레임마다 무작위로 튀지 않게 겹친 사인파로 부드럽게 떤다
    const sh = this.shakeAmt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.3);
    const st = this.rt * 31;
    const shake = new THREE.Vector3(Math.sin(st) * 0.6 + Math.sin(st * 1.7 + 1.3) * 0.4, Math.sin(st * 1.3 + 0.7) * 0.6 + Math.sin(st * 2.3) * 0.4, 0).multiplyScalar(sh * 0.45);
    // 타격 반동: 화면이 잠깐 기울고 앞으로 튄 뒤 빠르게 돌아온다
    [this.kickRoll, this.kickRollV] = smoothDamp(this.kickRoll, 0, this.kickRollV, 0.09, dt);
    [this.kickZoom, this.kickZoomV] = smoothDamp(this.kickZoom, 0, this.kickZoomV, 0.09, dt);
    const fwd = this.camLook.clone().sub(this.camPos).normalize();
    cam.position.copy(this.camPos).add(shake).addScaledVector(fwd, this.kickZoom);
    cam.lookAt(this.camLook.clone().add(shake.multiplyScalar(0.4)));
    if (this.kickRoll) cam.rotateZ(this.kickRoll);
    if (this.bloom) {
      this.bloomBoost = Math.max(0, this.bloomBoost - dt * 2.2);
      this.bloom.strength = this.bloomBase + this.bloomBoost;
    }
    // 배경 흐림은 무대(원점)까지 거리 기준: 무대 뒤쪽부터 흐려진다
    if (this.outline) {
      const d = pos.length();
      this.outline.uniforms.uBlurNear.value = d + 16;
      this.outline.uniforms.uBlurFar.value = d + 70;
      this.outline.uniforms.uPaintNear.value = d + 8;
      this.outline.uniforms.uPaintFar.value = d + 30;
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
      if (a.travel) {
        a.travel.t += dt;
        const k = Math.min(1, a.travel.t / a.travel.dur);
        const e = 1 - Math.pow(1 - k, 3);
        a.travelX = a.travel.from + (a.travel.to - a.travel.from) * e;
        if (k >= 1) a.travel = null;
      }
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
              // 세게 맞을수록 멀리 밀리고 크게 찌그러진다
              const pw = a.anim.power;
              const k = Math.max(0, 1 - t / (0.3 + 0.15 * pw));
              a.offset.x = 0.3 * pw * k * Math.min(1, t / 0.04);
              a.offset.y = 0.12 * pw * Math.sin(Math.min(1, t / 0.3) * Math.PI) * (pw > 1.4 ? 1 : 0);
              roll = -0.12 * pw * k;
              sx = 1 - 0.12 * Math.min(pw, 2) * k;
              sy = 1 + 0.1 * Math.min(pw, 2) * k;
              if (t > 0.45 + 0.15 * pw) a.anim = null;
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
        a.obj.position.set(a.base.x + a.offset.x + a.travelX, a.hover + a.offset.y, a.base.z);
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
      const reach = (a.puppet ? a.puppet.reach : 0) + a.travelX;
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
    const reach = (a.puppet ? a.puppet.reach : 0) + a.travelX;
    const x = a.base.x + reach;
    const col = au.color.clone().lerp(new THREE.Color(0xffffff), ready ? 0.25 : 0);
    au.glow.position.set(x, a.height * 0.5, a.base.z - 0.05);
    const s = a.height * (0.75 + k * 0.55) * pulse;
    au.glow.scale.set(s * 0.8, s * 1.15, 1);
    au.glow.material.color.copy(col);
    au.glow.material.opacity = (0.08 + k * 0.22) * a.alpha;
    au.ring.position.set(x, 0.05, a.base.z);
    au.ring.rotation.z += dt * (0.6 + k * 2.4);
    const rs = 1.4 + k * 1.6;
    au.ring.scale.set(rs, rs, 1);
    (au.ring.material as THREE.MeshBasicMaterial).color.copy(col);
    (au.ring.material as THREE.MeshBasicMaterial).opacity = (0.2 + k * 0.45) * a.alpha;
    // 불씨: 중첩당 초당 2개
    if (!this.fx || a.dead) return;
    au.emit += dt * au.shown * 1.2;
    while (au.emit >= 1) {
      au.emit -= 1;
      const p = new THREE.Vector3(x + (Math.random() - 0.5) * a.width * 1.4, Math.random() * a.height * 0.5, a.base.z + 0.1);
      this.fx.sprite({
        tex: Math.random() < 0.5 ? 'flame_02' : 'soft',
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
    // 인물·카메라는 한 프레임에 최대 0.1초씩, 효과는 느린 기기에서도 실제 시간대로(최대 0.25초) 흘러 쌓이지 않게 한다
    const real = Math.min(0.25, (now - this.last) / 1000);
    const raw = Math.min(0.1, real);
    this.last = now;
    if (this.slowLeft > 0) {
      this.slowLeft -= raw;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
    // 역경직(히트스톱): 아주 잠깐 인물과 효과를 멈춰 타격에 무게를 싣는다. 카메라는 계속 흔들린다.
    let dt = raw * this.timeScale;
    let fxDt = real * this.timeScale;
    if (this.stopLeft > 0) {
      this.stopLeft -= raw;
      dt = 0;
      fxDt = 0;
    }
    this.t += dt;
    this.rt += raw;
    this.impact = Math.max(0, this.impact - raw * 12);
    this.updateCamera(raw);
    this.updateActors(dt);
    this.env?.update(this.t, dt);
    this.fx?.update(fxDt, this.t);
    this.toonFx.update(fxDt);
    this.backdrop.update(raw, this.rt);
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
      this.grade!.uniforms.uImpact.value = this.impact;
      if (this.safe) {
        this.renderer!.setRenderTarget(null);
        this.renderer!.render(this.scene, this.camera);
      } else this.composer.render(dt);
      if (this.rt > this.nextCheck) {
        this.nextCheck = this.rt + 3;
        this.watchBlack();
      }
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
