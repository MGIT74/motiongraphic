import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "En construction — MotionGraphic.si",
  description: "MotionGraphic.si prépare sa prochaine version.",
  robots: { index: false, follow: false },
};

export default function ConstructionPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#090b11] px-6 text-white">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-3xl font-bold tracking-tight">
          M<span className="text-[#64d2ff]">.</span>
        </div>
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-[#64d2ff]">MotionGraphic.si</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Quelque chose de beau se prépare.</h1>
        <p className="mx-auto mt-6 max-w-md text-base leading-7 text-white/60">
          Notre plateforme de motion design est actuellement en construction.
          Nous revenons bientôt avec une nouvelle expérience créative.
        </p>
        <div className="mx-auto mt-10 h-px w-24 bg-[#64d2ff]/60" />
        <p className="mt-6 text-xs tracking-widest text-white/35">COMING SOON</p>
      </div>
    </main>
  );
}
