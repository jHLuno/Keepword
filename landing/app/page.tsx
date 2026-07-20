import { Nav } from "@/components/Nav";
import { ScrollProgress } from "@/components/ScrollProgress";
import { Hero } from "@/components/Hero";
import { About } from "@/components/About";
import { Benefits } from "@/components/Benefits";
import { Story } from "@/components/Story";
import { CTA } from "@/components/CTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <About />
        <Benefits />
        <Story />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
