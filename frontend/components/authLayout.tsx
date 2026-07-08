"use client";

import Logo from "./logo";
import BackButton from "./backButton";

type Props = {
  children: React.ReactNode;
  /** Which of the 3 onboarding dots is active. Omit to hide the dots entirely. */
  step?: 1 | 2 | 3;
  showBack?: boolean;
  onBack?: () => void;
  /** Optional real photo. Falls back to a decorative gradient placeholder. */
  imageSrc?: string;
  imageAlt?: string;
};

export default function AuthLayout({
  children,
  step,
  showBack = false,
  onBack,
  imageSrc,
  imageAlt = "Renewable energy",
}: Props) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 5,
          }}
        >
          <BackButton fallbackHref="/" />
        </div>
        <div className="auth-card-top">
          <Logo />
          {step && (
            <div style={{ display: "flex", gap: "6px" }}>
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  style={{
                    width: n === step ? "22px" : "10px",
                    height: "6px",
                    borderRadius: "4px",
                    background: n === step ? "var(--primary)" : "#e2e2e6",
                    transition: "width 0.2s ease, background 0.2s ease",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="auth-card-body">{children}</div>

        {showBack && onBack && (
          <button
            onClick={onBack}
            aria-label="Previous step"
            style={{
              position: "absolute",
              left: "24px",
              bottom: "24px",
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid var(--input-border)",
              background: "#ffffff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            ← Previous
          </button>
        )}
      </div>

      <div className="auth-image">

        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={imageAlt} className="auth-image-img" />
        ) : (
          <div className="auth-image-placeholder" aria-hidden="true" />
        )}
        <div className="auth-image-overlay">
          <p>
            PolicyLens is an informational tool only. Policy data is sourced
            from official government publications. Always verify with
            official sources before taking action.
          </p>
          <p className="auth-image-copyright">
            © 2026 PolicyLens. All rights reserved.
          </p>
        </div>

      </div>

      <style jsx>{`

        .auth-shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
        background: #ffffff;
        }
        .auth-card {
          position: relative;
          flex: 0 0 38%;
          max-width: 560px;
          display: flex;
          flex-direction: column;
          padding: 28px 40px;
          margin: 16px;
          border: 1px solid var(--input-border);
          border-radius: 32px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
        }
        .auth-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .auth-card-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }




        .auth-image{
            position: relative;

            flex: 1;

            margin:16px 16px 16px 0;

            overflow:hidden;

            border-radius:32px;

            box-shadow:0 12px 40px rgba(0,0,0,.08);
        }



        .auth-image-img{
            width:100%;
            height:100%;

            object-fit:cover;

            object-position:center;

            display:block;

            transition:transform .45s ease;
        }



        .auth-image:hover .auth-image-img {
        transform: scale(1.02);
        }
        .auth-image-placeholder {
          width: 100%;
          height: 100%;

            background: linear-gradient(
                to top,
                rgba(0,0,0,.65) 0%,
                rgba(0,0,0,.18) 45%,
                rgba(0,0,0,0) 72%
            );
        }


        .auth-image-overlay {
        position: absolute;
        inset: 0;

        display: flex;
        flex-direction: column;
        justify-content: flex-end;

        padding: 28px;

        background: linear-gradient(
            to top,
            rgba(0,0,0,.62),
            rgba(0,0,0,.18) 45%,
            rgba(0,0,0,0) 70%
        );

        color: white;
        }

        .auth-image-overlay p {
          margin: 0;
          font-size: 11px;
          line-height: 1.5;
          opacity: 0.9;
        }
        .auth-image-copyright {
          margin-top: 8px !important;
          font-size: 11px;
          opacity: 0.85;
        }
        @media (max-width: 900px) {
          .auth-shell {
            flex-direction: column;
          }
          .auth-card {
            flex: none;
            max-width: none;
            margin: 12px;
            padding: 32px 24px;
          }
          .auth-image {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}