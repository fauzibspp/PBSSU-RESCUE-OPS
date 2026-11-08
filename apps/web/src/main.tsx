import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type ApiStatus = { reachable: boolean; detail: string };

function Preview() {
  const [api, setApi] = React.useState<ApiStatus | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch("/__dev/api-status", { cache: "no-store" })
      .then((response) => response.json() as Promise<ApiStatus>)
      .then((status) => {
        if (active) setApi(status);
      })
      .catch(() => {
        if (active)
          setApi({
            reachable: false,
            detail: "The local API diagnostic could not be reached.",
          });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#main"
          aria-label="PBSSU Rescue Ops preview home"
        >
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>
            PBSSU <b>RESCUE OPS</b>
          </span>
        </a>
        <span className="environment-pill">
          <span /> LOCAL PREVIEW
        </span>
      </header>

      <section id="main" className="hero" aria-labelledby="page-title">
        <p className="eyebrow">VISUAL DEVELOPMENT WORKSPACE</p>
        <h1 id="page-title">A clear view of what is running.</h1>
        <p className="intro">
          This browser preview is developer tooling. It is not an operational
          command center and contains no incident or responder data.
        </p>
      </section>

      <section className="status-grid" aria-label="Local development status">
        <article className="status-card">
          <div className="card-heading">
            <span className="number">01</span>
            <h2>Web preview</h2>
          </div>
          <p className="status-line">
            <span className="status-dot ready" /> Vite development server
          </p>
          <p className="detail">
            Loopback only · hot reload enabled · synthetic content only
          </p>
        </article>
        <article className="status-card">
          <div className="card-heading">
            <span className="number">02</span>
            <h2>API listener</h2>
          </div>
          <p className="status-line" role="status" aria-live="polite">
            <span
              className={`status-dot ${api === null ? "checking" : api.reachable ? "ready" : "idle"}`}
            />
            {api === null
              ? "Checking local port 3301…"
              : api.reachable
                ? "Local listener detected"
                : "No local listener detected"}
          </p>
          <p className="detail">
            {api?.detail ??
              "This TCP check does not authenticate or call operational endpoints."}
          </p>
        </article>
      </section>

      <aside className="scope-note" aria-labelledby="scope-title">
        <div className="scope-icon" aria-hidden="true">
          i
        </div>
        <div>
          <h2 id="scope-title">Operational UI is not implemented</h2>
          <p>
            No sign-in flow, dashboard, incident screens, assignment controls,
            movement timeline, or API-backed user workflow exists in this
            repository yet. This page is only a visual test target for future
            approved client work.
          </p>
        </div>
      </aside>

      <footer>
        <span>PBSSU RESCUE OPS</span>
        <span>Development tooling · no production connection</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
