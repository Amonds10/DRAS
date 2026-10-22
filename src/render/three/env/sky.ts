import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { BuildCtx } from './context';
import { NOISE_GLSL } from './glsl';

export interface SkyResult {
  mesh: THREE.Mesh;
  /** 환경광을 구울 때 해 원반을 잠시 끈다 */
  setDisc(on: boolean): void;
}

/** 하늘: 낮은 Preetham 산란(Sky.js), 밤은 별·달·오로라·일식 셰이더 */
export function buildSky(ctx: BuildCtx): SkyResult {
  return ctx.p.physical ? physicalSky(ctx) : nightSky(ctx);
}

function physicalSky(ctx: BuildCtx): SkyResult {
  const ph = ctx.p.physical!;
  const sky = new Sky();
  sky.scale.setScalar(450);
  const mat = sky.material as THREE.ShaderMaterial;
  const u = mat.uniforms;
  u.turbidity.value = ph.turbidity;
  u.rayleigh.value = ph.rayleigh;
  u.mieCoefficient.value = ph.mie;
  u.mieDirectionalG.value = ph.mieG;
  u.sunPosition.value.copy(ctx.sunDir);
  u.cloudCoverage.value = ph.cover;
  u.cloudDensity.value = ph.density;
  u.cloudElevation.value = 0.55;
  // 밝기를 장면 노출에 맞추고, 번개 섬광을 받을 수 있게 셰이더 끝만 바꾼다.
  const tick = ctx.shared();
  mat.uniforms = { ...u, skyGain: { value: ph.gain }, uFlash: tick.uFlash };
  mat.fragmentShader = 'uniform float skyGain;\nuniform float uFlash;\n' + mat.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'vec3 skyC = texColor * skyGain; skyC = skyC / (1.0 + max(max(skyC.r, skyC.g), skyC.b) * 0.12); gl_FragColor = vec4( skyC + uFlash * 0.08, 1.0 );');
  ctx.onUpdate((t) => (u.time.value = t));
  ctx.track(sky.geometry);
  ctx.track(mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  ctx.group.add(sky);
  return { mesh: sky, setDisc: (on) => (u.showSunDisc.value = on ? 1 : 0) };
}

