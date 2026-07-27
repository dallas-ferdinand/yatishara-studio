"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import "./studio-landing.css";

const LANDING_IMAGES = [
  "/studio-cinematic-mint-meadow-light-4k.webp",
  "/studio-scene-ocean-depth-light-4k.webp",
  "/studio-cinematic-gold-archive-light-4k.webp",
] as const;

const NAV_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "features", label: "Features" },
  { id: "network", label: "Network" },
] as const;

const POINTS = [
  {
    title: "Generate",
    body: "Images, video, and audio from one composer — keep every take in your files.",
  },
  {
    title: "Edit",
    body: "Cut clips, captions, and exports without leaving the Studio workspace.",
  },
  {
    title: "Network",
    body: "Browse Creative Network, book creators, and manage offers beside your work.",
  },
] as const;

export function StudioLandingPage({ onSignIn }: { onSignIn: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollToId = (id: string) => {
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>(`#${id}`);
    if (!root || !target) return;
    const top =
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop -
      32;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({
      top: Math.max(0, top),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const node = event.target as Node | null;
      if (menuRef.current && node && !menuRef.current.contains(node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("touchstart", onPointer);
    };
  }, [menuOpen]);

  return (
    <div
      ref={rootRef}
      className="studio-landing"
      data-appearance="light"
    >
      <header className="studio-landing-head" ref={menuRef}>
        <a className="studio-landing-brand" href="/" aria-label="Yatishara Studio">
          <BrandMark size={18} subtle appearance="light" />
          <span className="studio-landing-brand-name">Yatishara Studio</span>
        </a>

        <nav className="studio-landing-nav" aria-label="Page sections">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="studio-landing-nav-link"
              onClick={() => scrollToId(link.id)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="studio-landing-head-end">
          <button
            type="button"
            className="studio-landing-menu-btn"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="studio-landing-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="studio-landing-head-btn is-primary"
            onClick={onSignIn}
          >
            Sign in
          </button>
        </div>

        {menuOpen ? (
          <div
            id="studio-landing-mobile-menu"
            className="studio-landing-mobile-menu"
            role="menu"
            aria-label="Page sections"
          >
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                role="menuitem"
                className="studio-landing-mobile-link"
                onClick={() => scrollToId(link.id)}
              >
                {link.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <main className="studio-landing-main">
        <section
          id="overview"
          className="studio-landing-hero"
          aria-labelledby="studio-landing-title"
        >
          <div className="studio-landing-hero-visual" aria-hidden="true">
            <img
              src={LANDING_IMAGES[0]}
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          </div>

          <div className="studio-landing-hero-copy">
            <p className="studio-landing-kicker">Creative workspace</p>
            <h1 id="studio-landing-title" className="studio-landing-title">
              Yatishara Studio
            </h1>
            <p className="studio-landing-lead">
              Generate media, edit video, hire creators, and keep everything in one
              place — files, feed, and Creative Network included.
            </p>
            <div className="studio-landing-cta-row">
              <button type="button" className="studio-landing-cta" onClick={onSignIn}>
                Sign in to Studio
                <ArrowRight aria-hidden="true" />
              </button>
              <a className="studio-landing-cta-ghost" href="/creative-network">
                Browse Creative Network
              </a>
            </div>
          </div>

          <div className="studio-landing-strip" aria-hidden="true">
            {LANDING_IMAGES.map((src) => (
              <figure key={src}>
                <img src={src} alt="" loading="lazy" decoding="async" />
              </figure>
            ))}
          </div>
        </section>

        <section
          id="features"
          className="studio-landing-points"
          aria-label="What Studio includes"
        >
          {POINTS.map((point) => (
            <div key={point.title} className="studio-landing-point">
              <h2>{point.title}</h2>
              <p>{point.body}</p>
            </div>
          ))}
        </section>

        <section id="network" className="studio-landing-network" aria-labelledby="studio-landing-network-title">
          <div className="studio-landing-network-copy">
            <h2 id="studio-landing-network-title">Creative Network</h2>
            <p>
              Hire verified creators, browse offers, and keep jobs next to your
              Studio files.
            </p>
          </div>
          <a className="studio-landing-cta" href="/creative-network">
            Open Network
            <ArrowRight aria-hidden="true" />
          </a>
        </section>

        <footer className="studio-landing-foot">
          <span>Yatishara Studio</span>
          <span>Create · Edit · Hire</span>
        </footer>
      </main>
    </div>
  );
}
