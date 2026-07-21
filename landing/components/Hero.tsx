"use client";

import { motion } from "framer-motion";
import { Sparks } from "./Sparks";
import { Button } from "./ui/Button";
import { TELEGRAM_URL } from "@/lib/links";

export function Hero() {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[100svh] flex-col items-center overflow-hidden bg-bg pt-[calc(68px+44px)] text-fg"
    >
      <div className="absolute inset-0 -z-10 h-[120%]">
        <video
          className="h-full w-full object-cover [filter:grayscale(1)_brightness(0.5)_contrast(1.08)]"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/night.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 [background:linear-gradient(180deg,rgba(8,8,8,0.72)_0%,rgba(8,8,8,0.5)_38%,rgba(8,8,8,0.8)_78%,var(--color-bg)_100%)]" />
        <div className="absolute inset-0 [background:radial-gradient(120%_80%_at_50%_0%,transparent_40%,rgba(8,8,8,0.6)_100%)]" />
      </div>

      <Sparks variant="hero" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="relative z-[3] flex w-[min(960px,100%-40px)] flex-col items-center text-center"
      >
        <a
          href="#benefits"
          className="mb-8 inline-flex items-center gap-2.5 border border-line px-3.5 py-1.5 font-display text-[0.62rem] uppercase tracking-[0.22em] text-fg-dim backdrop-blur-sm transition-colors hover:text-fg"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-fg [animation:ping-soft_2.4s_infinite]" />
          New — Evening digests for teams
        </a>

        <h1 className="mb-7 font-display text-[clamp(1.9rem,5.4vw,4.1rem)] uppercase leading-[1.06] tracking-[0.005em] text-fg">
          <span className="block">Turn team promises</span>
          <span className="block text-fg-dim">
            into <span className="text-fg">follow-through</span>
          </span>
        </h1>

        <p className="mx-auto mb-9 max-w-[60ch] text-[clamp(0.98rem,1.4vw,1.15rem)] leading-relaxed text-fg-dim">
          Keepword catches commitments in your Telegram chats, confirms them with
          the author, and keeps nudging until the work is actually done.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Button href={TELEGRAM_URL} variant="solid">
            Add to chat
          </Button>
          <Button href="#story" variant="outline">
            See how it works
          </Button>
        </div>

        <p className="mt-6 font-display text-[0.6rem] uppercase tracking-[0.2em] text-fg-mute">
          7 days free · then from $5/mo · cancel anytime
        </p>
      </motion.div>

      <a
        href="#about"
        className="absolute bottom-5 left-1/2 z-[3] flex -translate-x-1/2 flex-col items-center gap-2 font-display text-[0.58rem] uppercase tracking-[0.22em] text-fg-mute"
      >
        <span className="relative h-8 w-[20px] rounded-full border border-line">
          <span className="absolute left-1/2 top-1.5 h-1.5 w-[2px] -translate-x-1/2 bg-fg [animation:wheel_1.6s_ease-out_infinite]" />
        </span>
        Scroll
      </a>
    </section>
  );
}
