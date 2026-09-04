import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  /* `lovable-tagger` was removed on 4 Sep 2026. It tagged components for
     Lovable's visual editor and this project moved to Vercel on 29 Aug; the
     import is top-level, so when its peer `@babel/parser` went missing it took
     the dev server down entirely - `failed to load config from vite.config.ts`
     - for an integration nothing uses any more. */
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
