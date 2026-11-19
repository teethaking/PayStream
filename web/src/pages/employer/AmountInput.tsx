import { useEffect, type Ref } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { parseAmount } from '@paystream/sdk';
import { Field } from '@/components/ui/Field';
import { fmt } from '@/lib/format';

/** Validates a human amount against an optional ceiling. Empty input is not an error until submit. */
export function checkAmount(
  raw: string,
  max: bigint | undefined,
  maxLabel: string,
): { value?: bigint; error?: string } {
  if (!raw.trim()) return {};
  try {
    const value = parseAmount(raw);
    if (value === 0n) return { error: 'Amount must be greater than zero' };
    if (max !== undefined && value > max) return { value, error: `More than ${maxLabel} (${fmt(max)} tUSD8)` };
    return { value };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function AmountInput({
  id,
  label,
  value,
  onChange,
  onMax,
  error,
  hint,
  inputRef,
  shakeKey,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  error?: string;
  hint?: React.ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  shakeKey?: number;
}) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (shakeKey) void controls.start({ x: [0, -7, 7, -5, 5, -2, 0], transition: { duration: 0.42 } });
  }, [shakeKey, controls]);
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <motion.div animate={controls} className="relative">
        <input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          className="input h-12 pr-32 font-mono text-lg tabular"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
          <span className="text-xs text-faint" aria-hidden>
            tUSD8
          </span>
          {onMax && (
            <button
              type="button"
              onClick={onMax}
              className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold text-violet ring-1 ring-line transition hover:ring-violet/40"
              aria-label={`Use maximum for ${label.toLowerCase()}`}
            >
              Max
            </button>
          )}
        </div>
      </motion.div>
    </Field>
  );
}
