import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Reveals text character by character; instant under reduced motion. Screen readers get the full text once. */
export function TypeText({ text, onDone }: { text: string; onDone?: () => void }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? text.length : 0);
  const done = useRef(onDone);
  useEffect(() => {
    if (reduced) {
      done.current?.();
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i += 2;
      setN(Math.min(i, text.length));
      if (i >= text.length) {
        clearInterval(t);
        done.current?.();
      }
    }, 16);
    return () => clearInterval(t);
  }, [text, reduced]);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, n)}
        {n < text.length && (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-cyan" />
        )}
      </span>
    </>
  );
}
