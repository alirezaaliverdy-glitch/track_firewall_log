import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
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
})
