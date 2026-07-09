/**
 * Ported from `packages/share/e2e/websocket.cy.ts`.
 *
 * Verifies the WebSocket interceptor: matching by type/data/url/query, waiting for actions, the
 * timeout behaviour and writing the captured actions to a log file.
 *
 * Command mapping (Cypress -> Playwright):
 * - `cy.wsInterceptor()`            -> `wsInterceptor`
 * - `cy.wsInterceptorStats(m)`      -> `wsInterceptor.getStats(m)`
 * - `cy.wsInterceptorLastRequest(m)`-> `wsInterceptor.getLastRequest(m)`
 * - `cy.waitUntilWebsocketAction()` -> `await wsInterceptor.waitUntilWebsocketAction()`
 * - `cy.wsResetInterceptorWatch()`  -> `wsInterceptor.resetWatch()`
 * - `cy.wsInterceptorStatsToLog()`  -> `wsInterceptor.writeStatsToLog()` (writes synchronously to
 *                                      disk, so it is read back with `fs`).
 *
 * Playwright WebSocket limitations (`page.on('websocket')`) and the adaptations made here:
 * - No `onopen` action: Playwright only reports the socket opening as `create`. Every socket in the
 *   Cypress suite therefore has exactly ONE fewer action than in Cypress (the missing `onopen`), so
 *   all count-based assertions are reduced accordingly and the `onopen` assertions assert that no
 *   such action is captured.
 * - No protocols: the sub-protocols are not exposed, so `{ protocols: ... }` matchers can never
 *   match. Those specific assertions are skipped (with a comment) rather than adapted.
 * - No close code/reason: the close frame's code and reason are not exposed and the close action is
 *   reported as `onclose` (never `close`). The "Close" test asserts the close happened (type
 *   `onclose`, correct url, timing) and skips the code/reason assertions.
 * - `item.url` keeps the query string (the Cypress lib stripped it), so path matchers that need to
 *   match a socket opened with a query use a leading and trailing wildcard around the path.
 * - Injected socket errors: the dynamic page fakes an error via a browser-side WebSocket proxy that
 *   only exists under Cypress. Playwright surfaces real socket errors only, so the "Error" test is
 *   skipped.
 * - The default/env request-timeout fallbacks are exercised with locally constructed interceptor
 *   instances (Playwright reads `INTERCEPTOR_REQUEST_TIMEOUT` once when the fixture is built, so it
 *   cannot be varied per test).
 */

import * as fs from "fs";
import {
    CallStackWebsocket,
    expect,
    FileNameMaxLength,
    startTiming,
    stopTiming,
    test,
    WebsocketInterceptor
} from "playwright-interceptor";
import { getFilePath } from "playwright-interceptor/src/utils.node";
import { DynamicRequest } from "playwright-interceptor-server/src/types";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { getWorkerOutputDir } from "../src/constants";
import { createMatcher, fireRequest } from "../src/utils";

// Worker-scoped so the `beforeEach` cleanup below never races another parallel worker.
const outputDir = getWorkerOutputDir("websocket.spec.ts");

/**
 * Reproduce the exact file path `writeStatsToLog` produces for the current test. It uses the same
 * `getFilePath` helper and the same `titlePath` the interceptor fixture is initialised with.
 */
const createOutputFileName = (
    titlePath: string[],
    fileName?: string,
    maxLength?: FileNameMaxLength
) => getFilePath({ fileName, maxLength, outputDir, titlePath, type: "ws.stats" });

test.beforeEach(() => {
    fs.rmSync(outputDir, { force: true, recursive: true });
});

