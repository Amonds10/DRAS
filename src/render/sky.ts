interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 배경 밤하늘: 옅게 반짝이는 별만 그린다. */
export function startSky(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let stars: Star[] = [];
  let w = 0;
  let h = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 6000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 0.9 + 0.3,
      base: Math.random() * 0.35 + 0.15,
      speed: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
    }));
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const tw = reducedMotion() ? 1 : 0.7 + 0.3 * Math.sin(t * 0.001 * s.speed + s.phase);
      ctx.fillStyle = `rgba(236, 232, 222, ${s.base * tw})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
}
