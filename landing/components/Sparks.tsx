"use client";

type Spark = { x: string; y: string; d: string; s: number };

const HERO_SPARKS: Spark[] = [
  { x: "14%", y: "30%", d: "0s", s: 1 },
  { x: "82%", y: "24%", d: "1.4s", s: 0.7 },
  { x: "68%", y: "52%", d: "2.1s", s: 1.1 },
  { x: "24%", y: "64%", d: "0.7s", s: 0.85 },
  { x: "90%", y: "60%", d: "2.8s", s: 0.6 },
  { x: "40%", y: "18%", d: "1.9s", s: 0.75 },
];

const CTA_SPARKS: Spark[] = [
  { x: "18%", y: "26%", d: "0.3s", s: 1 },
  { x: "78%", y: "34%", d: "1.7s", s: 0.8 },
  { x: "60%", y: "70%", d: "2.4s", s: 1 },
  { x: "30%", y: "74%", d: "1s", s: 0.7 },
];

export function Sparks({ variant = "hero" }: { variant?: "hero" | "cta" }) {
  const sparks = variant === "hero" ? HERO_SPARKS : CTA_SPARKS;
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
      {sparks.map((sp, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: sp.x,
            top: sp.y,
            width: `${2.5 * sp.s}px`,
            height: `${2.5 * sp.s}px`,
            opacity: 0,
            animation: `twinkle 5s ease-in-out ${sp.d} infinite`,
          }}
        />
      ))}
    </div>
  );
}