function nightSky(ctx: BuildCtx): SkyResult {
  const p = ctx.p;
  const c = (n: number) => new THREE.Color(n);
  const mode = p.light ? { sun: 1, moon: 0, eclipse: 2 }[p.light.kind] : -1;
  const disc = { value: 1 };
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        ...ctx.shared(),
        uZenith: { value: c(p.zenith) },
        uHorizon: { value: c(p.horizon) },
        uGlow: { value: c(p.glow) },
        uCloudDark: { value: c(p.cloudDark) },
        uCloudLit: { value: c(p.cloudLit) },
        uClouds: { value: p.clouds },
        uStars: { value: p.stars },
        uLightDir: { value: ctx.sunDir },
        uLightSize: { value: p.light?.size ?? 0 },
        uLightColor: { value: c(p.light?.color ?? 0) },
        uMode: { value: mode },
        uDisc: disc,
        uAurora: { value: p.aurora },
        uNebula: { value: p.nebula },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uFlash, uClouds, uStars, uLightSize, uMode, uDisc, uAurora, uNebula;
        uniform vec3 uZenith, uHorizon, uGlow, uCloudDark, uCloudLit, uLightDir, uLightColor;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float az = atan(d.x, -d.z);
          vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.6, h), 0.7));
          float ang = acos(clamp(dot(d, uLightDir), -1.0, 1.0));
          col += uGlow * exp(-max(h, 0.0) * 8.0) * (0.5 + 0.6 * exp(-ang * 1.5));

          // 은하수: 기울어진 띠 안에 별이 촘촘하고 먼지가 낀다
          float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.55, 0.75))) / 0.16, 2.0));
          vec2 bp = vec2(az * 2.0, h * 4.0);
          float dust = fbm(bp * 3.0) * fbm(bp * 7.0 + 3.0);
          col += uStars * band * vec3(0.25, 0.3, 0.42) * smoothstep(0.15, 0.6, dust) * smoothstep(0.0, 0.25, h) * 0.6;

          // 별: 두 층(작고 많은 별, 크고 드문 별)
          vec2 sp = vec2(az, h) * 300.0;
          float st = hash(floor(sp));
          float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
          float star = step(0.9965 - band * 0.006, st) * twinkle;
          vec2 sp2 = vec2(az, h) * 90.0;
          float st2 = hash(floor(sp2) + 7.0);
          vec2 f2 = fract(sp2) - 0.5;
          star += step(0.995, st2) * smoothstep(0.18, 0.0, length(f2)) * 1.6 * twinkle;
          star *= smoothstep(0.02, 0.25, h) * uStars;

          // 성운
          vec2 np = vec2(az * 1.7, h * 3.2);
          float neb = fbm(np * 1.4 + vec2(uTime * 0.004, 0.0));
          vec3 nebCol = mix(vec3(0.45, 0.18, 0.55), vec3(0.15, 0.25, 0.6), fbm(np * 3.0 + 4.0));
          col += uNebula * nebCol * smoothstep(0.4, 0.8, neb) * smoothstep(-0.02, 0.15, h) * 0.9;

          // 오로라: 세로 커튼 줄무늬가 있는 띠 여러 겹
          if (uAurora > 0.0) {
            vec3 aur = vec3(0.0);
            for (int i = 0; i < 4; i++) {
              float fi = float(i);
              float y = 0.12 + 0.05 * fi + 0.035 * sin(az * 2.4 + uTime * 0.12 + fi * 1.7) + 0.03 * fbm(vec2(az * 3.0 + fi, uTime * 0.04));
              float above = h - y;
              float curtain = smoothstep(-0.01, 0.0, above) * exp(-above / (0.06 + 0.03 * fi));
              float rays = 0.45 + 0.55 * pow(fbm(vec2(az * 40.0 + fi * 3.0, uTime * 0.25)), 1.5);
              vec3 tint = mix(vec3(0.1, 1.0, 0.55), vec3(0.45, 0.35, 1.0), smoothstep(0.0, 0.18, above));
              aur += tint * curtain * rays * (0.9 - fi * 0.15);
            }
            col += aur * uAurora * 0.32;
          }

          // 달 / 일식
          float halo = 0.0;
          if (uMode >= 0.0) {
            float disk = smoothstep(uLightSize, uLightSize * 0.92, ang) * uDisc;
            halo = exp(-ang * ang / (uLightSize * uLightSize * 30.0));
            if (uMode > 1.5) {
              float corona = exp(-pow((ang - uLightSize) / (uLightSize * 0.18), 2.0));
              float streak = pow(fbm(vec2(atan(d.y - uLightDir.y, d.x - uLightDir.x) * 6.0, uTime * 0.05)), 2.0);
              col += uLightColor * (corona * 3.0 + halo * (0.5 + streak * 1.2) + exp(-ang * 4.0) * 0.25);
              col = mix(col, vec3(0.0), disk);
            } else {
              float craters = fbm(d.xy * 120.0) * 0.3;
              col += uLightColor * (halo * 0.35 + exp(-ang * 6.0) * 0.12);
              col = mix(col, uLightColor * (1.3 - craters), disk);
            }
          }

          // 구름
          vec2 cp = d.xz / (h + 0.14) * 0.55 + vec2(uTime * 0.012, uTime * 0.004);
          float c = fbm(cp * 1.1 + fbm(cp * 0.6) * 0.8);
          c = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.38, c) * smoothstep(-0.04, 0.1, h);
          float lit = clamp(halo * 1.4 + exp(-ang * 2.5) * 0.6 + fbm(cp * 2.0) * 0.3, 0.0, 1.0);
          vec3 cloudCol = mix(uCloudDark, uCloudLit, lit);
          cloudCol += uFlash * vec3(0.55, 0.6, 0.75);
          col = mix(col + star * (1.0 - c), cloudCol, c * 0.92);
          col += uFlash * 0.08;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  const mesh = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(400, 64, 32)), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  ctx.group.add(mesh);
  return { mesh, setDisc: (on) => (disc.value = on ? 1 : 0) };
}
