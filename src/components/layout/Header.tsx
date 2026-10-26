"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/explore#categories", label: "Categories" },
  { href: "/studio", label: "Studio" },
] as const;

function Logo() {
  return (
    <Link href="/" className="group inline-flex items-baseline text-lg font-bold tracking-tight" aria-label="MotionGraphic.si — accueil">
      <span className="text-ink">MotionGraphic</span>
      <span className="text-accent">.si</span>
    </Link>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background/75 backdrop-blur-lg">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Navigation principale">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {item.label}
              {item.href === "/studio" ? (
                <span className="ml-2 inline-block translate-y-[-2px] rounded-full border border-accent/40 bg-accent/10 px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Soon
                </span>
              ) : null}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-accent transition-all duration-300 group-hover:w-full" />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/explore"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/50 text-muted transition-all hover:border-accent/50 hover:text-ink"
            aria-label="Rechercher un template"
          >
            <Search className="h-4.5 w-4.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface/50 text-muted transition-all hover:text-ink md:hidden"
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
                  className="flex h-11 items-center justify-between rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
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