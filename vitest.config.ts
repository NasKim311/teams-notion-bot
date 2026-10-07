import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // 테스트 전용 가짜 값. 실제 비밀값(.dev.vars)에 의존하지 않는다.
        bindings: {
          TEAMS_HMAC_SECRET: "dGVzdC1obWFjLXNlY3JldC1rZXktMzItYnl0ZXMhIQ==",
          NOTION_TOKEN: "test-notion-token",
          NOTION_DATABASE_ID: "test-database-id",
          DEBUG: "false",
        },
      },
    }),
  ],
});
