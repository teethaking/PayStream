import { StreamProgress } from '@/components/ui/StreamProgress';
import type { StreamView } from '@/lib/derive';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { progressOf } from './live';

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** Start / cliff / end markers with a "now" needle that moves with chain time. */
export function ScheduleTimeline({ stream, now }: { stream: StreamView; now: number }) {
  const p = progressOf(stream, now);
  const stopAt = stream.canceled && stream.canceledAt ? stream.canceledAt : now;
  const needle = Math.min(1, Math.max(0, (stopAt - stream.start) / Math.max(1, stream.end - stream.start)));
  const hasCliff = stream.cliff > stream.start;
  const marks = [
    { label: 'Start', at: stream.start, tone: 'bg-violet', reached: now >= stream.start },
    ...(hasCliff ? [{ label: 'Cliff', at: stream.cliff, tone: 'bg-amber', reached: now >= stream.cliff }] : []),
    { label: 'End', at: stream.end, tone: 'bg-cyan', reached: now >= stream.end },
  ];
  return (
    <div>
      <div className="relative pt-9">
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 flex flex-col items-center"
          style={{ left: `${needle * 100}%`, transform: 'translateX(-50%)' }}
        >
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ring-1',
              stream.canceled ? 'bg-rose/15 text-rose ring-rose/30' : 'bg-surface-solid text-fg ring-line-strong',
            )}
            style={{ transform: `translateX(${(0.5 - needle) * 70}%)` }}
          >
            {stream.canceled ? 'Canceled' : 'Now'}
          </span>
          <span className={cn('mt-1 w-px flex-1', stream.canceled ? 'bg-rose/60' : 'bg-fg/40')} />
        </div>
        <StreamProgress
          vestedFraction={p.vested}
          withdrawnFraction={p.withdrawn}
          cliffFraction={p.cliff}
          canceled={stream.canceled}
          height={12}
          label={`Stream #${stream.id} vesting progress`}
        />
      </div>
      <ol className={cn('mt-5 grid gap-3', hasCliff ? 'grid-cols-3' : 'grid-cols-2')} aria-label="Schedule">
        {marks.map((m, i) => (
          <li
            key={m.label}
            className={cn('min-w-0', i === marks.length - 1 && 'text-right', i === 1 && hasCliff && 'text-center')}
          >
            <span className="label inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', m.tone, !m.reached && 'opacity-40')} aria-hidden />
              {m.label}
            </span>
            <span className="mt-1 block truncate font-mono text-xs text-fg sm:text-sm" title={fmtDateTime(m.at)}>
              {fmtDate(m.at)}
            </span>
            <span className="hidden font-mono text-[11px] text-faint sm:block">
              {timeFmt.format(new Date(m.at * 1000))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
