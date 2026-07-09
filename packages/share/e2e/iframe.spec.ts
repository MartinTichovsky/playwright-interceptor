/**
 * Ported from `packages/share/e2e/iframe.cy.ts`.
 *
 * Verifies that fetch/XHR requests fired from INSIDE iframes are captured by the interceptor.
 *
 * KEY DIFFERENCE vs the Cypress suite:
 * - Cypress has to explicitly patch fetch/XHR inside every iframe via
 *   `cy.enableInterceptorInsideIframe(selector)` (and undo it with
 *   `cy.destroyInterceptorInsideIframe()`), because `cy.intercept` only sees the top document.
 * - Playwright's `page.route("**\/*")` (installed by the interceptor fixture) automatically
 *   intercepts requests originating from ALL frames - the main frame and every (nested) iframe -
 *   with no extra setup. There is therefore NO `enableInterceptorInsideIframe` equivalent and none
 *   is needed: iframe requests land in `interceptor.getStats(...)` out of the box.
 *
 * Adaptations:
 * - `cy.visit(getIframeDynamicUrl([...]))` -> `await page.goto(getIframeDynamicUrl([...]))`.
 * - `cy.enableInterceptorInsideIframe(sel)` / `cy.destroyInterceptorInsideIframe()` -> REMOVED.
 *   Enabling is implicit, and there is no per-iframe patch to tear down.
 * - The Cypress tests inspected `iframe.contentWindow` for `originFetch`/`originXMLHttpRequest` to
 *   assert the patch was (or was not) installed. Those assertions test the Cypress-only patching
 *   mechanism and have no Playwright counterpart, so they are dropped. Instead the tests assert the
 *   observable capture behaviour: the requests fired inside the iframes appear in the stats, and the
 *   iframe rendered its "loaded" section (read through `page.frameLocator`).
 * - The Cypress "single select" case (only one iframe patched -> only one request captured) cannot
 *   be reproduced: Playwright captures every frame, so both iframe requests are always captured. The
 *   test is adapted to assert that full-capture behaviour rather than the single-frame selection.
 * - `cy.waitUntilRequestIsDone()` -> `await interceptor.waitUntilRequestIsDone()`.
 * - `cy.interceptorStats()` -> `interceptor.getStats(...)`; `chai` -> `expect`.
 */

import { expect, test } from "playwright-interceptor";
import { getDynamicUrl, getIframeDynamicUrl } from "playwright-interceptor-server/src/utils";

import { wait } from "../src/utils";

const iframeId_1 = "dynamicFrame-1";
const iframeId_2 = "dynamicFrame-2";
const testPath_Fetch_1 = "iframe/fetch-1";
const testPath_Fetch_2 = "iframe/fetch-2";
const testPath_Fetch_5 = "iframe/fetch-5";

type ResourceType = "fetch" | "xhr";

test.describe("Using Interceptor inside an IFRAME", () => {
    const visit = (page: import("@playwright/test").Page, type: ResourceType) =>
        page.goto(
            getIframeDynamicUrl([
                {
                    id: iframeId_1,
                    requests: [
                        {
                            delay: 100,
                            method: "POST",
                            path: testPath_Fetch_1,
                            type
                        }
                    ]
                },
                {
                    id: iframeId_2,
                    requests: [
                        {
                            delay: 200,
                            method: "POST",
                            path: testPath_Fetch_2,
                            type
                        }
                    ]
                }
            ])
        );

    // Assert the iframe rendered its "loaded" section, i.e. the request finished inside the frame.
    const expectIframeLoaded = async (
        page: import("@playwright/test").Page,
        iframeId: string,
        path: string
    ) => {
        await expect(
            page.frameLocator(`iframe#${iframeId}`).locator(`section[id="${path}_loaded"]`)
        ).toHaveCount(1);
    };

    test.describe("Requests fired inside iframes are captured", () => {
        (["fetch", "xhr"] as ResourceType[]).forEach((type) => {
            test(type.toUpperCase(), async ({ page, interceptor }) => {
                test.setTimeout(60000);

                await visit(page, type);

                await interceptor.waitUntilRequestIsDone();

                // both iframe requests are captured (no per-iframe enabling needed)
                const stats = interceptor.getStats({ resourceType: type });

                expect(stats).toHaveLength(2);
                expect(stats.some((s) => s.url.pathname.endsWith(testPath_Fetch_1))).toBe(true);
                expect(stats.some((s) => s.url.pathname.endsWith(testPath_Fetch_2))).toBe(true);

                // the requests actually completed inside the iframes and rendered their content
                await expectIframeLoaded(page, iframeId_1, testPath_Fetch_1);
                await expectIframeLoaded(page, iframeId_2, testPath_Fetch_2);
            });
        });
    });

    test.describe("Should not fail when changing the url", () => {
        test("Visit an another URL after the test", async ({ page, interceptor }) => {
            test.setTimeout(60000);

            await visit(page, "fetch");

            await interceptor.waitUntilRequestIsDone();

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        method: "POST",
                        path: testPath_Fetch_5,
                        type: "fetch"
                    }
                ])
            );

            // navigating away removes the iframes
            await expect(page.locator("iframe")).toHaveCount(0);

            await interceptor.waitUntilRequestIsDone();

            // the call stack keeps the earlier iframe requests plus the new main-frame request
            const stats = interceptor.getStats({ resourceType: "fetch" });

            expect(stats).toHaveLength(3);
            expect(stats[0].url.pathname.endsWith(testPath_Fetch_1)).toBe(true);
            expect(stats[1].url.pathname.endsWith(testPath_Fetch_2)).toBe(true);
            expect(stats[2].url.pathname.endsWith(testPath_Fetch_5)).toBe(true);

            // safety: give any late rendering a moment (mirrors the original cy.wait cadence)
            await wait(100);
        });
    });
});
