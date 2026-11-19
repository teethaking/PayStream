import { getAddress, isAddress, type Address } from 'viem';
import { DAY, buildStreamParams, parseAmount, type StreamParams } from '@paystream/sdk';

export interface PayrollRow {
  name?: string;
  recipient: string;
  amount: string;
  start?: string;
  cliffDays?: number;
  durationDays: number;
  cancelable?: boolean;
}

export interface PayrollFile {
  employer: string;
  streams: PayrollRow[];
}

export interface ParsedPayroll {
  employer: Address;
  rows: { name: string; params: StreamParams }[];
}

/** Validates a payroll file into exact on-chain StreamParams (BigInt amounts, unix-second schedule). */
export function parsePayroll(file: PayrollFile, nowSeconds: number): ParsedPayroll {
  if (!isAddress(file.employer)) throw new Error(`employer is not a valid address: ${file.employer}`);
  if (!Array.isArray(file.streams) || file.streams.length === 0) throw new Error('streams must be a non-empty array');
  const rows = file.streams.map((r, i) => {
    const where = `streams[${i}]${r.name ? ` (${r.name})` : ''}`;
    try {
      const start = r.start ? Math.floor(Date.parse(r.start) / 1000) : nowSeconds + 120;
      if (!Number.isFinite(start)) throw new Error(`invalid start "${r.start}"`);
      const params = buildStreamParams({
        recipient: r.recipient,
        amount: parseAmount(String(r.amount)),
        start,
        cliffSeconds: Math.round((r.cliffDays ?? 0) * DAY),
        durationSeconds: Math.round(r.durationDays * DAY),
        cancelable: r.cancelable ?? true,
      });
      return { name: r.name ?? `row ${i + 1}`, params };
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`);
    }
  });
  return { employer: getAddress(file.employer), rows };
}
