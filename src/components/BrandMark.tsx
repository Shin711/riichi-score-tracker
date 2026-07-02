import Image from "next/image";

import { SITE_LOGO_ALT, SITE_LOGO_PATH } from "@/lib/site";

type BrandMarkProps = {
  className?: string;
  priority?: boolean;
};

/** Club logo mark used in the header, footer, and page heroes. */
export function BrandMark({ className = "h-10 w-10", priority = false }: BrandMarkProps) {
  return (
    <Image
      src={SITE_LOGO_PATH}
      alt={SITE_LOGO_ALT}
      width={512}
      height={512}
      unoptimized
      priority={priority}
      className={`shrink-0 object-contain transition-all duration-300 ease-fluid group-hover:scale-105 ${className}`}
    />
  );
}
