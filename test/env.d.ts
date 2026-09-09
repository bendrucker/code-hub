/// <reference types="@cloudflare/vitest-pool-workers/types" />

interface TestBindings {
  TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  TEST_CRONS: string[];
}

declare namespace Cloudflare {
  interface Env extends TestBindings {}
}
