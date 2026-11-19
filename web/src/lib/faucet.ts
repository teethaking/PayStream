import { config } from '@/config';
import { toast } from './toast';

/** Copies the address and opens the QDay faucet in a new tab. */
export async function openFaucet(address?: string) {
  if (address) {
    try {
      await navigator.clipboard.writeText(address);
      toast({ kind: 'info', title: 'Address copied', message: 'Paste it into the faucet, or use /faucet <address> in the QDay Discord.' });
    } catch {
      /* clipboard blocked: the faucet still opens */
    }
  }
  window.open(config.faucetUrl, '_blank', 'noopener');
}
