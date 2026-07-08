"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "../components/logo";

// ─────────────────────────────────────────────────────────────────────────
// Scroll-reveal: fades + rises each [data-reveal] element into place the
// first time it enters the viewport. Respects prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]")
    );

    if (prefersReduced) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useScrollReveal();

  useEffect(() => {
    // Page-load entrance sequence for the hero (runs once, not tied to scroll).
    const t = setTimeout(() => setHeroVisible(true), 40);

    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", onScroll);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function scrollToHowItWorks(e: React.MouseEvent) {
    e.preventDefault();
    document
      .getElementById("how-it-works")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh" }}>
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
        <div className="nav-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={30} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>
              PolicyLens
            </span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <a href="#how-it-works" onClick={scrollToHowItWorks} className="nav-link">
              How it works
            </a>
            <button onClick={() => router.push("/chat")} className="nav-link nav-link-btn">
              Continue as guest
            </button>
            <button onClick={() => router.push("/signin")} className="nav-link nav-link-btn">
              Sign in
            </button>
            <button onClick={() => router.push("/signup")} className="btn-primary btn-sm">
              Get started
            </button>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="hero">
        <div
          ref={heroRef}
          className={`hero-copy hero-centered ${heroVisible ? "in" : ""}`}
        >
          <div className="eyebrow">
            US 🇺🇸 · India 🇮🇳 · Official sources only
          </div>

          <h1 className="hero-title">
            Ask policy questions.
            <br />
            <span className="hero-title-serif">
              Get answers you can verify.
            </span>
          </h1>

          <p className="hero-sub">
            PolicyLens reads renewable energy policy documents from the US and India,
            retrieves the most relevant evidence, and generates answers grounded in
            official government sources.
          </p>

          <div className="hero-buttons">
            <button
              onClick={() => router.push("/signup")}
              className="btn-primary btn-lg"
            >
              Get started free
            </button>

            <button
              onClick={() => router.push("/chat")}
              className="btn-ghost btn-lg"
            >
              Continue as guest
            </button>
          </div>

          {/* Future animation placeholder */}

          <div className="hero-demo">
              
              <video
                  className="hero-demo-video"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
              >
                  <source
                      src="/landing-demo.webm"
                      type="video/webm"
                  />
              </video>
          </div>
          </div>
          </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section id="how-it-works" className="section section-tinted">
        <div className="section-inner">
          <h2 data-reveal className="section-title">
            From question to cited answer, in three steps
          </h2>

          <div className="steps">
            <Step
              n={1}
              title="Ask in plain language"
              body="No keywords to memorize. Ask about incentives, timelines, or eligibility exactly how you'd ask a person."
            />
            <Step
              n={2}
              title="Watch it think, then answer"
              body="PolicyLens retrieves the relevant policy text, reranks it for relevance, and streams the answer token by token."
            />
            <Step
              n={3}
              title="Verify every claim"
              body="Each answer links back to the exact highlighted sentence in the source document — open it and check for yourself."
            />
          </div>
        </div>
      </section>

      {/* ── Feature strip ──────────────────────────────────────────── */}
      <section className="section">
        <div className="section-inner">
          <div className="features">
            <FeatureCard
              icon={<CiteIcon />}
              title="Grounded in citations"
              body="Every claim in an answer is traceable to a highlighted passage — not a paraphrase you have to trust blindly."
            />
            <FeatureCard
              icon={<StreamIcon />}
              title="Live streaming answers"
              body="See the answer form in real time, with a clear 'thinking' state while sources are retrieved and reranked."
            />
            <FeatureCard
              icon={<GlobeIcon />}
              title="Two countries, one assistant"
              body="Switch between US federal/state programs and India's national schemes without changing tools."
            />
          </div>
        </div>
      </section>

      {/* ── Sample exchange mockup ─────────────────────────────────── */}
      <section className="section section-tinted">
        <div className="section-inner section-inner-narrow">
          <h2 data-reveal className="section-title" style={{ textAlign: "center" }}>
            See it in action
          </h2>
          <p
            data-reveal
            style={{
              textAlign: "center",
              color: "var(--placeholder-text)",
              fontSize: 15,
              marginTop: 8,
              marginBottom: 40,
            }}
          >
            A real interaction shape — question in, sourced answer out.
          </p>

          <div data-reveal className="mock-window">
            <div className="mock-bubble mock-user">
              What is the federal solar Investment Tax Credit rate for 2026?
            </div>

            <div className="mock-bubble mock-assistant">
              The federal solar Investment Tax Credit is currently set at{" "}
              <mark className="mock-mark">30% of system cost</mark> for
              residential and commercial installations placed in service
              before the scheduled step-down.
              <div className="mock-source-row">
                <span className="mock-source-chip">
                  <DocIconSmall /> DSIRE — Federal ITC · 94% match
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────── */}
      <section className="section">
        <div data-reveal className="final-cta">
          <h2 className="section-title" style={{ marginBottom: 10 }}>
            Start with a question, not a search bar.
          </h2>
          <p style={{ color: "var(--placeholder-text)", fontSize: 15, marginBottom: 28 }}>
            Free to try, no account required to start.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => router.push("/signup")} className="btn-primary btn-lg">
              Get started free
            </button>
            <button onClick={() => router.push("/chat")} className="btn-ghost btn-lg">
              Continue as guest
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="footer">
        <p>
          PolicyLens is an informational tool only. Policy data is sourced
          from official government publications. Always verify with official
          sources before taking action.
        </p>
        <p className="footer-copyright">© 2026 PolicyLens. All rights reserved.</p>
      </footer>

      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }
      `}</style>

      <style jsx>{`
        /* ── Nav ───────────────────────────────────────────────────── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid transparent;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .nav-scrolled {
          border-bottom-color: var(--sidebar-border);
          box-shadow: 0 1px 0 rgba(20, 10, 60, 0.02);
        }
        .nav-inner {
          max-width: 1160px;
          margin: 0 auto;
          padding: 14px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .nav-link {
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
          text-decoration: none;
          opacity: 0.75;
          transition: opacity 0.15s ease;
        }
        .nav-link-btn {
          border: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
        }
        .nav-link:hover {
          opacity: 1;
        }

        /* ── Buttons ───────────────────────────────────────────────── */
        .btn-primary {
          border: none;
          background: var(--primary);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          border-radius: 999px;
          transition: background 0.15s ease, transform 0.15s ease;
          font-family: inherit;
        }
        .btn-primary:hover {
          background: var(--primary-hover);
          transform: translateY(-1px);
        }
        .btn-ghost {
          border: 1px solid var(--sidebar-border);
          background: #fff;
          color: var(--foreground);
          font-weight: 700;
          cursor: pointer;
          border-radius: 999px;
          transition: border-color 0.15s ease, background 0.15s ease;
          font-family: inherit;
        }
        .btn-ghost:hover {
          border-color: var(--primary);
          background: var(--primary-soft);
        }
        .btn-sm {
          padding: 9px 18px;
          font-size: 13px;
        }
        .btn-lg {
          padding: 14px 26px;
          font-size: 15px;
        }

        /* ── Hero ──────────────────────────────────────────────────── */
    
        .hero {
          max-width: 900px;
          margin: 0 auto;
          min-height: 95vh;

          padding: 80px 32px;

          display: flex;
          justify-content: center;
          align-items: center;
        }


        .hero-buttons{
            display:flex;
            justify-content:center;
            align-items:center;
            gap:18px;
            margin-top:26px;
            flex-wrap:wrap;
        }

        .hero-demo-placeholder{
            margin-top:72px;
        }


        .placeholder-box{
            max-width:760px;
            margin:auto;
            padding:32px;

            border:1px dashed var(--sidebar-border);
            border-radius:20px;

            background:#fff;
        }

        .placeholder-title{
            font-size:18px;
            font-weight:700;
            margin-bottom:10px;
        }


        .hero-demo{
            margin-top:60px;

            display:flex;
            justify-content:center;
        }

        .hero-demo-video{
            width:100%;
            max-width:920px;

            border-radius:24px;

            border:1px solid rgba(0,0,0,.08);

            background:#fff;

            box-shadow:
                0 25px 60px rgba(0,0,0,.08);

            overflow:hidden;

            display:block;
        }

        .hero-centered{
            width:100%;
            text-align:center;
        }
        .hero-copy {
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .hero-copy.in {
          opacity: 1;
          transform: translateY(0);
        }
        .eyebrow {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--primary);
          background: var(--primary-soft);
          border: 1px solid var(--primary-soft-border);
          padding: 6px 14px;
          border-radius: 999px;
          margin-bottom: 22px;
        }
        .hero-title {
          font-size: 48px;
          line-height: 1.12;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--foreground);
          margin: 0 0 20px;
        }
        .hero-title-serif {
          font-family: "Iowan Old Style", "Palatino Linotype", Georgia, ui-serif, serif;
          font-style: italic;
          font-weight: 500;
          color: var(--primary);
        }
        .hero-sub {
          font-size: 17px;
          line-height: 1.65;
          color: var(--placeholder-text);
          max-width: 700px;
          margin: 0 auto 36px;
          text-align:center;
        }
        .hero-microcopy {
          font-size: 12.5px;
          color: var(--placeholder-text);
          margin: 14px 0 0;
          opacity: 0.8;
        }

        /* ── Sections ──────────────────────────────────────────────── */
        .section {
          padding: 88px 32px;
        }
        .section-tinted {
          background: var(--primary-soft);
        }
        .section-inner {
          max-width: 1160px;
          margin: 0 auto;
        }
        .section-inner-narrow {
          max-width: 720px;
        }
        .section-title {
          font-size: 30px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.01em;
          margin: 0;
        }

        [data-reveal] {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        [data-reveal].is-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Steps ─────────────────────────────────────────────────── */
        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 28px;
          margin-top: 44px;
          position: relative;
        }

        /* ── Features ──────────────────────────────────────────────── */
        .features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        /* ── Mock chat window ──────────────────────────────────────── */
        .mock-window {
          background: #fff;
          border: 1px solid var(--sidebar-border);
          border-radius: 20px;
          padding: 28px;
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .mock-bubble {
          font-size: 14.5px;
          line-height: 1.65;
          padding: 14px 18px;
          border-radius: 16px;
          max-width: 82%;
        }
        .mock-user {
          align-self: flex-end;
          background: var(--user-bubble-bg);
          color: var(--user-bubble-text);
          border-bottom-right-radius: 4px;
        }
        .mock-assistant {
          align-self: flex-start;
          background: var(--assistant-bubble-bg);
          color: var(--assistant-text);
          border-bottom-left-radius: 4px;
        }
        .mock-mark {
          background: #e0d9ff;
          border-radius: 4px;
          padding: 1px 4px;
          font-weight: 600;
        }
        .mock-source-row {
          margin-top: 12px;
        }
        .mock-source-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--primary);
          background: #fff;
          border: 1px solid var(--primary-soft-border);
          padding: 5px 11px;
          border-radius: 999px;
        }

        /* ── Final CTA ─────────────────────────────────────────────── */
        .final-cta {
          max-width: 640px;
          margin: 0 auto;
          text-align: center;
        }

        /* ── Footer ────────────────────────────────────────────────── */
        .footer {
          border-top: 1px solid var(--sidebar-border);
          padding: 32px;
          text-align: center;
        }
        .footer p {
          margin: 0;
          font-size: 12px;
          color: var(--placeholder-text);
          max-width: 560px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .footer-copyright {
          margin-top: 8px !important;
        }

        @media (max-width: 860px) {
          .hero {
            grid-template-columns: 1fr;
            padding-top: 40px;
          }
          .hero-visual {
            height: 300px;
            order: -1;
          }
          .hero-title {
            font-size: 36px;
          }
          .steps,
          .features {
            grid-template-columns: 1fr;
          }
          .nav-inner nav {
            gap: 14px;
          }
          .nav-link {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-copy,
          .hero-visual,
          [data-reveal] {
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}



function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div data-reveal className="step">
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--primary)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {n}
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)", margin: "0 0 8px" }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--placeholder-text)", margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      data-reveal
      style={{
        background: "#fff",
        border: "1px solid var(--sidebar-border)",
        borderRadius: 18,
        padding: "26px 24px",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "var(--primary-soft)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {icon}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: "0 0 8px" }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--placeholder-text)", margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

function CiteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
function StreamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h4l3-9 4 18 3-9h6" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" />
    </svg>
  );
}
function DocIconSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}
