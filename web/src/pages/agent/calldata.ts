import { encodeFunctionData, type Address, type Hex } from 'viem';
import {
  ParamsError,
  buildStreamParams,
  checkOperatorCaps,
  type CapCheck,
  type OperatorCaps,
  type StreamParams,
} from '@paystream/sdk';
import { streamVaultAbi } from '@/lib/abi';
import { resolveRows, type AddressBook, type ParseResult, type ParsedRow } from './parser';

export interface Evaluation {
  rows: ParsedRow[];
  /** Present only when every row resolved and passed the contract's own validation. */
  params?: StreamParams[];
  paramError?: string;
  check?: CapCheck;
  calldata?: Hex;
  max?: bigint;
}

/** Resolves names, builds contract params, runs the off-chain cap check and encodes the exact calldata. */
export function evaluatePlan(
  parse: ParseResult,
  book: AddressBook,
  caps: OperatorCaps,
  now: number,
  employer: Address,
): Evaluation {
  const rows = resolveRows(parse.rows, book);
  const max = rows.reduce<bigint | undefined>((m, r) => (m === undefined || r.amount > m ? r.amount : m), undefined);
  if (parse.errors.length || !rows.length || rows.some((r) => !r.address)) return { rows, max };
  try {
    const params = rows.map((r) =>
      buildStreamParams({
        recipient: r.address!,
        amount: r.amount,
        start: r.start,
        cliffSeconds: r.cliffSeconds,
        durationSeconds: r.durationSeconds,
        cancelable: r.cancelable,
      }),
    );
    const calldata = encodeFunctionData({
      abi: streamVaultAbi,
      functionName: 'createStreams',
      args: [employer, params],
    });
    return { rows, params, check: checkOperatorCaps(caps, params, Math.floor(now)), calldata, max };
  } catch (e) {
    return { rows, max, paramError: e instanceof ParamsError ? e.message : 'These rows do not form a valid schedule.' };
  }
}
