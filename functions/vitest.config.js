import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: "2024-11-01",
          compatibilityFlags: ["nodejs_compat"],
          kvNamespaces: ["RIDES_KV"],
          bindings: {
            SITE_ORIGIN: "http://localhost:8788",
            MANAGER_PASSPHRASE: "correct horse battery staple",
            PURGE_KEY: "test-purge-key",
          },
        },
      },
    },
  },
});