test.describe("Websocket", () => {
    test.describe("Match", () => {
        const autoResponse1 = "message 1";
        const autoResponse2 = "message 2";
        const autoResponse3 = "message 3";
        const delay = 3000;
        const path1 = "webSocket-1";
        const path2 = "webSocket-2";
        const path3 = "webSocket-3";
        const query1 = { user: "Harry" };
        const query2 = { page: "5" };
        const responseData1 = "response data 1";
        const responseData2 = "response data 2";
        const sendData1 = "send data 1";
        const sendData2 = "send data 2";
        const sendQueue1 = "Hello,";
        const sendQueue2 = "server.";

        const config: DynamicRequest[] = [
            {
                delay: 100,
                communication: [
                    {
                        responseData: responseData1,
                        responseDelay: delay,
                        sendData: sendData1
                    },
                    {
                        responseData: responseData2,
                        responseDelay: delay,
                        sendData: sendData2
                    }
                ],
                path: path1,
                query: query1,
                type: "websocket"
            },
            {
                delay: 100,
                sendQueue: [
                    {
                        data: sendQueue1
                    },
                    {
                        data: sendQueue2,
                        delay
                    }
                ],
                path: path2,
                protocols: "soap",
                query: query2,
                type: "websocket"
            },
            {
                autoResponse: [
                    {
                        data: autoResponse1
                    },
                    {
                        data: autoResponse2,
                        delay: delay
                    },
                    {
                        data: autoResponse3,
                        delay: delay
                    }
                ],
                path: path3,
                protocols: ["amqp", "xmpp"],
                type: "websocket"
            }
        ];

        test("Multiple matches", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl(config));

            // `protocols: "xmpp"` on the third matcher is dropped: Playwright does not expose the
            // sub-protocols, so it would never match. Path matchers use the `**/<path>**` form
            // because the captured url keeps the query string.
            await wsInterceptor.waitUntilWebsocketAction([
                {
                    data: responseData2,
                    type: "onmessage",
                    url: `**/${path1}**`
                },
                {
                    data: sendQueue2,
                    type: "send",
                    url: `**/${path2}**`
                },
                {
                    data: autoResponse3,
                    type: "onmessage",
                    url: `**/${path3}**`
                }
            ]);

            const sendStats = wsInterceptor.getStats({ type: "send" });

            expect(sendStats).toHaveLength(4);
            expect(sendStats[0].data).toBeTruthy();
            expect(sendStats[1].data).toBeTruthy();
            expect(sendStats[2].data).toBeTruthy();
            expect(sendStats[3].data).toBeTruthy();

            const onmessageStats = wsInterceptor.getStats({ type: "onmessage" });

            expect(onmessageStats).toHaveLength(5);
            expect(onmessageStats[0].data).toBeTruthy();
            expect(onmessageStats[1].data).toBeTruthy();
            expect(onmessageStats[2].data).toBeTruthy();
            expect(onmessageStats[3].data).toBeTruthy();
            expect(onmessageStats[4].data).toBeTruthy();

            // path2 socket: create + 2 sends (no `onopen`, and the plain-string sends get no server
            // response). Cypress saw 4 (with `onopen`).
            const path2Stats = wsInterceptor.getStats({ url: `**/${path2}**` });

            expect(path2Stats).toHaveLength(3);
            expect(path2Stats[0].type).toEqual("create");
            expect(path2Stats[1].type).toEqual("send");
            expect(path2Stats[1].data).toEqual(sendQueue1);
            expect(path2Stats[2].type).toEqual("send");
            expect(path2Stats[2].data).toEqual(sendQueue2);

            // path1 socket: create + send + onmessage + send + onmessage (Cypress saw 6 with `onopen`).
            const query1Stats = wsInterceptor.getStats({
                queryMatcher: createMatcher(query1)
            });

            expect(query1Stats).toHaveLength(5);
            expect(query1Stats[0].type).toEqual("create");
            expect(query1Stats[1].type).toEqual("send");
            expect(query1Stats[1].data).toBeTruthy();
            expect(query1Stats[2]).toMatchObject({ data: { data: responseData1 } });
            expect(query1Stats[3].type).toEqual("send");
            expect(query1Stats[3].data).toBeTruthy();
            expect(query1Stats[4]).toMatchObject({ data: { data: responseData2 } });

            // Skipped: `{ protocols: "soap" }` and `{ protocols: ["amqp", "xmpp"] }` matchers.
            // Playwright does not expose the WebSocket sub-protocols, so a protocols matcher can
            // never match a captured action.

            const typesStats = wsInterceptor.getStats({
                types: ["send", "onmessage"]
            });

            expect(typesStats).toHaveLength(9);

            expect(wsInterceptor.callStack.length).toBeGreaterThan(0);
        });

        test("Custom wait with default", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl(config));

            // just for testing that it passes
            await wsInterceptor.waitUntilWebsocketAction();

            expect(wsInterceptor.getLastRequest({ url: "some-url" })).toBeUndefined();
        });

        test("Custom wait with enforce check without match", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl(config));

            // just for testing that it passes
            await wsInterceptor.waitUntilWebsocketAction({ timeout: 5000 });
        });

        test("Default options - will not wait to the first action", async ({
            page,
            wsInterceptor
        }) => {
            test.setTimeout(60000);

            await page.goto(
                getDynamicUrl([
                    {
                        delay: 100,
                        communication: [
                            {
                                responseData: responseData1,
                                responseDelay: delay,
                                sendData: sendData1,
                                sendDelay: delay
                            },
                            {
                                responseData: responseData2,
                                responseDelay: delay,
                                sendData: sendData2
                            }
                        ],
                        path: path1,
                        query: query1,
                        type: "websocket"
                    }
                ])
            );

            await wsInterceptor.waitUntilWebsocketAction();
        });
    });

    test.describe("Expected fail", () => {
        const errMessage = "<EXPECTED WS ERROR>";

        test("Max wait", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            const delay = 9999;
            const responseData = "response data";

            await page.goto(
                getDynamicUrl([
                    {
                        communication: [
                            {
                                responseData,
                                responseDelay: delay,
                                sendData: "send data"
                            }
                        ],
                        delay: 100,
                        path: "websocket-1",
                        type: "websocket"
                    }
                ])
            );

            await expect(
                wsInterceptor.waitUntilWebsocketAction(
                    { data: responseData, type: "onmessage" },
                    { timeout: delay / 2 },
                    errMessage
                )
            ).rejects.toThrow(`${errMessage} (${delay / 2}ms)`);
        });

        test("Enforce check", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl([]));

            await expect(
                wsInterceptor.waitUntilWebsocketAction({ timeout: 5000 }, errMessage)
            ).rejects.toThrow(`${errMessage} (5000ms)`);
        });

        test("Default timeout", async ({ page }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl([]));

            // A locally built interceptor with no `requestTimeout` falls back to the default 10000ms.
            const localInterceptor = new WebsocketInterceptor(page);

            await expect(
                localInterceptor.waitUntilWebsocketAction({ url: "some-url" }, errMessage)
            ).rejects.toThrow(`${errMessage} (10000ms)`);
        });

        test("Env timeout", async ({ page }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl([]));

            // A locally built interceptor with an explicit `requestTimeout` mirrors the Cypress env
            // override (`INTERCEPTOR_REQUEST_TIMEOUT`).
            const localInterceptor = new WebsocketInterceptor(page, { requestTimeout: 20000 });

            await expect(
                localInterceptor.waitUntilWebsocketAction({ url: "some-url" }, errMessage)
            ).rejects.toThrow(`${errMessage} (20000ms)`);
        });
    });

    test.describe("Log stats to file", () => {
        const path1 = "websocket-in-1";
        const path2 = "websocket-in-2";
        const responseData11 = "data response 1-1";
        const responseData12 = "data response 1-2";
        const responseData21 = "data response 2-1";
        const responseData22 = "data response 2-2";
        const sendData1 = "data send 1";
        const sendData2 = "data send 2";

        const config: DynamicRequest[] = [
            {
                communication: [
                    {
                        responseData: responseData11,
                        responseDelay: 1500,
                        sendData: sendData1
                    },
                    {
                        responseData: responseData12,
                        responseDelay: 2000,
                        sendData: sendData2
                    }
                ],
                delay: 100,
                path: path1,
                type: "websocket"
            }
        ];

        test("Name auto generated", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            await page.goto(getDynamicUrl(config));

            await wsInterceptor.waitUntilWebsocketAction({
                data: responseData12,
                type: "onmessage",
                url: new RegExp(`${path1}$`, "i")
            });

            wsInterceptor.writeStatsToLog(`${outputDir}/`);

            const stats = JSON.parse(
                fs.readFileSync(createOutputFileName(test.info().titlePath), "utf8")
            ) as CallStackWebsocket[];

            // 5 actions instead of 6: Playwright does not capture the `onopen` action.
            expect(stats).toHaveLength(5);
            expect(stats.find((entry) => entry.url.endsWith(path1))).not.toBeUndefined();
            expect(stats[1].data).toBeTruthy();
            expect(stats[1].type).toEqual("send");
            expect(stats[2]).toMatchObject({ data: { data: responseData11 }, type: "onmessage" });
            expect(stats[3].data).toBeTruthy();
            expect(stats[3].type).toEqual("send");
            expect(stats[4]).toMatchObject({ data: { data: responseData12 }, type: "onmessage" });
        });

        test("Strict name", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            const fileName = "FILE_NAME_WS_STATS";

            await page.goto(getDynamicUrl(config));

            await wsInterceptor.waitUntilWebsocketAction({
                data: responseData12,
                type: "onmessage",
                url: new RegExp(`${path1}$`, "i")
            });

            wsInterceptor.writeStatsToLog(outputDir, { fileName });

            const stats = JSON.parse(
                fs.readFileSync(createOutputFileName(test.info().titlePath, fileName), "utf8")
            ) as CallStackWebsocket[];

            expect(stats).toHaveLength(5);
            expect(stats.find((entry) => entry.url.endsWith(path1))).not.toBeUndefined();
            expect(stats[1].data).toBeTruthy();
            expect(stats[1].type).toEqual("send");
            expect(stats[2]).toMatchObject({ data: { data: responseData11 }, type: "onmessage" });
            expect(stats[3].data).toBeTruthy();
            expect(stats[3].type).toEqual("send");
            expect(stats[4]).toMatchObject({ data: { data: responseData12 }, type: "onmessage" });
        });

        test("Should return null when log is empty", ({ wsInterceptor }) => {
            // The Cypress command resolved with `null` for an empty log. The Playwright
            // `writeStatsToLog` returns nothing and writes no file when the call stack is empty, so
            // assert that no file is created.
            const outputFileName = createOutputFileName(test.info().titlePath);

            fs.rmSync(outputFileName, { force: true });

            wsInterceptor.writeStatsToLog(outputDir);

            expect(fs.existsSync(outputFileName)).toBe(false);
        });

        test("Max length of the generated name - number", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            const maxLength = 30;

            await page.goto(getDynamicUrl(config));

            await wsInterceptor.waitUntilWebsocketAction({
                data: responseData12,
                type: "onmessage",
                url: new RegExp(`${path1}$`, "i")
            });

            const outputFileName = createOutputFileName(
                test.info().titlePath,
                undefined,
                maxLength
            );

            expect(outputFileName.length).toBeLessThan(
                createOutputFileName(test.info().titlePath).length
            );

            wsInterceptor.writeStatsToLog(outputDir, { maxLength });

            expect(fs.existsSync(outputFileName)).toBe(true);

            const stats = JSON.parse(
                fs.readFileSync(outputFileName, "utf8")
            ) as CallStackWebsocket[];

            expect(stats).toHaveLength(5);
            expect(stats.find((entry) => entry.url.endsWith(path1))).not.toBeUndefined();
        });

        test("Max length of the generated name - object", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            const maxLength = { describe: 10, testName: 15 };

            await page.goto(getDynamicUrl(config));

            await wsInterceptor.waitUntilWebsocketAction({
                data: responseData12,
                type: "onmessage",
                url: new RegExp(`${path1}$`, "i")
            });

            const outputFileName = createOutputFileName(
                test.info().titlePath,
                undefined,
                maxLength
            );

            expect(outputFileName.length).toBeLessThan(
                createOutputFileName(test.info().titlePath).length
            );

            wsInterceptor.writeStatsToLog(outputDir, { maxLength });

            expect(fs.existsSync(outputFileName)).toBe(true);

            const stats = JSON.parse(
                fs.readFileSync(outputFileName, "utf8")
            ) as CallStackWebsocket[];

            expect(stats).toHaveLength(5);
            expect(stats.find((entry) => entry.url.endsWith(path1))).not.toBeUndefined();
        });

        test("Stats to file - matcher, filter, mapper", async ({ page, wsInterceptor }) => {
            test.setTimeout(60000);

            const fileName = "FILE_NAME_WS_STATS_MATCH";

            await page.goto(
                getDynamicUrl([
                    ...config,
                    {
                        communication: [
                            {
                                responseData: responseData21,
                                responseDelay: 1000,
                                sendData: sendData1
                            },
                            {
                                responseData: responseData22,
                                sendData: sendData2
                            }
                        ],
                        delay: 100,
                        path: path2,
                        protocols: "soap",
                        type: "websocket"
                    }
                ])
            );

            await wsInterceptor.waitUntilWebsocketAction([
                {
                    data: responseData12,
                    type: "onmessage"
                },
                {
                    data: responseData22,
                    type: "onmessage"
                }
            ]);

            const filePath = createOutputFileName(test.info().titlePath, fileName);

            // Two sockets x 5 actions each = 10 (Cypress saw 12 with the two `onopen` actions).
            wsInterceptor.writeStatsToLog(outputDir, { fileName, prettyOutput: true });

            expect(
                (JSON.parse(fs.readFileSync(filePath, "utf8")) as CallStackWebsocket[]).length
            ).toEqual(10);

            // Skipped: `{ matcher: { protocols: "soap" } }` - Playwright does not expose the
            // sub-protocols, so the matcher would select nothing and write no file.

            wsInterceptor.writeStatsToLog(outputDir, {
                fileName,
                matcher: { type: "onmessage", url: `**/${path1}` }
            });

            const onmessageStats = JSON.parse(
                fs.readFileSync(filePath, "utf8")
            ) as CallStackWebsocket[];

            expect(onmessageStats).toHaveLength(2);
            expect(onmessageStats[0]).toMatchObject({
                data: { data: responseData11 },
                type: "onmessage"
            });
            expect(onmessageStats[1]).toMatchObject({
                data: { data: responseData12 },
                type: "onmessage"
            });

            // path2 socket: create + send + onmessage + send + onmessage = 5 (Cypress saw 6).
            wsInterceptor.writeStatsToLog(outputDir, {
                fileName,
                filter: (callStack) => callStack.url.endsWith(path2)
            });

            const filterStats = JSON.parse(
                fs.readFileSync(filePath, "utf8")
            ) as CallStackWebsocket[];

            expect(filterStats).toHaveLength(5);
            expect(filterStats.every((entry) => entry.url.endsWith(path2))).toBe(true);

            wsInterceptor.writeStatsToLog(outputDir, {
                fileName,
                mapper: (callStack) => ({ type: callStack.type, url: callStack.url })
            });

            const mapperStats = JSON.parse(
                fs.readFileSync(filePath, "utf8")
            ) as CallStackWebsocket[];

            expect(mapperStats).toHaveLength(10);
            expect(
                mapperStats.every(
                    (entry) =>
                        entry.type !== undefined &&
                        entry.url !== undefined &&
                        Object.keys(entry).length === 2
                )
            ).toBe(true);
        });
    });

    test("Close", async ({ page, wsInterceptor }) => {
        test.setTimeout(60000);

        const delay = 3000;
        const code = 1000;
        const path = "webSocket-1";
        const reason = "<REASON>";

        const timing = startTiming();

        await page.goto(
            getDynamicUrl([
                {
                    close: {
                        code,
                        reason
                    },
                    communication: [
                        {
                            responseData: "response data",
                            responseDelay: delay,
                            sendData: "send data"
                        }
                    ],
                    delay: 100,
                    path,
                    type: "websocket"
                }
            ])
        );

        // Playwright reports the close as `onclose` and does not expose the close code/reason, so we
        // wait for/assert the `onclose` action instead of a `close` action with `{ code, reason }`.
        await wsInterceptor.waitUntilWebsocketAction([
            {
                type: "onclose"
            }
        ]);

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay);

        const entry = wsInterceptor.getLastRequest({ type: "onclose" });

        expect(entry).not.toBeUndefined();
        expect(entry!.url.toString().endsWith(path)).toBe(true);
    });

    test("Communication", async ({ page, wsInterceptor }) => {
        test.setTimeout(60000);

        const delay1 = 2000;
        const delay2 = 3500;
        const sendData1 = "hello";
        const sendData2 = "server";
        const response1 = "wellcome";
        const response2 = "friend";

        const timing = startTiming();

        await page.goto(
            getDynamicUrl([
                {
                    communication: [
                        {
                            responseData: response1,
                            responseDelay: delay1,
                            sendData: sendData1
                        },
                        {
                            responseData: response2,
                            responseDelay: delay2,
                            sendData: sendData2
                        }
                    ],
                    delay: 100,
                    path: "webSocket-1",
                    type: "websocket"
                }
            ])
        );

        await wsInterceptor.waitUntilWebsocketAction({
            data: response2,
            type: "onmessage"
        });

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay1 + delay2);

        // 5 actions instead of 6: Playwright does not capture the `onopen` action.
        expect(wsInterceptor.getStats()).toHaveLength(5);

        expect(wsInterceptor.getStats({ type: "create" })).toHaveLength(1);

        // `onopen` is not captured by Playwright.
        expect(wsInterceptor.getStats({ type: "onopen" })).toHaveLength(0);

        const sendStats = wsInterceptor.getStats({ type: "send" });

        expect(sendStats).toHaveLength(2);
        expect(sendStats[0].data).toBeTruthy();
        expect(sendStats[1].data).toBeTruthy();

        const onmessageStats = wsInterceptor.getStats({ type: "onmessage" });

        expect(onmessageStats).toHaveLength(2);
        expect(onmessageStats[0]).toMatchObject({ data: { data: response1 } });
        expect(onmessageStats[1]).toMatchObject({ data: { data: response2 } });
    });

    // Skipped: the dynamic page injects a fake socket error through a browser-side WebSocket proxy
    // that only exists under Cypress. Playwright's `page.on('websocket')` reports real socket errors
    // only, so the injected `onerror` action is never captured.
    test.skip("Error", async ({ page, wsInterceptor }) => {
        const delay = 3000;

        const timing = startTiming();

        await page.goto(
            getDynamicUrl([
                {
                    delay,
                    error: true,
                    path: "webSocket-1",
                    type: "websocket"
                }
            ])
        );

        await wsInterceptor.waitUntilWebsocketAction({
            type: "onerror"
        });

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay);

        expect(wsInterceptor.getLastRequest({ type: "onerror" })).not.toBeUndefined();
    });

    test("OnMessage", async ({ page, wsInterceptor }) => {
        test.setTimeout(60000);

        const delay1 = 3000;
        const delay2 = 2000;
        const response1 = "wellcome";
        const response2 = "friend";

        const timing = startTiming();

        await page.goto(
            getDynamicUrl([
                {
                    autoResponse: [
                        { data: response1, delay: delay1 },
                        { data: response2, delay: delay2 }
                    ],
                    delay: 100,
                    path: "webSocket-1",
                    type: "websocket"
                }
            ])
        );

        await wsInterceptor.waitUntilWebsocketAction({
            data: response2,
            type: "onmessage"
        });

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay1 + delay2);

        // 3 actions instead of 4: Playwright does not capture the `onopen` action.
        expect(wsInterceptor.getStats()).toHaveLength(3);

        expect(wsInterceptor.getStats({ type: "create" })).toHaveLength(1);

        // `onopen` is not captured by Playwright.
        expect(wsInterceptor.getStats({ type: "onopen" })).toHaveLength(0);

        const onmessageStats = wsInterceptor.getStats({ type: "onmessage" });

        expect(onmessageStats).toHaveLength(2);
        expect(onmessageStats[0]).toMatchObject({ data: { data: response1 } });
        expect(onmessageStats[1]).toMatchObject({ data: { data: response2 } });
    });

    test("Send", async ({ page, wsInterceptor }) => {
        test.setTimeout(60000);

        const delay1 = 2500;
        const delay2 = 3000;
        const sendData1 = "hello";
        const sendData2 = "server";

        const timing = startTiming();

        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    path: "webSocket-1",
                    sendQueue: [
                        {
                            data: sendData1,
                            delay: delay1
                        },
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
            data: sendData2,
            type: "send"
        });

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay1 + delay2);

        // 3 actions instead of 4: Playwright does not capture the `onopen` action.
        expect(wsInterceptor.getStats()).toHaveLength(3);

        expect(wsInterceptor.getStats({ type: "create" })).toHaveLength(1);

        // `onopen` is not captured by Playwright.
        expect(wsInterceptor.getStats({ type: "onopen" })).toHaveLength(0);

        const sendStats = wsInterceptor.getStats({ type: "send" });

        expect(sendStats).toHaveLength(2);
        expect(sendStats[0].data).toEqual(sendData1);
        expect(sendStats[1].data).toEqual(sendData2);
    });

    test("Reset watch", async ({ page, wsInterceptor }) => {
        test.setTimeout(60000);

        const delay1 = 2500;
        const delay2 = 3000;
        const path = "webSocket-1";
        const sendData1 = "hello";
        const sendData2 = "server";

        await page.goto(
            getDynamicUrl([
                {
                    delay: 100,
                    path,
                    sendQueue: [
                        {
                            data: "send me"
                        },
                        {
                            data: sendData2,
                            delay: 500
                        }
                    ],
                    type: "websocket"
                },
                {
                    fireOnClick: true,
                    path,
                    sendQueue: [
                        {
                            data: sendData1,
                            delay: delay1
                        },
                        {
                            data: sendData2,
                            delay: delay2
                        }
                    ],
                    type: "websocket"
                }
            ])
        );

        await wsInterceptor.waitUntilWebsocketAction(
            {
                type: "send"
            },
            { countMatch: 2 }
        );

        wsInterceptor.resetWatch();

        await fireRequest(page);

        const timing = startTiming();

        await wsInterceptor.waitUntilWebsocketAction({
            data: sendData2,
            type: "send"
        });

        expect(stopTiming(timing)).toBeGreaterThanOrEqual(delay1 + delay2);

        const sendStats = wsInterceptor.getStats({ type: "send" });

        expect(sendStats).toHaveLength(4);
        expect(sendStats[sendStats.length - 2].data).toEqual(sendData1);
        expect(sendStats[sendStats.length - 1].data).toEqual(sendData2);
    });
});
