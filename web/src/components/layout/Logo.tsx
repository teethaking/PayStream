export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" opacity="0.15" />
      <path d="M12 40c8 0 10-16 20-16s12 16 20 16" fill="none" stroke="url(#logo-g)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="12" cy="40" r="4.5" fill="#7C5CFF" />
      <circle cx="52" cy="40" r="4.5" fill="#22D3EE" />
    </svg>
  );
}
