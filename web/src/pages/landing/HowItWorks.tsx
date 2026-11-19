import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Bot, Lock, PenLine, Waves } from 'lucide-react';
import type { ReactNode } from 'react';

const card: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.12, duration: 0.6, ease: [0.16, 1, 0.3, 1] } }),
};

function Step({
  i,
  icon,
  title,
  body,
  children,
}: {
  i: number;
  icon: ReactNode;
  title: string;
  body: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.li
      custom={i}
      variants={card}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      className="glass group relative flex flex-col overflow-hidden p-6 transition-shadow duration-300 hover:shadow-[0_0_0_1px_var(--ps-border-strong),0_24px_60px_-24px_rgb(124_92_255/0.45)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-violet/15 blur-3xl transition-opacity duration-500 group-hover:opacity-100 sm:opacity-60"
      />
      <div className="relative mb-6 grid h-36 place-items-center rounded-xl bg-surface ring-1 ring-line">
        {children}
      </div>
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-accent font-mono text-sm font-semibold text-white">
          {i + 1}
        </span>
        <span className="text-violet" aria-hidden>
          {icon}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </motion.li>
  );
}

function PermitArt() {
  const reduced = useReducedMotion();
  const loop = reduced ? undefined : { repeat: Infinity, repeatDelay: 1.2 };
  return (
    <svg viewBox="0 0 220 120" className="h-full w-full max-w-[240px]" aria-hidden>
      <rect
        x="132"
        y="30"
        width="64"
        height="60"
        rx="12"
        fill="var(--ps-surface-solid)"
        stroke="var(--ps-cyan)"
        strokeWidth="1.5"
      />
      <circle cx="164" cy="60" r="10" fill="none" stroke="var(--ps-cyan)" strokeWidth="1.5" />
      <path d="M164 50 v20 M154 60 h20" stroke="var(--ps-cyan)" strokeWidth="1.5" opacity="0.6" />
      <motion.path
        d="M18 82 c 10 -22, 18 -22, 22 -6 s 10 14, 18 -8 s 12 -14, 16 4 s 10 8, 20 -2"
        fill="none"
        stroke="var(--ps-violet)"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: [0, 1, 1] }}
        viewport={{ once: false }}
        transition={{ duration: 2.4, times: [0, 0.5, 1], ...loop }}
      />
      <line x1="16" y1="92" x2="100" y2="92" stroke="var(--ps-border-strong)" strokeWidth="1.5" />
      <motion.circle
        r="7"
        cy="60"
        fill="var(--ps-violet)"
        initial={{ cx: 104, opacity: 0 }}
        whileInView={{ cx: [104, 104, 156], opacity: [0, 1, 0] }}
        transition={{ duration: 2.4, times: [0, 0.55, 1], ease: 'easeInOut', ...loop }}
      />
      <text x="58" y="108" textAnchor="middle" fontSize="10" fill="var(--ps-faint)" fontFamily="var(--font-mono)">
        1 signature
      </text>
    </svg>
  );
}

function StreamArt() {
  const reduced = useReducedMotion();
  const rows = [0.92, 0.7, 0.5];
  return (
    <div className="w-full max-w-[240px] space-y-3 px-4" aria-hidden>
      {rows.map((target, i) => (
        <div key={i} className="relative h-2.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
          <motion.div
            className="h-full rounded-full bg-accent"
            initial={{ width: '0%' }}
            whileInView={{ width: [`0%`, `${target * 100}%`] }}
            viewport={{ once: false }}
            transition={{
              duration: 3,
              delay: 0.25 + i * 0.2,
              ease: 'linear',
              repeat: reduced ? 0 : Infinity,
              repeatDelay: 0.8,
            }}
          />
          <span className="absolute top-0 left-[22%] h-full w-px bg-amber" />
        </div>
      ))}
      <div className="flex justify-between font-mono text-[10px] text-faint">
        <span>start</span>
        <span className="-ml-6 text-amber">cliff</span>
        <span>end</span>
      </div>
    </div>
  );
}

function AgentArt() {
  const reduced = useReducedMotion();
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-5" aria-hidden>
      <div className="relative size-24">
        <svg viewBox="0 0 96 96" className="size-full -rotate-90">
          <circle cx="48" cy="48" r={r} fill="none" stroke="var(--ps-surface-2)" strokeWidth="8" />
          <motion.circle
            cx="48"
            cy="48"
            r={r}
            fill="none"
            stroke="var(--ps-amber)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            whileInView={{ strokeDashoffset: [c, c * 0.18, c * 0.18] }}
            transition={{ duration: 3, times: [0, 0.6, 1], repeat: reduced ? 0 : Infinity, repeatDelay: 0.6 }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <Bot className="size-7 text-cyan" />
        </div>
      </div>
      <ul className="space-y-1.5 font-mono text-[11px]">
        <li className="flex items-center gap-1.5 text-muted">
          <Lock className="size-3 text-mint" /> per-stream cap
        </li>
        <li className="flex items-center gap-1.5 text-muted">
          <Lock className="size-3 text-mint" /> daily cap
        </li>
        <li className="flex items-center gap-1.5 text-muted">
          <Lock className="size-3 text-mint" /> expiry
        </li>
        <li className="flex items-center gap-1.5 text-rose">
          <Lock className="size-3" /> cancel · withdraw
        </li>
      </ul>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-2xl"
      >
        <p className="font-mono text-xs tracking-[0.2em] text-cyan uppercase">How it works</p>
        <h2 id="how-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
          Three steps from treasury to paycheck.
        </h2>
        <p className="mt-3 text-muted">
          Everything settles in a single StreamVault contract. No backend holds your money and nothing needs a cron job.
        </p>
      </motion.div>
      <ol className="mt-12 grid gap-5 md:grid-cols-3">
        <Step
          i={0}
          icon={<PenLine className="size-5" />}
          title="Fund the treasury"
          body={
            <>
              Sign one EIP-2612 permit and deposit tUSD8 in a single transaction. No separate approve step, no unlimited
              allowance left behind.
            </>
          }
        >
          <PermitArt />
        </Step>
        <Step
          i={1}
          icon={<Waves className="size-5" />}
          title="Stream payroll"
          body={
            <>
              Each salary vests linearly by the second after an optional cliff. Pay a whole team in one batch
              transaction; employees claim whenever they like.
            </>
          }
        >
          <StreamArt />
        </Step>
        <Step
          i={2}
          icon={<Bot className="size-5" />}
          title="Delegate to an AI agent"
          body={
            <>
              Grant the agent an operator key with on-chain per-stream and daily caps plus an expiry. Revoke it
              instantly. It can never cancel streams or withdraw the treasury.
            </>
          }
        >
          <AgentArt />
        </Step>
      </ol>
    </section>
  );
}
