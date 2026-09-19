import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredApiBaseUrl = env.VITE_API_BASE_URL ?? "/firewall-api";
  const apiBaseUrl = command === "serve" && /^https?:\/\/localhost:4000\/api\/?$/i.test(configuredApiBaseUrl)
    ? "/firewall-api"
    : configuredApiBaseUrl;

  return {
    base: env.VITE_BASE_PATH ?? "/",
    define: command === "serve" ? {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBaseUrl),
    } : undefined,
    build: {
      sourcemap: false,
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/firewall-api": {
          target: "http://127.0.0.1:4000",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/firewall-api/, "/api"),
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
})
