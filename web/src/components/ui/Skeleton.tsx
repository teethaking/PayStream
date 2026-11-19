import { cn } from '@/lib/cn';

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}
