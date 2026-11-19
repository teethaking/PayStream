import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  className,
  glow,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { glow?: 'violet' | 'cyan' | 'mint' | 'rose' }) {
  return (
    <div className={cn('glass relative p-5 sm:p-6', className)} {...rest}>
      {glow && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-px -z-10 rounded-[inherit] opacity-60 blur-2xl',
            glow === 'violet' && 'bg-violet/20',
            glow === 'cyan' && 'bg-cyan/15',
            glow === 'mint' && 'bg-mint/15',
            glow === 'rose' && 'bg-rose/20',
          )}
        />
      )}
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-violet ring-1 ring-line">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
