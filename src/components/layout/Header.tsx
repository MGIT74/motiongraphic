"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Search, X } from "lucide-react";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/explore#categories", label: "Categories" },
  { href: "/studio", label: "Studio" },
] as const;

function LogoMark() {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink" aria-hidden="true">
      <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none">
        <rect x="2.5" y="10" width="3.2" height="7" rx="1.2" fill="#000" />
        <rect x="8.4" y="5" width="3.2" height="12" rx="1.2" fill="#000" />
        <rect x="14.3" y="2" width="3.2" height="15" rx="1.2" fill="#000" />
      </svg>
    </span>
  );
}

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="MotionGraphic.si — accueil">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight text-ink transition-opacity group-hover:opacity-80">
        MotionGraphic<span className="text-accent">.si</span>
      </span>
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pill, setPill] = useState<{ x: number; w: number; shown: boolean }>({
    x: 0,
    w: 0,
    shown: false,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const movePill = (el: HTMLAnchorElement) => {
    setPill({ x: el.offsetLeft, w: el.offsetWidth, shown: true });
  };
  const hidePill = () => setPill((p) => ({ ...p, shown: false }));

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled ? "border-line bg-background" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />

        {/* Navigation flottante type pill (style Hands Graphic) */}
        <nav
          className="relative hidden h-13 items-center gap-1 rounded-full border border-line bg-surface/80 p-1.5 md:flex"
          aria-label="Navigation principale"
          onMouseLeave={hidePill}
        >
          <span
            className="pointer-events-none absolute inset-y-1.5 left-0 rounded-full bg-elevated transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              width: pill.w,
              transform: `translateX(${pill.x}px)`,
              opacity: pill.shown ? 1 : 0,
            }}
            aria-hidden="true"
          />
          {NAV.map((item) => {
            const isActive =
              pathname === item.href.split("#")[0] &&
              (item.href !== "/explore#categories" || pathname === "/explore");
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={(e) => movePill(e.currentTarget)}
                onFocus={(e) => movePill(e.currentTarget)}
                className={`relative z-10 inline-flex h-10 items-center rounded-full px-4.5 text-sm font-medium transition-colors duration-200 ${
                  isActive ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
                {item.href === "/studio" ? (
                  <span className="ml-2 rounded-full border border-accent/40 bg-accent/10 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Soon
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/explore"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface/50 text-muted transition-all hover:border-accent/50 hover:text-ink"
            aria-label="Rechercher un template"
          >
            <Search className="h-4.5 w-4.5" aria-hidden="true" />
          </Link>
          <Link
            href="/explore"
            className="hidden h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-black transition-all hover:bg-white sm:inline-flex"
          >
            Explorer
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface/50 text-muted transition-all hover:text-ink md:hidden"
            aria-expanded={open}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-line bg-background/95 px-5 py-4 md:hidden" aria-label="Navigation mobile">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center justify-between rounded-2xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  {item.label}
                  {item.href === "/studio" ? <span className="text-[10px] uppercase tracking-wider text-accent">Soon</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}