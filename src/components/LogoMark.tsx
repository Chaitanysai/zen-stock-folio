type LogoMarkProps = {
  size?: number;
  className?: string;
};

/**
 * ZenFolio mark: a folded folio with a rising price path.
 * Fills come from the theme tokens, so the mark inverts with light/dark and
 * carries the brand orange on its two top facets.
 */
export default function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path d="M7 22.5V10.5L16 15.2L25 10.5V22.5L16 27.2L7 22.5Z" fill="hsl(var(--primary-foreground) / .16)" />
      <path d="M7 10.5L16 15.2L25 10.5L16 5.8L7 10.5Z" fill="hsl(var(--brand))" />
      <path d="M16 15.2V27.2L25 22.5V10.5L16 15.2Z" fill="hsl(var(--brand-strong))" />
      <path
        d="M10 19.2L13.2 16.4L16.1 17.8L21.6 12.6"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.6" cy="12.6" r="1.3" fill="hsl(var(--primary-foreground))" />
    </svg>
  );
}
