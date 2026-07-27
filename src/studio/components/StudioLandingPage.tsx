"use client";

import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import "./studio-landing.css";

const LANDING_IMAGES = [
  "/studio-cinematic-mint-meadow-light-4k.webp",
  "/studio-scene-ocean-depth-light-4k.webp",
  "/studio-cinematic-gold-archive-light-4k.webp",
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
  return (
    <div className="studio-landing" data-appearance="light">
      <header className="studio-landing-head">
        <a className="studio-landing-brand" href="/" aria-label="Yatishara Studio">
          <BrandMark size={18} subtle appearance="light" />
          <span className="studio-landing-brand-name">Yatishara Studio</span>
        </a>
        <div className="studio-landing-head-end">
          <button
            type="button"
            className="studio-landing-head-btn is-primary"
            onClick={onSignIn}
          >
            Sign in
          </button>
        </div>
      </header>

      <main className="studio-landing-main">
        <section className="studio-landing-hero" aria-labelledby="studio-landing-title">
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

        <section className="studio-landing-points" aria-label="What Studio includes">
          {POINTS.map((point) => (
            <div key={point.title} className="studio-landing-point">
              <h2>{point.title}</h2>
              <p>{point.body}</p>
            </div>
          ))}
        </section>

        <footer className="studio-landing-foot">
          <span>Yatishara Studio</span>
          <span>Create · Edit · Hire</span>
        </footer>
      </main>
    </div>
  );
}
