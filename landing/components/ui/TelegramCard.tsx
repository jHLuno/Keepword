import type { ReactNode } from "react";

export function TgAvatar({
  children = "K",
  small = false,
}: {
  children?: ReactNode;
  small?: boolean;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center border border-line bg-white/[0.04] font-display text-fg ${
        small ? "h-9 w-9 text-[0.8rem]" : "h-10 w-10 text-[0.9rem]"
      }`}
    >
      {children}
    </span>
  );
}

export function TgHead({
  title,
  subtitle,
  tag,
}: {
  title: string;
  subtitle: string;
  tag?: string;
}) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <TgAvatar />
      <div className="flex flex-col leading-tight">
        <b className="text-[0.92rem] font-semibold text-fg">{title}</b>
        <span className="text-[0.72rem] text-fg-mute">{subtitle}</span>
      </div>
      {tag && (
        <span className="ml-auto font-display text-[0.62rem] uppercase tracking-widest text-fg-mute">
          {tag}
        </span>
      )}
    </div>
  );
}

export function TgButton({
  children,
  primary = false,
  wide = false,
}: {
  children: ReactNode;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`px-3.5 py-2 text-[0.82rem] font-medium transition-all duration-200 hover:-translate-y-0.5 ${
        primary
          ? "bg-fg text-bg hover:bg-white"
          : "border border-line text-fg-dim hover:border-fg/50 hover:text-fg"
      } ${wide ? "mt-3.5 w-full text-center" : ""}`}
    >
      {children}
    </button>
  );
}

export function TgCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-line bg-panel-2 p-5 text-left shadow-panel ${className}`}
    >
      {children}
    </div>
  );
}
