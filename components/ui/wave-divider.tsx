export function WaveDivider({
  fillClass = "fill-white",
  flipped = false,
}: {
  fillClass?: string;
  flipped?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      className={`block w-full h-8 sm:h-12 ${flipped ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        className={fillClass}
        d="M0,30 C240,60 480,0 720,30 C960,60 1200,0 1440,30 L1440,60 L0,60 Z"
      />
    </svg>
  );
}
