"use client";

import { motion } from "framer-motion";
import { RevealGroup } from "./Reveal";
import { fadeUp } from "@/lib/variants";

type Stat = {
  no: string;
  label: string;
  value: string;
  note: string;
};

const STATS: Stat[] = [
  {
    no: "01",
    label: "Author-confirmed",
    value: "100%",
    note: "of tasks are approved by a human before they ever exist.",
  },
  {
    no: "02",
    label: "Fewer dropped balls",
    value: "3×",
    note: "fewer forgotten agreements in a team’s first month.",
  },
  {
    no: "03",
    label: "Every evening",
    value: "20:00",
    note: "a personal digest of only your open commitments.",
  },
  {
    no: "04",
    label: "Zero new apps",
    value: "1 MIN",
    note: "add Keepword to a Telegram group and you’re live.",
  },
];

export function Benefits() {
  return (
    <section id="benefits" className="relative bg-bg py-[clamp(44px,5.5vw,76px)]">
      <div className="mx-auto w-[min(1240px,100%-40px)]">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div className="font-display text-[0.62rem] uppercase tracking-[0.28em] text-fg-mute">
            •• why teams keep it ••
          </div>
          <div className="hidden font-display text-[0.62rem] uppercase tracking-[0.28em] text-fg-mute sm:block">
            [ 04 metrics ]
          </div>
        </div>

        <RevealGroup className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {STATS.map((s) => (
            <motion.div key={s.no} variants={fadeUp}>
              <div className="notch notch--hover relative min-h-[260px] p-7 [--n:20px]">
                <span
                  aria-hidden
                  className="absolute right-2.5 top-2.5 z-10 h-2.5 w-2.5 border-r border-t border-white/35"
                />
                <span
                  aria-hidden
                  className="absolute bottom-2.5 left-2.5 z-10 h-2.5 w-2.5 border-b border-l border-white/35"
                />
                <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-[0.9rem] text-fg">
                      {s.no}
                    </span>
                    <span className="text-fg-mute">/</span>
                    <span className="text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-fg-dim">
                      {s.label}
                    </span>
                  </div>
                  <div>
                    <div className="font-display text-[clamp(2.6rem,6.5vw,4.4rem)] leading-none text-fg">
                      {s.value}
                    </div>
                    <p className="mt-4 max-w-[42ch] text-[0.88rem] leading-relaxed text-fg-mute">
                      {s.note}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
