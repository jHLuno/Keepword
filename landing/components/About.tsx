"use client";

import { Reveal } from "./Reveal";

export function About() {
  return (
    <section id="about" className="relative bg-bg py-[clamp(52px,7vw,92px)]">
      <div className="mx-auto w-[min(1240px,100%-40px)]">
        <div className="grid grid-cols-1 gap-y-12 md:grid-cols-[1.1fr_0.9fr] md:gap-x-16">
          {/* LEFT — pins in place while the right column scrolls past */}
          <div className="md:sticky md:top-28 md:h-fit md:self-start">
            <Reveal>
              <div className="mb-8 flex items-center gap-3 font-display text-[0.62rem] uppercase tracking-[0.3em] text-fg-mute">
                <span aria-hidden>••</span>
                about us
                <span aria-hidden>••</span>
              </div>
            </Reveal>
            <Reveal>
              <h2 className="max-w-[16ch] font-display text-[clamp(1.5rem,3.9vw,3rem)] uppercase leading-[1.12] tracking-[0.005em] text-fg">
                Keepword is an AI Telegram bot that catches promises in team chats
                and turns them into follow-through.
              </h2>
            </Reveal>
          </div>

          {/* RIGHT — starts low, scrolls up to its resting position */}
          <div className="flex flex-col justify-end gap-6 md:min-h-[104vh] md:pb-[4vh]">
            <div className="space-y-6 text-[0.94rem] leading-relaxed text-fg-dim md:text-[1rem]">
              <Reveal>
                <p>
                  Work rarely breaks because teams stop talking. It breaks because
                  commitments disappear inside endless threads — a proposal here, a
                  deadline there, an “I’ll handle it” that no one ever wrote down.
                  Then the chat scrolls up, the date passes, and it becomes
                  “I thought you were doing that.”
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <p>
                  Keepword reads new messages in a connected work chat, notices real
                  commitments, and asks the author to confirm them. Nothing is
                  created silently. Every agreement stays visible, owned, and tied to
                  the exact message it came from — the infrastructure of
                  follow-through for teams that move fast.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
