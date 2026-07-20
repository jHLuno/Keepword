export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="currentColor" strokeOpacity="0.4" />
      <path
        d="M9 8h3v7.5L18 8h3.6l-6.2 7.4L22 24h-4l-4.4-6.2V24H9V8Z"
        fill="currentColor"
      />
      <circle cx="22" cy="10" r="1.7" fill="currentColor" />
    </svg>
  );
}
