import type { Page } from "@playwright/test";
import { expect, InterceptorFixtures, test } from "playwright-interceptor";
import { HOST } from "playwright-interceptor-server/src/resources/constants";

import { wait } from "../src/utils";

type InterceptorFixture = InterceptorFixtures["interceptor"];
type WsInterceptorFixture = InterceptorFixtures["wsInterceptor"];

/**
 * Ported from `packages/share/e2e/disableEnable.cy.ts`.
 *
 * The Cypress suite asserts Cypress-implementation details of enabling/disabling the proxies
 * (`Cypress.env(CYPRESS_ENV_KEY_*_PROXY_DISABLED)` flags and the presence of `originFetch`,
 * `originXMLHttpRequest`, `originWebSocket` on `window`). None of those have a Playwright
 * equivalent, so the intent is rewritten behaviorally:
 *
 * - "disabled": the interceptors are destroyed, requests are made from the page, and we assert that
 *   nothing was captured (`interceptor.getStats()` / `wsInterceptor.getStats()` are empty).
 * - "enabled": the interceptors are active, requests are made from the page, and we assert that the
 *   HTTP requests (fetch + xhr) and WebSocket actions were captured.
 *
 * The Cypress suite spreads this across `before`/`beforeEach`/`it`/`all-together` describe variants
 * that each re-run the same behavior. Playwright's per-test isolation makes the cross-hook
 * persistence pointless, so the behavior is expressed directly with a `test.beforeEach` that sets
 * the desired enabled/disabled state, plus first/second-run tests to keep the original structure.
 */

interface RequestResult {
    fetchStatus: number;
    fetchBody: string;
    xhrStatus: number;
    xhrBody: string;
    wsResponseCalled: boolean;
}

/**
 * Perform the page-side requests: a fetch, an XHR and a WebSocket ping. Mirrors the `cy.window`
 * block from the Cypress suite.
 */
const makeRequests = async (page: Page): Promise<RequestResult> =>
    page.evaluate(async (host) => {
        const urlFetch = `http://${host}/test-fetch`;
        const urlXhr = `http://${host}/test-xhr`;

        const wait = (timeout: number) => new Promise((resolve) => setTimeout(resolve, timeout));

        const responseFetch = await window.fetch(urlFetch);
        const fetchStatus = responseFetch.status;
        const fetchBody = await responseFetch.text();

        const responseXHR = new window.XMLHttpRequest();

        responseXHR.open("GET", urlXhr);
        responseXHR.send();

        await wait(500);

        const xhrStatus = responseXHR.status;
        const xhrBody = responseXHR.response as string;

        const response = "pong";

        const ws = new window.WebSocket("ws://localhost:3000/ping-test");

        let wsResponseCalled = false;

        ws.onopen = () => {
            ws.send(
                JSON.stringify({
                    data: "ping",
                    delay: 500,
                    response
                })
            );
        };

        ws.onmessage = (event: MessageEvent) => {
            if (event.data === response) {
                wsResponseCalled = true;
            }
        };

        await wait(1500);

        return { fetchStatus, fetchBody, xhrStatus, xhrBody, wsResponseCalled };
    }, HOST);

test.describe("Disable / Enable Interceptor", () => {
    test.describe("Interceptor should be disabled", () => {
        test.beforeEach(async ({ page, interceptor, wsInterceptor }) => {
            test.setTimeout(60000);

            await page.goto("/");

            // Disable both interceptors so nothing is captured.
            await interceptor.destroy();
            wsInterceptor.destroy();
        });

        const doTest = async (
            page: Page,
            interceptor: InterceptorFixture,
            wsInterceptor: WsInterceptorFixture
        ) => {
            expect(interceptor.getStats()).toHaveLength(0);
            expect(wsInterceptor.getStats()).toHaveLength(0);

            const result = await makeRequests(page);

            // The requests still succeed even though the interceptor is disabled.
            expect(result.fetchStatus).toEqual(200);
            expect(result.fetchBody).toEqual("{}");
            expect(result.xhrStatus).toEqual(200);
            expect(result.xhrBody).toEqual("{}");
            expect(result.wsResponseCalled).toBe(true);

            // Nothing captured because the interceptors were destroyed.
            expect(interceptor.getStats()).toHaveLength(0);
            expect(wsInterceptor.getStats()).toHaveLength(0);
        };

        test("Interceptor should be disabled - first run", async ({
            page,
            interceptor,
            wsInterceptor
        }) => {
            test.setTimeout(60000);

            await doTest(page, interceptor, wsInterceptor);
        });

        test("Interceptor should be disabled - second run", async ({
            page,
            interceptor,
            wsInterceptor
        }) => {
            test.setTimeout(60000);

            await doTest(page, interceptor, wsInterceptor);
        });
    });

    test.describe("Interceptor should be enabled", () => {
        test.beforeEach(async ({ page, interceptor, wsInterceptor }) => {
            test.setTimeout(60000);

            // The fixture already starts both interceptors; recreate/start to mirror the "enable"
            // intent and to guarantee a clean, active state.
            await interceptor.recreate();
            wsInterceptor.resetWatch();

            await page.goto("/");
        });

        const doTest = async (
            page: Page,
            interceptor: InterceptorFixture,
            wsInterceptor: WsInterceptorFixture
        ) => {
            const result = await makeRequests(page);

            expect(result.fetchStatus).toEqual(200);
            expect(result.fetchBody).toEqual("{}");
            expect(result.xhrStatus).toEqual(200);
            expect(result.xhrBody).toEqual("{}");
            expect(result.wsResponseCalled).toBe(true);

            // Give the interceptors a moment to flush the captured actions.
            await wait(500);

            // fetch + xhr are captured.
            expect(interceptor.getStats()).toHaveLength(2);

            // The WebSocket lifecycle is captured: at least create + send + onmessage.
            expect(wsInterceptor.getStats().length).toBeGreaterThanOrEqual(3);
            expect(wsInterceptor.getStats({ type: "create" }).length).toBeGreaterThanOrEqual(1);
            expect(wsInterceptor.getStats({ type: "send" }).length).toBeGreaterThanOrEqual(1);
            expect(wsInterceptor.getStats({ type: "onmessage" }).length).toBeGreaterThanOrEqual(1);
        };

        test("Interceptor should be enabled - first run", async ({
            page,
            interceptor,
            wsInterceptor
        }) => {
            test.setTimeout(60000);

            await doTest(page, interceptor, wsInterceptor);
        });

        test("Interceptor should be enabled - second run", async ({
            page,
            interceptor,
            wsInterceptor
        }) => {
            test.setTimeout(60000);

            await doTest(page, interceptor, wsInterceptor);
        });
    });
});
