import { defineConfig, devices, PlaywrightTestConfig } from "@playwright/test";
import * as path from "path";

const rootDir = path.resolve(__dirname, "../..");

/**
 * Create a Playwright configuration shared by all version-specific runner packages.
 *
 * Each runner package re-exports this from its own `playwright.config.ts`:
 *
 * @example
 * import { createConfig } from "playwright-interceptor-share/playwright.config";
 *
 * export default createConfig();
 *
 * `testDir` is resolved relative to the runner's own config file, so every runner keeps its thin
 * spec files (which import the shared tests) in its local `./e2e` folder.
 */
export const createConfig = (overrides: PlaywrightTestConfig = {}) =>
    defineConfig({
        testDir: "./e2e",
        testMatch: "**/*.spec.ts",
        fullyParallel: true,
        // Use half of the available CPU cores. Running at full parallelism can be too fast and
        // cause flaky failures (e.g. race conditions around the shared server/network).
        workers: "50%",
        forbidOnly: !!process.env.CI,
        retries: process.env.CI ? 2 : 0,
        reporter: "list",
        timeout: 30000,
        use: {
            baseURL: "http://localhost:3000/",
            trace: "on-first-retry"
        },
        projects: [
            {
                name: "chromium",
                use: { ...devices["Desktop Chrome"] }
            }
        ],
        webServer: {
            command: "npm run server",
            cwd: rootDir,
            url: "http://localhost:3000",
            reuseExistingServer: !process.env.CI,
            timeout: 120000
        },
        ...overrides
    });
