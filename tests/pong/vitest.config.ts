import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/pong/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 15000,
    pool: "forks", // native addon (node-datachannel) needs forks
  },
});
