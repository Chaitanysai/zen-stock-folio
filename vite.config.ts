import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { assertFirebaseConfig } from "./src/lib/config/firebaseConfig";

// https://vitejs.dev/config/
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:3000";

export default defineConfig(({ mode }) => {
  // Fail the build on a configuration that cannot work: missing Firebase keys,
  // or a stale Supabase provider switch left in the environment. Without this,
  // either ships a bundle whose login screen can never authenticate.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  assertFirebaseConfig({
    apiKey: env.VITE_FIREBASE_API_KEY,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    authProvider: env.VITE_AUTH_PROVIDER,
    dataProvider: env.VITE_DATA_PROVIDER,
  });

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    ssr: {
      noExternal: ["lightweight-charts"],
    },
    optimizeDeps: {
      include: ["lightweight-charts"],
    },
  };
});
