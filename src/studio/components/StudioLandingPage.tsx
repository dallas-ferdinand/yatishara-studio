"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  Clapperboard,
  CircleHelp,
  Home,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Sparkles,
  UserCircle,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
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

const MENU_LINKS: ReadonlyArray<{
  id: string;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "overview", label: "Overview", Icon: Home },
  { id: "generate", label: "Generate", Icon: Sparkles },
  { id: "edit", label: "Edit", Icon: Clapperboard },
  { id: "hire", label: "Hire", Icon: Users },
  { id: "book", label: "Book", Icon: Wallet },
  { id: "messages", label: "Messages", Icon: MessageCircle },
  { id: "profiles", label: "Profiles", Icon: UserCircle },
  { id: "earn", label: "Earn", Icon: BadgeDollarSign },
  { id: "faq", label: "FAQ", Icon: CircleHelp },
  { id: "visit", label: "Visit", Icon: MapPin },
];

const FAQ_ITEMS = [
  {
    q: "What is Yatishara Studio?",
    a: "A creative workspace for businesses. You generate ads, edit them, hire creators, and handle payment without ever leaving. It's the room where all your creative work finally lives together.",
  },
  {
    q: "Who is it for?",
    a: "Businesses that need ads and content done, and the creators who make them. Both sides work in the same place, which is exactly the point.",
  },
  {
    q: "Do I have to hire someone?",
    a: "Not at all. Plenty of people generate and edit everything themselves. Creative Network is there for the days you'd rather hand it to a professional.",
  },
  {
    q: "How does booking payment work?",
    a: "You top up your Studio wallet and book a package. The money stays protected until the delivery arrives and you accept it. If the work never lands, the money never leaves.",
  },
  {
    q: "What currencies do you use?",
    a: "Wallets and listings run in TTD, Trinidad and Tobago dollars.",
  },
  {
    q: "Where are you based?",
    a: "Trinidad and Tobago, and proudly so. Write to hello@yatishara.com and a real person will answer.",
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
  title,
  lead,
  children,
  tone = "page",
  aside,
}: {
  id: string;
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
        <h2 id="faq-title" className="studio-landing-section-title">
          Fair <Hl tone="mint">questions</Hl>.
        </h2>
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div ref={rootRef} className="studio-landing" data-appearance="light">
      <header className="studio-landing-head">
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
            className="studio-landing-head-btn is-bordered"
            onClick={() => scrollToId("generate")}
          >
            Show me around
          </button>
          <button
            type="button"
            className="studio-landing-head-btn is-primary"
            onClick={onSignIn}
          >
            Sign in
          </button>
          <button
            type="button"
            className="studio-landing-menu-btn"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="studio-landing-menu-sheet"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="studio-landing-menu-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="studio-landing-menu-sheet"
            className="studio-landing-menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Page sections"
          >
            <div className="studio-landing-menu-sheet-grab" aria-hidden="true" />
            <div className="studio-landing-menu-sheet-head">
              <h2 className="studio-landing-menu-sheet-title">Menu</h2>
              <button
                type="button"
                className="studio-landing-menu-btn"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <nav className="studio-landing-menu-sheet-body" aria-label="Page sections">
              {menuLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="studio-landing-menu-sheet-link"
                  onClick={() => scrollToId(link.id)}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          </div>
        </>
      ) : null}

      <main className="studio-landing-main">
        <section
          id="overview"
          className="studio-landing-section is-hero"
          aria-labelledby="overview-title"
        >
          <div className="studio-landing-section-inner">
            <h1 id="overview-title" className="studio-landing-hero-title">
              Your ads, made under <Circled>one roof</Circled>.
            </h1>
            <p className="studio-landing-section-lead">
              Describe what you're selling and Studio shapes it into a flyer, a
              video, a voice. When you want human hands on it,{" "}
              <Hl>hire a real creator</Hl> and pay them safely.
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
              everything finally in one place
            </p>
            <div className="studio-landing-cta-row">
              <button type="button" className="studio-landing-cta" onClick={onSignIn}>
                Enter Studio
                <ArrowRight aria-hidden="true" />
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
          title={
            <>
              Start with a <Hl tone="mint">sentence</Hl>.
            </>
          }
          lead="Type the brief the way you'd say it out loud. Studio answers with the flyer, the video, or the voiceover."
          aside="just say what you need"
        >
          <LaptopMock
            src="/landing/mock-generate-chat.jpg"
            alt="Studio assistant chat turning a brief into a video ad"
          />
        </LandingSection>

        <LandingSection
          id="edit"
          tone="page"
          title={
            <>
              Then make it <Wavy tone="coral">yours</Wavy>.
            </>
          }
          lead="Trim the take, drop in music, and finish where you started. No exporting to somewhere else."
        >
          <LaptopMock
            src="/landing/mock-edit.jpg"
            alt="Studio video editor with asset library sound effects"
          />
        </LandingSection>

        <LandingSection
          id="hire"
          tone="plate"
          title={
            <>
              Some jobs deserve a <Circled>human</Circled>.
            </>
          }
          lead="Creative Network has verified creators with real portfolios. Find who feels right and book them."
        >
          <LaptopMock
            src="/landing/mock-network.jpg"
            alt="Creative Network marketplace for booking creators"
          />
        </LandingSection>

        <LandingSection
          id="book"
          tone="page"
          title={
            <>
              Your money moves when you're <Hl>happy</Hl>.
            </>
          }
          lead="Book a package and payment waits in your wallet until the work arrives and you accept it."
          aside="your wallet, your call"
        >
          <LaptopMock
            src="/landing/mock-book.jpg"
            alt="Booking a Creative Network package with wallet balance"
          />
        </LandingSection>

        <LandingSection
          id="messages"
          tone="plate"
          title={
            <>
              Talk it through, <Wavy tone="sky">right here</Wavy>.
            </>
          }
          lead="Every booking gets a thread. Share the storyboard, leave a voice note, ask for one more pass."
        >
          <LaptopMock
            src="/landing/mock-messages.jpg"
            alt="Studio messages with a paid creator and shared storyboard"
          />
        </LandingSection>

        <LandingSection
          id="profiles"
          tone="page"
          title={
            <>
              Meet who you're <Hl tone="mint">hiring</Hl>.
            </>
          }
          lead="Scroll their work, get a feel for their taste, then hire from the same page."
        >
          <LaptopMock
            src="/landing/mock-profile.jpg"
            alt="Creator profile with Hire Us and portfolio grid"
          />
        </LandingSection>

        <LandingSection
          id="earn"
          tone="plate"
          title={
            <>
              Creators get <Circled>paid</Circled> here too.
            </>
          }
          lead="List your offers and assets, and watch sales land beside the files you already use."
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
            <h2 id="visit-title" className="studio-landing-section-title">
              Made in <Wavy>Trinidad &amp; Tobago</Wavy>.
            </h2>
            <p className="studio-landing-section-lead">
              Built and run from Trinidad and Tobago. Wallets and listings in
              TTD. Write to us anytime.
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
            <h2 id="start-title" className="studio-landing-section-title">
              Bring your next ad <Hl>home</Hl>.
            </h2>
            <p className="studio-landing-section-lead">
              Sign in and start with whatever you have, even if it's just a
              sentence.
            </p>
            <div className="studio-landing-cta-row">
              <button type="button" className="studio-landing-cta" onClick={onSignIn}>
                Sign in to Studio
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
            <p className="studio-landing-aside is-under-cta" aria-hidden="true">
              your first flyer is minutes away
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
