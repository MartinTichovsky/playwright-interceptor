import { devices, expect, test } from "@playwright/test";
import * as path from "path";
import { registerPlaywright } from "playwright-interceptor/register";

// Bind the interceptor fixtures to THIS package's pinned @playwright/test version before the shared
// specs are loaded. Without this, `test`/`expect` from `playwright-interceptor` would resolve to the
// version hoisted to the monorepo root, and Playwright would reject the shared `test.describe(...)`
// calls with "did not expect test.describe() to be called here".
registerPlaywright({ expect, test });

import { createConfig } from "playwright-interceptor-share/playwright.config";

// Read the pinned version from this package's own @playwright/test so it's logged at startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: playwrightVersion } = require("@playwright/test/package.json");

// Run the shim specs in this package's own `e2e` directory (the full shared suite). `devices` comes
// from this package's own @playwright/test so the shared config never loads a second copy of
// Playwright (older versions throw when two copies are loaded).
export default createConfig({
    devices,
    playwrightVersion,
    testDir: path.resolve(__dirname, "e2e")
});
