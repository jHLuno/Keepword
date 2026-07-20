"use client";

import { motion } from "framer-motion";
import { fadeUp, viewportOnce } from "@/lib/variants";
import { TgAvatar, TgButton, TgCard, TgHead } from "./ui/TelegramCard";

/* one revealing row of the thread — fades + pops up on scroll */
function Beat({
  children,
  align = "start",
  delay = 0,
}: {
  children: React.ReactNode;
  align?: "start" | "end";
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      transition={{ delay }}
      className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}
    >
      {children}
    </motion.div>
  );
}

function StepLabel({ n, title }: { n: string; title: string }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      className="flex items-center gap-3 py-2"
    >
      <span className="font-display text-[0.7rem] text-fg">{n}</span>
      <span className="h-px w-8 bg-line" />
      <span className="font-display text-[0.62rem] uppercase tracking-[0.24em] text-fg-dim">
        {title}
      </span>
    </motion.div>
  );
}

function Bubble({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-[80%] items-start gap-3">
      <TgAvatar small>{name[0]}</TgAvatar>
      <div className="border border-line bg-panel px-4 py-3">
        <b className="mb-1 block text-[0.78rem] font-semibold text-fg-dim">
          {name}
        </b>
        <p className="text-[0.95rem] leading-relaxed text-fg">{children}</p>
      </div>
    </div>
  );
}

const META: [string, string][] = [
  ["Action", "send proposal to client"],
  ["Owner", "Daniyar"],
  ["Due", "today · 23:59"],
  ["Source", "Telegram message"],
];

const STEPS: [string, string][] = [
  ["01", "Notices"],
  ["02", "Confirms"],
  ["03", "Reminds"],
  ["04", "Wraps up"],
];

