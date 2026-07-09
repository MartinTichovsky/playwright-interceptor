import { expect, test } from "playwright-interceptor";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

/**
 * Ported from `packages/share/e2e/bigData.cy.ts`.
 *
 * Playwright's `page.route` interception must forward a big response back to the caller's code.
 */
test.describe("Big Data", () => {
    const testPath_api_1 = "test/api-1";
    const testPath_api_2 = "test/api-2";

    test("Fetch", async ({ page, interceptor }) => {
        test.setTimeout(300000);

        await page.goto(
            getDynamicUrl([
                {
                    bigData: true,
                    delay: 100,
                    method: "POST",
                    path: testPath_api_1,
                    type: "fetch"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone({ timeout: 300000 });

        const stats = interceptor.getLastRequest();

        expect(stats).not.toBeUndefined();
        expect(stats!.request.method).toEqual("POST");
        expect(stats!.url.pathname.endsWith(testPath_api_1)).toBe(true);
    });

    test("Xhr", async ({ page, interceptor }) => {
        test.setTimeout(300000);

        await page.goto(
            getDynamicUrl([
                {
                    bigData: true,
                    delay: 100,
                    method: "POST",
                    path: testPath_api_2,
                    type: "xhr"
                }
            ])
        );

        await interceptor.waitUntilRequestIsDone({ timeout: 300000 });

        const stats = interceptor.getLastRequest();

        expect(stats).not.toBeUndefined();
        expect(stats!.request.method).toEqual("POST");
        expect(stats!.url.pathname.endsWith(testPath_api_2)).toBe(true);
    });
});
