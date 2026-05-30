import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  badge?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, badge, action }: PageHeaderProps) {
  return (
    <div className="card relative overflow-hidden p-5 sm:p-6">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-club-red/[0.04] dark:bg-club-red/[0.06]"
        aria-hidden
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {badge ? (
            <span className="mb-2 inline-block rounded-full bg-club-red-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-club-red dark:text-red-200">
              {badge}
            </span>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-club-ink sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="text-muted mt-1.5 max-w-xl text-sm leading-6">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
