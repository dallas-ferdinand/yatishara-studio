"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clapperboard,
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
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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

const DECK_IDS = [
  "overview",
  "generate",
  "edit",
  "hire",
  "book",
  "messages",
  "profiles",
  "earn",
  "faq",
  "visit",
  "start",
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

/** Hand arrow for Caveat asides — shaft + tip meet; never CSS-rotated (blurs). */
function AsideArrow() {
  return (
    <svg
      viewBox="0 0 72 40"
      className="studio-landing-aside-arrow"
      aria-hidden="true"
      fill="none"
      shapeRendering="geometricPrecision"
    >
      {/* Soft upward sweep into the tip */}
      <path
        d="M5 27c11 1.5 19-9 33-11.5 9-1.6 16-.2 26 6"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Classic open head that shares the tip point */}
      <path
        d="M52 12.5 64 21.5 51.5 28"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
            <AsideArrow />
            <span className="studio-landing-aside-text">{aside}</span>
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

function readLandingMenuChrome(root: HTMLElement | null) {
  const chromeEl = root?.querySelector<HTMLElement>(".studio-landing-head");
  return (
    chromeEl?.getBoundingClientRect().height ??
    (typeof window !== "undefined" && window.matchMedia("(max-width: 979px)").matches
      ? 38
      : 32)
  );
}

/** Peek is locked from first paint; only full/min refresh with viewport. */
function getLandingMenuFull(root: HTMLElement | null) {
  return Math.max(220, window.innerHeight - readLandingMenuChrome(root));
}

function measureLandingMenuPeek(root: HTMLElement | null, sheet: HTMLElement | null) {
  const full = getLandingMenuFull(root);
  // Measure CSS peek before we overwrite with inline px.
  if (sheet && (sheet.style.height === "" || sheet.style.height == null)) {
    const laidOut = sheet.getBoundingClientRect().height;
    if (laidOut > 40) return Math.min(laidOut, full * 0.92);
  }
  if (!root) return Math.min(window.innerHeight * 0.42, 320);
  const raw = getComputedStyle(root).getPropertyValue("--studio-landing-menu-peek-h").trim();
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${raw || "min(42dvh,320px)"}`;
  root.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.min(h || Math.min(window.innerHeight * 0.42, 320), full * 0.92);
}

export function StudioLandingPage({ onSignIn }: { onSignIn: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const menuSheetRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Pixel height is the only size source while open — avoids class/transform jumps. */
  const [menuHeight, setMenuHeight] = useState<number | null>(null);
  const [menuDragging, setMenuDragging] = useState(false);
  /** Entrance rise runs once; never re-apply after drag or it restarts translateY. */
  const [menuEntered, setMenuEntered] = useState(false);
  const [menuDismissY, setMenuDismissY] = useState(0);
  const menuDragRef = useRef<{
    startY: number;
    startH: number;
    lastY: number;
    lastT: number;
    /** Finger velocity in px/ms; positive = finger down. */
    vy: number;
  } | null>(null);
  const menuMetricsRef = useRef({ peek: 280, full: 600, min: 120 });
  const menuHeightRef = useRef<number | null>(null);
  const menuDragRafRef = useRef<number | null>(null);
  const menuSettleTimerRef = useRef<number | null>(null);
  /** Ignore link activation after a finger scroll inside the sheet. */
  const menuListGestureRef = useRef<{
    startY: number;
    startX: number;
    moved: boolean;
  } | null>(null);
  const menuScrollSuppressClickRef = useRef(false);
  const [activeDeck, setActiveDeck] = useState(0);
  const year = new Date().getFullYear();

  const applySheetHeight = (px: number) => {
    menuHeightRef.current = px;
    const el = menuSheetRef.current;
    if (el) {
      el.style.height = `${px}px`;
      el.style.maxHeight = `${px}px`;
    }
  };

  const closeMenu = () => {
    if (menuSettleTimerRef.current != null) {
      window.clearTimeout(menuSettleTimerRef.current);
      menuSettleTimerRef.current = null;
    }
    setMenuOpen(false);
    setMenuHeight(null);
    menuHeightRef.current = null;
    setMenuDragging(false);
    setMenuEntered(false);
    setMenuDismissY(0);
    menuDragRef.current = null;
  };

  const scrollToId = (id: string) => {
    if (menuScrollSuppressClickRef.current) {
      menuScrollSuppressClickRef.current = false;
      return;
    }
    const scroller = mainRef.current;
    const target = scroller?.querySelector<HTMLElement>(`#${id}`);
    if (!scroller || !target) return;
    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({
      top: Math.max(0, top),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    closeMenu();
  };

  const onMenuListPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    menuListGestureRef.current = {
      startY: event.clientY,
      startX: event.clientX,
      moved: false,
    };
    menuScrollSuppressClickRef.current = false;
  };

  const onMenuListPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = menuListGestureRef.current;
    if (!g || g.moved) return;
    if (
      Math.abs(event.clientY - g.startY) > 8 ||
      Math.abs(event.clientX - g.startX) > 8
    ) {
      g.moved = true;
      menuScrollSuppressClickRef.current = true;
      const active = document.activeElement;
      if (active instanceof HTMLElement && event.currentTarget.contains(active)) {
        active.blur();
      }
    }
  };

  const onMenuListPointerUp = () => {
    menuListGestureRef.current = null;
  };

  const scrollDeckBy = (delta: number) => {
    const next = Math.min(DECK_IDS.length - 1, Math.max(0, activeDeck + delta));
    scrollToId(DECK_IDS[next]!);
  };

  const settleMenuHeight = (h: number, target: number) => {
    applySheetHeight(h);
    setMenuHeight(h);
    setMenuDragging(false);
    requestAnimationFrame(() => {
      menuHeightRef.current = target;
      setMenuHeight(target);
      applySheetHeight(target);
    });
  };

  const dismissMenuFromHeight = (h: number) => {
    const { full } = menuMetricsRef.current;
    setMenuDragging(false);
    setMenuHeight(h);
    applySheetHeight(h);
    setMenuDismissY(Math.max(full * 0.45, h * 0.65));
    menuSettleTimerRef.current = window.setTimeout(() => closeMenu(), 220);
  };

  const onMenuHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (menuSettleTimerRef.current != null) {
      window.clearTimeout(menuSettleTimerRef.current);
      menuSettleTimerRef.current = null;
    }
    const sheet = menuSheetRef.current;
    const full = getLandingMenuFull(rootRef.current);
    const peek = menuMetricsRef.current.peek;
    menuMetricsRef.current = {
      peek,
      full,
      min: Math.max(110, peek * 0.42),
    };
    // Measure painted height — never swap in a freshly computed peek (dvh mismatch = jump).
    const startH =
      sheet?.getBoundingClientRect().height ||
      menuHeightRef.current ||
      peek;
    const now = performance.now();
    event.currentTarget.setPointerCapture(event.pointerId);
    menuDragRef.current = {
      startY: event.clientY,
      startH,
      lastY: event.clientY,
      lastT: now,
      vy: 0,
    };
    setMenuDismissY(0);
    setMenuEntered(true);
    setMenuDragging(true);
    applySheetHeight(startH);
    setMenuHeight(startH);
  };

  const onMenuHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = menuDragRef.current;
    if (!drag) return;
    const { full, min } = menuMetricsRef.current;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      // Blend recent samples so a flick still reads after a short pause at the end.
      const instant = (event.clientY - drag.lastY) / dt;
      drag.vy = drag.vy * 0.35 + instant * 0.65;
      drag.lastY = event.clientY;
      drag.lastT = now;
    }
    const dy = event.clientY - drag.startY;
    // Finger down shrinks, finger up grows — DOM first, React height synced on rAF.
    const nextH = Math.min(full, Math.max(min, drag.startH - dy));
    applySheetHeight(nextH);
    if (menuDragRafRef.current == null) {
      menuDragRafRef.current = window.requestAnimationFrame(() => {
        menuDragRafRef.current = null;
        const live = menuHeightRef.current;
        if (live != null) setMenuHeight(live);
      });
    }
  };

  const onMenuHandlePointerUp = () => {
    const drag = menuDragRef.current;
    if (!drag) return;
    menuDragRef.current = null;
    if (menuDragRafRef.current != null) {
      window.cancelAnimationFrame(menuDragRafRef.current);
      menuDragRafRef.current = null;
    }
    const { peek, full, min } = menuMetricsRef.current;
    const h =
      menuHeightRef.current ??
      menuSheetRef.current?.getBoundingClientRect().height ??
      peek;
    const mid = (peek + full) / 2;
    const range = Math.max(1, full - peek);
    const dragDown = drag.startH - h;
    const dragUp = h - drag.startH;
    const fromFull = drag.startH >= full - 12;
    // Stale sample (>80ms) = no flick — use position only.
    const fresh = performance.now() - drag.lastT < 80;
    const vy = fresh ? drag.vy : 0;
    const flickUp = vy < -0.42;
    const flickDown = vy > 0.42;

    // Flick up always expands — don't bounce back to peek on a short fast swipe.
    if (flickUp || (!fromFull && dragUp > range * 0.22 && h > peek + 8)) {
      settleMenuHeight(h, full);
      return;
    }

    if (fromFull) {
      // From expanded: small/medium flick-down → peek; bigger swipe → close.
      const bigSwipeDown =
        h <= peek * 0.78 ||
        h <= min + 8 ||
        dragDown >= range * 0.55 ||
        (flickDown && dragDown >= range * 0.32);
      if (bigSwipeDown) {
        dismissMenuFromHeight(h);
        return;
      }
      if (flickDown || dragDown > 18 || h < full - 10) {
        settleMenuHeight(h, peek);
        return;
      }
      settleMenuHeight(h, full);
      return;
    }

    // From peek / mid: position + downward flick closes.
    if (flickDown || h <= peek * 0.72 || h <= min + 8) {
      dismissMenuFromHeight(h);
      return;
    }
    settleMenuHeight(h, h >= mid ? full : peek);
  };

  useEffect(() => {
    if (!menuOpen) {
      setMenuHeight(null);
      menuHeightRef.current = null;
      setMenuDragging(false);
      setMenuEntered(false);
      setMenuDismissY(0);
      menuDragRef.current = null;
      return;
    }
    setMenuEntered(false);
    setMenuDismissY(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMenuEntered(true);
    }
    // After paint, lock peek from real CSS layout (dvh), then pin inline height.
    const id = window.requestAnimationFrame(() => {
      const peek = measureLandingMenuPeek(rootRef.current, menuSheetRef.current);
      const full = getLandingMenuFull(rootRef.current);
      menuMetricsRef.current = {
        peek,
        full,
        min: Math.max(110, peek * 0.42),
      };
      menuHeightRef.current = peek;
      setMenuHeight(peek);
      applySheetHeight(peek);
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const scroller = mainRef.current;
    if (!scroller) return;

    const updateActive = () => {
      const cardH = scroller.clientHeight || 1;
      const idx = Math.round(scroller.scrollTop / cardH);
      setActiveDeck(Math.min(DECK_IDS.length - 1, Math.max(0, idx)));
    };

    updateActive();
    scroller.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      scroller.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`studio-landing is-deck${menuOpen ? " is-menu-open" : ""}`}
      data-appearance="light"
    >
      <header className="studio-landing-head">
        <a className="studio-landing-brand" href="/" aria-label="Yatishara Studio">
          <BrandMark size={22} subtle appearance="light" />
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

      <aside className="studio-landing-deck-rail" aria-label="Swipe through sections">
        <button
          type="button"
          className="studio-landing-deck-arrow"
          aria-label="Previous section"
          disabled={activeDeck <= 0}
          onClick={() => scrollDeckBy(-1)}
        >
          <ChevronUp aria-hidden="true" />
        </button>
        <div className="studio-landing-deck-dots" role="tablist" aria-label="Sections">
          {DECK_IDS.map((id, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-label={`Go to ${id}`}
              aria-selected={index === activeDeck}
              className={`studio-landing-deck-dot${index === activeDeck ? " is-active" : ""}`}
              onClick={() => scrollToId(id)}
            />
          ))}
        </div>
        <button
          type="button"
          className="studio-landing-deck-arrow"
          aria-label="Next section"
          disabled={activeDeck >= DECK_IDS.length - 1}
          onClick={() => scrollDeckBy(1)}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </aside>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="studio-landing-menu-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div
            id="studio-landing-menu-sheet"
            ref={menuSheetRef}
            className={[
              "studio-landing-menu-sheet",
              menuEntered ? "is-entered" : "is-entering",
              menuDragging ? "is-dragging" : "",
              menuHeight != null &&
              menuHeight >= menuMetricsRef.current.full - 8
                ? "is-expanded"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label="Page sections"
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.animationName === "studio-landing-menu-rise") {
                setMenuEntered(true);
              }
            }}
            style={
              {
                height: menuHeight ?? undefined,
                maxHeight: menuHeight ?? undefined,
                transform: menuDismissY > 0 ? `translateY(${menuDismissY}px)` : undefined,
              } satisfies CSSProperties
            }
          >
            <div
              className="studio-landing-menu-sheet-handle"
              aria-label="Drag up for full menu, or down to close"
              onPointerDown={onMenuHandlePointerDown}
              onPointerMove={onMenuHandlePointerMove}
              onPointerUp={onMenuHandlePointerUp}
              onPointerCancel={onMenuHandlePointerUp}
            >
              <div className="studio-landing-menu-sheet-grab" aria-hidden="true" />
            </div>
            <div className="studio-landing-menu-sheet-scroll">
              <nav
                className="studio-landing-menu-sheet-body"
                aria-label="Page sections"
                onPointerDown={onMenuListPointerDown}
                onPointerMove={onMenuListPointerMove}
                onPointerUp={onMenuListPointerUp}
                onPointerCancel={onMenuListPointerUp}
                onScroll={() => {
                  menuScrollSuppressClickRef.current = true;
                  const active = document.activeElement;
                  if (
                    active instanceof HTMLElement &&
                    active.classList.contains("studio-landing-menu-sheet-link")
                  ) {
                    active.blur();
                  }
                }}
              >
                {MENU_LINKS.map((link) => {
                  const Icon = link.Icon;
                  return (
                    <button
                      key={link.id}
                      type="button"
                      className="studio-landing-menu-sheet-link"
                      onClick={() => scrollToId(link.id)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{link.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </>
      ) : null}

      <main ref={mainRef} className="studio-landing-main">
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
              <AsideArrow />
              <span className="studio-landing-aside-text">
                everything finally in one place
              </span>
            </p>
            <div className="studio-landing-cta-row">
              <button type="button" className="studio-landing-cta" onClick={onSignIn}>
                Enter Studio
                <ArrowRight aria-hidden="true" />
              </button>
              <button
                type="button"
                className="studio-landing-cta is-bordered"
                onClick={() => scrollToId("generate")}
              >
                Show me around
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
              <span className="studio-landing-aside-text">
                your first flyer is minutes away
              </span>
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
