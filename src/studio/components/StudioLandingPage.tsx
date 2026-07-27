"use client";

import { ArrowRight, Mail, MapPin, Menu, MessageCircle, Phone, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import "./studio-landing.css";

/**
 * Landing story (business creative ecosystem):
 * Overview → Generate → Edit → Hire → Book → Messages → Profiles → Earn → FAQ → Visit → Start
 */
const NAV_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "generate", label: "Generate" },
  { id: "edit", label: "Edit" },
  { id: "hire", label: "Hire" },
  { id: "messages", label: "Messages" },
  { id: "faq", label: "FAQ" },
] as const;

type Callout = {
  /** % from left of screen */
  x: number;
  /** % from top of screen */
  y: number;
  /** ellipse width % */
  w: number;
  /** ellipse height % */
  h: number;
  label: string;
  /** label placement relative to circle */
  place?: "top" | "bottom" | "left" | "right";
};

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
    a: "Yatishara operates from Trinidad & Tobago. Reach us on WhatsApp or email — details in Visit below.",
  },
] as const;

function PencilCallouts({ callouts }: { callouts: Callout[] }) {
  return (
    <div className="studio-landing-callouts" aria-hidden="true">
      <svg className="studio-landing-callouts-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {callouts.map((c) => (
          <ellipse
            key={`${c.label}-${c.x}-${c.y}`}
            className="studio-landing-callout-ring"
            cx={c.x}
            cy={c.y}
            rx={c.w / 2}
            ry={c.h / 2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {callouts.map((c) => (
        <span
          key={`label-${c.label}-${c.x}`}
          className={`studio-landing-callout-label is-${c.place ?? "bottom"}`}
          style={{ left: `${c.x}%`, top: `${c.y}%` }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function LaptopMock({
  src,
  alt,
  priority = false,
  callouts,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  callouts?: Callout[];
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
        {callouts?.length ? <PencilCallouts callouts={callouts} /> : null}
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

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="studio-landing-section is-plate" aria-labelledby="faq-title">
      <div className="studio-landing-section-inner is-narrow">
        <p className="studio-landing-kicker">FAQ</p>
        <h2 id="faq-title" className="studio-landing-section-title">
          Quick answers.
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
              callouts={[
                {
                  x: 52,
                  y: 58,
                  w: 34,
                  h: 28,
                  label: "Brief → finished flyer",
                  place: "top",
                },
                {
                  x: 52,
                  y: 78,
                  w: 28,
                  h: 12,
                  label: "Upscale or make video next",
                  place: "bottom",
                },
              ]}
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
            callouts={[
              {
                x: 54,
                y: 82,
                w: 36,
                h: 10,
                label: "Pick Image / Video / Audio",
                place: "top",
              },
            ]}
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
            callouts={[
              {
                x: 18,
                y: 48,
                w: 22,
                h: 36,
                label: "Stock SFX in the same app",
                place: "right",
              },
              {
                x: 58,
                y: 78,
                w: 42,
                h: 18,
                label: "Timeline + voiceover",
                place: "top",
              },
            ]}
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
            callouts={[
              {
                x: 58,
                y: 28,
                w: 48,
                h: 22,
                label: "Browse verified creators",
                place: "bottom",
              },
            ]}
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
            callouts={[
              {
                x: 82,
                y: 48,
                w: 22,
                h: 40,
                label: "Packages + wallet",
                place: "left",
              },
            ]}
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
            callouts={[
              {
                x: 14,
                y: 36,
                w: 18,
                h: 14,
                label: "Paid jobs",
                place: "right",
              },
              {
                x: 48,
                y: 52,
                w: 28,
                h: 30,
                label: "Share the board in-thread",
                place: "bottom",
              },
            ]}
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
            callouts={[
              {
                x: 48,
                y: 32,
                w: 18,
                h: 12,
                label: "Hire Us",
                place: "bottom",
              },
            ]}
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
            callouts={[
              {
                x: 48,
                y: 28,
                w: 55,
                h: 14,
                label: "Funds + live listings",
                place: "bottom",
              },
            ]}
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
              Trinidad &amp; Tobago.
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
                <Phone aria-hidden="true" />
                <a href="https://wa.me/18683034621" target="_blank" rel="noreferrer">
                  +1 (868) 303-4621
                </a>
              </li>
              <li>
                <MessageCircle aria-hidden="true" />
                <a href="https://wa.me/18683034621" target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </li>
              <li>
                <Mail aria-hidden="true" />
                <a href="mailto:yatishara.com@gmail.com">yatishara.com@gmail.com</a>
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
          <span>Yatishara Studio · Trinidad &amp; Tobago</span>
          <span>Generate · Edit · Hire · Message</span>
        </footer>
      </main>
    </div>
  );
}
