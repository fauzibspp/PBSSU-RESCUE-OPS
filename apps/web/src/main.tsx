import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Challenge = {
  challenge_id: string;
  next_action: string;
  authentication_state: "CHALLENGE_REQUIRED";
};
type Handoff = { handoff_id: string; purpose: string };
type SessionResult = { authentication_state: string; handoff: Handoff };
type Membership = {
  membership_id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_status: string;
  display_name: string;
  status: string;
  availability: string;
  roles: { code: string; name: string }[];
};
type Incident = {
  id: string;
  version: number;
  created_at: string;
  organization_id: string;
  title: string;
  category: string;
  status: string;
  occurred_at: string;
  source_kind: string;
};
type Page<T> = { items: T[]; next_cursor: string | null };
type TotpMaterial = {
  kind: "TOTP_SETUP";
  enrollment_id: string;
  totp_secret: string;
  otpauth_uri: string;
  expires_at: string;
};

const knownRoles = new Set([
  "ORGANIZATION_ADMIN",
  "CONTROL_ROOM_OPERATOR",
  "INCIDENT_COMMANDER",
  "READ_ONLY_AUDITOR",
  "FIELD_RESPONDER",
]);

class ApiError extends Error {
  constructor(readonly status: number) {
    super("Request unavailable");
  }
}

