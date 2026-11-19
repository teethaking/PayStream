import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

interface Pt {
  x: number;
  y: number;
}

interface Particle {
  path: number;
  t: number;
  speed: number;
  size: number;
  offset: number;
  depth: number;
}

interface Palette {
  violet: string;
  cyan: string;
  text: string;
  muted: string;
  line: string;
  surface: string;
  light: boolean;
}

const EMPLOYEES = ['Ada', 'Kofi', 'Mei', 'Luis', 'Noor', 'Ivan'];

function toHex(color: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    violet: toHex(v('--ps-violet'), '#7c5cff'),
    cyan: toHex(v('--ps-cyan'), '#22d3ee'),
    text: v('--ps-text') || '#eef0f8',
    muted: v('--ps-muted') || '#a0a6ba',
    line: v('--ps-border-strong') || 'rgba(255,255,255,0.12)',
    surface: v('--ps-surface-solid') || '#10121a',
    light: document.documentElement.dataset.theme === 'light',
  };
}

function particleBudget(width: number) {
  const cores = navigator.hardwareConcurrency || 4;
  const base = cores >= 8 ? 150 : cores >= 4 ? 100 : 56;
  return Math.round(width < 640 ? base * 0.45 : width < 1024 ? base * 0.75 : base);
}

const bezier = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
};

const bezierTangent = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
};

/**
 * Hero illustration: tUSD8 "coins" stream from one employer node to several employees along bezier curves.
 * DPR-aware, particle budget scaled to the device, pointer parallax across three depth layers,
 * paused while the tab is hidden or the hero is off-screen. Static SVG under prefers-reduced-motion.
 */
