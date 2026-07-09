import { expect, test } from "playwright-interceptor";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

/**
 * Ported from `packages/share/e2e/hooks-2.cy.ts`.
 *
 * Playwright has the same hooks as Cypress (`test.beforeAll` / `test.afterAll` /
 * `test.beforeEach` / `test.afterEach`). The reason this suite is not a 1:1 port is fixture
 * *scoping*, not the hooks themselves:
 *
 * - The `interceptor` and `watchTheConsole` fixtures are **test-scoped**: every test gets a fresh
 *   instance. The Cypress suite verifies that options set in a `before` hook persist across several
 *   `it`s within a spec (a single plugin instance lives for the whole file). That cross-test
 *   persistence cannot happen in Playwright, so it is not reproduced.
 * - `test.beforeAll` / `test.afterAll` run outside test scope and therefore cannot access the
 *   test-scoped `page` / `interceptor` / `watchTheConsole` fixtures, so options cannot be set there.
 *
 * What this suite verifies instead (the portable intent of the original):
 * - the get/set contract of the options API (`cy.interceptorOptions()` <-> `interceptor.setOptions()`);
 * - options set in a `beforeEach` persist through the test and into the `afterEach`, i.e. the same
 *   fixture instance flows through the whole test lifecycle, and they survive a navigation;
 * - options do NOT leak from one test into the next (each test starts from the defaults).
 */

test.describe("Hooks - Case 2", () => {
    test("interceptor options get/set contract", async ({ page, interceptor }) => {
        // `setOptions()` with no argument reads the current options (like `cy.interceptorOptions()`).
        expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: false });

        // `setOptions({...})` writes the options (like `cy.interceptorOptions({...})`) and returns
        // the resulting options.
        expect(interceptor.setOptions({ ignoreCrossDomain: true })).toEqual({
            ignoreCrossDomain: true
        });

        // The options are kept for the rest of the test, including after a navigation.
        await page.goto(getDynamicUrl([]));

        expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: true });
    });

    test.describe("Options persist through a test lifecycle", () => {
        // Set options before the test. The same fixture instances are shared with the test body and
        // the afterEach, so the options set here must still be visible in both.
        test.beforeEach(async ({ page, interceptor, watchTheConsole }) => {
            interceptor.setOptions({ ignoreCrossDomain: true });
            watchTheConsole.setOptions({ cloneConsoleArguments: true });

            await page.goto(getDynamicUrl([]));

            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: true });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: true });
        });

        test.afterEach(({ interceptor, watchTheConsole }) => {
            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: true });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: true });
        });

        test("options set in beforeEach are still set in the test - 1", ({
            interceptor,
            watchTheConsole
        }) => {
            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: true });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: true });
        });

        test("options set in beforeEach are still set in the test - 2", async ({
            page,
            interceptor,
            watchTheConsole
        }) => {
            // options also survive a further navigation inside the test
            await page.goto(getDynamicUrl([]));

            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: true });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: true });
        });
    });

    test.describe("Options do not leak across tests", () => {
        // Each test gets a brand-new fixture instance, so options set in one test cannot leak into
        // another - regardless of execution order. This is the Playwright equivalent of the Cypress
        // "should not keep the options from the previous describe" cases.
        test("sets non-default options - 1", ({ interceptor, watchTheConsole }) => {
            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: false });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: false });

            interceptor.setOptions({ ignoreCrossDomain: true });
            watchTheConsole.setOptions({ cloneConsoleArguments: true });

            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: true });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: true });
        });

        test("starts from the defaults - 2", ({ interceptor, watchTheConsole }) => {
            expect(interceptor.setOptions()).toEqual({ ignoreCrossDomain: false });
            expect(watchTheConsole.setOptions()).toEqual({ cloneConsoleArguments: false });
        });
    });
});
