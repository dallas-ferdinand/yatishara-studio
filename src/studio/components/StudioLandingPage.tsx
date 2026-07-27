"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import "./studio-landing.css";

/**
 * Landing story (business creative ecosystem):
 * Overview → Generate → Edit → Hire → Book → Messages → Profiles → Earn → Start
 * Each full-height section = one idea + one real product laptop mock.
 */
const NAV_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "generate", label: "Generate" },
  { id: "edit", label: "Edit" },
  { id: "hire", label: "Hire" },
  { id: "messages", label: "Messages" },
  { id: "profiles", label: "Profiles" },
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
            <button
              type="button"
              role="menuitem"
              className="studio-landing-mobile-link"
              onClick={() => scrollToId("book")}
            >
              Book
            </button>
            <button
              type="button"
              role="menuitem"
              className="studio-landing-mobile-link"
              onClick={() => scrollToId("earn")}
            >
              Earn
            </button>
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
            <p className="studio-landing-kicker">Business creative ecosystem</p>
            <h1 id="overview-title" className="studio-landing-hero-title">
              Yatishara Studio
            </h1>
            <p className="studio-landing-section-lead">
              Generate ads, edit them, hire creators, message the job, and pay
              safely — one workspace for businesses that need creatives done.
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
                Walk the flow
              </button>
            </div>
            <LaptopMock
              src="/landing/mock-flyer.jpg"
              alt="Studio generating a product flyer from a brief"
              priority
            />
          </div>
        </section>

        <LandingSection
          id="generate"
          tone="plate"
          kicker="Generate"
          title="Brief it. Get the ad."
          lead="Talk to Studio like a creative director — image, video, audio, or script."
        >
          <LaptopMock
            src="/landing/mock-generate-chat.jpg"
            alt="Studio assistant chat turning a brief into a video ad"
          />
        </LandingSection>

        <LandingSection
          id="edit"
          tone="page"
          kicker="Edit"
          title="Finish in the timeline."
          lead="Cut, caption, drop stock music or SFX, and export without leaving your files."
        >
          <LaptopMock
            src="/landing/mock-edit.jpg"
            alt="Studio video editor with asset library sound effects"
          />
        </LandingSection>

        <LandingSection
          id="hire"
          tone="plate"
          kicker="Hire"
          title="Need a partner? Book one."
          lead="Creative Network lists verified creators — ads, delivery windows, clear packages."
        >
          <LaptopMock
            src="/landing/mock-network.jpg"
            alt="Creative Network marketplace for booking creators"
          />
        </LandingSection>

        <LandingSection
          id="book"
          tone="page"
          kicker="Book"
          title="Pay when you accept."
          lead="Pick a package, top up, and keep payment protected until delivery looks right."
        >
          <LaptopMock
            src="/landing/mock-book.jpg"
            alt="Booking a Creative Network package with wallet balance"
          />
        </LandingSection>

        <LandingSection
          id="messages"
          tone="plate"
          kicker="Messages"
          title="Run the job in chat."
          lead="Share storyboards, voice notes, and revisions with paid creators in one thread."
        >
          <LaptopMock
            src="/landing/mock-messages.jpg"
            alt="Studio messages with a paid creator and shared storyboard"
          />
        </LandingSection>

        <LandingSection
          id="profiles"
          tone="page"
          kicker="Profiles"
          title="See the work. Hire Us."
          lead="Open a creator profile, skim the portfolio, then hire or message from there."
        >
          <LaptopMock
            src="/landing/mock-profile.jpg"
            alt="Creator profile with Hire Us and portfolio grid"
          />
        </LandingSection>

        <LandingSection
          id="earn"
          tone="plate"
          kicker="Earn"
          title="Creators sell here too."
          lead="List SFX, offers, and assets — track sales beside the same Studio files."
        >
          <LaptopMock
            src="/landing/mock-assets-sell.jpg"
            alt="My assets dashboard with listed sound effects and earnings"
          />
        </LandingSection>

        <section
          id="start"
          className="studio-landing-section is-cta"
          aria-labelledby="start-title"
        >
          <div className="studio-landing-section-inner">
            <p className="studio-landing-kicker">One ecosystem</p>
            <h2 id="start-title" className="studio-landing-section-title">
              From brief to booked delivery.
            </h2>
            <p className="studio-landing-section-lead">
              Studio is where businesses make ads, hire help, and keep the whole
              job — files, chat, and payments — in one place.
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
          <span>Generate · Edit · Hire · Message</span>
        </footer>
      </main>
    </div>
  );
}
