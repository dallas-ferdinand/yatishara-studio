"use client";

import { ArrowRight, Mail, MapPin, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import "./studio-landing.css";

const NAV_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "generate", label: "Generate" },
  { id: "edit", label: "Edit" },
  { id: "hire", label: "Hire" },
  { id: "messages", label: "Messages" },
  { id: "faq", label: "FAQ" },
] as const;

const FAQ_ITEMS = [
  {
    q: "What is Yatishara Studio?",
    a: "A business creative ecosystem — generate ads, edit them, hire creators, message the job, and pay safely in one workspace.",
  },
  {
    q: "Who is it for?",
    a: "Businesses that need ads and creatives done, plus creators who want to sell offers or assets beside the same tools.",
  },
  {
    q: "Do I have to hire someone?",
    a: "No. Generate and edit on your own, or book a verified creator on Creative Network when you need a partner.",
  },
  {
    q: "How does booking payment work?",
    a: "You pick a package and top up your Studio wallet. Payment stays protected until you accept the delivery.",
  },
  {
    q: "What currencies do you use?",
    a: "Studio wallets and listings use TTD (Trinidad & Tobago dollars).",
  },
  {
    q: "Where are you based?",
    a: "Yatishara operates from Trinidad & Tobago. Email hello@yatishara.com — details in Visit below.",
  },
] as const;

/** Odoo-style marker wash behind a phrase. */
function Hl({
  children,
  tone = "amber",
}: {
  children: ReactNode;
  tone?: "amber" | "mint" | "ink";
}) {
  return <span className={`studio-landing-hl is-${tone}`}>{children}</span>;
}

/** Loose hand circle around a short word. */
function Circled({ children }: { children: ReactNode }) {
  return (
    <span className="studio-landing-circled">
      <svg
        className="studio-landing-circled-svg"
        viewBox="0 0 120 48"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path
          d="M10 28c3-16 22-24 50-23 30 1 52 10 51 23-2 14-22 19-52 19S7 42 10 28z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="studio-landing-circled-text">{children}</span>
    </span>
  );
}

