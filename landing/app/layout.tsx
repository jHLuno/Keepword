import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

const geistPixel = localFont({
  src: "./fonts/GeistPixel.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "Keepword — team promises, turned into follow-through",
  description:
    "Keepword is a Telegram bot that catches commitments in team chats, confirms them with the author, and reminds people until the work is done.",
  openGraph: {
    title: "Keepword — team promises, turned into follow-through",
    description: "AI that turns team promises into follow-through.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080808",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistPixel.variable}`}
      suppressHydrationWarning
    >
      <body className="grain" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
