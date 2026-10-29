/**
 * The speedboat from the Gilifast wordmark (`(customer)/_components/logo.tsx`)
 * in brand blue on a white tile, for the generated tab / home-screen icons.
 * Keep the paths in step with the logo. The wordmark is left out: it cannot be
 * read at 16-32 px.
 */
export function BrandIcon({ size }: { size: number }) {
  const pad = Math.max(1, Math.round(size * 0.04));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        borderRadius: Math.round(size * 0.22),
      }}
    >
      <svg
        viewBox="0 14 130 36"
        width={size - pad * 2}
        height={Math.round(((size - pad * 2) * 36) / 130)}
        fill="#103BE9"
      >
        <rect x="0" y="16" width="30" height="4.5" rx="2.25" />
        <rect x="8" y="27" width="18" height="4.5" rx="2.25" />
        <path d="M22 34 L128 34 C121 44 110 48 95 48 L48 48 C37 48 28 42 22 34 Z" />
        <path d="M52 31 L59 16 L90 16 C105 16 118 22 127 31 Z" />
      </svg>
    </div>
  );
}
