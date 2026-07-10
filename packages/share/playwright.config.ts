import type { PlaywrightTestConfig } from "@playwright/test";
import * as path from "path";
import { PORT } from "playwright-interceptor-server/src/resources/constants";

const rootDir = path.resolve(__dirname, "../..");

export interface CreateConfigOptions {
    /**
     * The `devices` export from the runner's own `@playwright/test`. Typed loosely because each
     * runner pins a different Playwright version whose `devices` map is structurally different.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    devices: Record<string, any>;
    /**
     * Absolute path to the runner's OWN `e2e` directory. Each runner curates which shared specs it
     * executes by placing thin re-export shims there (e.g. `import "playwright-interceptor-share/e2e/wait.spec"`),
     * so a runner only runs the specs it opted into instead of the whole shared suite.
     */
    testDir: string;
    /**
     * The runner's pinned `@playwright/test` version, logged once when the config loads so it's clear
     * which Playwright version the run is using.
     */
    playwrightVersion?: string;
    /** Optional per-runner config overrides, merged last. */
    overrides?: PlaywrightTestConfig;
}

/**
 * Build the Playwright configuration shared by every version-specific runner package.
 *
 * This module intentionally does NOT import any runtime value from `@playwright/test`. Each runner
 * pins a different Playwright version, and older versions throw when two different copies of
 * `@playwright/test` are loaded in the same process. The runner already imports its own copy (to
 * register the interceptor fixtures), so it passes the pieces this config needs - currently just
 * `devices` - as arguments. `defineConfig` is skipped for the same reason; it only adds types, and
 * Playwright accepts a plain configuration object.
 *
 * The specs themselves live under `packages/share/e2e` (outside `node_modules`) and are executed via
 * the absolute `testDir` below, so every Playwright version transpiles and runs the exact same suite.
 *
 * @example
 * import { devices, expect, test } from "@playwright/test";
 * import { registerPlaywright } from "playwright-interceptor/register";
 * import { createConfig } from "playwright-interceptor-share/playwright.config";
 *
 * registerPlaywright({ expect, test });
 *
 * export default createConfig({ devices });
 */
export const createConfig = ({
    devices,
    overrides = {},
    playwrightVersion,
    testDir
}: CreateConfigOptions): PlaywrightTestConfig => {
    if (playwrightVersion) {
        console.log(`\n▶ Running shared tests with @playwright/test v${playwrightVersion}\n`);
    }

    return {
        // The runner's own `e2e` directory. Only the shim specs it placed there are executed, so each
        // runner runs just the shared specs it opted into.
        testDir,
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
            baseURL: `http://localhost:${PORT}/`,
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
            url: `http://localhost:${PORT}`,
            reuseExistingServer: !process.env.CI,
            timeout: 120000
        },
        ...overrides
    };
};
