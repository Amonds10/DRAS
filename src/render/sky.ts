interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
  hue: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 배경 밤하늘: 반짝이는 별, 느린 흐름, 가끔 떨어지는 유성. */
export function startSky(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let stars: Star[] = [];
  let meteors: Meteor[] = [];
  let w = 0;
  let h = 0;
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round((w * h) / 3400);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() < 0.92 ? Math.random() * 0.9 + 0.25 : Math.random() * 1.4 + 1,
      base: Math.random() * 0.6 + 0.25,
      speed: Math.random() * 1.6 + 0.4,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.3 ? 40 : Math.random() < 0.4 ? 20 : 210,
    }));
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const drift = reducedMotion() ? 0 : t * 0.0015;
    for (const s of stars) {
      const tw = reducedMotion() ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.speed + s.phase);
      const a = s.base * tw;
      const x = (s.x + drift * s.r) % w;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${s.hue}, 60%, 86%, ${a})`;
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.2) {
        ctx.fillStyle = `hsla(${s.hue}, 90%, 85%, ${a * 0.12})`;
        ctx.beginPath();
        ctx.arc(x, s.y, s.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!reducedMotion() && Math.random() < 0.004 && meteors.length < 2) {
      meteors.push({ x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, vx: -6 - Math.random() * 4, vy: 2.5 + Math.random() * 2, life: 1 });
    }
    meteors = meteors.filter((m) => m.life > 0);
    for (const m of meteors) {
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
      grad.addColorStop(0, `rgba(255,240,210,${m.life})`);
      grad.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
      ctx.stroke();
      m.x += m.vx;
      m.y += m.vy;
      m.life -= 0.012;
    }
    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
}
