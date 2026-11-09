import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateIntegrationState } from "./run-integration-tests.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const statePath = process.env.PBSSU_TEST_DATABASE_STATE;
if (!statePath) {
  throw new Error("Browser API requires PBSSU_TEST_DATABASE_STATE");
}
const resolvedState = resolve(root, statePath);
let state: Record<string, string>;
try {
  state = JSON.parse(readFileSync(resolvedState, "utf8")) as Record<
    string,
    string
  >;
  validateIntegrationState(state, root, resolvedState);
} catch {
  throw new Error(
    "Browser API requires a valid isolated synthetic database state",
  );
}

const identityKeyPath = resolve(root, ".cache", "m01", "identity-keys.json");
if (!existsSync(identityKeyPath)) {
  throw new Error("Browser API requires synthetic local identity keys");
}

const port = Number(process.env.PBSSU_API_PORT ?? "3301");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Browser API port is invalid");
}
const webPort = Number(process.env.PBSSU_WEB_PORT ?? "5173");
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) {
  throw new Error("Browser web port is invalid");
}

const child = spawn(
  process.execPath,
  [resolve(root, "apps/api/dist/main.js")],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      MAIL_MODE: "mock",
      TRUSTED_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
      DATABASE_URL: state.runtimeUrl,
      IDENTITY_DATABASE_URL: state.identityUrl,
      PBSSU_IDENTITY_KEY_FILE: identityKeyPath,
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  },
);

let stopping = false;
const stop = (signal: NodeJS.Signals): void => {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

const ready = await new Promise<boolean>((resolveReady) => {
  const timeout = setTimeout(() => resolveReady(false), 30_000);
  const finish = (value: boolean): void => {
    clearTimeout(timeout);
    resolveReady(value);
  };
  child.once("message", (message: unknown) => {
    if (
      message &&
      typeof message === "object" &&
      "type" in message &&
      message.type === "pbssu-test-api-ready" &&
      "host" in message &&
      message.host === "127.0.0.1" &&
      "port" in message &&
      message.port === port
    ) {
      finish(true);
    }
  });
  child.once("exit", () => finish(false));
  child.once("error", () => finish(false));
});

let healthCheckPassed = false;
if (ready) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/incidents`, {
      signal: AbortSignal.timeout(3000),
    });
    healthCheckPassed = response.status === 401;
  } catch {
    healthCheckPassed = false;
  }
}

if (!ready || !healthCheckPassed) {
  child.kill("SIGTERM");
  process.stderr.write(
    "The launched browser API did not pass its process-bound readiness and unauthenticated 401 checks.\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Synthetic browser API ready on loopback (unauthenticated incident request returned 401).\n",
  );
}

if (ready) {
  await new Promise<void>((resolveClose) => {
    child.once("close", (code) => {
      if (!stopping && code !== 0) process.exitCode = code ?? 1;
      resolveClose();
    });
    child.once("error", () => {
      process.exitCode = 1;
      resolveClose();
    });
  });
}
