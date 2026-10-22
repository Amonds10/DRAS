import * as THREE from 'three';
import type { BuildCtx } from './context';
import { NOISE_GLSL } from './glsl';

/**
 * 일러스트풍 하늘: 세 색 그라데이션에 살짝 끊어지는 색 띠, 두 톤 구름,
 * 촘촘한 별(반짝이는 십자 별 포함), 별의 강, 성운, 오로라, 작고 또렷한 해·달·일식.
 */
export function buildSky(ctx: BuildCtx): THREE.Mesh {
  const p = ctx.p;
  const c = (n: number) => new THREE.Color(n);
  const mode = p.light ? { sun: 1, moon: 0, eclipse: 2 }[p.light.kind] : -1;
  const mat = ctx.track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        ...ctx.shared(),
        uZenith: { value: c(p.sky.zenith) },
        uMid: { value: c(p.sky.mid) },
        uHorizon: { value: c(p.sky.horizon) },
        uGlow: { value: c(p.sky.glow) },
        uCloudDark: { value: c(p.cloudDark) },
        uCloudLit: { value: c(p.cloudLit) },
        uClouds: { value: p.clouds },
        uStars: { value: p.stars },
        uRiver: { value: p.starRiver },
        uLightDir: { value: ctx.sunDir },
        uLightSize: { value: p.light?.size ?? 0 },
        uLightColor: { value: c(p.light?.color ?? 0) },
        uMode: { value: mode },
        uAurora: { value: p.aurora },
        uNebula: { value: p.nebula },
        uArc: { value: c(p.arcana.color) },
        uArc2: { value: c(p.arcana.accent) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uFlash, uClouds, uStars, uRiver, uLightSize, uMode, uAurora, uNebula;
        uniform vec3 uZenith, uMid, uHorizon, uGlow, uCloudDark, uCloudLit, uLightDir, uLightColor, uArc, uArc2;
        varying vec3 vDir;
        ${NOISE_GLSL}

        // 십자 모양으로 빛나는 별 하나(격자 칸 안)
        float sparkle(vec2 f, float size) {
          vec2 a = abs(f);
          float core = smoothstep(size, 0.0, length(f));
          float cross = smoothstep(size * 0.18, 0.0, a.x) * smoothstep(size * 3.2, 0.0, a.y)
                      + smoothstep(size * 0.18, 0.0, a.y) * smoothstep(size * 3.2, 0.0, a.x);
          return core + cross * 0.55;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float az = atan(d.x, -d.z);

          // 그라데이션: 지평선 → 중간 → 천정. 색 띠가 살짝 보이도록 계단과 섞는다.
          float t = clamp(h, 0.0, 1.0);
          float g1 = smoothstep(0.0, 0.13, t);
          float g2 = smoothstep(0.1, 0.55, t);
          vec3 smoothCol = mix(mix(uHorizon, uMid, g1), uZenith, g2);
          float steps = floor(pow(t, 0.6) * 9.0) / 9.0;
          vec3 bandCol = mix(mix(uHorizon, uMid, smoothstep(0.0, 0.5, steps)), uZenith, smoothstep(0.45, 1.0, steps));
          vec3 col = mix(smoothCol, bandCol, 0.28);
          if (h < 0.0) col = mix(uHorizon, uMid * 0.5, smoothstep(0.0, -0.2, h));

          float ang = acos(clamp(dot(d, uLightDir), -1.0, 1.0));
          // 지평선 빛: 광원 쪽으로 조금 더 진하게(좁게)
          col += uGlow * exp(-max(h, 0.0) * 18.0) * (0.2 + 0.4 * exp(-ang * 3.0));

          // 하늘 밝기에 따라 별이 보이는 정도
          float lum = dot(col, vec3(0.3, 0.55, 0.15));
          float starVis = uStars * smoothstep(0.8, 0.1, lum) * smoothstep(0.015, 0.07, h);

          // 별의 강: 기울어진 띠, 먼지와 빛 알갱이
          vec3 bandN = normalize(vec3(0.42, 0.62, 0.66));
          float bd = dot(d, bandN);
          float band = exp(-pow(bd / 0.17, 2.0));
          vec2 bp = vec2(az * 3.0, h * 6.0);
          float dust = fbm(bp * 2.0 + vec2(uTime * 0.003, 0.0));
          float lanes = smoothstep(0.35, 0.75, fbm(bp * 4.0 + 7.0));
          vec3 riverCol = mix(uArc2, uArc, smoothstep(0.3, 0.8, fbm(bp * 1.3 + 3.0)));
          col += riverCol * band * (dust * 0.55 + 0.1) * (1.0 - lanes * 0.6) * uRiver * starVis * 0.9;

          // 성운
          vec2 np = vec2(az * 1.6, h * 3.0);
          float neb = fbm(np * 1.4 + vec2(uTime * 0.004, 0.0));
          vec3 nebCol = mix(uArc2 * 0.8, vec3(0.45, 0.2, 0.6), fbm(np * 3.0 + 4.0));
          col += uNebula * nebCol * smoothstep(0.45, 0.85, neb) * smoothstep(0.05, 0.3, h) * 0.7;

          // 별: 잔별(많이), 중간 별, 십자 별(드물게, 색 있음)
          vec2 sp = vec2(az * 1.0, h) * 340.0;
          float s1 = hash(floor(sp));
          float tw = 0.65 + 0.35 * sin(uTime * (1.5 + s1 * 3.0) + s1 * 60.0);
          float stars = step(0.993 - band * 0.012 * uRiver, s1) * tw * 0.8;
          vec2 sp2 = vec2(az, h) * 110.0;
          vec2 c2 = floor(sp2);
          float s2 = hash(c2 + 3.1);
          vec2 f2 = fract(sp2) - 0.5 - (vec2(hash(c2 + 1.0), hash(c2 + 2.0)) - 0.5) * 0.6;
          stars += step(0.965, s2) * smoothstep(0.12, 0.0, length(f2)) * (0.6 + 0.4 * sin(uTime * 2.0 + s2 * 40.0));
          vec2 sp3 = vec2(az, h) * 34.0;
          vec2 c3 = floor(sp3);
          float s3 = hash(c3 + 9.7);
          vec2 f3 = fract(sp3) - 0.5 - (vec2(hash(c3 + 4.0), hash(c3 + 5.0)) - 0.5) * 0.5;
          float big = step(0.93, s3) * sparkle(f3, 0.05) * (0.7 + 0.3 * sin(uTime * 1.3 + s3 * 70.0));
          vec3 tint = mix(vec3(0.75, 0.85, 1.0), mix(uArc, vec3(1.0), 0.4), step(0.5, hash(c3 + 11.0)));
          vec3 starCol = vec3(stars) + tint * big * 1.4;

          // 오로라: 커튼 줄무늬 띠
          if (uAurora > 0.0) {
            vec3 aur = vec3(0.0);
            for (int i = 0; i < 4; i++) {
              float fi = float(i);
              float y = 0.13 + 0.05 * fi + 0.035 * sin(az * 2.4 + uTime * 0.12 + fi * 1.7) + 0.03 * fbm(vec2(az * 3.0 + fi, uTime * 0.04));
              float above = h - y;
              float curtain = smoothstep(-0.01, 0.0, above) * exp(-above / (0.06 + 0.03 * fi));
              float rays = 0.45 + 0.55 * pow(fbm(vec2(az * 40.0 + fi * 3.0, uTime * 0.25)), 1.5);
              vec3 tintA = mix(vec3(0.1, 1.0, 0.6), vec3(0.5, 0.4, 1.0), smoothstep(0.0, 0.18, above));
              aur += tintA * curtain * rays * (0.9 - fi * 0.15);
            }
            col += aur * uAurora * 0.3;
          }

          // 해·달·일식: 원반은 작고 또렷하게, 번짐은 좁게
          float halo = 0.0;
          if (uMode >= 0.0) {
            float disk = smoothstep(uLightSize, uLightSize * 0.85, ang);
            halo = exp(-ang * ang / (uLightSize * uLightSize * 9.0));
            float ring = exp(-pow((ang - uLightSize * 2.4) / (uLightSize * 0.18), 2.0)) * 0.25;
            if (uMode > 1.5) {
              float corona = exp(-pow((ang - uLightSize) / (uLightSize * 0.14), 2.0));
              float streak = pow(fbm(vec2(atan(d.y - uLightDir.y, d.x - uLightDir.x) * 7.0, uTime * 0.05)), 2.0);
              col += uLightColor * (corona * 2.2 + halo * (0.35 + streak * 0.8) + ring);
              col = mix(col, vec3(0.02, 0.0, 0.01), disk);
            } else if (uMode > 0.5) {
              col += uLightColor * (halo * 0.7 + ring);
              col = mix(col, uLightColor * 1.6 + 0.4, disk);
            } else {
              float craters = fbm(d.xy * 160.0) * 0.25;
              col += uLightColor * (halo * 0.35 + ring * 0.8);
              col = mix(col, uLightColor * (1.25 - craters), disk);
            }
          }

          // 셀 구름: 경계가 또렷한 두 톤, 해 쪽 가장자리에 밝은 테
          vec2 cp = d.xz / (h + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
          float n = fbm(cp * 1.1 + fbm(cp * 0.6) * 0.8);
          float th = 1.0 - uClouds;
          float cmask = smoothstep(th, th + 0.02, n) * smoothstep(0.01, 0.05, h) * smoothstep(0.3, 0.08, h);
          float shade = step(th + 0.07, fbm(cp * 1.1 + vec2(0.05, -0.04) + fbm(cp * 0.6) * 0.8));
          float toward = exp(-ang * 1.6);
          vec3 cloudCol = mix(uCloudLit, uCloudDark, shade * (1.0 - toward * 0.6));
          float rim = smoothstep(th, th + 0.02, n) - smoothstep(th + 0.02, th + 0.05, n);
          cloudCol += uLightColor * rim * toward * 0.8;
          cloudCol += uFlash * vec3(0.55, 0.6, 0.75);
          col = mix(col + starCol * starVis * (1.0 - cmask), cloudCol, cmask * 0.85);
          col += uFlash * 0.08;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  const mesh = new THREE.Mesh(ctx.track(new THREE.SphereGeometry(400, 64, 32)), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  ctx.group.add(mesh);
  return mesh;
}
