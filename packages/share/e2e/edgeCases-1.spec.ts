/**
 * Ported from `packages/share/e2e/edgeCases-1.cy.ts`.
 *
 * Exercises edge cases and error scenarios for fetch / XMLHttpRequest / WebSocket, verifying that
 * every scenario behaves identically whether the interceptor is enabled or disabled.
 *
 * Adaptations from the Cypress suite:
 * - `cy.window().then((win) => ...)` bodies run in the browser, so each one is moved into a
 *   `page.evaluate(...)`. Only serializable values are returned and the assertions are made in Node.
 * - The Cypress helpers `getInitForFetchFromParams` / `getParamsFromDynamicRequest` live in
 *   `server/src/resources/dynamic`, which touches `window`/`document` at import time and therefore
 *   cannot be imported in the Node test process. Instead the request URLs are built in Node with a
 *   local `buildEntryUrl` helper (mirroring `getParamsFromDynamicRequest` for the fields these tests
 *   use) and the fetch/XHR/WebSocket calls are issued with plain browser APIs inside `page.evaluate`.
 * - Cypress-internal assertions (`Cypress.env(...)`, `"originFetch" in win`, etc.) are not ported.
 *   Instead the interceptor state is driven with `interceptor.destroy()` /
 *   `wsInterceptor.destroy()` (disabled) and the default started fixtures (enabled), and the
 *   behaviour is asserted.
 * - The `withvisit` variant is added to the describe title so the otherwise-identical enabled /
 *   disabled runs have unique, greppable names.
 * - "should handle all XHR state changes": a chunked response fires `readystatechange` multiple
 *   times while in the `LOADING` (3) state, so the captured states are de-duplicated before the
 *   `[1, 2, 3, 4]` comparison (keeps the original intent: the request progresses through every
 *   state).
 */

import { expect, test } from "playwright-interceptor";
import { HOST, SERVER_URL } from "playwright-interceptor-server/src/resources/constants";
import { getDynamicUrl } from "playwright-interceptor-server/src/utils";

import { getResponseStatus } from "../src/selectors";
import { wait } from "../src/utils";

const ORIGIN = `http://${HOST}`;
const testPath_Fetch_1 = "stats/fetch-1";

interface RequestEntry {
    duration?: number;
    method?: string;
    path: string;
    query?: Record<string, string | number>;
    responseBody?: Record<string, unknown>;
    status?: number;
    type: "fetch" | "xhr" | "websocket";
}

/**
 * Build the dynamic-server URL for a single request. Mirrors `getParamsFromDynamicRequest` for the
 * subset of fields these tests use (path, query, duration, responseBody, status).
 */
const buildEntryUrl = (entry: RequestEntry): string => {
    if (entry.type === "websocket") {
        return /^ws:\/\//.test(entry.path) ? entry.path : `ws://${HOST}/${entry.path}`;
    }

    const params = new URLSearchParams();

    if (entry.query) {
        for (const [key, value] of Object.entries(entry.query)) {
            params.set(key, String(value));
        }
    }

    if (entry.duration !== undefined) {
        params.set("duration", String(entry.duration));
    }

    params.set("path", entry.path);

    if (entry.responseBody !== undefined) {
        params.set("responseBody", JSON.stringify(entry.responseBody));
    }

    if (entry.status !== undefined) {
        params.set("status", String(entry.status));
    }

    const search = params.toString();
    const base = /^https?:\/\//.test(entry.path) ? entry.path : `${ORIGIN}/${entry.path}`;

    return `${base}${search ? `?${search}` : ""}`;
};