/** Wavy underline under a phrase. */
function Wavy({
  children,
  tone = "sky",
}: {
  children: ReactNode;
  tone?: "sky" | "coral" | "ink";
}) {
  return (
    <span className={`studio-landing-wavy is-${tone}`}>
      {children}
      <svg className="studio-landing-wavy-svg" viewBox="0 0 120 10" aria-hidden="true" preserveAspectRatio="none">
        <path
          d="M2 6c10-4 18 4 28 0s18-4 28 0 18 4 28 0 18-4 30 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

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
  aside,
}: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead: string;
  children?: ReactNode;
  tone?: "page" | "plate";
  aside?: string;
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
        {aside ? (
          <p className="studio-landing-aside" aria-hidden="true">
            <svg viewBox="0 0 48 28" className="studio-landing-aside-arrow">
              <path
                d="M2 8c12 2 18 14 30 14 4 0 8-2 12-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M38 10l8 6-10 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {aside}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="studio-landing-section is-plate" aria-labelledby="faq-title">
      <div className="studio-landing-section-inner is-narrow">
        <p className="studio-landing-kicker">FAQ</p>
        <h2 id="faq-title" className="studio-landing-section-title">
          Quick <Hl tone="mint">answers</Hl>.
        </h2>
        <p className="studio-landing-section-lead">
          The short version of how Studio fits a business that needs ads done.
        </p>
        <div className="studio-landing-faq">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q} className={`studio-landing-faq-item${isOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="studio-landing-faq-q"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <span className="studio-landing-faq-mark" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen ? <p className="studio-landing-faq-a">{item.a}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function StudioLandingPage({ onSignIn }: { onSignIn: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const year = new Date().getFullYear();

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
            {[
              ...NAV_LINKS,
              { id: "book", label: "Book" },
              { id: "profiles", label: "Profiles" },
              { id: "earn", label: "Earn" },
              { id: "visit", label: "Visit" },
            ].map((link) => (
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
            <p className="studio-landing-kicker">Business creative ecosystem</p>
            <h1 id="overview-title" className="studio-landing-hero-title">
              Yatishara <Circled>Studio</Circled>
            </h1>
            <p className="studio-landing-section-lead">
              Generate ads, edit them, hire creators, and pay safely —{" "}
              <Hl>one workspace</Hl> for businesses that{" "}
              <Wavy>need creatives done</Wavy>.
            </p>
            <p className="studio-landing-aside" aria-hidden="true">
              <svg viewBox="0 0 48 28" className="studio-landing-aside-arrow">
                <path
                  d="M4 20c14-2 22-14 40-16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M36 2l8 2-4 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              files · chat · payments — all here
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
          title={
            <>
              Brief it. Get the <Hl tone="mint">ad</Hl>.
            </>
          }
          lead="Talk to Studio like a creative director — image, video, audio, or script."
          aside="no tool-hopping"
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
          title={
            <>
              Cut. Caption. <Wavy tone="coral">Ship</Wavy>.
            </>
          }
          lead="Finish in the timeline — stock music and SFX sit right beside your files."
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
          title={
            <>
              Need a partner? <Circled>Book</Circled> one.
            </>
          }
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
          title={
            <>
              Pay when you <Hl>accept</Hl>.
            </>
          }
          lead="Pick a package, top up, and keep payment protected until delivery looks right."
          aside="wallet stays in Studio"
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
          title={
            <>
              Run the job in <Wavy tone="sky">chat</Wavy>.
            </>
          }
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
          title={
            <>
              See the work. <Hl tone="mint">Hire Us</Hl>.
            </>
          }
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
          title={
            <>
              Creators <Circled>sell</Circled> here too.
            </>
          }
          lead="List SFX, offers, and assets — track sales beside the same Studio files."
        >
          <LaptopMock
            src="/landing/mock-assets-sell.jpg"
            alt="My assets dashboard with listed sound effects and earnings"
          />
        </LandingSection>

        <FaqSection />

        <section
          id="visit"
          className="studio-landing-section is-page"
          aria-labelledby="visit-title"
        >
          <div className="studio-landing-section-inner is-narrow">
            <p className="studio-landing-kicker">Visit</p>
            <h2 id="visit-title" className="studio-landing-section-title">
              <Wavy>Trinidad &amp; Tobago</Wavy>.
            </h2>
            <p className="studio-landing-section-lead">
              Yatishara Studio is built and operated from Trinidad &amp; Tobago —
              wallets and listings in TTD.
            </p>
            <ul className="studio-landing-visit">
              <li>
                <MapPin aria-hidden="true" />
                <span>Trinidad &amp; Tobago</span>
              </li>
              <li>
                <Mail aria-hidden="true" />
                <a href="mailto:hello@yatishara.com">hello@yatishara.com</a>
              </li>
            </ul>
          </div>
        </section>

        <section
          id="start"
          className="studio-landing-section is-cta"
          aria-labelledby="start-title"
        >
          <div className="studio-landing-section-inner">
            <p className="studio-landing-kicker">One ecosystem</p>
            <h2 id="start-title" className="studio-landing-section-title">
              From brief to <Hl>booked delivery</Hl>.
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
            <p className="studio-landing-aside is-under-cta" aria-hidden="true">
              simple. efficient. in one place.
            </p>
          </div>
        </section>

        <footer className="studio-landing-foot">
          <div className="studio-landing-foot-brand">
            <BrandMark size={22} subtle appearance="light" />
            <span>Yatishara Studio</span>
          </div>
          <p className="studio-landing-foot-copy">
            © {year} Yatishara Studio. All rights reserved.
          </p>
          <a className="studio-landing-foot-mail" href="mailto:hello@yatishara.com">
            hello@yatishara.com
          </a>
        </footer>
      </main>
    </div>
  );
}
