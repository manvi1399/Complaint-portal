import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        citizen: path.resolve(__dirname, "index.html"),
        admin: path.resolve(__dirname, "admin.html"),
        northBlock: path.resolve(__dirname, "block-north.html"),
        centralBlock: path.resolve(__dirname, "block-central.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== "true",
  },
});