const createTests = (disableInterceptor: boolean, withvisit: "after" | "before") => {
    test.describe(`Edge Cases and Error Scenarios with interceptor ${disableInterceptor ? "disabled" : "enabled"} (visit ${withvisit})`, () => {
        test.beforeEach(async ({ page, interceptor, wsInterceptor }) => {
            test.setTimeout(60000);

            if (withvisit === "before") {
                await page.goto("/");
            }

            if (disableInterceptor) {
                await interceptor.destroy();
                wsInterceptor.destroy();
            }

            if (withvisit === "after") {
                await page.goto("/");
            }
        });

        if (disableInterceptor) {
            test("Interceptor should be disabled", async ({ page, interceptor }) => {
                const testPath_api_1 = "fetch-1";
                const testPath_api_2 = "xhr-1";

                await page.goto(
                    getDynamicUrl([
                        {
                            method: "POST",
                            path: "fetch-1",
                            type: "fetch"
                        },
                        {
                            method: "POST",
                            path: "xhr-1",
                            type: "xhr"
                        }
                    ])
                );

                await wait(1000);

                expect(interceptor.getStats()).toHaveLength(0);

                expect(await getResponseStatus(page, testPath_api_1)).toEqual(200);
                expect(await getResponseStatus(page, testPath_api_2)).toEqual(200);
            });

            test("wsInterceptor should be disabled", async ({ page, wsInterceptor }) => {
                const response = "test";

                await page.goto(
                    getDynamicUrl([
                        {
                            autoResponse: [{ data: response }],
                            delay: 100,
                            path: "webSocket-1",
                            type: "websocket"
                        }
                    ])
                );

                await wait(1000);

                expect(wsInterceptor.getStats()).toHaveLength(0);
            });
        }

        test.describe("Fetch Edge Cases", () => {
            test("should handle fetch with AbortController", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: "abort-test",
                    status: 200,
                    type: "fetch"
                });

                const result = await page.evaluate(async (url) => {
                    const controller = new AbortController();

                    const fetchPromise = fetch(url, { signal: controller.signal });

                    setTimeout(() => controller.abort(), 500);

                    try {
                        await fetchPromise;

                        return { aborted: false, name: "" };
                    } catch (error) {
                        return { aborted: true, name: (error as Error).name };
                    }
                }, url);

                if (result.aborted) {
                    expect(result.name).toEqual("AbortError");
                }
            });

            test("should handle fetch with streaming response", async ({ page }) => {
                const responseBody = { data: "chunk1\nchunk2\nchunk3" };

                const url = buildEntryUrl({
                    method: "GET",
                    path: testPath_Fetch_1,
                    responseBody,
                    status: 200,
                    type: "fetch"
                });

                const chunks = await page.evaluate(async (url) => {
                    const response = await fetch(url, {
                        headers: { "Content-Type": "application/json" }
                    });

                    const reader = response.body?.getReader();
                    const parts: string[] = [];

                    while (true) {
                        const { done, value } = await reader!.read();

                        if (done) {
                            break;
                        }

                        parts.push(new TextDecoder().decode(value));
                    }

                    return parts.join("");
                }, url);

                expect(chunks).toEqual(JSON.stringify(responseBody));
            });

            test("should handle fetch with credentials", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: "credentials-test",
                    status: 200,
                    type: "fetch"
                });

                const status = await page.evaluate(async (url) => {
                    const response = await fetch(url, {
                        credentials: "include",
                        headers: {
                            Authorization: "Bearer test-token",
                            "Content-Type": "application/json"
                        }
                    });

                    return response.status;
                }, url);

                expect(status).toEqual(200);
            });
        });

        test.describe("XMLHttpRequest Edge Cases", () => {
            test("should handle XHR with progress events", async ({ page }) => {
                const result = await page.evaluate(
                    () =>
                        new Promise<{ uploadProgressEvents: number; progressEvents: number }>(
                            (resolve) => {
                                const xhr = new XMLHttpRequest();
                                let uploadProgressEvents = 0;
                                let progressEvents = 0;

                                xhr.upload.onprogress = () => uploadProgressEvents++;
                                xhr.onprogress = () => progressEvents++;

                                xhr.open("POST", "/progress-test");
                                xhr.send("test data");

                                xhr.onload = () => {
                                    resolve({ uploadProgressEvents, progressEvents });
                                };
                            }
                        )
                );

                expect(result.uploadProgressEvents).toBeGreaterThan(0);
                expect(result.progressEvents).toEqual(0);
            });

            test("should handle XHR with timeout", async ({ page }) => {
                const url = buildEntryUrl({
                    duration: 2000,
                    method: "GET",
                    path: "timeout-test",
                    status: 200,
                    type: "xhr"
                });

                const readyState = await page.evaluate(
                    (url) =>
                        new Promise<number>((resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.timeout = 1000;

                            xhr.ontimeout = () => {
                                resolve(xhr.readyState);
                            };

                            xhr.open("GET", url);
                            xhr.send();
                        }),
                    url
                );

                expect(readyState).toEqual(4);
            });

            test("should handle XHR with custom headers", async ({ page }) => {
                const status = await page.evaluate(
                    () =>
                        new Promise<number>((resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("GET", "/headers-test");
                            xhr.setRequestHeader("X-Custom-Header", "test-value");
                            xhr.setRequestHeader("Content-Type", "application/json");
                            xhr.send();

                            xhr.onload = () => {
                                resolve(xhr.status);
                            };
                        })
                );

                expect(status).toEqual(200);
            });

            test("should handle XHR with Blob response", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: SERVER_URL.BlobResponse,
                    status: 200,
                    type: "xhr"
                });

                const isBlob = await page.evaluate(
                    (url) =>
                        new Promise<boolean>((resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("GET", url);
                            xhr.responseType = "blob";

                            xhr.onload = () => {
                                resolve(xhr.response instanceof Blob);
                            };

                            xhr.send();
                        }),
                    url
                );

                expect(isBlob).toBe(true);
            });

            test("should handle fetch with Blob response", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: SERVER_URL.BlobResponse,
                    status: 200,
                    type: "fetch"
                });

                const isBlob = await page.evaluate(async (url) => {
                    const response = await fetch(url);
                    const blob = await response.blob();

                    return blob instanceof Blob;
                }, url);

                expect(isBlob).toBe(true);
            });

            test("should handle malformed response in XHR", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: SERVER_URL.InvalidJson,
                    type: "xhr"
                });

                const result = await page.evaluate(
                    (url) =>
                        new Promise<{ status: number; responseIsNull: boolean }>((resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("GET", url);
                            xhr.responseType = "json";

                            xhr.onload = () => {
                                resolve({
                                    status: xhr.status,
                                    responseIsNull: xhr.response === null
                                });
                            };

                            xhr.send();
                        }),
                    url
                );

                expect(result.status).toEqual(200);
                expect(result.responseIsNull).toBe(true);
            });

            test("should handle malformed response in fetch", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: SERVER_URL.InvalidJson,
                    type: "fetch"
                });

                const result = await page.evaluate(async (url) => {
                    const response = await fetch(url);

                    let threw = false;

                    try {
                        await response.json();
                    } catch {
                        threw = true;
                    }

                    return { status: response.status, threw };
                }, url);

                expect(result.status).toEqual(200);
                expect(result.threw).toBe(true);
            });
        });

        test.describe("WebSocket Edge Cases", () => {
            test("should handle WebSocket binary data", async ({ page }) => {
                const url = buildEntryUrl({
                    path: SERVER_URL.WebSocketArrayBuffer,
                    type: "websocket"
                });

                const isArrayBuffer = await page.evaluate(
                    (url) =>
                        new Promise<boolean>((resolve) => {
                            const ws = new WebSocket(url);

                            ws.binaryType = "arraybuffer";

                            ws.onopen = () => {
                                ws.send(new Uint8Array([1, 2, 3, 4, 5]));
                            };

                            ws.onmessage = (event) => {
                                resolve(event.data instanceof ArrayBuffer);
                            };
                        }),
                    url
                );

                expect(isArrayBuffer).toBe(true);
            });

            test("should handle WebSocket with multiple protocols", async ({ page }) => {
                const url = buildEntryUrl({
                    path: "protocols-test",
                    type: "websocket"
                });

                const protocol = await page.evaluate(
                    (url) =>
                        new Promise<string>((resolve) => {
                            const ws = new WebSocket(url, ["protocol1", "protocol2"]);

                            ws.onopen = () => {
                                resolve(ws.protocol);
                            };
                        }),
                    url
                );

                expect(["protocol1", "protocol2"]).toContain(protocol);
            });

            test("should handle WebSocket with ping/pong", async ({ page }) => {
                const url = buildEntryUrl({
                    path: "ping-test",
                    type: "websocket"
                });

                const gotPong = await page.evaluate(
                    (url) =>
                        new Promise<boolean>((resolve) => {
                            const ws = new WebSocket(url);
                            const response = "pong";

                            ws.onopen = () => {
                                ws.send(
                                    JSON.stringify({
                                        data: "ping",
                                        delay: 500,
                                        response
                                    })
                                );
                            };

                            ws.onmessage = (event) => {
                                if (event.data === response) {
                                    resolve(true);
                                }
                            };
                        }),
                    url
                );

                expect(gotPong).toBe(true);
            });
        });

        test.describe("Concurrent Requests", () => {
            test("should handle multiple concurrent fetch requests", async ({ page }) => {
                const urls = [
                    buildEntryUrl({
                        method: "GET",
                        path: "concurrent-1",
                        status: 200,
                        type: "fetch"
                    }),
                    buildEntryUrl({
                        method: "GET",
                        path: "concurrent-2",
                        status: 200,
                        type: "fetch"
                    }),
                    buildEntryUrl({
                        method: "GET",
                        path: "concurrent-3",
                        status: 200,
                        type: "fetch"
                    })
                ];

                const statuses = await page.evaluate(async (urls) => {
                    const responses = await Promise.all(urls.map((url) => fetch(url)));

                    return responses.map((response) => response.status);
                }, urls);

                expect(statuses).toHaveLength(3);
                statuses.forEach((status) => expect(status).toEqual(200));
            });

            test("should handle mixed concurrent requests (fetch, XHR, WebSocket)", async ({
                page
            }) => {
                const fetchUrl = buildEntryUrl({
                    method: "GET",
                    path: "mixed-1",
                    status: 200,
                    type: "fetch"
                });
                const xhrUrl = buildEntryUrl({
                    method: "GET",
                    path: "mixed-2",
                    status: 200,
                    type: "xhr"
                });
                const wsUrl = buildEntryUrl({
                    path: "mixed-3",
                    type: "websocket"
                });

                const result = await page.evaluate(
                    async ({ fetchUrl, xhrUrl, wsUrl }) => {
                        const fetchPromise = fetch(fetchUrl);

                        const xhrPromise = new Promise<number>((resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("GET", xhrUrl);
                            xhr.onload = () => resolve(xhr.status);
                            xhr.send();
                        });

                        const wsPromise = new Promise<number>((resolve) => {
                            const ws = new WebSocket(wsUrl);

                            ws.onopen = () => resolve(ws.readyState);
                        });

                        const [fetchRes, xhrStatus, wsReadyState] = await Promise.all([
                            fetchPromise,
                            xhrPromise,
                            wsPromise
                        ]);

                        return {
                            fetchStatus: fetchRes.status,
                            xhrStatus,
                            wsReadyState
                        };
                    },
                    { fetchUrl, xhrUrl, wsUrl }
                );

                expect(result.fetchStatus).toEqual(200);
                expect(result.xhrStatus).toEqual(200);
                expect(result.wsReadyState).toEqual(1);
            });
        });

        test.describe("Error Handling Scenarios", () => {
            test("should handle network errors in fetch", async ({ page }) => {
                const result = await page.evaluate(async () => {
                    try {
                        await fetch("http://localhost:3333/invalid-url");

                        return { caught: false, isTypeError: false, message: "" };
                    } catch (error) {
                        return {
                            caught: true,
                            isTypeError: error instanceof TypeError,
                            message: (error as Error).message
                        };
                    }
                });

                expect(result.caught).toBe(true);
                expect(result.isTypeError).toBe(true);
                expect(result.message).toContain("Failed to fetch");
            });

            test("should handle an invalid url for WebSocket", async ({ page }) => {
                const readyState = await page.evaluate(
                    () =>
                        new Promise<number>((resolve) => {
                            const ws = new WebSocket("ws://localhost:3003/ws/");

                            ws.onerror = () => {
                                resolve(ws.readyState);
                            };
                        })
                );

                expect(readyState).toEqual(3);
            });

            test("should handle WebSocket connection errors", async ({ page }) => {
                const url = buildEntryUrl({
                    path: SERVER_URL.WebSocketClose,
                    type: "websocket"
                });

                const result = await page.evaluate(
                    (url) =>
                        new Promise<{ openCalled: boolean; closedReadyState: number }>(
                            (resolve) => {
                                const ws = new WebSocket(url);
                                let openCalled = false;

                                ws.onopen = () => {
                                    openCalled = true;
                                };

                                ws.onclose = () => {
                                    resolve({ openCalled, closedReadyState: ws.readyState });
                                };
                            }
                        ),
                    url
                );

                expect(result.closedReadyState).toEqual(3);
                expect(result.openCalled).toBe(true);
            });
        });

        test.describe("Request/Response Transformation", () => {
            test("should handle fetch with FormData", async ({ page }) => {
                const url = buildEntryUrl({
                    method: "POST",
                    path: SERVER_URL.AutoResponseFormData,
                    status: 200,
                    type: "fetch"
                });

                const testFileName = "test.txt";
                const testKey = "text";
                const testValue = "test value";

                const result = await page.evaluate(
                    async ({ url, testFileName, testFileContent, testKey, testValue }) => {
                        const formData = new FormData();

                        formData.append("file", new File([testFileContent], testFileName));
                        formData.append(testKey, testValue);

                        const response = await fetch(url, {
                            body: formData,
                            method: "POST"
                        });

                        return {
                            status: response.status,
                            json: (await response.json()) as {
                                receivedFields: Record<string, unknown>;
                                receivedFiles: { originalname: string }[];
                            }
                        };
                    },
                    {
                        url,
                        testFileName,
                        testFileContent: "test content",
                        testKey,
                        testValue
                    }
                );

                expect(result.status).toEqual(200);
                expect(result.json).toHaveProperty("receivedFields");
                expect(result.json).toHaveProperty("receivedFiles");
                expect(result.json.receivedFields).toEqual({ [testKey]: testValue });
                expect(result.json.receivedFiles).toHaveLength(1);
                expect(result.json.receivedFiles[0]).toHaveProperty("originalname", testFileName);
            });
        });

        test.describe("State Management", () => {
            test("should handle fetch request cancellation after response started", async ({
                page
            }) => {
                const url = buildEntryUrl({
                    method: "GET",
                    path: "cancel-after-start",
                    responseBody: { data: "streaming response" },
                    status: 200,
                    type: "fetch"
                });

                const result = await page.evaluate(async (url) => {
                    const controller = new AbortController();

                    const response = await fetch(url, {
                        headers: { "Content-Type": "application/json" },
                        signal: controller.signal
                    });

                    const reader = response.body?.getReader();

                    controller.abort();

                    try {
                        await reader!.read();

                        return { aborted: false, name: "" };
                    } catch (error) {
                        return { aborted: true, name: (error as Error).name };
                    }
                }, url);

                expect(result.aborted).toBe(true);
                expect(result.name).toEqual("AbortError");
            });

            test("should handle all XHR state changes", async ({ page }) => {
                const url = buildEntryUrl({
                    duration: 1000,
                    method: "GET",
                    path: SERVER_URL.ResponseWithProgress,
                    status: 200,
                    type: "xhr"
                });

                const states = await page.evaluate(
                    (url) =>
                        new Promise<number[]>((resolve) => {
                            const xhr = new XMLHttpRequest();
                            const captured: number[] = [];

                            xhr.onreadystatechange = () => {
                                captured.push(xhr.readyState);

                                if (xhr.readyState === 4) {
                                    resolve(captured);
                                }
                            };

                            xhr.open("GET", url);
                            xhr.send();
                        }),
                    url
                );

                // de-duplicate consecutive states: a chunked response fires `readystatechange`
                // repeatedly while in the LOADING (3) state.
                const uniqueStates = states.filter(
                    (state, index) => index === 0 || state !== states[index - 1]
                );

                expect(uniqueStates).toEqual([1, 2, 3, 4]);
            });
        });
    });
};

// we must be sure that the tests are applicable to the original fetch, xhr and websocket
createTests(true, "before");
createTests(true, "after");
// tests with interceptor enabled
createTests(false, "before");
createTests(false, "after");
