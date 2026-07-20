"use client";

import { motion, type Variants } from "framer-motion";
import { fadeUp, stagger, viewportOnce } from "@/lib/variants";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
  as?: "div" | "section" | "li" | "span" | "p" | "h2";
  delay?: number;
};

export function Reveal({
  children,
  className,
  variants = fadeUp,
  as = "div",
  delay = 0,
}: RevealProps) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </MotionTag>
  );
}

export function RevealGroup({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "ul";
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </MotionTag>
  );
}
