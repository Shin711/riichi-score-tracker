import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  badge?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, badge, action }: PageHeaderProps) {
  return (
    <div className="hero-card p-6 sm:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-club-red/[0.12] blur-3xl dark:bg-club-red/[0.18]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-club-jade/[0.1] blur-3xl dark:bg-club-jade/[0.15]"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          {badge ? (
            <span className="inline-flex items-center rounded-full border border-club-border bg-club-surface/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-club-red backdrop-blur-sm dark:text-red-200">
              {badge}
            </span>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-club-ink sm:text-4xl">{title}</h1>
          {description ? (
            <p className="text-muted max-w-2xl text-sm leading-7 sm:text-base">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
