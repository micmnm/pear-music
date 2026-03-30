import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist/client",
    emptyDirOnBuild: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
