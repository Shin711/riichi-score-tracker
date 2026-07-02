import type { ReactNode } from "react";

import { BrandMark } from "@/components/BrandMark";

type PageHeaderProps = {
  title: string;
  description?: string;
  badge?: string;
  action?: ReactNode;
  showLogo?: boolean;
};

export function PageHeader({ title, description, badge, action, showLogo = false }: PageHeaderProps) {
  return (
    <header className="page-hero">
      <div className="page-hero-wash page-hero-wash-red" aria-hidden />
      <div className="page-hero-wash page-hero-wash-jade" aria-hidden />
      <div className="page-hero-rule" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center sm:gap-6">
        {showLogo ? (
          <BrandMark className="h-32 w-32 sm:h-36 sm:w-36" priority />
        ) : null}

        {badge ? (
          <span className="arcade-badge">
            <span className="arcade-badge-dot" aria-hidden />
            {badge}
          </span>
        ) : null}

        <h1 className="page-hero-title text-balance">{title}</h1>

        {description ? (
          <p className="page-hero-desc text-pretty">{description}</p>
        ) : null}

        {action ? <div className="page-hero-action">{action}</div> : null}
      </div>
    </header>
  );
}
