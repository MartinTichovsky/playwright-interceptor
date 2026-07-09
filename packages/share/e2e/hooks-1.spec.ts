import type { ConsoleMessage, Page } from "@playwright/test";
import { expect, startTiming, stopTiming, test } from "playwright-interceptor";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { fireRequest, wait } from "../src/utils";

/**
 * Ported from `packages/share/e2e/hooks-1.cy.ts`.
 *
 * Adaptations:
 * - The Cypress suite uses `cy.watchTheConsole()` (from `cypress-interceptor/console`) to assert the
 *   recorded console output. `playwright-interceptor` has no WatchTheConsole equivalent, so the
 *   console output is captured locally with Playwright's `page.on("console")` event. The Cypress
 *   `ConsoleLogType` values are mapped to Playwright console message types:
 *   `ConsoleLog -> "log"`, `ConsoleWarn -> "warning"`, `ConsoleError -> "error"`, `ConsoleInfo -> "info"`.
 * - The Cypress suite spreads the setup across `before`/`it`/`after`/`afterEach` hooks that share a
 *   single persisted page across the (single) `it`. In Playwright every test gets a fresh
 *   page + interceptor, so the `before` setup and the `it` body are merged into one test. The shared
 *   `check()` assertions (originally run in `after`/`afterEach`) run at the end of the test, keeping
 *   the original intent (verify Interceptor stats, WebSocket send count and console records).
 */

const CONSOLE_TYPE = {
    log: "log",
    warning: "warning",
    error: "error",
    info: "info"
} as const;

interface ConsoleRecord {
    args: string[];
    type: string;
}

/**
 * Local replacement for `cy.watchTheConsole()`: collect the page console output as it happens.
 */
const watchConsole = (page: Page) => {
    const records: ConsoleRecord[] = [];

    const listener = (message: ConsoleMessage) => {
        records.push({ args: [message.text()], type: message.type() });
    };

    page.on("console", listener);

    return records;
};

/**
 * Wait until the expected number of console records have been captured (the `page.on("console")`
 * event is asynchronous, so give it a moment to flush after a `page.evaluate` that logs).
 */
const waitForRecords = async (records: ConsoleRecord[], length: number) => {
    for (let i = 0; i < 50 && records.length < length; i++) {
        await wait(20);
    }
};

test.describe("Hooks - Case 1", () => {
    const testPath_api_1 = "test/api-1";
    const testPath_api_2 = "test/api-2";
    const testPath_api_3 = "test/api-3";
    const duration = 2500;

    test.describe("Using Interceptor, WatchTheConsole and Websocket in hooks", () => {
        const log1 = "Before hook 1";
        const log2 = "Before hook 2";
        const log3 = "Before hook 3";
        const log4 = "Before hook 4";

        test("Should work", async ({ page, interceptor, wsInterceptor }) => {
            test.setTimeout(60000);

            const records = watchConsole(page);

            // --- originally the `before` hook ---
            await page.goto(
                getDynamicUrl([
                    {
                        delay: 200,
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
                        method: "GET",
                        path: testPath_api_3,
                        type: "xhr"
                    },
                    {
                        delay: 100,
                        path: "webSocket-1",
                        sendQueue: [
                            {
                                data: "send data",
                                delay: 200
                            }
                        ],
                        type: "websocket"
                    }
                ])
            );

            await interceptor.waitUntilRequestIsDone();

            expect(interceptor.getStats()).toHaveLength(2);

            await page.evaluate(
                ([a, b]) => {
                    window.console.log(a);

                    window.console.warn(b);
                },
                [log1, log2]
            );

            await waitForRecords(records, 2);

            expect(records).toHaveLength(2);
            expect(records[0].type).toEqual(CONSOLE_TYPE.log);
            expect(records[0].args).toEqual([log1]);
            expect(records[1].type).toEqual(CONSOLE_TYPE.warning);
            expect(records[1].args).toEqual([log2]);

            // --- originally the `it` body ---
            const timing = startTiming();

            await fireRequest(page);

            await interceptor.waitUntilRequestIsDone();

            expect(stopTiming(timing)).toBeGreaterThanOrEqual(duration);

            await page.evaluate(
                ([a, b]) => {
                    window.console.error(a);

                    window.console.info(b);
                },
                [log3, log4]
            );

            await waitForRecords(records, 4);

            // --- originally the shared `check()` run in `after`/`afterEach` ---
            await wsInterceptor.waitUntilWebsocketAction({ type: "send" });

            expect(interceptor.getStats()).toHaveLength(3);
            expect(wsInterceptor.getStats({ type: "send" })).toHaveLength(1);

            expect(records).toHaveLength(4);
            expect(records[2].type).toEqual(CONSOLE_TYPE.error);
            expect(records[2].args).toEqual([log3]);
            expect(records[3].type).toEqual(CONSOLE_TYPE.info);
            expect(records[3].args).toEqual([log4]);
        });
    });
});
