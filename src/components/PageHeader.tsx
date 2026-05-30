import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  badge?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, badge, action }: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200/90 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6 dark:border-stone-800/90 dark:bg-stone-900/80">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-club-red/5 dark:bg-club-red/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-club-gold/5 dark:bg-club-gold/10"
        aria-hidden
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {badge ? (
            <span className="mb-2 inline-block rounded-full bg-club-red-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-club-red dark:text-red-300">
              {badge}
            </span>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-stone-600 dark:text-stone-300">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
