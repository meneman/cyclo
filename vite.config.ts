import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    port: 3331,
    open: true,
    allowedHosts: ["cyclo.wohnli.com"],
    proxy: {
      "/ws": {
        target: "ws://localhost:3332",
        ws: true,
      },
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