export default function FlowCanvas() {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let palette = readPalette();
    let particles: Particle[] = [];
    let employees: Pt[] = [];
    let employer: Pt = { x: 0, y: 0 };
    let pulses: number[] = [];
    let raf = 0;
    let last = 0;
    let visible = true;
    let mobile = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const curve = (i: number, shift: Pt) => {
      const e = employees[i]!;
      const p0 = { x: employer.x + shift.x, y: employer.y + shift.y };
      const p3 = { x: e.x + shift.x, y: e.y + shift.y };
      const span = p3.x - p0.x;
      return [p0, { x: p0.x + span * 0.42, y: p0.y }, { x: p3.x - span * 0.42, y: p3.y }, p3] as const;
    };

    const spawn = (scatter: boolean): Particle => ({
      path: Math.floor(Math.random() * employees.length),
      t: scatter ? Math.random() : 0,
      speed: 0.08 + Math.random() * 0.12,
      size: 1.8 + Math.random() * 2.4,
      offset: (Math.random() - 0.5) * (mobile ? 10 : 16),
      depth: Math.random(),
    });

    const layout = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      mobile = w < 520;
      const count = mobile ? 4 : EMPLOYEES.length;
      employer = { x: w * (mobile ? 0.15 : 0.14), y: h * 0.5 };
      employees = Array.from({ length: count }, (_, i) => ({
        x: w * (mobile ? 0.78 : 0.82),
        y: h * (0.14 + (0.72 * i) / (count - 1)),
      }));
      pulses = employees.map(() => 0);
      particles = Array.from({ length: particleBudget(w) }, () => spawn(true));
    };

    const drawNode = (p: Pt, r: number, color: string, glow: number) => {
      const outer = r * (3 + glow * 2);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outer);
      g.addColorStop(0, color + (palette.light ? '40' : '66'));
      g.addColorStop(1, color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.surface;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5 + glow * 1.5;
      ctx.strokeStyle = color;
      ctx.stroke();
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (time - last) / 1000 : 0.016);
      last = time;
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
      const shift = (d: number): Pt => ({ x: pointer.x * d, y: pointer.y * d });

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const bg = shift(-6);
      ctx.fillStyle = palette.line;
      for (let x = 12; x < w; x += 28) {
        for (let y = 12; y < h; y += 28) ctx.fillRect(x + bg.x, y + bg.y, 1.2, 1.2);
      }

      const mid = shift(10);
      ctx.lineCap = 'round';
      employees.forEach((_, i) => {
        const [p0, p1, p2, p3] = curve(i, mid);
        const grad = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
        grad.addColorStop(0, palette.violet + '66');
        grad.addColorStop(1, palette.cyan + '66');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        ctx.stroke();
      });

      ctx.globalCompositeOperation = palette.light ? 'source-over' : 'lighter';
      for (const p of particles) {
        p.t += p.speed * dt;
        if (p.t >= 1) {
          pulses[p.path] = Math.min(1, pulses[p.path]! + 0.35);
          Object.assign(p, spawn(false));
          continue;
        }
        const s = shift(10 + p.depth * 12);
        const [p0, p1, p2, p3] = curve(p.path, s);
        const pos = bezier(p0, p1, p2, p3, p.t);
        const tan = bezierTangent(p0, p1, p2, p3, p.t);
        const len = Math.hypot(tan.x, tan.y) || 1;
        const spread = Math.sin(p.t * Math.PI);
        const x = pos.x + (-tan.y / len) * p.offset * spread;
        const y = pos.y + (tan.x / len) * p.offset * spread;
        const fade = Math.min(1, p.t * 8, (1 - p.t) * 8);
        const size = p.size * (0.7 + p.depth * 0.6);
        ctx.fillStyle = p.t < 0.5 ? palette.violet : palette.cyan;

        ctx.globalAlpha = fade * 0.3;
        ctx.beginPath();
        ctx.arc(x - (tan.x / len) * size * 2.2, y - (tan.y / len) * size * 2.2, size * 0.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = fade * (0.55 + p.depth * 0.45);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      const node = shift(10);
      const breath = (Math.sin(time / 700) + 1) / 2;
      const ep = { x: employer.x + node.x, y: employer.y + node.y };
      drawNode(ep, mobile ? 14 : 18, palette.violet, breath * 0.6);
      ctx.font = `600 ${mobile ? 11 : 12}px "Inter Variable", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.text;
      ctx.fillText('Employer', ep.x, ep.y + (mobile ? 32 : 40));

      ctx.font = `500 ${mobile ? 10 : 11}px "Inter Variable", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      employees.forEach((e, i) => {
        pulses[i] = Math.max(0, pulses[i]! - dt * 1.4);
        const p = { x: e.x + node.x, y: e.y + node.y };
        drawNode(p, mobile ? 8 : 10, palette.cyan, pulses[i]!);
        ctx.fillStyle = palette.muted;
        ctx.fillText(EMPLOYEES[i]!, p.x + (mobile ? 14 : 18), p.y + 4);
      });
    };

    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    layout();
    start();

    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    io.observe(wrap);
    const mo = new MutationObserver(() => (palette = readPalette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduced]);

  return (
    <div
      ref={wrapRef}
      className="relative size-full"
      role="img"
      aria-label="Illustration: payroll coins streaming continuously from one employer to several employees"
    >
      {reduced ? <StaticFlow /> : <canvas ref={canvasRef} className="absolute inset-0 size-full" />}
    </div>
  );
}

function StaticFlow() {
  const ys = [60, 124, 188, 252, 316];
  return (
    <svg viewBox="0 0 480 376" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id="sf-line" x1="0" x2="1">
          <stop offset="0" stopColor="var(--ps-violet)" />
          <stop offset="1" stopColor="var(--ps-cyan)" />
        </linearGradient>
        <radialGradient id="sf-glow">
          <stop offset="0" stopColor="var(--ps-violet)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--ps-violet)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="68" cy="188" r="80" fill="url(#sf-glow)" />
      {ys.map((y) => (
        <g key={y}>
          <path
            d={`M68 188 C 210 188, 250 ${y}, 392 ${y}`}
            fill="none"
            stroke="url(#sf-line)"
            strokeWidth="2"
            strokeOpacity="0.7"
          />
          {[0.3, 0.55, 0.8].map((t) => (
            <circle
              key={t}
              cx={68 + (392 - 68) * t}
              cy={188 + (y - 188) * (t * t * (3 - 2 * t))}
              r="3"
              fill="var(--ps-cyan)"
            />
          ))}
          <circle cx="392" cy={y} r="9" fill="var(--ps-surface-solid)" stroke="var(--ps-cyan)" strokeWidth="2" />
        </g>
      ))}
      <circle cx="68" cy="188" r="18" fill="var(--ps-surface-solid)" stroke="var(--ps-violet)" strokeWidth="2" />
      <text x="68" y="230" textAnchor="middle" fill="var(--ps-text)" fontSize="12" fontWeight="600">
        Employer
      </text>
    </svg>
  );
}
