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
    <header className="page-header">
      {showLogo ? <BrandMark className="mb-4 h-16 w-16" priority /> : null}
      {badge ? <p className="club-eyebrow">{badge}</p> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="page-header-title text-balance">{title}</h1>
          {description ? <p className="page-header-desc text-pretty">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div> : null}
      </div>
    </header>
  );
}
