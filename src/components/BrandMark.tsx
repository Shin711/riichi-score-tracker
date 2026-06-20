/** Mahjong tile mark — stylized 東 (East wind). */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-club-red to-club-red-dark text-sm font-bold text-white shadow-md shadow-club-red/35 transition-all duration-300 ease-fluid group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-club-red/40 ${className}`}
      aria-hidden
    >
      東
    </span>
  );
}
