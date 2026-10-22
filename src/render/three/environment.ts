import * as THREE from 'three';
import { fxTexture } from './textures';
import type { Quality } from './quality';
import { MAX_GROUND_LIGHTS, type BuildCtx, type GroundLights, type TickUniforms } from './env/context';
import { buildCity } from './env/city';
import { buildStageDecal } from './env/decal';
import { PRESETS, type PresetDef, type ScenePreset } from './env/presets';
import { buildProps } from './env/props';
import { buildSky } from './env/sky';
import { buildTerrain } from './env/terrain';
import { buildVegetation } from './env/vegetation';
import { buildCloudSea, buildSea } from './env/water';
import { buildFogBands, buildParticles, buildRain } from './env/weather';

export { PRESETS, floorPreset, type ScenePreset } from './env/presets';
export { MAX_GROUND_LIGHTS, type GroundLights } from './env/context';

/**
 * 한 프리셋의 배경 전체: 하늘, 지형, 지형지물, 식생, 물, 날씨, 조명.
 * update()로 시간을 흘리고 dispose()로 정리한다.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly preset: PresetDef;
  readonly lights: GroundLights;
  readonly staticLightCount: number;
  readonly fog: THREE.FogExp2;
  /** 하늘로 구운 환경광(PBR 반사) */
  readonly envMap: THREE.Texture | null;
  /** 장면에서 해·달을 향하는 방향(빛줄기 위치 계산용) */
  readonly sunDir: THREE.Vector3;
  private ticks: TickUniforms[] = [];
  private updaters: ((t: number, dt: number) => void)[] = [];
  private disposables: { dispose(): void }[] = [];
  private flash = 0;
  private nextBolt = 4;
  private bolt: THREE.Sprite | null = null;
  private boltT = 0;

  constructor(
    readonly id: ScenePreset,
    renderer: THREE.WebGLRenderer,
    readonly quality: Quality,
  ) {
    const p = (this.preset = PRESETS[id]);
    this.sunDir = new THREE.Vector3(...(p.light?.dir ?? [0.3, 0.6, -1])).normalize();
    this.lights = {
      pos: Array.from({ length: MAX_GROUND_LIGHTS }, () => new THREE.Vector3(0, -100, 0)),
      col: Array.from({ length: MAX_GROUND_LIGHTS }, () => new THREE.Color(0, 0, 0)),
    };
    this.fog = new THREE.FogExp2(p.fog, p.fogDensity);

    const ctx: BuildCtx = {
      id,
      p,
      q: quality,
      renderer,
      group: this.group,
      sunDir: this.sunDir,
      lights: this.lights,
      track: (o) => {
        this.disposables.push(o);
        return o;
      },
      shared: () => {
        const u = { uTime: { value: 0 }, uFlash: { value: 0 } };
        this.ticks.push(u);
        return u;
      },
      onUpdate: (fn) => this.updaters.push(fn),
      heightAt: () => 0,
    };

    const sky = buildSky(ctx);
    ctx.heightAt = buildTerrain(ctx);
    if (p.ground.kind === 'water') buildSea(ctx);
    if (p.terrain === 'island') buildCloudSea(ctx);
    if (p.scenery === 'neon') this.staticLightCount = buildCity(ctx);
    else {
      this.staticLightCount = 0;
      buildStageDecal(ctx);
      buildProps(ctx);
      buildVegetation(ctx);
    }
    buildFogBands(ctx);
    if (p.rain > 0) buildRain(ctx);
    if (p.particles.kind !== 'none') buildParticles(ctx);
    this.buildLights(ctx);
    this.envMap = this.bakeEnvironment(renderer, sky.mesh, sky.setDisc);
  }

  /** 직사광(그림자)과 하늘·땅 반사광 */
  private buildLights(ctx: BuildCtx): void {
    const p = this.preset;
    const hemi = new THREE.HemisphereLight(p.hemi.sky, p.hemi.ground, p.hemi.intensity);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(p.sun.color, p.sun.intensity);
    // 해가 지평선에 붙어 있으면 그림자가 끝없이 길어지므로, 그림자용 고도는 25도 이상으로 올린다.
    const flat = new THREE.Vector3(this.sunDir.x, 0, this.sunDir.z).normalize();
    const el = Math.max(Math.asin(THREE.MathUtils.clamp(this.sunDir.y, -1, 1)), 0.45);
    const dir = flat.multiplyScalar(Math.cos(el)).setY(Math.sin(el));
    sun.position.copy(dir.multiplyScalar(60)).add(new THREE.Vector3(0, 0, -4));
    sun.target.position.set(0, 0, -4);
    const shadows = ctx.q.shadows && p.scenery !== 'neon';
    sun.castShadow = shadows;
    if (shadows) {
      const s = sun.shadow;
      s.mapSize.set(ctx.q.shadowSize, ctx.q.shadowSize);
      const cam = s.camera as THREE.OrthographicCamera;
      cam.left = -30;
      cam.right = 30;
      cam.top = 26;
      cam.bottom = -26;
      cam.near = 1;
      cam.far = 160;
      s.bias = -0.0005;
      s.normalBias = 0.05;
      s.radius = 3;
    }
    this.group.add(sun, sun.target);
  }

  /** 하늘만 담은 장면을 PMREM으로 구워 환경광으로 쓴다 */
  private bakeEnvironment(renderer: THREE.WebGLRenderer, sky: THREE.Mesh, setDisc: (on: boolean) => void): THREE.Texture | null {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const tmp = new THREE.Scene();
      const parent = sky.parent;
      tmp.add(sky);
      setDisc(false);
      const rt = pmrem.fromScene(tmp, 0, 0.1, 1000);
      setDisc(true);
      parent?.add(sky);
      pmrem.dispose();
      this.disposables.push(rt);
      return rt.texture;
    } catch {
      return null;
    }
  }

  /** 번개: 하늘 섬광과 먼 번개 줄기 */
  strike(): void {
    this.flash = 1;
    if (!this.bolt) {
      const mat = new THREE.SpriteMaterial({ map: fxTexture('spark_05'), color: 0xcfe0ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.disposables.push(mat);
      this.bolt = new THREE.Sprite(mat);
      this.group.add(this.bolt);
    }
    this.bolt.position.set((Math.random() - 0.5) * 80, 24, -75);
    this.bolt.scale.set(18, 36, 1);
    this.bolt.material.rotation = (Math.random() - 0.5) * 0.4;
    this.boltT = 0.35;
  }

  update(t: number, dt: number): void {
    if (this.preset.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.strike();
        this.nextBolt = 5 + Math.random() * 8;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const f = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(t * 60)) : 0;
    for (const u of this.ticks) {
      u.uTime.value = t;
      u.uFlash.value = f;
    }
    for (const fn of this.updaters) fn(t, dt);
    if (this.bolt) {
      this.boltT = Math.max(0, this.boltT - dt);
      this.bolt.visible = this.boltT > 0 && Math.sin(t * 50) > -0.3;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
