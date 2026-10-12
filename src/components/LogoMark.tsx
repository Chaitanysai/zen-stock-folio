type LogoMarkProps = {
  size?: number;
  className?: string;
};

/** Original ZenFolio mark: a folded folio with a rising price path. */
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
      <rect width="32" height="32" rx="8" fill="#142033" />
      <path d="M7 22.5V10.5L16 15.2L25 10.5V22.5L16 27.2L7 22.5Z" fill="#1E3148" />
      <path d="M7 10.5L16 15.2L25 10.5L16 5.8L7 10.5Z" fill="#C4A574" />
      <path d="M16 15.2V27.2L25 22.5V10.5L16 15.2Z" fill="#8E7350" />
      <path
        d="M10 19.2L13.2 16.4L16.1 17.8L21.6 12.6"
        stroke="#F4E6C8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.6" cy="12.6" r="1.3" fill="#E8C98A" />
    </svg>
  );
}
