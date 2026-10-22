import * as THREE from 'three';
import { fxTexture } from '../textures';
import type { BuildCtx } from './context';
import { magicCircleMaterial } from './magicCircle';
import { lcg } from './noise';

const R = 360;

/** 하늘 방향(방위각, 고도) → 구 위의 점 */
function skyPoint(az: number, el: number, r = R): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(r);
}

/** 하늘을 별·빛·마법으로 채운다: 별자리, 거대한 마법 구조물, 빛기둥, 별똥별 */
export function buildCelestial(ctx: BuildCtx): void {
  const p = ctx.p;
  const rand = lcg(ctx.id.charCodeAt(0) * 53 + 11);
  buildConstellations(ctx, rand);
  if (p.arcana.skyRing !== 'none') buildSkyRing(ctx, rand);
  if (p.arcana.pillars > 0) buildPillars(ctx, rand);
  buildShootingStars(ctx, rand);
}

/** 별자리: 밝은 별 몇 개를 가는 빛줄로 잇는다. 줄은 천천히 숨 쉬듯 밝아졌다 어두워진다. */
function buildConstellations(ctx: BuildCtx, rand: () => number): void {
  const p = ctx.p;
  const lines: number[] = [];
  const stars: number[] = [];
  const sizes: number[] = [];
  const phases: number[] = [];
  for (let k = 0; k < p.constellations; k++) {
    // 화면에 잘 보이도록 앞쪽 하늘에 고르게 흩어 놓는다
    const az0 = (k / Math.max(1, p.constellations - 1) - 0.5) * 2.2 + (rand() - 0.5) * 0.3;
    // 전투 카메라에 보이는 하늘(지평선 위 6~15도)에 걸치도록 낮게
    const el0 = 0.13 + rand() * 0.13;
    const count = 5 + Math.floor(rand() * 4);
    const pts: THREE.Vector3[] = [];
    let az = az0, el = el0;
    for (let i = 0; i < count; i++) {
      pts.push(skyPoint(az, el));
      az += (rand() - 0.5) * 0.16;
      el += (rand() - 0.45) * 0.07;
    }
    for (let i = 1; i < pts.length; i++) {
      // 한 갈래는 앞 별이 아니라 두 칸 전 별에서 뻗는다
      const from = i > 2 && rand() < 0.25 ? pts[i - 2] : pts[i - 1];
      lines.push(...from.toArray(), ...pts[i].toArray());
    }
    pts.forEach((v, i) => {
      stars.push(...v.toArray());
      sizes.push(i === 0 || rand() < 0.3 ? 1.6 : 1);
      phases.push(rand() * 10);
    });
  }
  const tick = ctx.shared();
  const lineGeo = ctx.track(new THREE.BufferGeometry());
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const lineMat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...tick, uColor: { value: new THREE.Color(p.arcana.accent).lerp(new THREE.Color(0xffffff), 0.4) } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vP; void main(){ float pulse = 0.55 + 0.45 * sin(uTime * 0.6 + vP.x * 0.01); gl_FragColor = vec4(uColor * 0.32 * pulse, 1.0); }`,
    }),
  );
  const ls = new THREE.LineSegments(lineGeo, lineMat);
  ls.renderOrder = -9;
  ls.frustumCulled = false;
  ctx.group.add(ls);

  const starGeo = ctx.track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  starGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  starGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  const starMat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...tick, uMap: { value: fxTexture('star_04') }, uColor: { value: new THREE.Color(p.arcana.color).lerp(new THREE.Color(0xffffff), 0.5) } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aPhase; uniform float uTime; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.7 + 0.3 * sin(uTime * 1.7 + aPhase);
          gl_PointSize = aSize * 22.0 * tw;
          vA = tw;
        }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * texture2D(uMap, gl_PointCoord).a * vA, 1.0); }`,
    }),
  );
  const pts = new THREE.Points(starGeo, starMat);
  pts.renderOrder = -9;
  pts.frustumCulled = false;
  ctx.group.add(pts);
}

