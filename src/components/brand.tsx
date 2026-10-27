import clsx from "clsx";

/**
 * purojekuto's mark: a three-column board on Midnight Navy — to do, doing,
 * and a Chain Teal "done" column. Fixed colours (not theme tokens) so it is
 * identical everywhere; same geometry as public/icon.svg (64×64 grid).
 */
export const MARK = {
  bg: "#0f1419",
  bgTop: "#1b2430",
  ink: "#e8edf2",
  dim: "#5a6673",
  accent: "#00d4aa",
} as const;

export function LogoMark({ size = 28, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={clsx("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id="puro-mark-bg" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={MARK.bgTop} />
          <stop offset="1" stopColor={MARK.bg} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#puro-mark-bg)" />
      <rect x="12" y="14" width="11" height="36" rx="4" fill="none" stroke={MARK.ink} strokeWidth="3.2" />
      <rect x="26.5" y="14" width="11" height="25" rx="4" fill="none" stroke={MARK.ink} strokeWidth="3.2" />
      <rect x="41" y="14" width="11" height="15" rx="4" fill={MARK.accent} />
      <circle cx="46.5" cy="44.5" r="4.6" fill={MARK.accent} />
    </svg>
  );
}

export function Wordmark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className="font-semibold tracking-tight text-ink" style={{ fontSize: size * 0.62 }}>
        purojekuto
      </span>
    </span>
  );
}
