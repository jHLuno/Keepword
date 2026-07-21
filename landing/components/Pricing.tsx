"use client";

import { motion } from "framer-motion";
import { RevealGroup } from "./Reveal";
import { fadeUp } from "@/lib/variants";
import { Button } from "./ui/Button";
import { TELEGRAM_URL } from "@/lib/links";

type Plan = {
  no: string;
  name: string;
  price: string;
  seats: string;
  features: string[];
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    no: "01",
    name: "Small team",
    price: "$5",
    seats: "Up to 5 people",
    features: [
      "Every commitment caught & confirmed",
      "Personal reminders + evening digest",
      "Team digest for admins",
    ],
  },
  {
    no: "02",
    name: "Growing team",
    price: "$15",
    seats: "6 or more people",
    featured: true,
    features: [
      "Everything in Small team",
      "Unlimited members in the group",
      "Priority support in Telegram",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative bg-bg py-[clamp(44px,5.5vw,76px)]">
      <div className="mx-auto w-[min(1240px,100%-40px)]">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div className="font-display text-[0.62rem] uppercase tracking-[0.28em] text-fg-mute">
            •• pricing ••
          </div>
          <div className="inline-flex items-center gap-2 border border-line px-3 py-1.5 font-display text-[0.6rem] uppercase tracking-[0.22em] text-fg">
            <span className="h-1.5 w-1.5 rounded-full bg-fg [animation:ping-soft_2.4s_infinite]" />
            7 days free
          </div>
        </div>

        <h2 className="mb-3 max-w-[18ch] font-display text-[clamp(1.5rem,3.6vw,2.7rem)] uppercase leading-[1.12] text-fg">
          Start free. Pay only if it earns its place.
        </h2>
        <p className="mb-10 max-w-[56ch] text-[0.94rem] leading-relaxed text-fg-dim md:text-[1rem]">
          Every team starts with a 7-day free trial — no card required. After
          that it’s a simple monthly subscription, and you can cancel anytime.
        </p>

        <RevealGroup className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {PLANS.map((p) => (
            <motion.div key={p.no} variants={fadeUp}>
              <div className="notch notch--hover relative p-8 [--n:22px]">
                <span
                  aria-hidden
                  className="absolute right-2.5 top-2.5 z-10 h-2.5 w-2.5 border-r border-t border-white/35"
                />
                <span
                  aria-hidden
                  className="absolute bottom-2.5 left-2.5 z-10 h-2.5 w-2.5 border-b border-l border-white/35"
                />
                <div className="relative z-10 flex flex-col gap-7">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="font-display text-[0.9rem] text-fg">
                        {p.no}
                      </span>
                      <span className="text-fg-mute">/</span>
                      <span className="text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-fg-dim">
                        {p.name}
                      </span>
                    </div>
                    {p.featured && (
                      <span className="font-display text-[0.56rem] uppercase tracking-[0.18em] text-fg-mute">
                        [ bigger teams ]
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-[clamp(2.6rem,6vw,4rem)] leading-none text-fg">
                        {p.price}
                      </span>
                      <span className="text-[0.9rem] text-fg-mute">/ month</span>
                    </div>
                    <p className="mt-3 text-[0.9rem] text-fg-dim">{p.seats}</p>
                  </div>

                  <ul className="flex flex-col gap-3 border-t border-line-soft pt-6">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-[0.9rem] text-fg">
                        <span className="mt-0.5 font-display text-[0.7rem] text-fg-mute">
                          +
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-col gap-3">
                    <Button href={TELEGRAM_URL} variant="solid" className="w-full">
                      Start 7 days free
                    </Button>
                    <p className="text-center font-display text-[0.56rem] uppercase tracking-[0.18em] text-fg-mute">
                      then {p.price}/mo · cancel anytime
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
