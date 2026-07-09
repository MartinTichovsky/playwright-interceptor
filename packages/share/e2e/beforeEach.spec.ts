import { expect, startTiming, stopTiming, test } from "playwright-interceptor";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { fireRequest } from "../src/utils";

/**
 * Ported from `packages/share/e2e/beforeEach.cy.ts`.
 *
 * Adaptations:
 * - The Cypress suite relies on `beforeEach` re-visiting the page before each `it`, exercising the
 *   interceptor's automatic per-test reset. Playwright gives every test a fresh page + interceptor,
 *   so the `test.beforeEach` hook here does the same visit/wait, and each test then fires the
 *   deferred (`fireOnClick`) request. The intent (each test starts from a freshly loaded page whose
 *   initial requests are already done, then triggers a further request) is preserved.
 * - The WebSocket `describe` uses a Cypress `before` (run once) to load the page + assert the first
 *   send, and a single `it` to fire the second send. Because a Playwright page cannot persist across
 *   tests, that flow is merged into one test that performs both steps in order.
 */
test.describe("Before and BeforeEach", () => {
    const testPath_api_1 = "test/api-1";
    const testPath_api_2 = "test/api-2";
    const testPath_api_3 = "test/api-3";
    const duration = 2500;

    const visitConfig = getDynamicUrl([
        {
            delay: 200,
            duration,
            method: "POST",
            path: testPath_api_1,
            requests: [
                {
                    duration,
                    fireOnClick: true,
                    method: "POST",
                    path: testPath_api_2,
                    type: "fetch"
                }
            ],
            type: "fetch"
        },
        {
            delay: 200,
            duration,
            method: "GET",
            path: testPath_api_3,
            type: "xhr"
        }
    ]);

    test.describe("Using it in before each - first", () => {
        test.beforeEach(async ({ page, interceptor }) => {
            test.setTimeout(60000);

            const timing = startTiming();

            await page.goto(visitConfig);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });

        test("First test", async ({ page, interceptor }) => {
            test.setTimeout(60000);

            const timing = startTiming();

            await fireRequest(page);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });

        test("Second test", async ({ page, interceptor }) => {
            test.setTimeout(60000);

            const timing = startTiming();

            await fireRequest(page);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });
    });

    test.describe("Using it in before each - second", () => {
        test.beforeEach(async ({ page, interceptor }) => {
            test.setTimeout(60000);

            const timing = startTiming();

            await page.goto(visitConfig);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });

        test("First test", async ({ page, interceptor }) => {
            test.setTimeout(60000);

            const timing = startTiming();

            await fireRequest(page);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });

        test("Second test", async ({ page, interceptor }) => {
            test.setTimeout(60000);

            const timing = startTiming();

            await fireRequest(page);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);
        });
    });

    test.describe("Using Websocket in before", () => {
        const delay1 = 2500;
        const delay2 = 3000;
        const path = "webSocket-1";
        const sendData1 = "hello";
        const sendData2 = "server";

        test("Should work", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            // --- originally the `before` hook ---
            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        path,
                        sendQueue: [
                            {
                                data: sendData1,
                                delay: delay1
                            }
                        ],
                        type: "websocket"
                    },
                    {
                        fireOnClick: true,
                        path,
                        sendQueue: [
                            {
                                data: sendData2,
                                delay: delay2
                            }
                        ],
                        type: "websocket"
                    }
                ])
            );

            await wsInterceptor.waitUntilWebsocketAction({
                data: sendData1,
                type: "send"
            });

            expect(wsInterceptor.getStats({ type: "send" })).toHaveLength(1);

            // --- originally the `it` body ---
            const timing = startTiming();

            await fireRequest(page);

            await wsInterceptor.waitUntilWebsocketAction({
                data: sendData2,
                type: "send"
            });

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay2);

            expect(wsInterceptor.getStats({ type: "send" })).toHaveLength(2);
        });
    });
});
