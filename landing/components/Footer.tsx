import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line-soft bg-bg py-10 text-fg-dim">
      <div className="mx-auto flex w-[min(1240px,100%-40px)] flex-wrap items-center justify-between gap-4">
        <Link href="#top" className="inline-flex items-center gap-2.5 text-fg">
          <Logo size={22} />
          <span className="font-display text-[0.9rem] tracking-tight">KEEPWORD</span>
        </Link>
        <p className="font-display text-[0.62rem] uppercase tracking-[0.2em] text-fg-mute">
          AI that turns team promises into follow-through
        </p>
        <span className="text-[0.8rem] text-fg-mute">© 2026 Keepword</span>
      </div>
    </footer>
  );
}
