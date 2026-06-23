import Image from "next/image";

import { SITE_LOGO_ALT, SITE_LOGO_PATH } from "@/lib/site";

type BrandMarkProps = {
  className?: string;
  priority?: boolean;
};

/** Club logo mark used in the header, footer, and page heroes. */
export function BrandMark({ className = "h-8 w-8", priority = false }: BrandMarkProps) {
  return (
    <Image
      src={SITE_LOGO_PATH}
      alt={SITE_LOGO_ALT}
      width={96}
      height={96}
      priority={priority}
      className={`shrink-0 rounded-full object-cover shadow-md shadow-club-red/20 ring-1 ring-club-border/70 transition-all duration-300 ease-fluid group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-club-red/30 ${className}`}
    />
  );
}
