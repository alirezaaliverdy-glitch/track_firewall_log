import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH ?? "/",
  define: command === "serve" ? {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/firewall-api"),
  } : undefined,
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
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
