import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Address } from 'viem';
import { CheckCircle2, FileUp, Plus, Rocket, Sparkles, Table2, Trash2, TriangleAlert, Users } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Field } from '@/components/ui/Field';
import { useTreasury } from '@/hooks/useVault';
import { config } from '@/config';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  MAX_BATCH,
  TEMPLATES,
  UNITS,
  blankRow,
  chainNow,
  isBlank,
  parseCsv,
  rowToParams,
  scheduleOf,
  type Row,
  type RowField,
  type RowResult,
  type Unit,
} from './payroll';
import { createStreams } from './actions';
import { VestingPreview } from './VestingPreview';

export function PayrollForm({
  address,
  onRequestDeposit,
  className,
}: {
  address: Address;
  onRequestDeposit: (amount: bigint) => void;
  className?: string;
}) {
  const treasury = useTreasury(address).value;
  const [rows, setRows] = useState<Row[]>(() => [blankRow(chainNow())]);
  const [focusKey, setFocusKey] = useState<string>();
  const [showErrors, setShowErrors] = useState(false);
  const [template, setTemplate] = useState<string>();
  const [csvOpen, setCsvOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  const results = useMemo(() => rows.map(rowToParams), [rows]);
  const { valid, invalid, filled } = useMemo(() => {
    const filledRows = rows.filter((r) => !isBlank(r)).length;
    const v = results.filter((r, i) => r.params && !isBlank(rows[i]!)).map((r) => r.params!);
    return { valid: v, invalid: filledRows - v.length, filled: filledRows };
  }, [rows, results]);
  const total = valid.reduce((a, p) => a + p.amount, 0n);
  const shortfall = total > treasury ? total - treasury : 0n;
  const tooMany = valid.length > MAX_BATCH;
  const coverage = total === 0n ? 0 : treasury === 0n ? 1 : Math.min(1, Number((total * 10_000n) / treasury) / 10_000);

  const update = useCallback((key: string, patch: Partial<Row>) => {
    setTemplate((t) =>
      patch.cliff !== undefined || patch.duration !== undefined || patch.cliffUnit || patch.durationUnit
        ? undefined
        : t,
    );
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);
  const remove = useCallback(
    (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [blankRow(chainNow())])),
    [],
  );
  const add = () => {
    const last = rows[rows.length - 1];
    const row = blankRow(chainNow(), last ? scheduleOf(last) : undefined);
    if (last) row.start = last.start;
    setRows((rs) => [...rs, row]);
    setFocusKey(row.key);
  };
  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    setTemplate(id);
    setRows((rs) => rs.map((r) => ({ ...r, ...t.schedule })));
  };
  const importRows = (incoming: Row[]) => {
    setRows((rs) => {
      const kept = rs.filter((r) => !isBlank(r));
      return [...kept, ...incoming].slice(0, Math.max(MAX_BATCH, kept.length));
    });
    setCsvOpen(false);
    setTemplate(undefined);
  };

  const submit = async () => {
    if (!filled || invalid > 0 || tooMany) {
      setShowErrors(true);
      setShake((n) => n + 1);
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (shortfall > 0n || !config.vault) return;
    setBusy(true);
    const res = await createStreams(address, valid);
    setBusy(false);
    if (res.ok) {
      setRows([blankRow(chainNow())]);
      setShowErrors(false);
      setTemplate(undefined);
    }
  };

  return (
    <Card className={className}>
      <CardHeader
        title="Create payroll"
        subtitle="Stream salaries to many people in one transaction"
        icon={<Users className="size-5" />}
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCsvOpen((v) => !v)}
            aria-expanded={csvOpen}
            icon={<Table2 className="size-3.5" />}
          >
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        }
      />

      <AnimatePresence initial={false}>
        {csvOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <CsvImport onImport={importRows} onClose={() => setCsvOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-5">
        <p className="label mb-2 flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-violet" aria-hidden /> Templates (apply a schedule to every row)
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Schedule templates">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              aria-pressed={template === t.id}
              title={t.hint}
              className={cn(
                'relative rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition',
                template === t.id
                  ? 'text-fg ring-violet/50'
                  : 'text-muted ring-line hover:text-fg hover:ring-line-strong',
              )}
            >
              {template === t.id && (
                <motion.span
                  layoutId="template-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-violet/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <ol ref={listRef} className="space-y-3" aria-label="Recipients">
            <AnimatePresence initial={false}>
              {rows.map((row, i) => (
                <RowEditor
                  key={row.key}
                  row={row}
                  index={i}
                  result={results[i]!}
                  showErrors={showErrors}
                  autoFocus={row.key === focusKey}
                  onChange={update}
                  onRemove={remove}
                />
              ))}
            </AnimatePresence>
          </ol>
          <Button
            variant="ghost"
            className="mt-3 w-full border border-dashed border-line-strong"
            onClick={add}
            disabled={rows.length >= MAX_BATCH}
            icon={<Plus className="size-4" />}
          >
            Add recipient
          </Button>
        </div>

        <aside className="lg:col-span-5 xl:col-span-4" aria-label="Payroll summary">
          <div className="space-y-5 rounded-2xl bg-surface p-4 ring-1 ring-line lg:sticky lg:top-24">
            <div>
              <p className="label mb-2">Vesting preview</p>
              <VestingPreview params={valid} />
            </div>

            <dl className="space-y-2.5 text-sm" aria-live="polite">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Streams</dt>
                <dd className="font-mono tabular">{valid.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Total</dt>
                <dd className="font-mono text-fg tabular">{fmt(total)} tUSD8</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Treasury now</dt>
                <dd className="font-mono tabular">{fmt(treasury)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-2.5">
                <dt className="text-muted">Treasury after</dt>
                <dd className={cn('font-mono tabular', shortfall > 0n ? 'text-rose' : 'text-mint')}>
                  {shortfall > 0n ? `−${fmt(shortfall)}` : fmt(treasury - total)}
                </dd>
              </div>
            </dl>

            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line" aria-hidden>
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  shortfall > 0n ? 'bg-rose' : coverage > 0.8 ? 'bg-amber' : 'bg-accent',
                )}
                initial={false}
                animate={{ width: `${coverage * 100}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>

            <AnimatePresence initial={false}>
              {shortfall > 0n && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                  role="alert"
                >
                  <div className="rounded-xl bg-rose/10 p-3 ring-1 ring-rose/25">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-rose">
                      <TriangleAlert className="size-4" aria-hidden /> Treasury is short by {fmt(shortfall)} tUSD8
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Streams are funded from the treasury up front. Top it up to submit this batch.
                    </p>
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => onRequestDeposit(shortfall)}>
                      Deposit {fmt(shortfall)} tUSD8
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {tooMany && (
              <p className="text-xs text-rose" role="alert">
                At most {MAX_BATCH} streams per batch. Split the list into several batches.
              </p>
            )}
            {showErrors && invalid > 0 && (
              <p className="text-xs text-rose" role="alert">
                Fix {invalid} {invalid === 1 ? 'row' : 'rows'} before submitting.
              </p>
            )}

            <motion.div
              animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
              key={shake}
              transition={{ duration: 0.4 }}
            >
              <Button
                size="lg"
                magnetic
                className="w-full"
                onClick={() => void submit()}
                loading={busy}
                disabled={!config.vault || shortfall > 0n}
                icon={<Rocket className="size-4" />}
              >
                {valid.length > 1 ? `Stream to ${valid.length} recipients` : 'Start streaming'}
              </Button>
            </motion.div>
            <p className="text-center text-xs text-faint">
              {config.vault
                ? 'One createStreams transaction. Recipients can claim every second.'
                : 'Submitting unlocks once the vault is deployed.'}
            </p>
          </div>
        </aside>
      </div>
    </Card>
  );
}

const RowEditor = memo(function RowEditor({
  row,
  index,
  result,
  showErrors,
  autoFocus,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  result: RowResult;
  showErrors: boolean;
  autoFocus: boolean;
  onChange: (key: string, patch: Partial<Row>) => void;
  onRemove: (key: string) => void;
}) {
  const id = `pr-${row.key}`;
  const blank = isBlank(row);
  const err = (f: RowField) => {
    const e = result.errors[f];
    if (!e) return undefined;
    if (showErrors && !blank) return e;
    if (f === 'recipient') return row.recipient.trim().length >= 6 ? e : undefined;
    if (f === 'amount') return row.amount.trim() ? e : undefined;
    return blank && !showErrors ? undefined : e;
  };
  const set = (patch: Partial<Row>) => onChange(row.key, patch);
  const ok = !!result.params && !blank;
  const n = index + 1;
  const inputProps = (f: RowField) => ({
    id: `${id}-${f}`,
    'aria-invalid': err(f) ? true : undefined,
    'aria-describedby': err(f) ? `${id}-${f}-error` : undefined,
  });

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -32, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={cn('rounded-2xl bg-surface p-4 ring-1 transition-shadow', ok ? 'ring-mint/25' : 'ring-line')}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <span className="grid size-6 place-items-center rounded-full bg-surface-2 font-mono text-xs ring-1 ring-line">
            {n}
          </span>
          Recipient {n}
          <AnimatePresence>
            {ok && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                <CheckCircle2 className="size-4 text-mint" aria-label="Row is valid" />
              </motion.span>
            )}
          </AnimatePresence>
        </p>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-rose/10 hover:text-rose"
          aria-label={`Remove recipient ${n}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <div className="sm:col-span-2 lg:col-span-7">
          <Field label="Address" htmlFor={`${id}-recipient`} error={err('recipient')}>
            <input
              {...inputProps('recipient')}
              className="input font-mono text-sm"
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              autoFocus={autoFocus}
              value={row.recipient}
              onChange={(e) => set({ recipient: e.target.value })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <Field label="Amount (tUSD8)" htmlFor={`${id}-amount`} error={err('amount')}>
            <input
              {...inputProps('amount')}
              className="input font-mono text-sm tabular"
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              value={row.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Field label="Start" htmlFor={`${id}-start`} error={err('start')}>
            <input
              {...inputProps('start')}
              type="datetime-local"
              className="input font-mono text-sm"
              value={row.start}
              onChange={(e) => set({ start: e.target.value })}
            />
          </Field>
        </div>
        <div className="lg:col-span-3">
          <SpanInput
            label="Cliff"
            fieldProps={inputProps('cliff')}
            error={err('cliff')}
            value={row.cliff}
            unit={row.cliffUnit}
            onValue={(cliff) => set({ cliff })}
            onUnit={(cliffUnit) => set({ cliffUnit })}
          />
        </div>
        <div className="lg:col-span-3">
          <SpanInput
            label="Duration"
            fieldProps={inputProps('duration')}
            error={err('duration')}
            value={row.duration}
            unit={row.durationUnit}
            onValue={(duration) => set({ duration })}
            onUnit={(durationUnit) => set({ durationUnit })}
          />
        </div>
        <div className="flex items-end lg:col-span-2">
          <div className="flex h-[42px] w-full items-center justify-between gap-2 sm:justify-start lg:flex-col lg:items-start lg:justify-end lg:gap-1.5 lg:h-auto">
            <label htmlFor={`${id}-cancelable`} className="label">
              Cancelable
            </label>
            <Toggle
              id={`${id}-cancelable`}
              checked={row.cancelable}
              onChange={(cancelable) => set({ cancelable })}
              label={`Recipient ${n} stream is cancelable`}
            />
          </div>
        </div>
      </div>
    </motion.li>
  );
});

function SpanInput({
  label,
  fieldProps,
  error,
  value,
  unit,
  onValue,
  onUnit,
}: {
  label: string;
  fieldProps: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };
  error?: string;
  value: string;
  unit: Unit;
  onValue: (v: string) => void;
  onUnit: (u: Unit) => void;
}) {
  return (
    <Field label={label} htmlFor={fieldProps.id} error={error}>
      <div className="flex">
        <input
          {...fieldProps}
          className="input min-w-0 rounded-r-none font-mono text-sm tabular"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onValue(e.target.value)}
        />
        <select
          aria-label={`${label} unit`}
          className="input w-auto shrink-0 rounded-l-none bg-surface-2 pr-2 pl-2 text-sm"
          value={unit}
          onChange={(e) => onUnit(e.target.value as Unit)}
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

const CSV_PLACEHOLDER =
  'address,amount,startISO,cliffDays,durationDays,cancelable\n0xRecipient…,1500,2026-12-01T09:00:00Z,0,180,true\n0xRecipient…,800,,7,30,false';

function CsvImport({ onImport, onClose }: { onImport: (rows: Row[]) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseCsv(text, chainNow()) : undefined), [text]);
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (f?: File) => {
    if (!f) return;
    setText(await f.text());
  };
  return (
    <div className="mb-5 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="payroll-csv" className="text-sm font-medium text-fg">
          Paste CSV
        </label>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            id="payroll-csv-file"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            icon={<FileUp className="size-3.5" />}
          >
            Choose file
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        One stream per line:{' '}
        <code className="font-mono text-faint">address,amount,startISO?,cliffDays,durationDays,cancelable</code>. Leave
        the start empty for “in 2 minutes”.
      </p>
      <textarea
        id="payroll-csv"
        className="input mt-3 h-32 resize-y font-mono text-xs"
        placeholder={CSV_PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-describedby="payroll-csv-status"
      />
      <div id="payroll-csv-status" aria-live="polite" className="mt-3 space-y-2">
        {parsed && (
          <p className="text-xs text-muted">
            <span className="text-mint">{parsed.rows.length} ready</span>
            {parsed.errors.length > 0 && <span className="text-rose"> · {parsed.errors.length} with errors</span>}
          </p>
        )}
        {parsed && parsed.errors.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl bg-rose/8 p-2 text-xs ring-1 ring-rose/20">
            {parsed.errors.map((e) => (
              <li key={e.line} className="flex gap-2">
                <span className="shrink-0 font-mono text-rose">Line {e.line}</span>
                <span className="text-muted">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button size="sm" disabled={!parsed?.rows.length} onClick={() => parsed && onImport(parsed.rows)}>
          Import {parsed?.rows.length ? parsed.rows.length : ''} {parsed?.rows.length === 1 ? 'row' : 'rows'}
        </Button>
      </div>
    </div>
  );
}
