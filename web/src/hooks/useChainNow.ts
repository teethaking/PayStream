import { useEffect, useState } from 'react';
import { useEvents } from '@/lib/events';
import { useReducedMotion } from 'framer-motion';

/**
 * Chain-aligned time in seconds (float), updated every animation frame while the tab is visible.
 * Interpolates locally and is re-anchored to the latest block timestamp by the event poller.
 */
export function useChainNow(fps: 'frame' | 'second' = 'frame') {
  const offset = useEvents((s) => s.chainOffset);
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now() / 1000 + offset);
  useEffect(() => {
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now() / 1000 + offset);
    if (fps === 'second' || reduced) {
      timer = setInterval(tick, 1000);
    } else {
      const loop = () => {
        if (!document.hidden) tick();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    tick();
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
    };
  }, [offset, fps, reduced]);
  return now;
}

/** Wall-clock seconds aligned to the chain, ticking once per second. */
export const useChainSeconds = () => Math.floor(useChainNow('second'));
