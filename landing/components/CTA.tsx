"use client";

import { Reveal } from "./Reveal";
import { Sparks } from "./Sparks";
import { Button } from "./ui/Button";

export function CTA() {
  return (
    <section
      id="cta"
      className="relative overflow-hidden border-t border-line-soft bg-bg py-[clamp(60px,8vw,110px)]"
    >
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_60%_at_50%_30%,rgba(255,255,255,0.06),transparent_70%)]" />
      <Sparks variant="cta" />

      <div className="relative z-[2] mx-auto w-[min(1000px,100%-40px)] text-center">
        <Reveal>
          <div className="mb-8 font-display text-[0.62rem] uppercase tracking-[0.3em] text-fg-mute">
            •• add keepword ••
          </div>
        </Reveal>
        <Reveal>
          <h2 className="mx-auto mb-7 max-w-[16ch] font-display text-[clamp(2rem,6vw,4.3rem)] uppercase leading-[1.06] text-fg">
            Never lose a promise in the chat again
          </h2>
        </Reveal>
        <Reveal>
          <p className="mx-auto mb-9 max-w-[56ch] text-[clamp(0.98rem,1.4vw,1.15rem)] leading-relaxed text-fg-dim">
            Add Keepword to a work group in a minute. It only reads new messages
            and never creates a task without confirmation.
          </p>
        </Reveal>
        <Reveal>
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="#" variant="solid">
              Add to chat
            </Button>
            <Button href="#story" variant="outline">
              See the scenario
            </Button>
          </div>
        </Reveal>
        <Reveal>
          <p className="mt-7 font-display text-[0.6rem] uppercase tracking-[0.2em] text-fg-mute">
            Free for early teams / Works right inside Telegram
          </p>
        </Reveal>
      </div>
    </section>
  );
}
