/**
 * Lightweight entry point for version-specific Playwright runners.
 *
 * A runner imports this from its `playwright.config` and calls {@link registerPlaywright} with its
 * own pinned `@playwright/test` module. Importing this file only pulls in the fixtures module (which
 * does not touch `@playwright/test` at load time), so it can run before the specs import the package
 * index. That ordering is what lets the interceptor fixtures extend the runner's exact Playwright
 * instance instead of the copy hoisted to the monorepo root.
 *
 * @example
 * // packages/playwright-<version>/playwright.config.ts
 * import { expect, test } from "@playwright/test";
 * import { registerPlaywright } from "playwright-interceptor/register";
 *
 * registerPlaywright({ expect, test });
 */
export { registerPlaywright } from "./fixtures";
