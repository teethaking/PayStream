import { lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import {
  ArrowRight,
  Ban,
  BookOpen,
  Gauge,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { enableBurner } from '@/lib/wallet';
import { config } from '@/config';
import { HowItWorks } from './HowItWorks';
import { LiveStats } from './LiveStats';

const FlowCanvas = lazy(() => import('./FlowCanvas'));

const HEADLINE: { text: string; accent?: boolean }[] = [
  { text: 'Payroll that' },
  { text: 'streams by the second,', accent: true },
  { text: 'with an AI agent that' },
  { text: 'physically cannot overspend.', accent: true },
];

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const word: Variants = {
  hidden: { opacity: 0, y: '0.5em', filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};
const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
});

const SAFETY = [
  { icon: KeyRound, title: 'Least privilege', body: 'The agent key can only create streams. Nothing else.' },
  { icon: Gauge, title: 'Hard caps', body: 'Per-stream and per-day limits enforced by the contract.' },
  { icon: Timer, title: 'Expiry', body: 'Every grant ends on its own at a timestamp you pick.' },
  { icon: Ban, title: 'Instant revoke', body: 'One transaction and the agent is locked out.' },
  { icon: ScrollText, title: 'Audit trail', body: 'Every stream records who created it, on-chain.' },
  { icon: Lock, title: 'Non-cancelable streams', body: 'Lock a stream so no one can ever claw it back.' },
];

function Hero() {
  const navigate = useNavigate();
  const startDemo = () => {
    enableBurner();
    navigate('/app');
  };
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-20%] left-[-10%] size-[640px] rounded-full bg-violet/20 blur-[120px]" />
        <div className="absolute right-[-10%] bottom-[-30%] size-[560px] rounded-full bg-cyan/15 blur-[120px]" />
      </div>
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-24 lg:pb-24">
        <div>
          <motion.div {...fadeUp(0)} className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber/12 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-amber ring-1 ring-amber/30 ring-inset">
              <span className="size-1.5 rounded-full bg-amber" aria-hidden />
              TESTNET
            </span>
            <span className="text-xs text-muted">QDay Aevum · chain {config.chainId}</span>
          </motion.div>
          <motion.h1
            id="hero-title"
            variants={container}
            initial="hidden"
            animate="show"
            className="mt-6 text-[2.5rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[3.5rem] xl:text-[3.75rem]"
          >
            {HEADLINE.flatMap((part, pi) =>
              part.text.split(' ').map((w, wi) => (
                <motion.span
                  key={`${pi}-${wi}`}
                  variants={word}
                  className={`mr-[0.25em] inline-block ${part.accent ? 'text-gradient' : ''}`}
                >
                  {w}
                </motion.span>
              )),
            )}
          </motion.h1>
          <motion.p {...fadeUp(0.6)} className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Fund a treasury in {config.tokenSymbol} on the QDay Aevum testnet, stream salaries that vest every second,
            and hand routine payroll to an AI agent whose spending limits live in the contract, not in a prompt.
          </motion.p>
          <motion.div {...fadeUp(0.75)} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              magnetic
              onClick={() => navigate('/app')}
              icon={<ArrowRight className="size-4" aria-hidden />}
              className="flex-row-reverse"
            >
              Launch app
            </Button>
            <Button
              size="lg"
              variant="secondary"
              magnetic
              onClick={startDemo}
              icon={<Sparkles className="size-4 text-cyan" aria-hidden />}
            >
              Try instant demo
            </Button>
          </motion.div>
          <motion.p {...fadeUp(0.9)} className="mt-4 text-xs text-faint">
            The demo creates a throwaway testnet key in your browser. No wallet extension needed.
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="glass relative h-[300px] overflow-hidden sm:h-[400px] lg:h-[480px]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_50%,var(--ps-glow-a),transparent_70%)]"
          />
          <Suspense fallback={<div className="skeleton absolute inset-4 rounded-xl" />}>
            <FlowCanvas />
          </Suspense>
          <div className="pointer-events-none absolute right-4 bottom-4 left-4 flex items-center justify-between font-mono text-[11px] text-faint">
            <span>createStreams()</span>
            <span>vesting · per second</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SafetyStrip() {
  return (
    <section aria-labelledby="safety-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-cyan uppercase">Safety in one glance</p>
          <h2 id="safety-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
            Guardrails written in Solidity.
          </h2>
        </div>
        <Link to="/docs" className="inline-flex items-center gap-1.5 text-sm text-violet hover:underline">
          Read the safety model <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-10 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SAFETY.map((s, i) => (
          <motion.li
            key={s.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: i * 0.06, duration: 0.5 }}
            whileHover={{ y: -4 }}
            className="glass group relative overflow-hidden p-5"
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
            <s.icon className="size-5 text-mint" aria-hidden />
            <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function CtaBand() {
  const navigate = useNavigate();
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="glass-strong relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-violet/25 blur-[100px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -bottom-40 size-[360px] rounded-full bg-cyan/20 blur-[100px]"
        />
        <ShieldCheck className="relative mx-auto size-8 text-cyan" aria-hidden />
        <h2 className="relative mx-auto mt-4 max-w-2xl text-3xl font-semibold sm:text-4xl">
          Start a payroll stream in <span className="text-gradient">under a minute</span>.
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-muted">
          Test tokens only. Bring a wallet or let the demo mint you a burner key.
        </p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            magnetic
            onClick={() => navigate('/app')}
            icon={<ArrowRight className="size-4" aria-hidden />}
            className="flex-row-reverse"
          >
            Launch app
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate('/docs')}
            icon={<BookOpen className="size-4" aria-hidden />}
          >
            Safety model
          </Button>
        </div>
      </motion.div>
    </section>
  );
}

export default function Landing() {
  return (
    <>
      <Hero />
      <LiveStats />
      <HowItWorks />
      <SafetyStrip />
      <CtaBand />
    </>
  );
}
