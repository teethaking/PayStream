import type { VaultErrorName } from '@paystream/sdk';
import { Bot, Building2, Cpu, UserRound, type LucideIcon } from 'lucide-react';

export type RoleId = 'employer' | 'agent' | 'recipient' | 'keeper';
export type ActionId = 'fund' | 'treasuryOut' | 'operators' | 'create' | 'withdraw' | 'cancel';
export type Kind = 'allow' | 'scoped' | 'self' | 'deny';

export interface Verdict {
  kind: Kind;
  note: string;
  error?: VaultErrorName;
}

export const ROLES: { id: RoleId; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'employer', label: 'Employer', icon: Building2, blurb: 'Owns the treasury and every stream it funds.' },
  {
    id: 'agent',
    label: 'AI Agent',
    icon: Bot,
    blurb: 'A scoped operator key. It can only create streams, inside its caps.',
  },
  {
    id: 'recipient',
    label: 'Recipient',
    icon: UserRound,
    blurb: 'Gets paid. Claims vested salary whenever they like.',
  },
  {
    id: 'keeper',
    label: 'Keeper',
    icon: Cpu,
    blurb: 'Any third party, such as a bot or relayer, that pokes payouts along.',
  },
];

export const ACTIONS: { id: ActionId; fn: string; label: string }[] = [
  { id: 'fund', fn: 'deposit · depositWithPermit', label: 'Fund treasury' },
  { id: 'treasuryOut', fn: 'withdrawTreasury', label: 'Pull treasury out' },
  { id: 'operators', fn: 'setOperator · revokeOperator', label: 'Grant or revoke agents' },
  { id: 'create', fn: 'createStream · createStreams', label: "Create streams from the employer's treasury" },
  { id: 'withdraw', fn: 'withdraw(id)', label: 'Pay out vested salary' },
  { id: 'cancel', fn: 'cancel(id)', label: 'Cancel a stream' },
];

export const MATRIX: Record<RoleId, Record<ActionId, Verdict>> = {
  employer: {
    fund: { kind: 'allow', note: 'Credits their own treasury.' },
    treasuryOut: { kind: 'allow', note: 'Only the unstreamed balance; streamed money is already committed.' },
    operators: { kind: 'allow', note: 'Grant, re-grant with new caps, or revoke instantly.' },
    create: { kind: 'allow', note: 'No caps apply to the employer itself.' },
    withdraw: { kind: 'allow', note: 'Can trigger it, but the money always goes to the recipient.' },
    cancel: { kind: 'allow', note: 'Cancelable streams only. Locked streams revert.', error: 'NotCancelable' },
  },
  agent: {
    fund: { kind: 'self', note: "Would only credit the agent's own empty treasury." },
    treasuryOut: {
      kind: 'deny',
      note: "Treasury is keyed by caller; the agent's own balance is zero.",
      error: 'InsufficientTreasury',
    },
    operators: { kind: 'self', note: "Writes the agent's own mapping. It cannot raise its own caps." },
    create: { kind: 'scoped', note: 'Only within its per-stream cap, daily cap and expiry.' },
    withdraw: { kind: 'allow', note: 'Can trigger a payout; the money still goes to the recipient.' },
    cancel: { kind: 'deny', note: 'Only the stream sender may cancel.', error: 'NotAuthorized' },
  },
  recipient: {
    fund: { kind: 'self', note: 'Would only credit their own treasury.' },
    treasuryOut: { kind: 'deny', note: "Cannot reach the employer's treasury.", error: 'InsufficientTreasury' },
    operators: { kind: 'self', note: 'Only affects their own account.' },
    create: { kind: 'deny', note: 'Not the sender and not an operator.', error: 'NotAuthorized' },
    withdraw: { kind: 'allow', note: 'Claims everything vested so far.' },
    cancel: { kind: 'deny', note: 'Only the stream sender may cancel.', error: 'NotAuthorized' },
  },
  keeper: {
    fund: { kind: 'self', note: 'Would only credit their own treasury.' },
    treasuryOut: { kind: 'deny', note: "Cannot reach the employer's treasury.", error: 'InsufficientTreasury' },
    operators: { kind: 'self', note: 'Only affects their own account.' },
    create: { kind: 'deny', note: 'Not the sender and not an operator.', error: 'NotAuthorized' },
    withdraw: { kind: 'allow', note: 'Anyone can trigger payouts; funds go to the recipient, never the caller.' },
    cancel: { kind: 'deny', note: 'Only the stream sender may cancel.', error: 'NotAuthorized' },
  },
};

export type Scenario = 'ok' | 'perStream' | 'daily' | 'expired' | 'revoked';

export const SCENARIOS: { id: Scenario; label: string; verdict: Verdict }[] = [
  {
    id: 'ok',
    label: 'Within caps',
    verdict: { kind: 'scoped', note: 'Amount ≤ per-stream cap, day total ≤ daily cap, before expiry.' },
  },
  {
    id: 'perStream',
    label: 'Over per-stream cap',
    verdict: { kind: 'deny', note: 'One stream is larger than the per-stream cap.', error: 'PerStreamCapExceeded' },
  },
  {
    id: 'daily',
    label: 'Over daily cap',
    verdict: { kind: 'deny', note: "Today's total would pass the daily cap.", error: 'DailyCapExceeded' },
  },
  {
    id: 'expired',
    label: 'After expiry',
    verdict: { kind: 'deny', note: 'The grant timestamp has passed.', error: 'OperatorExpired' },
  },
  {
    id: 'revoked',
    label: 'Revoked',
    verdict: { kind: 'deny', note: 'revokeOperator deleted the grant.', error: 'NotAuthorized' },
  },
];
