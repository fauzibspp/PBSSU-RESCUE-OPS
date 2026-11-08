import { createConnection } from "node:net";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const webPort = Number(process.env.PBSSU_WEB_PORT ?? 5173);

function localApiProbe(): Plugin {
  return {
    name: "pbssu-local-api-probe",
    configureServer(server) {
      server.middlewares.use("/__dev/api-status", (_request, response) => {
        let probe: ReturnType<typeof createConnection>;
        let finished = false;
        const finish = (reachable: boolean) => {
          if (finished) return;
          finished = true;
          probe?.destroy();
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(
            JSON.stringify({
              reachable,
              detail: reachable
                ? "A local listener accepts connections on the API port. No application health endpoint is defined."
                : "No local listener is accepting connections on the API port.",
            }),
          );
        };
        probe = createConnection({ host: "127.0.0.1", port: 3301 });
        probe.once("error", () => finish(false));
        probe.once("connect", () => finish(true));
        setTimeout(() => finish(false), 1500).unref();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiProbe()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
