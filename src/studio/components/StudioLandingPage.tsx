"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import "./studio-landing.css";

const NAV_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "generate", label: "Generate" },
  { id: "edit", label: "Edit" },
  { id: "hire", label: "Hire" },
  { id: "review", label: "Review" },
] as const;

function LaptopMock({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <figure className="studio-landing-laptop">
      <div className="studio-landing-laptop-chrome" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="studio-landing-laptop-screen">
        <img
          src={src}
          alt={alt}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
        />
      </div>
      <div className="studio-landing-laptop-base" aria-hidden="true" />
    </figure>
  );
}

function LandingSection({
  id,
  kicker,
  title,
  lead,
  children,
  tone = "page",
}: {
  id: string;
  kicker: string;
  title: string;
  lead: string;
  children?: ReactNode;
  tone?: "page" | "plate";
}) {
  return (
    <section
      id={id}
      className={`studio-landing-section is-${tone}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="studio-landing-section-inner">
        <p className="studio-landing-kicker">{kicker}</p>
        <h2 id={`${id}-title`} className="studio-landing-section-title">
          {title}
        </h2>
        <p className="studio-landing-section-lead">{lead}</p>
        {children}
      </div>
    </section>
  );
}

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
    <div ref={rootRef} className="studio-landing" data-appearance="light">
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
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
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
          className="studio-landing-section is-hero"
          aria-labelledby="overview-title"
        >
          <div className="studio-landing-section-inner">
            <p className="studio-landing-kicker">For businesses that need ads</p>
            <h1 id="overview-title" className="studio-landing-hero-title">
              Yatishara Studio
            </h1>
            <p className="studio-landing-section-lead">
              One ecosystem to generate creatives, edit them, hire partners, and
              review the work — without hopping between tools.
            </p>
            <div className="studio-landing-cta-row">
              <button type="button" className="studio-landing-cta" onClick={onSignIn}>
                Enter Studio
                <ArrowRight aria-hidden="true" />
              </button>
              <button
                type="button"
                className="studio-landing-cta-ghost"
                onClick={() => scrollToId("generate")}
              >
                See how it works
              </button>
            </div>
            <LaptopMock
              src="/landing/mock-generate.jpg"
              alt="Studio generate workspace"
              priority
            />
          </div>
        </section>

        <LandingSection
          id="generate"
          tone="plate"
          kicker="Generate"
          title="Make the ad."
          lead="Images, video, audio, and scripts — brief once, generate in Studio."
        >
          <LaptopMock
            src="/landing/mock-assist.jpg"
            alt="Studio assistant generating ad creatives"
          />
        </LandingSection>

        <LandingSection
          id="edit"
          tone="page"
          kicker="Edit"
          title="Cut. Caption. Ship."
          lead="Open the timeline, refine the take, export without leaving your files."
        >
          <LaptopMock
            src="/landing/mock-edit.jpg"
            alt="Studio video editor timeline"
          />
        </LandingSection>

        <LandingSection
          id="hire"
          tone="plate"
          kicker="Hire"
          title="Book the creator."
          lead="Creative Network keeps payment safe until you accept delivery."
        >
          <LaptopMock
            src="/landing/mock-network.jpg"
            alt="Creative Network marketplace in Studio"
          />
        </LandingSection>

        <LandingSection
          id="review"
          tone="page"
          kicker="Review"
          title="Approve together."
          lead="Share cuts on the feed, collect comments, and lock the next revision."
        >
          <LaptopMock
            src="/landing/mock-feed.jpg"
            alt="Studio feed for creative review"
          />
        </LandingSection>

        <section
          id="start"
          className="studio-landing-section is-cta"
          aria-labelledby="start-title"
        >
          <div className="studio-landing-section-inner">
            <p className="studio-landing-kicker">One workspace</p>
            <h2 id="start-title" className="studio-landing-section-title">
              Generate. Edit. Hire. Review.
            </h2>
            <p className="studio-landing-section-lead">
              Studio is the operating layer for businesses that need ads done —
              not another disconnected tool.
            </p>
            <div className="studio-landing-cta-row">
              <button type="button" className="studio-landing-cta" onClick={onSignIn}>
                Sign in to Studio
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <footer className="studio-landing-foot">
          <span>Yatishara Studio</span>
          <span>Business creative ecosystem</span>
        </footer>
      </main>
    </div>
  );
}
