import type { PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { ArrowUpRight, Bot } from 'lucide-react';
import { StatusChip } from '@/components/ui/Badge';
import { StreamProgress } from '@/components/ui/StreamProgress';
import { Ticker } from '@/components/ui/Ticker';
import { useChainNow } from '@/hooks/useChainNow';
import { sameAddress, statusOf, type StreamView } from '@/lib/derive';
import { fmt, fmtDuration, fmtLive, shortAddr } from '@/lib/format';
import { config } from '@/config';
import { claimableLive, progressOf } from './live';

/** Pointer-driven 3D tilt with a spring and a soft glare; flat under prefers-reduced-motion. */
function useTilt() {
  const reduced = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 20, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-9, 9]), spring);
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgb(255 255 255 / 0.09), transparent 55%)`;
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (reduced || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onPointerLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };
  return { reduced, rotateX, rotateY, glare, onPointerMove, onPointerLeave };
}

export function StreamCard({ stream, index }: { stream: StreamView; index: number }) {
  const tilt = useTilt();
  const byAgent = !sameAddress(stream.createdBy, stream.sender);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05, type: 'spring', stiffness: 260, damping: 26 }}
      style={{ perspective: 1000 }}
    >
      <Link
        to={`/claim/${stream.id}`}
        className="group block rounded-[16px] focus-visible:outline-offset-4"
        aria-label={`Open stream #${stream.id} from ${shortAddr(stream.sender)}`}
        onPointerMove={tilt.onPointerMove}
        onPointerLeave={tilt.onPointerLeave}
      >
        <motion.article
          layoutId={`stream-${stream.id}`}
          className="glass relative overflow-hidden p-5 transition-shadow duration-300 group-hover:shadow-[0_30px_80px_-30px_rgb(124_92_255/0.55)]"
          style={
            tilt.reduced ? undefined : { rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformStyle: 'preserve-3d' }
          }
          whileHover={tilt.reduced ? undefined : { y: -6, scale: 1.01 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          {!tilt.reduced && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: tilt.glare }}
            />
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 size-48 rounded-full bg-violet/15 blur-3xl"
          />
          <CardBody stream={stream} byAgent={byAgent} />
        </motion.article>
      </Link>
    </motion.div>
  );
}

function CardBody({ stream, byAgent }: { stream: StreamView; byAgent: boolean }) {
  const now = useChainNow();
  const p = progressOf(stream, now);
  const status = statusOf(stream, now);
  const left =
    stream.canceled || now >= stream.end
      ? null
      : now < stream.cliff
        ? `Cliff in ${fmtDuration(stream.cliff - now)}`
        : `${fmtDuration(stream.end - now)} left`;
  return (
    <div className="relative" style={{ transform: 'translateZ(24px)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-fg">Stream #{stream.id.toString()}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
            from <span className="font-mono">{shortAddr(stream.sender)}</span>
            {byAgent && <Bot className="size-3.5 text-violet" aria-label="created by AI agent" />}
          </p>
        </div>
        <StatusChip status={status} />
      </div>
      <p className="label mt-6">Claimable</p>
      <Ticker
        text={fmtLive(claimableLive(stream, now), 6)}
        suffix={config.tokenSymbol}
        className="mt-2 text-[1.7rem] font-semibold text-fg"
      />
      <StreamProgress
        className="mt-6"
        vestedFraction={p.vested}
        withdrawnFraction={p.withdrawn}
        cliffFraction={p.cliff}
        canceled={stream.canceled}
        label={`Stream #${stream.id} progress`}
      />
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <span className="font-mono tabular">
          {Math.min(100, p.vested * 100).toFixed(1)}% of {fmt(stream.originalTotal)}
        </span>
        <span className="inline-flex items-center gap-1 font-mono tabular">
          {left ?? 'Open'}
          <ArrowUpRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden
          />
        </span>
      </div>
    </div>
  );
}
