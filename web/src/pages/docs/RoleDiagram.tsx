import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, CircleSlash, Landmark, Lock, ShieldCheck } from 'lucide-react';
import { VAULT_ERROR_MESSAGES } from '@paystream/sdk';
import { cn } from '@/lib/cn';
import {
  ACTIONS,
  MATRIX,
  ROLES,
  SCENARIOS,
  type ActionId,
  type Kind,
  type RoleId,
  type Scenario,
  type Verdict,
} from './model';

interface Edge {
  id: ActionId;
  d: string;
  kind: Kind;
}

const kindMeta: Record<Kind, { label: string; tone: string; icon: typeof Check }> = {
  allow: { label: 'Allowed', tone: 'text-mint', icon: Check },
  scoped: { label: 'Allowed within caps', tone: 'text-cyan', icon: ShieldCheck },
  self: { label: 'Own account only', tone: 'text-muted', icon: CircleSlash },
  deny: { label: 'Reverts', tone: 'text-rose', icon: Lock },
};

export function RoleDiagram() {
  const reduced = useReducedMotion();
  const [role, setRole] = useState<RoleId>('agent');
  const [scenario, setScenario] = useState<Scenario>('ok');
  const [edges, setEdges] = useState<Edge[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const roleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const verdictOf = useCallback(
    (a: ActionId): Verdict =>
      role === 'agent' && a === 'create' ? SCENARIOS.find((s) => s.id === scenario)!.verdict : MATRIX[role][a],
    [role, scenario],
  );

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const from = roleRefs.current[role];
    if (!wrap || !from) return;
    const base = wrap.getBoundingClientRect();
    const f = from.getBoundingClientRect();
    const x0 = f.right - base.left;
    const y0 = f.top + f.height / 2 - base.top;
    setBox({ w: base.width, h: base.height });
    setEdges(
      ACTIONS.map((a) => {
        const r = rowRefs.current[a.id]!.getBoundingClientRect();
        const x1 = r.left - base.left;
        const y1 = r.top + Math.min(r.height / 2, 22) - base.top;
        const mx = (x0 + x1) / 2;
        return { id: a.id, kind: verdictOf(a.id).kind, d: `M${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}` };
      }),
    );
  }, [role, verdictOf]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const onRoleKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta =
      e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = ROLES[(i + delta + ROLES.length) % ROLES.length]!;
    setRole(next.id);
    roleRefs.current[next.id]?.focus();
  };

  const active = ROLES.find((r) => r.id === role)!;
  const allowed = ACTIONS.filter((a) => ['allow', 'scoped'].includes(verdictOf(a.id).kind)).map((a) => a.fn);
  const blocked = ACTIONS.filter((a) => verdictOf(a.id).kind === 'deny').map(
    (a) => `${a.fn} (${verdictOf(a.id).error})`,
  );

  return (
    <div className="glass relative overflow-hidden p-4 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-0 size-[420px] rounded-full bg-violet/15 blur-[100px]"
      />
      <p id="diagram-help" className="relative text-sm text-muted">
        Pick a role (click, tap, or use the arrow keys) to see what it can call on the vault.
      </p>

      <AnimatePresence initial={false}>
        {role === 'agent' && (
          <motion.fieldset
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative mt-4 overflow-hidden"
          >
            <legend className="label mb-2">Try the agent against its guardrails</legend>
            <div className="flex flex-wrap gap-2">
              {SCENARIOS.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-xs ring-1 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan',
                    scenario === s.id
                      ? s.verdict.kind === 'deny'
                        ? 'bg-rose/12 text-rose ring-rose/35'
                        : 'bg-cyan/12 text-cyan ring-cyan/35'
                      : 'text-muted ring-line hover:text-fg',
                  )}
                >
                  <input
                    type="radio"
                    name="agent-scenario"
                    className="sr-only"
                    checked={scenario === s.id}
                    onChange={() => setScenario(s.id)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </motion.fieldset>
        )}
      </AnimatePresence>

      <div
        ref={wrapRef}
        className="relative mt-6 grid grid-cols-[minmax(92px,0.8fr)_minmax(24px,0.5fr)_minmax(0,2fr)] items-center sm:grid-cols-[minmax(150px,1fr)_minmax(48px,0.6fr)_minmax(0,2fr)]"
      >
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={box.w} height={box.h} aria-hidden>
          <defs>
            <linearGradient id="edge-ok" gradientUnits="userSpaceOnUse" x1="0" x2={box.w} y1="0" y2="0">
              <stop offset="0" stopColor="var(--ps-violet)" />
              <stop offset="1" stopColor="var(--ps-cyan)" />
            </linearGradient>
            <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {edges.map((e) => {
            const ok = e.kind === 'allow' || e.kind === 'scoped';
            return (
              <g key={`${role}-${e.id}`}>
                <motion.path
                  d={e.d}
                  fill="none"
                  stroke={ok ? 'url(#edge-ok)' : e.kind === 'deny' ? 'var(--ps-rose)' : 'var(--ps-border-strong)'}
                  strokeWidth={ok ? 2 : 1.5}
                  strokeOpacity={ok ? 1 : e.kind === 'deny' ? 0.55 : 0.9}
                  strokeDasharray={ok ? undefined : '4 6'}
                  filter={ok ? 'url(#edge-glow)' : undefined}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
                {ok && !reduced && (
                  <motion.path
                    d={e.d}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={0.8}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="2 18"
                    animate={{ strokeDashoffset: [40, 0] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <div
          role="radiogroup"
          aria-label="Role"
          aria-describedby="diagram-help"
          className="relative z-10 flex flex-col gap-3"
        >
          {ROLES.map((r, i) => {
            const on = r.id === role;
            return (
              <button
                key={r.id}
                ref={(el) => {
                  roleRefs.current[r.id] = el;
                }}
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setRole(r.id)}
                onFocus={() => setRole(r.id)}
                onKeyDown={(e) => onRoleKey(e, i)}
                className={cn(
                  'relative flex items-center gap-2 rounded-xl px-2.5 py-3 text-left text-xs font-medium ring-1 transition-colors sm:gap-3 sm:px-4 sm:text-sm',
                  on ? 'bg-surface-solid text-fg ring-violet/60' : 'bg-surface text-muted ring-line hover:text-fg',
                )}
              >
                {on && (
                  <motion.span
                    layoutId="role-glow"
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-xl shadow-[0_0_32px_-4px_rgb(124_92_255/0.6)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <r.icon className={cn('size-4 shrink-0', on ? 'text-violet' : '')} aria-hidden />
                {r.label}
              </button>
            );
          })}
        </div>

        <div aria-hidden />

        <div className="relative z-10 rounded-2xl bg-surface-solid/80 p-3 ring-1 ring-line-strong sm:p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px -z-10 rounded-2xl bg-accent opacity-20 blur-xl"
          />
          <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
            <Landmark className="size-4 text-cyan" aria-hidden /> StreamVault
          </div>
          <ul className="space-y-2">
            {ACTIONS.map((a) => {
              const v = verdictOf(a.id);
              const m = kindMeta[v.kind];
              return (
                <li
                  key={a.id}
                  ref={(el) => {
                    rowRefs.current[a.id] = el;
                  }}
                  className={cn(
                    'rounded-xl px-3 py-2 ring-1 transition-colors duration-300',
                    v.kind === 'deny'
                      ? 'bg-rose/8 ring-rose/25'
                      : v.kind === 'self'
                        ? 'bg-surface ring-line'
                        : 'bg-cyan/8 ring-cyan/25',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <code className="font-mono text-[11px] break-words text-fg sm:text-xs">{a.fn}</code>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={`${v.kind}-${v.error ?? ''}`}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        className={cn('flex shrink-0 items-center gap-1 text-[11px] font-medium', m.tone)}
                      >
                        <m.icon className="size-3.5" aria-hidden />
                        <span className="hidden sm:inline">{m.label}</span>
                        <span className="sr-only sm:hidden">{m.label}</span>
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted sm:text-xs">{v.note}</p>
                  {v.error && (
                    <p className={cn('mt-1 text-[11px] sm:text-xs', v.kind === 'deny' ? 'text-rose' : 'text-amber')}>
                      <code className="font-mono">{v.error}</code>
                      <span className="text-muted"> · {VAULT_ERROR_MESSAGES[v.error].title}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="relative mt-5 text-sm text-muted">
        <span className="font-medium text-fg">{active.label}:</span> {active.blurb}
      </p>
      <p className="sr-only" aria-live="polite">
        {active.label} selected. Can call: {allowed.join(', ') || 'nothing'}. Blocked: {blocked.join(', ') || 'nothing'}
        .
      </p>
    </div>
  );
}
