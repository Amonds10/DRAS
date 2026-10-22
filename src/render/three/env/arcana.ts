import * as THREE from 'three';
import { fxTexture } from '../textures';
import type { BuildCtx } from './context';
import { magicCircleMaterial } from './magicCircle';
import { lcg } from './noise';
import { toonMaterial } from './toon';

/** 무대 뒤를 마법 장식으로 채운다: 떠다니는 수정, 반짝이는 별가루, 땅의 룬 마법진 */
export function buildArcana(ctx: BuildCtx): void {
  const rand = lcg(ctx.id.length * 389 + 17);
  buildCrystals(ctx, rand);
  buildSparkles(ctx, rand);
  if (ctx.p.scenery !== 'neon') buildGroundRunes(ctx, rand);
}

/** 수정: 길쭉한 팔면체, 가운데서 은은히 빛나며 천천히 돌고 오르내린다 */
function buildCrystals(ctx: BuildCtx, rand: () => number): void {
  const p = ctx.p;
  const n = p.arcana.crystals;
  if (!n) return;
  const geo = ctx.track(new THREE.OctahedronGeometry(1, 0));
  geo.scale(0.55, 1.4, 0.55);
  const col = new THREE.Color(p.arcana.accent);
  const mat = toonMaterial(ctx, { vertexColors: false, color: col.clone().multiplyScalar(0.7), emissive: col.clone().multiplyScalar(0.45) });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const glowMat = ctx.track(new THREE.SpriteMaterial({ map: fxTexture('soft'), color: col.clone().multiplyScalar(0.55), blending: THREE.AdditiveBlending, depthWrite: false }));
  const items: { x: number; y: number; z: number; s: number; ph: number; spin: number }[] = [];
  for (let i = 0; i < n; i++) {
    // 무대 뒤 반원 띠에 흩어 놓는다(캐릭터 앞을 가리지 않게)
    const side = i % 2 ? 1 : -1;
    const x = side * (6 + rand() * 34) * (rand() < 0.2 ? 0.3 : 1);
    const z = -16 - rand() * 46;
    const y = ctx.heightAt(x, z) + 3 + rand() * 9;
    const s = 0.5 + rand() * 1.3;
    items.push({ x, y, z, s, ph: rand() * 6, spin: 0.2 + rand() * 0.5 });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(x, y, z);
    glow.scale.setScalar(s * 2.2);
    glow.userData.i = i;
    ctx.group.add(glow);
  }
  mesh.castShadow = false;
  ctx.group.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const glows = ctx.group.children.filter((o) => o instanceof THREE.Sprite && o.material === glowMat);
  ctx.onUpdate((t) => {
    items.forEach((it, i) => {
      const y = it.y + Math.sin(t * 0.8 + it.ph) * 0.35;
      e.set(0.2 * Math.sin(it.ph), t * it.spin + it.ph, 0);
      m.compose(v.set(it.x, y, it.z), q.setFromEuler(e), sc.setScalar(it.s));
      mesh.setMatrixAt(i, m);
      const g = glows[i];
      if (g) {
        g.position.y = y;
        (g as THREE.Sprite).scale.setScalar(it.s * (2.1 + Math.sin(t * 2 + it.ph) * 0.25));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

/** 별가루: 무대 뒤 공간을 촘촘히 채우는 반짝이(십자 별 모양) */
function buildSparkles(ctx: BuildCtx, rand: () => number): void {
  const p = ctx.p;
  const n = Math.round(420 * (0.5 + ctx.q.particles * 0.5));
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n);
  const tint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = -8 - Math.pow(rand(), 0.7) * 70;
    const x = (rand() - 0.5) * (40 + -z * 1.4);
    pos.set([x, ctx.heightAt(x, z) + 0.5 + rand() * (6 + -z * 0.25), z], i * 3);
    rnd[i] = rand();
    tint[i] = rand() < 0.35 ? 1 : 0;
  }
  const geo = ctx.track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...ctx.shared(), uMap: { value: fxTexture('star_04') }, uA: { value: new THREE.Color(p.arcana.color) }, uB: { value: new THREE.Color(p.arcana.accent) } },
      vertexShader: /* glsl */ `
        attribute float aRand; attribute float aTint;
        uniform float uTime;
        varying float vA; varying float vTint;
        void main() {
          vec3 q = position;
          q.y += sin(uTime * 0.5 + aRand * 30.0) * 0.4;
          q.x += cos(uTime * 0.3 + aRand * 20.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = pow(0.5 + 0.5 * sin(uTime * (1.2 + aRand * 2.0) + aRand * 50.0), 3.0);
          gl_PointSize = (0.25 + aRand * 0.35) * 600.0 / -mv.z * (0.5 + tw);
          vA = tw * 0.9 + 0.1;
          vTint = aTint;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uA, uB;
        varying float vA; varying float vTint;
        void main() { gl_FragColor = vec4(mix(uA, uB, vTint) * texture2D(uMap, gl_PointCoord).a * vA, 1.0); }`,
    }),
  );
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.group.add(pts);
}

/** 땅에 새겨진 룬 마법진: 무대 뒤 몇 곳에서 천천히 돈다 */
function buildGroundRunes(ctx: BuildCtx, rand: () => number): void {
  const p = ctx.p;
  const spots: [number, number, number][] = [
    [-18 - rand() * 6, -26 - rand() * 8, 7],
    [20 + rand() * 6, -30 - rand() * 8, 9],
    [-2 + rand() * 4, -48 - rand() * 6, 12],
  ];
  spots.forEach(([x, z, s], i) => {
    const mat = magicCircleMaterial(ctx, new THREE.Color(i % 2 ? p.arcana.accent : p.arcana.color), { seed: i * 3 + 2, spin: i % 2 ? -0.05 : 0.07, intensity: 0.7 });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    const m = new THREE.Mesh(ctx.track(new THREE.PlaneGeometry(s, s)), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, ctx.heightAt(x, z) + 0.06, z);
    ctx.group.add(m);
  });
}
