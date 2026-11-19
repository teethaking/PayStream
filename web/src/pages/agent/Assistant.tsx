import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BookUser, Bot, ChevronDown, Info, Plus, SendHorizontal, Sparkles, Trash2, User, X } from 'lucide-react';
import { isAddress, type Address } from 'viem';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { config } from '@/config';
import { cn } from '@/lib/cn';
import { shortAddr } from '@/lib/format';
import { useChainNow } from '@/hooks/useChainNow';
import { parsePayroll, type ParseResult } from './parser';
import { evaluatePlan } from './calldata';
import { PlanReply } from './PlanReply';
import { setDraftMax, shakeGauges, useAddressBook, type useOperatorPair } from './store';

type Pair = ReturnType<typeof useOperatorPair>;

type Message = { id: number; role: 'user'; text: string } | { id: number; role: 'assistant'; parse: ParseResult };

const SUGGESTIONS = [
  'Pay Ada 500 and Tobe 300 tUSD8 over 3 months, 1 month cliff',
  'Split 1.5k between Ada, Tobe and Chi over 6 weeks starting tomorrow',
  'Pay Ada 50 over 10 minutes, no cliff, non-cancelable',
];

let seq = 0;

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1.5" role="status" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-muted"
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function AddressBookPanel() {
  const { book, set, remove } = useAddressBook();
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [error, setError] = useState<string>();
  const entries = Object.entries(book);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || /\s{2,}|^0x/i.test(name.trim())) return setError('Enter a name, like Ada');
    if (!isAddress(addr.trim(), { strict: false })) return setError('Enter a valid 0x address');
    set(name, addr.trim());
    setName('');
    setAddr('');
    setError(undefined);
  };
  return (
    <div className="space-y-3 pt-3">
      {entries.length === 0 ? (
        <p className="text-xs text-faint">
          No saved names yet. Add one here or paste an address when the assistant asks.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {entries.map(([n, a]) => (
              <motion.li
                key={n}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-xs ring-1 ring-line"
              >
                <span className="font-medium">{n}</span>
                <span className="font-mono text-faint">{shortAddr(a)}</span>
                <button
                  type="button"
                  onClick={() => remove(n)}
                  className="grid size-6 place-items-center rounded-full text-faint hover:bg-rose/15 hover:text-rose"
                  aria-label={'Remove ' + n}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]" noValidate>
        <label className="sr-only" htmlFor="book-name">
          Name
        </label>
        <input
          id="book-name"
          className="input text-sm"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <label className="sr-only" htmlFor="book-address">
          Address
        </label>
        <input
          id="book-address"
          className="input font-mono text-sm"
          placeholder="0x…"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" icon={<Plus className="size-4" aria-hidden />}>
          Save
        </Button>
      </form>
      {error && (
        <p className="text-xs text-rose" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Assistant({ employer, agent, pair }: { employer: Address; agent?: Address; pair: Pair }) {
  const { book } = useAddressBook();
  const now = useChainNow('second');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const latest = useMemo(() => [...messages].reverse().find((m) => m.role === 'assistant'), [messages]);
  const latestEval = useMemo(
    () => (latest?.role === 'assistant' ? evaluatePlan(latest.parse, book, pair.checkCaps, now, employer) : undefined),
    [latest, book, pair.checkCaps, now, employer],
  );
  const latestMax = latestEval?.max;
  useEffect(() => setDraftMax(latestMax), [latestMax]);
  useEffect(() => () => setDraftMax(undefined), []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [messages, typing, reduced]);

  const ask = (raw: string) => {
    const t = raw.trim();
    if (!t || typing) return;
    setMessages((m) => [...m, { id: ++seq, role: 'user', text: t }]);
    setText('');
    setTyping(true);
    const parse = parsePayroll(t, { now, book });
    setTimeout(
      () => {
        setTyping(false);
        setMessages((m) => [...m, { id: ++seq, role: 'assistant', parse }]);
        const ev = evaluatePlan(parse, book, pair.checkCaps, now, employer);
        if (
          ev.check &&
          !ev.check.ok &&
          (ev.check.reason === 'PerStreamCapExceeded' || ev.check.reason === 'DailyCapExceeded')
        )
          shakeGauges();
      },
      reduced ? 150 : 650,
    );
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={<Sparkles className="size-5" aria-hidden />}
        title="Payroll assistant"
        subtitle="Describe payroll in plain words. A deterministic parser turns it into exact streams; nothing leaves your browser."
        action={
          messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              aria-label="Clear conversation"
              icon={<X className="size-4" aria-hidden />}
            >
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )
        }
      />
      {config.llmEnabled && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-xs text-muted ring-1 ring-inset ring-line">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          An LLM provider can be plugged in to handle free-form requests. It is disabled here: the deterministic parser
          below covers the demo fully.
        </p>
      )}

      <div
        ref={scroller}
        role="log"
        aria-label="Assistant conversation"
        aria-live="polite"
        className="-mx-2 min-h-[16rem] flex-1 space-y-4 overflow-y-auto px-2 pb-2 lg:max-h-[44rem]"
      >
        {messages.length === 0 && !typing && (
          <div className="grid place-items-center py-8 text-center">
            <motion.div
              aria-hidden
              className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-white shadow-[0_10px_40px_-10px_rgb(124_92_255/0.8)]"
              animate={reduced ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Bot className="size-7" />
            </motion.div>
            <p className="font-display font-semibold">What should the agent pay?</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Try one of these, or write your own. Names come from your address book; 0x addresses work directly.
            </p>
            <div className="mt-5 flex max-w-lg flex-col gap-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.07 }}
                  className="rounded-xl bg-surface px-4 py-2.5 text-left text-sm text-muted ring-1 ring-inset ring-line transition hover:bg-surface-2 hover:text-fg hover:ring-violet/40"
                >
                  “{s}”
                </motion.button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1 grid size-8 shrink-0 place-items-center rounded-full ring-1',
                  m.role === 'user' ? 'bg-surface-2 text-muted ring-line' : 'bg-accent text-white ring-transparent',
                )}
              >
                {m.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
              </span>
              {m.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-violet/15 px-4 py-2.5 text-sm ring-1 ring-inset ring-violet/25">
                  <span className="sr-only">You: </span>
                  {m.text}
                </div>
              ) : (
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-surface px-4 py-3 ring-1 ring-inset ring-line">
                  <PlanReply parse={m.parse} employer={employer} agent={agent} pair={pair} />
                </div>
              )}
            </motion.div>
          ))}
          {typing && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-3"
            >
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent text-white">
                <Bot className="size-4" />
              </span>
              <div className="rounded-2xl rounded-tl-md bg-surface px-3 py-2 ring-1 ring-inset ring-line">
                <TypingDots />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Payroll instruction
        </label>
        <div className="flex items-end gap-2 rounded-2xl bg-surface p-2 ring-1 ring-inset ring-line-strong transition-shadow focus-within:shadow-[0_0_0_4px_rgb(124_92_255/0.18)] focus-within:ring-violet">
          <textarea
            id="assistant-input"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(text);
              }
            }}
            placeholder="Pay Ada 500 and Tobe 300 tUSD8 over 3 months, 1 month cliff"
            className="max-h-40 min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg placeholder:text-faint focus:outline-none"
          />
          <Button
            type="submit"
            size="md"
            disabled={!text.trim() || typing}
            aria-label="Send instruction"
            icon={<SendHorizontal className="size-4" aria-hidden />}
          >
            <span className="hidden sm:inline">Parse</span>
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Enter to send, Shift+Enter for a new line. Understands “and”/commas, 1.5k, “each”, “split”, durations, cliffs,
          start dates and “locked”.
        </p>
      </form>

      <div className="mt-4 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setBookOpen((o) => !o)}
          aria-expanded={bookOpen}
          aria-controls="address-book"
          className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-sm text-muted hover:text-fg"
        >
          <span className="flex items-center gap-2">
            <BookUser className="size-4" aria-hidden /> Address book{' '}
            <span className="font-mono text-xs text-faint">({Object.keys(book).length})</span>
          </span>
          <ChevronDown className={cn('size-4 transition-transform', bookOpen && 'rotate-180')} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {bookOpen && (
            <motion.div
              id="address-book"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <AddressBookPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
