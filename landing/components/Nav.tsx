"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Button } from "./ui/Button";

const LINKS = [
  { href: "#about", label: "About" },
  { href: "#benefits", label: "Benefits" },
  { href: "#story", label: "How it works" },
  { href: "#cta", label: "Start" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-line-soft bg-bg/85 backdrop-blur-md" : ""
      }`}
    >
      <div className="mx-auto flex h-[68px] w-[min(1240px,100%-40px)] items-center justify-between gap-6">
        <Link
          href="#top"
          className="inline-flex items-center gap-2.5 text-fg"
          aria-label="Keepword — home"
        >
          <Logo />
          <span className="font-display text-[1rem] tracking-tight">KEEPWORD</span>
        </Link>

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Primary"
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[0.82rem] font-medium uppercase tracking-wide text-fg-dim transition-colors hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Button href="#cta" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Talk to us
          </Button>
          <Button href="#cta" variant="solid" size="sm">
            Add to chat
          </Button>
        </div>
      </div>
      <div className="hatch h-[9px] w-full opacity-60" aria-hidden />
    </header>
  );
}
