import { memo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';

const DIGITS = '0123456789';

const Digit = memo(function Digit({ d, still }: { d: number; still: boolean }) {
  return (
    <span className="relative inline-block h-[1em] overflow-hidden align-top" style={{ width: '0.62em' }} aria-hidden>
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${d}em)`,
          transition: still ? 'none' : 'transform 420ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {DIGITS.split('').map((c) => (
          <span key={c} className="block h-[1em] leading-none">
            {c}
          </span>
        ))}
      </span>
    </span>
  );
});

/**
 * Odometer-style number. `text` is an already formatted string ("1,234.567891"); each digit rolls independently.
 * Screen readers get the plain text once via aria-label (live updates are not announced every frame).
 * The last `instantTail` digits (the fraction, by default) change faster than a roll can finish, so they snap instead of smearing.
 */
export function Ticker({
  text,
  className,
  suffix,
  instantTail = 6,
}: {
  text: string;
  className?: string;
  suffix?: string;
  instantTail?: number;
}) {
  const reduced = useReducedMotion();
  const digitCount = text.replace(/\D/g, '').length;
  let seen = 0;
  return (
    <span
      className={cn('inline-flex items-baseline font-mono tabular leading-none', className)}
      aria-label={`${text}${suffix ? ' ' + suffix : ''}`}
      role="text"
    >
      {text.split('').map((c, i) =>
        /\d/.test(c) ? (
          <Digit key={i} d={Number(c)} still={Boolean(reduced) || ++seen > digitCount - instantTail} />
        ) : (
          <span
            key={i}
            aria-hidden
            className="inline-block leading-none"
            style={{ width: c === ',' || c === '.' ? '0.32em' : undefined }}
          >
            {c}
          </span>
        ),
      )}
      {suffix && (
        <span aria-hidden className="ml-2 font-sans text-[0.45em] font-medium text-muted">
          {suffix}
        </span>
      )}
    </span>
  );
}
