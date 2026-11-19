import type { Options } from 'canvas-confetti';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Success burst in brand colours. Lazy-loaded so it never weighs on first paint. */
export async function celebrate(origin?: { x: number; y: number }) {
  if (reduced()) return;
  const { default: confetti } = await import('canvas-confetti');
  const base: Options = { origin: origin ?? { x: 0.5, y: 0.35 }, colors: ['#7C5CFF', '#22D3EE', '#34D399', '#ffffff'], disableForReducedMotion: true };
  confetti({ ...base, particleCount: 90, spread: 70, startVelocity: 42, scalar: 0.9 });
  setTimeout(() => confetti({ ...base, particleCount: 50, spread: 110, startVelocity: 28, scalar: 0.7 }), 160);
}
