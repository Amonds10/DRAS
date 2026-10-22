import * as THREE from 'three';
import type { BuildCtx } from './context';
import { fbm2, lcg, ridged2 } from './noise';

/**
 * 먼 능선 실루엣 층. 일러스트 배경처럼 색이 한 단계씩 옅어지는 판을 겹쳐 깊이를 만든다.
 * 가까운 층일수록 진하고, 위쪽 가장자리에는 광원 쪽으로 얇은 빛 테가 생긴다.
 */
export function buildLayers(ctx: BuildCtx): void {
  const p = ctx.p;
  if (!p.layers.length) return;
  const rand = lcg(ctx.id.length * 71 + 9);
  const n = p.layers.length;
  p.layers.forEach((hex, i) => {
    const k = n === 1 ? 1 : i / (n - 1); // 0 먼 층 → 1 가까운 층
    const z = -340 + k * 130;
    const base = 6 + k * 2;
    const amp = { coast: 26, meadow: 22, dunes: 18, snowfield: 60, skyruins: 30, neon: 0 }[p.scenery] * (1 - k * 0.35);
    const seg = 360;
    const geo = new THREE.PlaneGeometry(1100, 1, seg, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const off = rand() * 100;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      if (pos.getY(v) < 0) {
        pos.setY(v, -40);
        continue;
      }
      let hgt: number;
      switch (p.scenery) {
        case 'snowfield':
          hgt = Math.pow(ridged2(x * 0.006 + off, k * 3, 5, 3), 1.6) * amp;
          break;
        case 'dunes':
          hgt = (Math.abs(Math.sin(x * 0.012 + off + fbm2(x * 0.004, k, 3, 4) * 3)) * 0.7 + fbm2(x * 0.01, off, 3, 5) * 0.3) * amp;
          break;
        case 'meadow': {
          // 완만한 언덕 위에 숲 실루엣(둥근 나무 꼭대기들)
          const hill = fbm2(x * 0.005 + off, k, 4, 6) * amp;
          const crowns = Math.pow(Math.abs(Math.sin(x * (0.35 - k * 0.12) + off)), 0.5) * (2.5 + k * 2) * (fbm2(x * 0.02, off, 2, 7) > 0.42 ? 1 : 0.2);
          hgt = hill + crowns;
          break;
        }
        default:
          hgt = (ridged2(x * 0.007 + off, k * 2, 4, 8) * 0.6 + fbm2(x * 0.01, off, 3, 9) * 0.4) * amp;
      }
      pos.setY(v, base + hgt);
    }
    const mat = ctx.track(
      new THREE.ShaderMaterial({
        fog: false,
        uniforms: {
          uCol: { value: new THREE.Color(hex) },
          uHaze: { value: new THREE.Color(p.sky.horizon) },
          uRim: { value: new THREE.Color(p.light?.color ?? p.arcana.color) },
          uSun: { value: ctx.sunDir },
          uTop: { value: base + amp },
          uNear: { value: k },
        },
        vertexShader: /* glsl */ `
          varying float vY; varying vec3 vWorld;
          void main() { vY = position.y; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCol, uHaze, uRim, uSun; uniform float uTop, uNear;
          varying float vY; varying vec3 vWorld;
          void main() {
            // 아래로 갈수록 지평선 안개 색에 잠긴다
            float mist = smoothstep(uTop * 0.55, -4.0, vY) * (0.75 - uNear * 0.35);
            vec3 col = mix(uCol, uHaze, mist);
            // 광원 쪽 위 가장자리 빛 테(아주 얇게)
            vec3 v = normalize(vWorld - cameraPosition);
            float toward = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0), 8.0);
            col += uRim * toward * 0.12 * (1.0 - uNear * 0.5);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    const mesh = new THREE.Mesh(ctx.track(geo), mat);
    mesh.position.set(0, 0, z);
    mesh.renderOrder = -5;
    ctx.group.add(mesh);
  });
}