export function Story() {
  return (
    <section id="story" className="relative bg-bg py-[clamp(52px,7vw,92px)]">
      <div className="mx-auto w-[min(1240px,100%-40px)]">
        <div className="grid grid-cols-1 gap-y-12 md:grid-cols-[0.82fr_1.18fr] md:gap-x-16">
          {/* LEFT — pins in place while the thread scrolls & messages pop in */}
          <div className="md:sticky md:top-28 md:h-fit md:self-start">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              className="mb-6 flex items-center gap-3 font-display text-[0.62rem] uppercase tracking-[0.3em] text-fg-mute"
            >
              <span aria-hidden>••</span>
              the life of one promise
              <span aria-hidden>••</span>
            </motion.div>

            <motion.h2
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              className="max-w-[15ch] font-display text-[clamp(1.5rem,3.6vw,2.7rem)] uppercase leading-[1.12] text-fg"
            >
              From a message to a kept commitment
            </motion.h2>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              className="mt-5 max-w-[38ch] text-[0.94rem] leading-relaxed text-fg-dim"
            >
              One commitment, followed end to end — noticed in the chat, confirmed
              by its author, gently reminded, and wrapped up by evening.
            </motion.p>

            <motion.ol
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              className="mt-9 hidden gap-y-3 border-t border-line-soft pt-6 md:grid"
            >
              {STEPS.map(([n, t]) => (
                <li key={n} className="flex items-center gap-3">
                  <span className="font-display text-[0.72rem] text-fg">{n}</span>
                  <span className="h-px w-6 bg-line" />
                  <span className="font-display text-[0.62rem] uppercase tracking-[0.22em] text-fg-dim">
                    {t}
                  </span>
                </li>
              ))}
            </motion.ol>
          </div>

          {/* RIGHT — the thread; each beat fades + pops up on scroll */}
          <div className="relative">
            <span
              aria-hidden
              className="absolute left-[7px] top-2 bottom-2 hidden w-px bg-line-soft sm:block"
            />

            <div className="space-y-5 sm:pl-10">
              <StepLabel n="01" title="Notices" />

              <Beat align="start">
                <Bubble name="Daniyar">
                  Sending the proposal to the client today by end of day.
                </Bubble>
              </Beat>

              <Beat align="end" delay={0.05}>
                <span className="inline-flex items-center gap-2 border border-line bg-panel px-3.5 py-2 text-[0.78rem] text-fg-dim">
                  <span className="flex gap-1">
                    <i className="h-1 w-1 rounded-full bg-fg [animation:blink_1.2s_infinite]" />
                    <i className="h-1 w-1 rounded-full bg-fg [animation:blink_1.2s_0.2s_infinite]" />
                    <i className="h-1 w-1 rounded-full bg-fg [animation:blink_1.2s_0.4s_infinite]" />
                  </span>
                  Keepword is reading the chat…
                </span>
              </Beat>

              <StepLabel n="02" title="Confirms" />

              <Beat align="start" delay={0.05}>
                <TgCard className="w-full max-w-[460px]">
                  <div className="mb-3.5 border-l border-line pl-3 text-[0.8rem] text-fg-mute">
                    Daniyar · sending the proposal to the client today
                  </div>
                  <TgHead title="Keepword" subtitle="Case Lab Team" tag="Reply" />
                  <p className="mb-4 text-[0.96rem] leading-relaxed text-fg">
                    <span className="text-fg-dim">Spotted a commitment.</span>{" "}
                    Daniyar will send the proposal to the client today by 23:59.
                  </p>
                  <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line-soft py-3">
                    {META.map(([k, v]) => (
                      <div key={k} className="flex flex-col">
                        <dt className="font-display text-[0.56rem] uppercase tracking-[0.16em] text-fg-mute">
                          {k}
                        </dt>
                        <dd className="text-[0.82rem] text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <TgButton primary>Confirm</TgButton>
                    <TgButton>Edit</TgButton>
                    <TgButton>Dismiss</TgButton>
                  </div>
                </TgCard>
              </Beat>

              <Beat align="start" delay={0.1}>
                <span className="inline-flex items-center gap-2 border border-line bg-panel px-3.5 py-2 text-[0.82rem] text-fg">
                  <span className="font-display text-fg">✓✓</span>
                  Confirmed by Daniyar — now visible to the whole team
                </span>
              </Beat>

              <StepLabel n="03" title="Reminds — privately" />

              <Beat align="end" delay={0.05}>
                <TgCard className="w-full max-w-[400px]">
                  <TgHead
                    title="Keepword"
                    subtitle="direct message"
                    tag="18:00"
                  />
                  <p className="mb-4 text-[0.95rem] leading-relaxed text-fg">
                    <span className="text-fg-dim">Reminder —</span> due today:{" "}
                    <b className="font-semibold">send the proposal to the client.</b>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <TgButton primary>Done</TgButton>
                    <TgButton>Reschedule</TgButton>
                    <TgButton>Blocked</TgButton>
                  </div>
                </TgCard>
              </Beat>

              <StepLabel n="04" title="Wraps up the day" />

              <Beat align="end" delay={0.05}>
                <TgCard className="w-full max-w-[440px]">
                  <TgHead title="Your digest" subtitle="July 18 · 20:00" tag="Daily" />
                  <ul className="mb-4 grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ["2", "Done today"],
                        ["3", "Open"],
                        ["1", "Overdue"],
                        ["2", "Due tomorrow"],
                      ] as [string, string][]
                    ).map(([n, l]) => (
                      <li
                        key={l}
                        className="flex items-baseline gap-2 border border-line-soft px-3 py-2.5"
                      >
                        <b className="font-display text-[1.4rem] leading-none text-fg">
                          {n}
                        </b>
                        <span className="text-[0.76rem] text-fg-mute">{l}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-line-soft pt-3">
                    <p className="mb-2 font-display text-[0.56rem] uppercase tracking-[0.16em] text-fg-mute">
                      Needs attention
                    </p>
                    <p className="text-[0.86rem] text-fg-dim">
                      Proposal for Client N — overdue by 1 day
                    </p>
                    <p className="text-[0.86rem] text-fg-dim">
                      Prepare budget — due tomorrow at 12:00
                    </p>
                  </div>
                  <TgButton wide>My tasks</TgButton>
                </TgCard>
              </Beat>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
