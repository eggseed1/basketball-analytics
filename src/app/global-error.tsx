"use client";

import { useEffect } from "react";

import { hardReload, useStaleClientRecovery } from "@/lib/stale-client-error";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const stale = useStaleClientRecovery(error);
  useEffect(() => {
    console.error("[global-route] render failed", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            fontFamily: "system-ui, sans-serif",
            background: "#f6f6f4",
            color: "#171717",
          }}
        >
          <style>{`@media (prefers-reduced-motion: no-preference) { [data-global-error] { animation: global-error-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both; } } @keyframes global-error-in { from { opacity: 0; translate: 0 14px; } }`}</style>
          <section data-global-error style={{ width: "min(680px, 100%)" }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
              Application interrupted
            </p>
            <h1 style={{ marginTop: 8, fontSize: 28 }}>
              Basketball Analytics could not finish this request.
            </h1>
            <p style={{ marginTop: 10, lineHeight: 1.6 }}>
              Retry the route. If the provider remains unavailable, return to
              the home page and use another section while it recovers.
            </p>
            {error.digest ? (
              <p style={{ marginTop: 10, fontFamily: "monospace", fontSize: 11 }}>
                Reference: {error.digest}
              </p>
            ) : null}
            <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={stale ? hardReload : retry}
                style={{
                  border: "1px solid #171717",
                  borderRadius: 6,
                  background: "#171717",
                  color: "white",
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
              <a
                href="/"
                style={{
                  border: "1px solid #999",
                  borderRadius: 6,
                  color: "inherit",
                  padding: "10px 14px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Go home
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