/** 하늘에 걸린 거대한 마법 구조물: 아스트롤라베 고리, 룬 마법진, 부서진 고리 */
function buildSkyRing(ctx: BuildCtx, rand: () => number): void {
  const p = ctx.p;
  const kind = p.arcana.skyRing;
  const group = new THREE.Group();
  // 광원 반대편 하늘 위쪽(해와 겹치지 않게)
  const sunAz = Math.atan2(ctx.sunDir.x, -ctx.sunDir.z);
  const az = sunAz > 0 ? -0.32 : 0.32;
  // 지평선에서 떠오르듯 아래쪽은 능선에 가려진다
  group.position.copy(skyPoint(az, 0.15, 300));
  group.lookAt(0, 0, 0);
  const col = new THREE.Color(p.arcana.color);
  const accent = new THREE.Color(p.arcana.accent);
  const ringMat = (c: THREE.Color, a: number) =>
    ctx.track(new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(a), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const spinners: { obj: THREE.Object3D; axis: THREE.Vector3; speed: number }[] = [];

  if (kind === 'astrolabe' || kind === 'broken') {
    const rings = kind === 'astrolabe' ? 4 : 5;
    for (let i = 0; i < rings; i++) {
      const r = 22 + i * 6;
      const arc = kind === 'broken' ? Math.PI * (0.6 + rand() * 0.9) : Math.PI * 2;
      const m = new THREE.Mesh(ctx.track(new THREE.TorusGeometry(r, 0.22 + (i % 2) * 0.14, 6, 160, arc)), ringMat(i % 2 ? accent : col, 0.22));
      m.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      group.add(m);
      spinners.push({ obj: m, axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), speed: 0.02 + rand() * 0.04 });
      // 고리 위 눈금 구슬
      const beads = new THREE.InstancedMesh(ctx.track(new THREE.SphereGeometry(0.55, 8, 6)), ringMat(col, 0.5), 12);
      for (let b = 0; b < 12; b++) {
        const t = (b / 12) * arc;
        beads.setMatrixAt(b, new THREE.Matrix4().makeTranslation(Math.cos(t) * r, Math.sin(t) * r, 0));
      }
      m.add(beads);
    }
    // 가운데 별
    const core = new THREE.Sprite(ctx.track(new THREE.SpriteMaterial({ map: fxTexture('star_05'), color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    core.scale.setScalar(14);
    group.add(core);
  }
  if (kind === 'runes' || kind === 'astrolabe') {
    // 룬 마법진: 크기가 다른 두 장이 겹쳐 서로 반대로 돈다
    const k = kind === 'runes' ? 0.42 : 0.28;
    for (const [s, c, sp, seed] of [[118, col, 0.04, 1], [72, accent, -0.07, 7]] as const) {
      const m = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(1, 1)), magicCircleMaterial(ctx, c.clone(), { seed, spin: sp, intensity: k }));
      m.scale.setScalar(s);
      group.add(m);
    }
  }
  group.traverse((o) => (o.renderOrder = -8));
  ctx.group.add(group);
  ctx.onUpdate((_t, dt) => {
    for (const s of spinners) s.obj.rotateOnAxis(s.axis, s.speed * dt);
  });
}

/** 먼 곳에서 하늘로 솟는 빛기둥 */
function buildPillars(ctx: BuildCtx, rand: () => number): void {
  const p = ctx.p;
  const tick = ctx.shared();
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { ...tick, uColor: { value: new THREE.Color(p.arcana.color) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main() {
          float core = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.0);
          float fade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
          float flow = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
          gl_FragColor = vec4(uColor * core * fade * flow * 0.22, 1.0);
        }`,
    }),
  );
  for (let i = 0; i < p.arcana.pillars; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (40 + rand() * 90);
    const z = -110 - rand() * 120;
    const h = 120 + rand() * 80;
    const w = 5 + rand() * 4;
    // 십자로 교차한 두 판이라 어느 쪽에서 봐도 기둥처럼 보인다
    for (const rot of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(w, h)), mat);
      m.position.set(x, ctx.heightAt(x, z) + h / 2 - 4, z);
      m.rotation.y = rot;
      m.renderOrder = -4;
      ctx.group.add(m);
    }
    const flare = new THREE.Sprite(ctx.track(new THREE.SpriteMaterial({ map: fxTexture('light_02'), color: new THREE.Color(p.arcana.color).multiplyScalar(0.8), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
    flare.position.set(x, ctx.heightAt(x, z) + 2, z);
    flare.scale.setScalar(14);
    ctx.group.add(flare);
  }
}

/** 별똥별: 몇 초마다 하늘 위쪽을 가로지르는 빛 꼬리 */
function buildShootingStars(ctx: BuildCtx, rand: () => number): void {
  if (ctx.p.stars < 0.3) return;
  const geo = ctx.track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute([0, 1], 1));
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(ctx.p.arcana.accent).lerp(new THREE.Color(0xffffff), 0.6) } },
      vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uAlpha; uniform vec3 uColor; varying float vT; void main(){ gl_FragColor = vec4(uColor * vT * uAlpha, 1.0); }`,
    }),
  );
  const line = new THREE.LineSegments(geo, mat);
  line.frustumCulled = false;
  line.renderOrder = -9;
  ctx.group.add(line);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let t = -2 - rand() * 3;
  let from = new THREE.Vector3(), dir = new THREE.Vector3();
  ctx.onUpdate((_time, dt) => {
    t += dt;
    if (t > 1.2) {
      t = -(3 + rand() * 6);
      const az = (rand() - 0.5) * 2, el = 0.35 + rand() * 0.35;
      from = skyPoint(az, el, 340);
      dir = skyPoint(az + (rand() < 0.5 ? -0.35 : 0.35), el - 0.2, 340).sub(from);
    }
    if (t < 0) {
      mat.uniforms.uAlpha.value = 0;
      return;
    }
    const k = t / 1.2;
    const head = from.clone().addScaledVector(dir, k);
    const tail = from.clone().addScaledVector(dir, Math.max(0, k - 0.25));
    pos.setXYZ(0, tail.x, tail.y, tail.z);
    pos.setXYZ(1, head.x, head.y, head.z);
    pos.needsUpdate = true;
    mat.uniforms.uAlpha.value = Math.sin(k * Math.PI) * 1.4;
  });
}
