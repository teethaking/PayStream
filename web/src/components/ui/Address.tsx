import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { explorerAddress, explorerTx } from '@paystream/sdk';
import { shortAddr } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Address({
  address,
  label,
  className,
  link = true,
}: {
  address: string;
  label?: string;
  className?: string;
  link?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <span className={cn('inline-flex items-center gap-1 font-mono text-xs', className)}>
      <span title={address}>{label ?? shortAddr(address)}</span>
      <button
        type="button"
        onClick={copy}
        className="rounded p-0.5 text-faint hover:text-fg"
        aria-label={`Copy ${address}`}
      >
        {copied ? <Check className="size-3.5 text-mint" /> : <Copy className="size-3.5" />}
      </button>
      {link && (
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noreferrer"
          className="rounded p-0.5 text-faint hover:text-fg"
          aria-label="Open in explorer"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </span>
  );
}

export function TxLink({
  hash,
  className,
  children,
}: {
  hash: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs text-muted ring-1 ring-line transition hover:text-fg hover:ring-line-strong',
        className,
      )}
    >
      {children ?? shortAddr(hash, 6)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
