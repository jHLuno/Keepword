import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "solid" | "outline" | "ghost";
type Size = "sm" | "lg";

const base =
  "group inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all duration-300 will-change-transform";

const variants: Record<Variant, string> = {
  solid:
    "bg-fg text-bg hover:bg-white hover:-translate-y-0.5",
  outline:
    "border border-line text-fg hover:border-fg/60 hover:bg-white/[0.04] hover:-translate-y-0.5",
  ghost: "text-fg-dim hover:text-fg",
};

const sizes: Record<Size, string> = {
  sm: "px-4 py-2 text-[0.82rem]",
  lg: "px-6 py-[13px] text-[0.9rem]",
};

export function Button({
  children,
  href = "#cta",
  variant = "solid",
  size = "lg",
  className = "",
}: {
  children: ReactNode;
  href?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </Link>
  );
}
