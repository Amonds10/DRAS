import * as THREE from 'three';
import type { BuildCtx } from './context';

/**
 * 셰이더로 그린 마법진: 동심원, 룬 글자 띠, 육망성, 바깥 눈금.
 * 가산 합성이라 어두운 하늘이나 땅 위에서 빛나는 선으로 보인다.
 */
export function magicCircleMaterial(ctx: BuildCtx, color: THREE.Color, opts: { seed?: number; spin?: number; intensity?: number } = {}): THREE.ShaderMaterial {
  return ctx.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        ...ctx.shared(),
        uColor: { value: color },
        uSeed: { value: opts.seed ?? 1 },
        uSpin: { value: opts.spin ?? 0.05 },
        uI: { value: opts.intensity ?? 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime, uSeed, uSpin, uI;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float line(float d, float w) { return smoothstep(w, 0.0, abs(d)); }
        // 선분까지 거리
        float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float w = 0.006;
          float v = 0.0;
          // 동심원
          v += line(r - 0.98, w) + line(r - 0.93, w * 0.7) + line(r - 0.72, w) + line(r - 0.66, w * 0.7) + line(r - 0.36, w);
          // 바깥 눈금(천천히 돈다)
          float ao = a + uTime * uSpin;
          float ticks = step(0.82, fract(ao / 6.2831 * 96.0)) * step(0.93, r) * step(r, 0.98);
          v += ticks * 0.8;
          // 룬 글자 띠: 칸마다 무작위 획(반대로 돈다)
          float ai = a - uTime * uSpin * 0.7;
          float cells = 36.0;
          float cell = floor((ai / 6.2831 + 0.5) * cells);
          float fx = fract((ai / 6.2831 + 0.5) * cells);
          float fy = (r - 0.72) / 0.21;
          if (fy > 0.0 && fy < 1.0) {
            vec2 c = vec2(cell, uSeed);
            float g = 0.0;
            g += step(0.45, hash(c)) * line(fy - 0.3, 0.05) * step(0.2, fx) * step(fx, 0.8);
            g += step(0.5, hash(c + 1.0)) * line(fy - 0.7, 0.05) * step(0.2, fx) * step(fx, 0.8);
            g += step(0.35, hash(c + 2.0)) * line(fx - 0.3, 0.06) * step(0.2, fy) * step(fy, 0.85);
            g += step(0.55, hash(c + 3.0)) * line(fx - 0.7, 0.06) * step(0.15, fy) * step(fy, 0.8);
            g += step(0.7, hash(c + 4.0)) * smoothstep(0.12, 0.05, length(vec2(fx - 0.5, fy - 0.5) * vec2(1.0, 1.4)));
            v += clamp(g, 0.0, 1.0) * 0.85;
          }
          // 육망성(두 삼각형)
          float ah = a + uTime * uSpin * 0.4;
          vec2 q = vec2(cos(ah), sin(ah)) * r;
          float star = 9.0;
          for (int k = 0; k < 6; k++) {
            float t0 = float(k) * 1.0472;
            vec2 v0 = 0.66 * vec2(cos(t0), sin(t0));
            vec2 v1 = 0.66 * vec2(cos(t0 + 2.0944), sin(t0 + 2.0944));
            star = min(star, seg(q, v0, v1));
          }
          v += line(star, w * 1.1) * 0.9;
          // 가운데 작은 원과 은은한 바탕
          v += line(r - 0.12, w) * 0.8;
          v += 0.05 * smoothstep(1.0, 0.0, r);
          gl_FragColor = vec4(uColor * v * uI, 1.0);
        }`,
    }),
  );
}
