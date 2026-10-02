import { existsSync, readFileSync } from "node:fs";

// Phil's real kitchen list (Sept 30, 2026 count) stays on his PC, never on GitHub.
// Tests that use it skip when it's missing, but vitest still runs each describe
// body to collect the tests, so reading the file there must not throw.
export const SEED = `${process.cwd()}/kitchen-seed-data.json`;
export const HAS_SEED = existsSync(SEED);
export const seedJson = (): unknown => (HAS_SEED ? JSON.parse(readFileSync(SEED, "utf8")) : { items: [] });
