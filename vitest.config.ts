import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { unstable_readConfig } from "wrangler";

const configPath = "./wrangler.jsonc";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  // The scheduled handler dispatches on the cron expression, so a test needs
  // the ones the deployment actually triggers.
  const { triggers } = unstable_readConfig({ config: configPath });

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, TEST_CRONS: triggers.crons } },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts", "./test/reset-tables.ts"],
    },
  };
});
