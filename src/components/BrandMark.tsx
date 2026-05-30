/** Mahjong tile mark — stylized 東 (East wind). */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-club-red to-club-red-dark text-sm font-bold text-white shadow-sm shadow-club-red/30 ${className}`}
      aria-hidden
    >
      東
    </span>
  );
}
