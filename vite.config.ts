import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5190, open: true },
  optimizeDeps: {
    exclude: ["@terrastruct/d2"],
  },
  worker: {
    format: "es",
  },
});