function csrfToken(): string | undefined {
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-pbssu_csrf="));
  return entry
    ? decodeURIComponent(entry.slice(entry.indexOf("=") + 1))
    : undefined;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const csrf = csrfToken();
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new ApiError(response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function randomBinding(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function safeError(
  error: unknown,
  context: "login" | "mfa" | "general" = "general",
) {
  if (error instanceof ApiError && error.status === 401)
    return context === "login"
      ? "We could not sign you in. Check your details and try again."
      : context === "mfa"
        ? "We could not verify that code. Check it and try again."
        : "Your session has expired. Sign in again to continue.";
  if (error instanceof ApiError && error.status === 403)
    return "You do not have access to this information.";
  if (error instanceof ApiError && error.status === 404)
    return "This information is unavailable.";
  return "The service is unavailable right now. Please try again.";
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function App() {
  const [path, setPath] = React.useState(window.location.pathname);
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [binding, setBinding] = React.useState<string | null>(null);
  const [material, setMaterial] = React.useState<TotpMaterial | null>(null);
  const [enrollmentId, setEnrollmentId] = React.useState<string | null>(null);
  const [memberships, setMemberships] = React.useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = React.useState("");
  const [incidents, setIncidents] = React.useState<Incident[]>([]);
  const [incident, setIncident] = React.useState<Incident | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loadingIncidents, setLoadingIncidents] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [booting, setBooting] = React.useState(true);
  const [sessionEstablished, setSessionEstablished] = React.useState(false);
  const bootstrapStarted = React.useRef(false);
  const tenantGeneration = React.useRef(0);

  React.useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const loadMemberships = React.useCallback(async () => {
    const page = await request<Page<Membership>>("/me/memberships?limit=200");
    const eligible = page.items.filter((item) => item.status === "ACTIVE");
    setMemberships(eligible);
    setOrganizationId((current) =>
      eligible.some((item) => item.organization_id === current)
        ? current
        : (eligible[0]?.organization_id ?? ""),
    );
    return eligible;
  }, []);

  const finishSession = React.useCallback(
    async (handoff: Handoff, clientBinding?: string) => {
      await request<void>(
        `/auth/credential-handoffs/${encodeURIComponent(handoff.handoff_id)}/redeem`,
        {
          method: "POST",
          headers: clientBinding
            ? { "X-Auth-Challenge-Binding": clientBinding }
            : undefined,
          body: JSON.stringify({ purpose: "SESSION" }),
        },
      );
      setChallenge(null);
      setBinding(null);
      setMaterial(null);
      setEnrollmentId(null);
      await loadMemberships();
      setSessionEstablished(true);
      navigate("/app/organizations");
    },
    [loadMemberships],
  );

  const bootstrap = React.useCallback(async () => {
    setBooting(true);
    try {
      if (!csrfToken()) return;
      const session = await request<SessionResult>("/auth/refresh", {
        method: "POST",
        body: "{}",
      });
      await finishSession(session.handoff);
    } catch {
      setMemberships([]);
      setOrganizationId("");
      setSessionEstablished(false);
    } finally {
      setBooting(false);
    }
  }, [finishSession]);

  React.useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    void bootstrap();
  }, [bootstrap]);

  const loadIncidents = React.useCallback(
    async (org: string, next?: string) => {
      const params = new URLSearchParams({ limit: "50" });
      if (next) params.set("cursor", next);
      const result = await request<Page<Incident>>(`/incidents?${params}`, {
        headers: { "X-Organization-Id": org },
      });
      return result;
    },
    [],
  );

  React.useEffect(() => {
    if (!organizationId || !path.startsWith("/app/incidents")) return;
    let current = true;
    setError("");
    setIncidents([]);
    setIncident(null);
    setLoadingIncidents(true);
    const generation = ++tenantGeneration.current;
    const id = path.match(/^\/app\/incidents\/([^/]+)$/)?.[1];
    const load = async () => {
      try {
        if (id) {
          const value = await request<Incident>(
            `/incidents/${encodeURIComponent(id)}`,
            {
              headers: { "X-Organization-Id": organizationId },
            },
          );
          if (current) setIncident(value);
        } else if (path === "/app/incidents") {
          const result = await loadIncidents(organizationId);
          if (current && generation === tenantGeneration.current) {
            setIncidents(result.items);
            setCursor(result.next_cursor);
          }
        }
      } catch (reason) {
        if (current) {
          setError(safeError(reason));
          if (reason instanceof ApiError && reason.status === 401) {
            tenantGeneration.current += 1;
            setMemberships([]);
            setOrganizationId("");
            navigate("/login");
          }
        }
      } finally {
        if (current) setLoadingIncidents(false);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [organizationId, path, loadIncidents]);

  async function loadIncidentsForView(org: string, next?: string) {
    const generation = tenantGeneration.current;
    try {
      const result = await loadIncidents(org, next);
      if (generation === tenantGeneration.current) {
        setIncidents((items) =>
          next ? [...items, ...result.items] : result.items,
        );
        setCursor(result.next_cursor);
      }
    } catch (reason) {
      setError(safeError(reason));
    }
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    const form = new FormData(formElement);
    const clientBinding = randomBinding();
    try {
      const result = await request<Challenge | SessionResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login: String(form.get("login") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          client_kind: "WEB",
          client_binding: clientBinding,
        }),
      });
      formElement.reset();
      setBinding(clientBinding);
      if (result.authentication_state === "SESSION_HANDOFF_REQUIRED") {
        await finishSession((result as SessionResult).handoff, clientBinding);
      } else {
        const next = result as Challenge;
        if (!["VERIFY_MFA", "ENROLL_MFA"].includes(next.next_action))
          throw new Error("Authentication unavailable");
        setChallenge(next);
        navigate(next.next_action === "ENROLL_MFA" ? "/mfa/enroll" : "/mfa");
      }
    } catch (reason) {
      setError(safeError(reason, "login"));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!challenge || !binding) return navigate("/login");
    setBusy(true);
    setError("");
    const form = new FormData(formElement);
    try {
      const result = await request<Challenge | SessionResult>(
        "/auth/mfa/verify",
        {
          method: "POST",
          headers: { "X-Auth-Challenge-Binding": binding },
          body: JSON.stringify({
            challenge_id: challenge.challenge_id,
            code: String(form.get("code") ?? ""),
          }),
        },
      );
      formElement.reset();
      if (result.authentication_state === "SESSION_HANDOFF_REQUIRED")
        await finishSession((result as SessionResult).handoff, binding);
      else {
        setChallenge(result as Challenge);
        setNotice("Verification complete. Continue with the next secure step.");
      }
    } catch (reason) {
      setError(safeError(reason, "mfa"));
    } finally {
      setBusy(false);
    }
  }

  async function beginEnrollment() {
    if (!challenge || !binding) return navigate("/login");
    setBusy(true);
    setError("");
    try {
      const enrollment = await request<{
        enrollment_id: string;
        handoff: Handoff;
      }>("/auth/mfa/enrollments", {
        method: "POST",
        headers: { "X-Auth-Challenge-Binding": binding },
        body: JSON.stringify({ challenge_id: challenge.challenge_id }),
      });
      const setup = await request<TotpMaterial>(
        `/auth/credential-handoffs/${encodeURIComponent(enrollment.handoff.handoff_id)}/redeem`,
        {
          method: "POST",
          headers: { "X-Auth-Challenge-Binding": binding },
          body: JSON.stringify({ purpose: "TOTP_SETUP" }),
        },
      );
      if (
        setup.kind !== "TOTP_SETUP" ||
        setup.enrollment_id !== enrollment.enrollment_id
      )
        throw new Error("Enrollment unavailable");
      setEnrollmentId(setup.enrollment_id);
      setMaterial(setup);
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitEnrollment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!challenge || !binding || !material || !enrollmentId) return;
    setBusy(true);
    setError("");
    const form = new FormData(formElement);
    try {
      const next = await request<Challenge>("/auth/mfa/enrollments/confirm", {
        method: "POST",
        headers: { "X-Auth-Challenge-Binding": binding },
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          enrollment_id: enrollmentId,
          code: String(form.get("code") ?? ""),
        }),
      });
      formElement.reset();
      setChallenge(next);
      setMaterial(null);
      setEnrollmentId(null);
      setNotice(
        "Authenticator set up. Enter a current code to finish signing in.",
      );
      navigate("/mfa");
    } catch (reason) {
      setError(safeError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await request<void>("/auth/logout", { method: "POST", body: "{}" });
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) {
        setError(
          "Sign out could not be confirmed. Check the connection and try again.",
        );
        setBusy(false);
        return;
      }
    }
    setMemberships([]);
    setOrganizationId("");
    setIncidents([]);
    setIncident(null);
    setChallenge(null);
    setBinding(null);
    setMaterial(null);
    setEnrollmentId(null);
    setSessionEstablished(false);
    setBusy(false);
    navigate("/login");
  }

  const authenticated = memberships.length > 0;
  const selected = memberships.find(
    (item) => item.organization_id === organizationId,
  );
  const isAuthRoute = ["/login", "/mfa", "/mfa/enroll"].includes(path);

  if (booting)
    return (
      <main className="center-page">
        <p role="status">Checking your secure session…</p>
      </main>
    );

  if (path.startsWith("/app") && sessionEstablished && !authenticated)
    return (
      <AuthFrame>
        <section className="panel" role="status">
          <p className="eyebrow">ORGANIZATION ACCESS</p>
          <h1>No active organization access</h1>
          <p>
            This account has no active organization membership available in this
            workspace.
          </p>
          <button onClick={() => void logout()}>Sign out</button>
        </section>
      </AuthFrame>
    );

  if (path.startsWith("/app") && !authenticated)
    return (
      <AuthFrame>
        <section className="panel">
          <p className="eyebrow">SESSION REQUIRED</p>
          <h1>Sign in to continue</h1>
          <p>
            Your session is not active. Sign in to view organization
            information.
          </p>
          <button onClick={() => navigate("/login")}>Go to sign in</button>
        </section>
      </AuthFrame>
    );

  if (isAuthRoute || !authenticated) {
    if (path === "/mfa" && !challenge) navigate("/login");
    if (
      path === "/mfa/enroll" &&
      (!challenge || challenge.next_action !== "ENROLL_MFA")
    )
      navigate("/login");
    return (
      <AuthFrame>
        {path === "/mfa" && challenge ? (
          <section className="panel" aria-labelledby="page-title">
            <p className="eyebrow">SECURE SIGN IN · STEP 2</p>
            <h1 id="page-title">Verify your authenticator</h1>
            <p>
              Enter the six-digit code from your authenticator app. This code is
              sent securely and is not saved in this browser.
            </p>
            <form onSubmit={submitMfa} noValidate>
              <label htmlFor="mfa-code">Authenticator code</label>
              <input
                id="mfa-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                aria-describedby={error ? "form-error" : undefined}
              />
              <FormError message={error} />
              <button disabled={busy}>
                {busy ? "Verifying…" : "Verify and continue"}
              </button>
            </form>
            <button
              className="text-button"
              onClick={() => {
                setChallenge(null);
                setBinding(null);
                navigate("/login");
              }}
            >
              Cancel sign in
            </button>
          </section>
        ) : path === "/mfa/enroll" && challenge ? (
          <section className="panel" aria-labelledby="page-title">
            <p className="eyebrow">SECURE SIGN IN · AUTHENTICATOR SETUP</p>
            <h1 id="page-title">Set up an authenticator</h1>
            {!material ? (
              <>
                <p>
                  Prepare a time-based authenticator for this account. Setup
                  material is shown once and remains only in this page’s memory.
                </p>
                <FormError message={error} />
                <button onClick={() => void beginEnrollment()} disabled={busy}>
                  {busy ? "Preparing…" : "Prepare setup"}
                </button>
              </>
            ) : (
              <>
                <p>
                  Enter this setup key in your authenticator app, then confirm
                  with a current six-digit code. Keep the key private.
                </p>
                <label htmlFor="setup-key">One-time setup key</label>
                <code className="setup-key" id="setup-key">
                  {material.totp_secret}
                </code>
                <p className="small-note">
                  Expires {new Date(material.expires_at).toLocaleString()}
                </p>
                <form onSubmit={submitEnrollment} noValidate>
                  <label htmlFor="enroll-code">Authenticator code</label>
                  <input
                    id="enroll-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                  <FormError message={error} />
                  <button disabled={busy}>
                    {busy ? "Confirming…" : "Confirm authenticator"}
                  </button>
                </form>
              </>
            )}
            <button
              className="text-button"
              onClick={() => {
                setMaterial(null);
                setChallenge(null);
                setBinding(null);
                navigate("/login");
              }}
            >
              Cancel setup
            </button>
          </section>
        ) : (
          <section className="panel" aria-labelledby="page-title">
            <p className="eyebrow">PBSSU RESCUE OPS · SECURE ACCESS</p>
            <h1 id="page-title">Sign in</h1>
            <p>
              Access is based on your active organization membership and
              permissions.
            </p>
            <form onSubmit={submitLogin} noValidate>
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                name="login"
                type="email"
                autoComplete="username"
                maxLength={254}
                required
              />
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={1024}
                required
              />
              <FormError message={error} />
              <button disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        )}
      </AuthFrame>
    );
  }

  if (!selected && path !== "/app/organizations")
    return (
      <Shell
        memberships={memberships}
        selectedId={organizationId}
        onSelect={setOrganizationId}
        onLogout={logout}
        busy={busy}
        showIncidents={false}
      >
        <section className="panel">
          <h1>Choose an organization</h1>
          <p>Select an active membership to continue.</p>
          <button onClick={() => navigate("/app/organizations")}>
            Choose organization
          </button>
        </section>
      </Shell>
    );

  const codes = new Set(selected?.roles.map((role) => role.code) ?? []);
  const hasReadNav = [...codes].some((code) => knownRoles.has(code));
  return (
    <Shell
      memberships={memberships}
      selectedId={organizationId}
      onSelect={(id) => {
        setOrganizationId(id);
        setIncidents([]);
        setIncident(null);
        setCursor(null);
        setError("");
        navigate("/app/organizations");
      }}
      onLogout={logout}
      busy={busy}
      showIncidents={hasReadNav}
    >
      {path === "/app" || path === "/app/organizations" ? (
        <section className="welcome panel" aria-labelledby="page-title">
          <p className="eyebrow">ORGANIZATION WORKSPACE</p>
          <h1 id="page-title">Your organization access</h1>
          <p>
            Choose an active membership. Available pages reflect role templates;
            the API checks every request independently.
          </p>
          <ul className="membership-list">
            {memberships.map((item) => (
              <li key={item.membership_id}>
                <button
                  className={
                    item.organization_id === organizationId
                      ? "membership-choice selected"
                      : "membership-choice"
                  }
                  onClick={() => {
                    setOrganizationId(item.organization_id);
                    setIncidents([]);
                    navigate("/app/incidents");
                  }}
                >
                  <span>
                    <strong>{item.organization_name}</strong>
                    <small>
                      {item.display_name} ·{" "}
                      {item.roles.map((role) => role.name).join(", ") ||
                        "Member"}
                    </small>
                  </span>
                  <span>
                    {item.organization_id === organizationId
                      ? "Selected"
                      : "Select"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && hasReadNav ? (
            <button onClick={() => navigate("/app/incidents")}>
              Open incidents
            </button>
          ) : null}
        </section>
      ) : path === "/app/incidents" ? (
        <section className="content-panel" aria-labelledby="page-title">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {selected?.organization_name ?? "ORGANIZATION"}
              </p>
              <h1 id="page-title">Incidents</h1>
              <p className="muted">Read-only operational overview</p>
            </div>
          </div>
          <FormError message={error} />
          {loadingIncidents ? (
            <p role="status">Loading incidents…</p>
          ) : error ? (
            <button
              className="secondary"
              onClick={() =>
                organizationId && void loadIncidentsForView(organizationId)
              }
            >
              Try again
            </button>
          ) : incidents.length === 0 ? (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                —
              </span>
              <h2>No incidents to display</h2>
              <p>
                There are no incidents available for this organization, or you
                do not have incident read access.
              </p>
            </div>
          ) : (
            <>
              <div className="incident-list">
                {incidents.map((item) => (
                  <button
                    className="incident-row"
                    key={item.id}
                    onClick={() =>
                      navigate(`/app/incidents/${encodeURIComponent(item.id)}`)
                    }
                  >
                    <span className="incident-main">
                      <strong>{item.title}</strong>
                      <small>
                        {item.category.replaceAll("_", " ")} ·{" "}
                        {new Date(item.occurred_at).toLocaleString()}
                      </small>
                    </span>
                    <span
                      className={`status status-${item.status.toLowerCase()}`}
                    >
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </button>
                ))}
              </div>
              {cursor ? (
                <button
                  className="secondary"
                  onClick={() =>
                    void loadIncidentsForView(organizationId, cursor)
                  }
                >
                  Load more
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : path.startsWith("/app/incidents/") ? (
        <section className="content-panel" aria-labelledby="page-title">
          <button
            className="back-link"
            onClick={() => navigate("/app/incidents")}
          >
            ← All incidents
          </button>
          <FormError message={error} />
          {incident ? (
            <>
              <p className="eyebrow">INCIDENT DETAIL · READ ONLY</p>
              <h1 id="page-title">{incident.title}</h1>
              <dl className="detail-grid">
                <Detail
                  label="Status"
                  value={incident.status.replaceAll("_", " ")}
                />
                <Detail
                  label="Category"
                  value={incident.category.replaceAll("_", " ")}
                />
                <Detail
                  label="Occurred"
                  value={new Date(incident.occurred_at).toLocaleString()}
                />
                <Detail label="Source" value={incident.source_kind} />
                <Detail
                  label="Record version"
                  value={String(incident.version)}
                />
                <Detail
                  label="Created"
                  value={new Date(incident.created_at).toLocaleString()}
                />
              </dl>
              <p className="read-only-note">
                This view is read only. Operational changes are not available in
                this web slice.
              </p>
            </>
          ) : !error ? (
            <p role="status">Loading incident…</p>
          ) : (
            <button onClick={() => navigate("/app/incidents")}>
              Return to incidents
            </button>
          )}
        </section>
      ) : (
        <section className="panel">
          <h1>Page not found</h1>
          <button onClick={() => navigate("/app/organizations")}>
            Return to organizations
          </button>
        </section>
      )}
      {notice ? (
        <p role="status" className="notice">
          {notice}
        </p>
      ) : null}
    </Shell>
  );
}

function FormError({ message }: { message: string }) {
  return message ? (
    <p className="form-error" id="form-error" role="alert">
      {message}
    </p>
  ) : null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-cell">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <header className="brand-row">
        <a
          href="/login"
          onClick={(event) => {
            event.preventDefault();
            navigate("/login");
          }}
          className="brand"
        >
          <span className="brand-mark">R</span>
          <span>
            PBSSU <b>RESCUE OPS</b>
          </span>
        </a>
        <span className="environment-pill">LOCAL DEVELOPMENT</span>
      </header>
      <div className="auth-layout">
        <div className="auth-aside">
          <p className="eyebrow">SECURE OPERATIONS PLATFORM</p>
          <h2>Clear information for coordinated response.</h2>
          <p>
            Authorized team members can review incident information using their
            approved organization access.
          </p>
          <span className="aside-line" />
        </div>
        {children}
      </div>
      <footer className="app-footer">
        <span>PBSSU RESCUE OPS</span>
        <span>Local development environment</span>
      </footer>
    </main>
  );
}

function Shell({
  children,
  memberships,
  selectedId,
  onSelect,
  onLogout,
  busy,
  showIncidents,
}: {
  children: React.ReactNode;
  memberships: Membership[];
  selectedId: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  busy: boolean;
  showIncidents: boolean;
}) {
  const selected = memberships.find(
    (item) => item.organization_id === selectedId,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="/app/organizations"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigate("/app/organizations");
          }}
        >
          <span className="brand-mark">R</span>
          <span>
            PBSSU <b>RESCUE OPS</b>
          </span>
        </a>
        <div className="tenant-box">
          <label htmlFor="organization-select">Organization</label>
          <select
            id="organization-select"
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">Select organization</option>
            {memberships.map((item) => (
              <option key={item.membership_id} value={item.organization_id}>
                {item.organization_name}
              </option>
            ))}
          </select>
        </div>
        <nav aria-label="Main navigation">
          <a
            href="/app/organizations"
            onClick={(event) => {
              event.preventDefault();
              navigate("/app/organizations");
            }}
            aria-current={
              window.location.pathname === "/app/organizations"
                ? "page"
                : undefined
            }
          >
            Organizations
          </a>
          {showIncidents ? (
            <a
              href="/app/incidents"
              onClick={(event) => {
                event.preventDefault();
                navigate("/app/incidents");
              }}
              aria-current={
                window.location.pathname.startsWith("/app/incidents")
                  ? "page"
                  : undefined
              }
            >
              Incidents
            </a>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <p>
            {selected?.roles
              .map((role) => (knownRoles.has(role.code) ? role.name : null))
              .filter(Boolean)
              .join(" · ") || "Member"}
          </p>
          <button className="logout-button" onClick={onLogout} disabled={busy}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="mobile-header">
          <a
            href="/app/organizations"
            className="brand"
            onClick={(event) => {
              event.preventDefault();
              navigate("/app/organizations");
            }}
          >
            PBSSU <b>RESCUE OPS</b>
          </a>
          <button className="secondary" onClick={onLogout} disabled={busy}>
            Sign out
          </button>
        </header>
        {children}
        <footer className="workspace-footer">
          <span>{selected?.organization_name ?? "Select an organization"}</span>
          <span>Read access is verified by the service</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
