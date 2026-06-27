/** Radial glow + vignette for the app boot screen. */
export function BootBackdrop({ glowY = 38 }: { glowY?: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: `${glowY}%`,
          width: "120vmax",
          height: "120vmax",
          background:
            "radial-gradient(circle, rgba(196,165,116,0.07) 0%, rgba(196,165,116,0.02) 35%, transparent 70%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(27,28,35,0.35) 100%)",
        }}
      />
    </div>
  );
}
