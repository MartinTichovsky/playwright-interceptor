/**
 * Ported from the Cypress suite (`packages/share/e2e/xmlHttpRequest.cy.ts`).
 *
 * The Cypress file runs every test twice via `createTests(disableInterceptor)`: once with the
 * interceptor enabled and once disabled. That structure is preserved here.
 *
 * Adaptations from the Cypress suite:
 * - `getParamsFromDynamicRequest` (from `server/src/resources/dynamic`) cannot be imported in Node
 *   (it touches `window`/`location`/`document` at import time). Instead the request URL is built in
 *   Node with the local `buildUrl` helper (same query params the dynamic helper would produce:
 *   `responseBody`, `responseHeaders`, `responseString`, `status`, `duration` and arbitrary query),
 *   and the XHR is fired inside `page.evaluate(...)` returning only serializable values that are
 *   asserted in Node.
 * - Cypress-internal `beforeEach` assertions (`Cypress.env(...)`, `"originFetch" in win`, ...) are
 *   dropped. The enable/disable intent is expressed with `interceptor.destroy()` (disabled) and the
 *   already-started fixture (enabled). For the disabled variant every test additionally asserts that
 *   `interceptor.getStats()` stays empty; the requests still succeed and the server counter still
 *   logs them.
 * - `cy.window().then(async (win) => new Promise(...))` -> `await page.evaluate(...)`.
 * - The describe title (`... enabled` / `... disabled`) keeps the two variants' test ids unique.
 */

import { expect, test } from "playwright-interceptor";
import {
    HOST,
    I_TEST_ID_HEADER,
    SERVER_URL
} from "playwright-interceptor-server/src/resources/constants";

import { getCounter, resetCounter } from "../src/counter";
import { getTestId } from "../src/utils";

interface BuildUrlParams {
    duration?: number;
    query?: Record<string, string>;
    responseBody?: Record<string, unknown>;
    responseHeaders?: Record<string, string>;
    responseString?: string;
    status?: number;
}

/**
 * Build a relative URL for the test server's dynamic endpoint. Mirrors the query params the shared
 * `getParamsFromDynamicRequest` helper would produce so the server reflects the response the test
 * expects. The URL is relative, so it resolves against the page origin once fired in the browser.
 */
const buildUrl = (path: string, params: BuildUrlParams = {}) => {
    const search = new URLSearchParams();

    if (params.query) {
        for (const [key, value] of Object.entries(params.query)) {
            search.set(key, value);
        }
    }

    if (params.duration !== undefined) {
        search.set("duration", String(params.duration));
    }

    if (params.responseBody !== undefined) {
        search.set("responseBody", JSON.stringify(params.responseBody));
    }

    if (params.responseString !== undefined) {
        search.set("responseString", params.responseString);
    }

    if (params.responseHeaders !== undefined) {
        search.set("responseHeaders", JSON.stringify(params.responseHeaders));
    }

    if (params.status !== undefined) {
        search.set("status", String(params.status));
    }

    const searchString = search.toString();

    return `${path}${searchString ? `?${searchString}` : ""}`;
};

const createTests = (disableInterceptor: boolean) => {
    test.describe(`XMLHttpRequest with interceptor ${disableInterceptor ? "disabled" : "enabled"}`, () => {
        test.beforeEach(async ({ page, interceptor }) => {
            if (disableInterceptor) {
                await interceptor.destroy();
            }

            await page.goto("/");
        });

        test("should handle GET request with response body and headers", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/users";

            await resetCounter(request, iTestId);

            const responseBody = { message: "GET request successful", data: [1, 2, 3] };
            const responseHeaders = { "X-Custom-Header": "test-value" };
            const responseStatus = 200;

            const url = buildUrl(testPath, {
                responseBody,
                responseHeaders,
                status: responseStatus
            });

            const runAction = () =>
                page.evaluate(
                    ({ url, iTestId, headerName }) =>
                        new Promise<{
                            status: number;
                            statusText: string;
                            responseText: string;
                            customHeader: string | null;
                        }>((resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("GET", url);
                            xhr.setRequestHeader(headerName, iTestId);

                            xhr.onload = () => {
                                resolve({
                                    status: xhr.status,
                                    statusText: xhr.statusText,
                                    responseText: xhr.responseText,
                                    customHeader: xhr.getResponseHeader("X-Custom-Header")
                                });
                            };

                            xhr.send();
                        }),
                    { url, iTestId, headerName: I_TEST_ID_HEADER }
                );

            const result = disableInterceptor
                ? await runAction()
                : await interceptor.waitUntilRequestIsDone(runAction);

            expect(result.status).toEqual(responseStatus);
            expect(result.statusText).toEqual("OK");
            expect(JSON.parse(result.responseText)).toEqual(responseBody);
            expect(result.customHeader).toEqual(responseHeaders["X-Custom-Header"]);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            } else {
                const stats = interceptor.getStats({ url: `**${testPath}` });

                expect(stats).toHaveLength(1);
                expect(stats[0].resourceType).toEqual("xhr");
                expect(stats[0].request.method).toEqual("GET");
                expect(stats[0].response?.statusCode).toEqual(responseStatus);
                expect(stats[0].isPending).toEqual(false);
            }
        });

        test("should handle POST request with request body and custom headers", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/users/create";

            await resetCounter(request, iTestId);

            const requestBody = { name: "John Doe", email: "john@example.com" };
            const requestHeaders = {
                Authorization: "Bearer token123",
                "X-API-Key": "api-key-456"
            };
            const responseBody = { id: 1, created: true };
            const responseStatus = 201;

            const url = buildUrl(testPath, { responseBody, status: responseStatus });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody, requestHeaders }) =>
                    new Promise<{ status: number; statusText: string; responseText: string }>(
                        (resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("POST", url);
                            xhr.setRequestHeader("Content-Type", "application/json");
                            xhr.setRequestHeader("Authorization", requestHeaders.Authorization);
                            xhr.setRequestHeader("X-API-Key", requestHeaders["X-API-Key"]);
                            xhr.setRequestHeader(headerName, iTestId);

                            xhr.onload = () => {
                                resolve({
                                    status: xhr.status,
                                    statusText: xhr.statusText,
                                    responseText: xhr.responseText
                                });
                            };

                            xhr.send(JSON.stringify(requestBody));
                        }
                    ),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody, requestHeaders }
            );

            expect(result.status).toEqual(responseStatus);
            expect(result.statusText).toEqual("Created");
            expect(JSON.parse(result.responseText)).toEqual(responseBody);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle POST request with query parameters (like PUT)", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/users/update";

            await resetCounter(request, iTestId);

            const requestBody = { status: "active", priority: "high" };
            const queryParams = { userId: "123", version: "v2", action: "update" };
            const responseStatus = 200;

            const url = buildUrl(testPath, { query: queryParams, status: responseStatus });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody }) =>
                    new Promise<{ status: number; readyState: number }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("POST", url);
                        xhr.setRequestHeader("Content-Type", "application/json");
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onload = () => {
                            resolve({ status: xhr.status, readyState: xhr.readyState });
                        };

                        xhr.send(JSON.stringify(requestBody));
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody }
            );

            expect(result.status).toEqual(responseStatus);
            expect(result.readyState).toEqual(4); // DONE

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toContain(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle POST request for deletion and test readyState changes", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/users/456/delete";

            await resetCounter(request, iTestId);

            const expectedStatus = 204;
            const requestBody = { action: "delete", confirm: true };

            const url = buildUrl(testPath, { status: expectedStatus });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody }) =>
                    new Promise<{ status: number; readyStates: number[] }>((resolve) => {
                        const readyStates: number[] = [];
                        const xhr = new XMLHttpRequest();

                        xhr.onreadystatechange = () => {
                            readyStates.push(xhr.readyState);

                            if (xhr.readyState === 4) {
                                resolve({ status: xhr.status, readyStates });
                            }
                        };

                        xhr.open("POST", url);
                        xhr.setRequestHeader("Content-Type", "application/json");
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.send(JSON.stringify(requestBody));
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody }
            );

            expect(result.status).toEqual(expectedStatus);
            expect(result.readyStates).toEqual(expect.arrayContaining([1, 2, 4]));

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle error responses (404 Not Found)", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/nonexistent";

            await resetCounter(request, iTestId);

            const expectedStatus = 404;
            const errorResponseBody = { error: "Resource not found", code: "NOT_FOUND" };

            const url = buildUrl(testPath, {
                responseBody: errorResponseBody,
                status: expectedStatus
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{ status: number; statusText: string; responseText: string }>(
                        (resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("GET", url);
                            xhr.setRequestHeader(headerName, iTestId);

                            xhr.onload = () => {
                                resolve({
                                    status: xhr.status,
                                    statusText: xhr.statusText,
                                    responseText: xhr.responseText
                                });
                            };

                            xhr.send();
                        }
                    ),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.status).toEqual(expectedStatus);
            expect(result.statusText).toEqual("Not Found");
            expect(JSON.parse(result.responseText)).toEqual(errorResponseBody);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle server error responses (500 Internal Server Error)", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/error-endpoint";

            await resetCounter(request, iTestId);

            const expectedStatus = 500;
            const errorResponseBody = {
                error: "Internal server error",
                timestamp: "2024-01-01T00:00:00Z"
            };

            const url = buildUrl(testPath, {
                responseBody: errorResponseBody,
                status: expectedStatus
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{ status: number; statusText: string; responseText: string }>(
                        (resolve) => {
                            const xhr = new XMLHttpRequest();

                            xhr.open("POST", url);
                            xhr.setRequestHeader(headerName, iTestId);

                            xhr.onload = () => {
                                resolve({
                                    status: xhr.status,
                                    statusText: xhr.statusText,
                                    responseText: xhr.responseText
                                });
                            };

                            xhr.send();
                        }
                    ),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.status).toEqual(expectedStatus);
            expect(result.statusText).toEqual("Internal Server Error");
            expect(JSON.parse(result.responseText)).toEqual(errorResponseBody);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle POST request with complex response headers (like PATCH)", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/resources/patch";

            await resetCounter(request, iTestId);

            const requestBody = { field: "updated-value", operation: "patch" };
            const responseHeaders = {
                "Last-Modified": "Wed, 21 Oct 2023 07:28:00 GMT",
                ETag: '"123456789"',
                "Cache-Control": "no-cache"
            };
            const expectedStatus = 200;

            const url = buildUrl(testPath, { responseHeaders, status: expectedStatus });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody, headerKeys }) =>
                    new Promise<{
                        status: number;
                        headers: Record<string, string | null>;
                        allHeaders: string;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("POST", url);
                        xhr.setRequestHeader("Content-Type", "application/json");
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onload = () => {
                            const headers: Record<string, string | null> = {};

                            headerKeys.forEach((key) => {
                                headers[key] = xhr.getResponseHeader(key);
                            });

                            resolve({
                                status: xhr.status,
                                headers,
                                allHeaders: xhr.getAllResponseHeaders()
                            });
                        };

                        xhr.send(JSON.stringify(requestBody));
                    }),
                {
                    url,
                    iTestId,
                    headerName: I_TEST_ID_HEADER,
                    requestBody,
                    headerKeys: Object.keys(responseHeaders)
                }
            );

            expect(result.status).toEqual(expectedStatus);

            for (const [key, value] of Object.entries(responseHeaders)) {
                expect(result.headers[key]).toEqual(value);
            }

            expect(result.allHeaders).toContain("content-type:");
            expect(result.allHeaders).toContain("last-modified:");

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle request with both query parameters and request body", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/process";

            await resetCounter(request, iTestId);

            const requestBody = { action: "process", data: { items: [1, 2, 3] } };
            const queryParams = { format: "json", include: "metadata", limit: "10" };
            const responseHeaders = { "X-Processing-Time": "150ms" };
            const responseBody = { processed: true, count: 3 };
            const responseStatus = 200;

            const url = buildUrl(testPath, {
                query: queryParams,
                responseBody,
                responseHeaders,
                status: responseStatus
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody }) =>
                    new Promise<{
                        status: number;
                        responseText: string;
                        processingTime: string | null;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("POST", url);
                        xhr.setRequestHeader("Content-Type", "application/json");
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onload = () => {
                            resolve({
                                status: xhr.status,
                                responseText: xhr.responseText,
                                processingTime: xhr.getResponseHeader("X-Processing-Time")
                            });
                        };

                        xhr.send(JSON.stringify(requestBody));
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody }
            );

            expect(result.status).toEqual(responseStatus);
            expect(JSON.parse(result.responseText)).toEqual(responseBody);
            expect(result.processingTime).toEqual(responseHeaders["X-Processing-Time"]);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toContain(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle progress events and loading states", async ({
            page,
            request,
            interceptor
        }) => {
            test.setTimeout(60000);

            const iTestId = getTestId(test.info());
            const testPath = `/${SERVER_URL.ResponseWithProgress}`;

            await resetCounter(request, iTestId);

            const requestBody = { largeData: "x".repeat(1000) };

            const url = buildUrl(testPath);

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody }) =>
                    new Promise<{
                        loadStartCalled: boolean;
                        progressCalled: boolean;
                        loadEndCalled: boolean;
                    }>((resolve) => {
                        let progressCalled = false;
                        let loadStartCalled = false;
                        let loadEndCalled = false;

                        const xhr = new XMLHttpRequest();

                        xhr.onloadstart = () => {
                            loadStartCalled = true;
                        };

                        xhr.onprogress = () => {
                            progressCalled = true;
                        };

                        xhr.onloadend = () => {
                            loadEndCalled = true;
                        };

                        xhr.onload = () => {
                            // because `onloadend` is called after `onload`
                            setTimeout(() => {
                                resolve({ loadStartCalled, progressCalled, loadEndCalled });
                            }, 100);
                        };

                        xhr.open("POST", url);
                        xhr.setRequestHeader("Content-Type", "application/json");
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.send(JSON.stringify(requestBody));
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody }
            );

            expect(result.loadStartCalled).toBe(true);
            expect(result.progressCalled).toBe(true);
            expect(result.loadEndCalled).toBe(true);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toContain(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle different GET and POST scenarios comprehensively", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPaths = ["/api/get-test", "/api/head-like-test", "/api/options-like-test"];

            await resetCounter(request, iTestId);

            const testCases = [
                { method: "GET" as const, path: testPaths[0], status: 200, hasBody: false },
                { method: "GET" as const, path: testPaths[1], status: 200, hasBody: false },
                {
                    method: "POST" as const,
                    path: testPaths[2],
                    status: 200,
                    hasBody: true,
                    body: { operation: "options" }
                }
            ].map((testCase) => ({
                ...testCase,
                url: buildUrl(testCase.path, { status: testCase.status })
            }));

            const results = await page.evaluate(
                ({ testCases, iTestId, headerName }) =>
                    Promise.all(
                        testCases.map(
                            (testCase) =>
                                new Promise<string>((resolve, reject) => {
                                    const xhr = new XMLHttpRequest();

                                    xhr.open(testCase.method, testCase.url);
                                    xhr.setRequestHeader(headerName, iTestId);

                                    xhr.onload = () => {
                                        if (xhr.status !== testCase.status) {
                                            reject(new Error(`Unexpected status ${xhr.status}`));

                                            return;
                                        }

                                        resolve(testCase.method);
                                    };

                                    if (testCase.hasBody) {
                                        xhr.setRequestHeader("Content-Type", "application/json");
                                        xhr.send(JSON.stringify(testCase.body));
                                    } else {
                                        xhr.send();
                                    }
                                })
                        )
                    ),
                { testCases, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(results).toHaveLength(3);
            expect([...results].sort()).toEqual(["GET", "GET", "POST"]);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(3);

            const loggedUrls = counter.map((entry) => entry.url);

            testPaths.forEach((path) => {
                expect(loggedUrls).toContain(`http://${HOST}${path}`);
            });

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle response with custom status text and multiple headers", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/with-headers";

            await resetCounter(request, iTestId);

            const multipleHeaders = {
                "X-Rate-Limit": "1000",
                "X-Rate-Remaining": "999",
                "X-Rate-Reset": "1640995200",
                Server: "nginx/1.20.1",
                "Access-Control-Allow-Origin": "*",
                "Custom-Header": "test-value"
            };
            const responseBody = { success: true, timestamp: Date.now() };
            const expectedStatus = 200;

            const url = buildUrl(testPath, {
                responseBody,
                responseHeaders: multipleHeaders,
                status: expectedStatus
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, headerKeys }) =>
                    new Promise<{
                        status: number;
                        responseText: string;
                        headers: Record<string, string | null>;
                        customLower: string | null;
                        customUpper: string | null;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onreadystatechange = () => {
                            if (xhr.readyState === 4) {
                                const headers: Record<string, string | null> = {};

                                headerKeys.forEach((key) => {
                                    headers[key] = xhr.getResponseHeader(key);
                                });

                                resolve({
                                    status: xhr.status,
                                    responseText: xhr.responseText,
                                    headers,
                                    customLower: xhr.getResponseHeader("custom-header"),
                                    customUpper: xhr.getResponseHeader("CUSTOM-HEADER")
                                });
                            }
                        };

                        xhr.send();
                    }),
                {
                    url,
                    iTestId,
                    headerName: I_TEST_ID_HEADER,
                    headerKeys: Object.keys(multipleHeaders)
                }
            );

            expect(result.status).toEqual(expectedStatus);
            expect(JSON.parse(result.responseText)).toEqual(responseBody);

            Object.entries(multipleHeaders).forEach(([headerName, headerValue]) => {
                expect(result.headers[headerName]).toEqual(headerValue);
            });

            expect(result.customLower).toEqual(multipleHeaders["Custom-Header"]);
            expect(result.customUpper).toEqual(multipleHeaders["Custom-Header"]);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle XMLHttpRequest with different ready states and events", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/ready-state-test";

            await resetCounter(request, iTestId);

            const requestBody = { test: "ready-state-testing" };
            const expectedStatus = 200;

            const url = buildUrl(testPath, { status: expectedStatus });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody }) =>
                    new Promise<{ status: number; readyStates: number[]; events: string[] }>(
                        (resolve) => {
                            const events: string[] = [];
                            const readyStates: number[] = [];

                            const xhr = new XMLHttpRequest();

                            xhr.onloadstart = () => events.push("loadstart");
                            xhr.onload = () => events.push("load");
                            xhr.onloadend = () => events.push("loadend");
                            xhr.onprogress = () => events.push("progress");

                            xhr.onreadystatechange = () => {
                                readyStates.push(xhr.readyState);
                                events.push(`readystatechange-${xhr.readyState}`);

                                if (xhr.readyState === 4) {
                                    // wait for the other events to be triggered
                                    setTimeout(() => {
                                        resolve({ status: xhr.status, readyStates, events });
                                    }, 100);
                                }
                            };

                            xhr.open("POST", url);
                            xhr.setRequestHeader("Content-Type", "application/json");
                            xhr.setRequestHeader(headerName, iTestId);
                            xhr.send(JSON.stringify(requestBody));
                        }
                    ),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody }
            );

            expect(result.status).toEqual(expectedStatus);
            expect(result.readyStates).toEqual(expect.arrayContaining([1, 2, 3, 4]));
            expect(result.events).toContain("loadstart");
            expect(result.events).toContain("load");
            expect(result.events).toContain("loadend");
            expect(result.events).toContain("readystatechange-4");

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle various status codes and response scenarios", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPaths = [
                "/api/ok",
                "/api/created",
                "/api/accepted",
                "/api/bad-request",
                "/api/unauthorized",
                "/api/forbidden"
            ];

            await resetCounter(request, iTestId);

            const statusTests = [
                { status: 200, path: testPaths[0], method: "GET" as const },
                { status: 201, path: testPaths[1], method: "POST" as const },
                { status: 202, path: testPaths[2], method: "POST" as const },
                { status: 400, path: testPaths[3], method: "GET" as const },
                { status: 401, path: testPaths[4], method: "GET" as const },
                { status: 403, path: testPaths[5], method: "GET" as const }
            ].map((statusTest) => ({
                ...statusTest,
                hasBody: statusTest.method === "POST",
                url: buildUrl(statusTest.path, { status: statusTest.status })
            }));

            const results = await page.evaluate(
                ({ statusTests, iTestId, headerName }) =>
                    Promise.all(
                        statusTests.map(
                            (statusTest) =>
                                new Promise<number>((resolve, reject) => {
                                    const xhr = new XMLHttpRequest();

                                    xhr.open(statusTest.method, statusTest.url);
                                    xhr.setRequestHeader(headerName, iTestId);

                                    xhr.onload = () => {
                                        if (
                                            xhr.status !== statusTest.status ||
                                            xhr.readyState !== 4
                                        ) {
                                            reject(
                                                new Error(
                                                    `Unexpected status ${xhr.status} / readyState ${xhr.readyState}`
                                                )
                                            );

                                            return;
                                        }

                                        resolve(xhr.status);
                                    };

                                    if (statusTest.hasBody) {
                                        xhr.setRequestHeader("Content-Type", "application/json");
                                        xhr.send(JSON.stringify({ statusTest: true }));
                                    } else {
                                        xhr.send();
                                    }
                                })
                        )
                    ),
                { statusTests, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(results).toHaveLength(6);
            expect([...results].sort((a, b) => a - b)).toEqual([200, 201, 202, 400, 401, 403]);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(6);

            const loggedUrls = counter.map((entry) => entry.url);

            testPaths.forEach((path) => {
                expect(loggedUrls).toContain(`http://${HOST}${path}`);
            });

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle timeout property correctly", async ({ page, request, interceptor }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/timeout-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, { responseBody: { success: true }, status: 200 });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{
                        defaultTimeout: number;
                        setTimeoutValue: number;
                        onloadTimeout: number;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        const defaultTimeout = xhr.timeout;

                        xhr.timeout = 5000;

                        const setTimeoutValue = xhr.timeout;

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.timeout = 10000; // 10 seconds timeout

                        xhr.onload = () => {
                            resolve({
                                defaultTimeout,
                                setTimeoutValue,
                                onloadTimeout: xhr.timeout
                            });
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.defaultTimeout).toEqual(0);
            expect(result.setTimeoutValue).toEqual(5000);
            expect(result.onloadTimeout).toEqual(10000);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle withCredentials property correctly", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/credentials-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, { responseBody: { authenticated: true }, status: 200 });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{
                        defaultWithCredentials: boolean;
                        setWithCredentials: boolean;
                        onloadWithCredentials: boolean;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        const defaultWithCredentials = xhr.withCredentials;

                        xhr.withCredentials = true;

                        const setWithCredentials = xhr.withCredentials;

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.withCredentials = true;

                        xhr.onload = () => {
                            resolve({
                                defaultWithCredentials,
                                setWithCredentials,
                                onloadWithCredentials: xhr.withCredentials
                            });
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.defaultWithCredentials).toEqual(false);
            expect(result.setWithCredentials).toEqual(true);
            expect(result.onloadWithCredentials).toEqual(true);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle upload property and events correctly", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/upload-test";

            await resetCounter(request, iTestId);

            const requestBody = { largeData: "x".repeat(5000) };

            const url = buildUrl(testPath, { responseBody: { uploaded: true }, status: 200 });

            const result = await page.evaluate(
                ({ url, iTestId, headerName, requestBody }) =>
                    new Promise<{
                        uploadExists: boolean;
                        uploadIsInstance: boolean;
                        uploadProgressCalled: boolean;
                        uploadLoadCalled: boolean;
                        uploadLoadStartCalled: boolean;
                    }>((resolve) => {
                        let uploadProgressCalled = false;
                        let uploadLoadStartCalled = false;
                        let uploadLoadCalled = false;

                        const xhr = new XMLHttpRequest();

                        const uploadExists = Boolean(xhr.upload);
                        const uploadIsInstance = xhr.upload instanceof XMLHttpRequestUpload;

                        xhr.upload.addEventListener("loadstart", () => {
                            uploadLoadStartCalled = true;
                        });

                        xhr.upload.addEventListener("progress", () => {
                            uploadProgressCalled = true;
                        });

                        xhr.upload.addEventListener("load", () => {
                            uploadLoadCalled = true;
                        });

                        xhr.open("POST", url);
                        xhr.setRequestHeader("Content-Type", "application/json");
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onload = () => {
                            // Give some time for upload events to fire
                            setTimeout(() => {
                                resolve({
                                    uploadExists,
                                    uploadIsInstance,
                                    uploadProgressCalled,
                                    uploadLoadCalled,
                                    uploadLoadStartCalled
                                });
                            }, 100);
                        };

                        xhr.send(JSON.stringify(requestBody));
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER, requestBody }
            );

            expect(result.uploadExists).toBe(true);
            expect(result.uploadIsInstance).toBe(true);
            expect(result.uploadProgressCalled).toBe(true);
            expect(result.uploadLoadCalled).toBe(true);
            expect(result.uploadLoadStartCalled).toBe(true);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle responseURL property correctly", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/responseurl-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, {
                query: { param1: "value1", param2: "value2" },
                responseBody: { url: "test" },
                status: 200
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{ before: string; after: string }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        const before = xhr.responseURL;

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onload = () => {
                            resolve({ before, after: xhr.responseURL });
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.before).toEqual("");
            expect(result.after).toContain("/api/responseurl-test");
            expect(result.after).toContain("param1=value1");
            expect(result.after).toContain("param2=value2");

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toContain(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle overrideMimeType function correctly", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/mimetype-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, {
                responseBody: { xml: "<xml><data>test</data></xml>" },
                responseHeaders: { "Content-Type": "application/xml" },
                status: 200
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{
                        overrideIsFunction: boolean;
                        status: number;
                        responseText: string;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);

                        const overrideIsFunction = typeof xhr.overrideMimeType === "function";

                        xhr.overrideMimeType("text/xml");

                        xhr.onload = () => {
                            resolve({
                                overrideIsFunction,
                                status: xhr.status,
                                responseText: xhr.responseText
                            });
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.overrideIsFunction).toBe(true);
            expect(result.status).toEqual(200);
            expect(result.responseText).toContain("<xml>");

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle responseXML property correctly", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/xml-test";

            await resetCounter(request, iTestId);

            const xmlContent = '<?xml version="1.0"?><root><item>test</item></root>';

            const url = buildUrl(testPath, {
                responseString: xmlContent,
                responseHeaders: { "Content-Type": "application/xml" },
                status: 200
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{ hasResponseXML: boolean }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.overrideMimeType("text/xml");

                        xhr.onload = () => {
                            resolve({ hasResponseXML: xhr.responseXML !== null });
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.hasResponseXML).toBe(true);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should throw error when accessing responseText with non-text responseType", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/responsetype-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, { responseBody: { data: "test" }, status: 200 });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{
                        responseType: string;
                        threwOnResponseText: boolean;
                        responseExists: boolean;
                    }>((resolve) => {
                        const xhr = new XMLHttpRequest();

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.responseType = "json";

                        const responseType = xhr.responseType;

                        xhr.onload = () => {
                            let threwOnResponseText = false;

                            try {
                                // Accessing responseText with responseType 'json' should throw
                                void xhr.responseText;
                            } catch {
                                threwOnResponseText = true;
                            }

                            resolve({
                                responseType,
                                threwOnResponseText,
                                responseExists: xhr.response !== null && xhr.response !== undefined
                            });
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.responseType).toEqual("json");
            expect(result.threwOnResponseText).toBe(true);
            expect(result.responseExists).toBe(true);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle different event types correctly", async ({
            page,
            request,
            interceptor
        }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/events-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, { responseBody: { events: "test" }, status: 200 });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{ events: string[] }>((resolve) => {
                        const events: string[] = [];

                        const xhr = new XMLHttpRequest();

                        xhr.addEventListener("loadstart", () => events.push("loadstart"));
                        xhr.addEventListener("load", () => events.push("load"));
                        xhr.addEventListener("loadend", () => events.push("loadend"));
                        xhr.addEventListener("readystatechange", () =>
                            events.push("readystatechange")
                        );
                        xhr.addEventListener("progress", () => events.push("progress"));
                        xhr.addEventListener("abort", () => events.push("abort"));
                        xhr.addEventListener("error", () => events.push("error"));
                        xhr.addEventListener("timeout", () => events.push("timeout"));

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);

                        xhr.onload = () => {
                            // Give some time for all events to fire
                            setTimeout(() => {
                                resolve({ events });
                            }, 100);
                        };

                        xhr.send();
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.events).toContain("loadstart");
            expect(result.events).toContain("load");
            expect(result.events).toContain("loadend");
            expect(result.events).toContain("readystatechange");

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle abort event correctly", async ({ page, request, interceptor }) => {
            const iTestId = getTestId(test.info());
            const testPath = "/api/abort-test";

            await resetCounter(request, iTestId);

            const url = buildUrl(testPath, {
                duration: 2000,
                responseBody: { test: "abort" },
                status: 200
            });

            const result = await page.evaluate(
                ({ url, iTestId, headerName }) =>
                    new Promise<{ abortCalled: boolean }>((resolve) => {
                        let abortCalled = false;

                        const xhr = new XMLHttpRequest();

                        xhr.onabort = () => {
                            abortCalled = true;
                        };

                        xhr.addEventListener("abort", () => {
                            // because `onabort` is called after `abort`
                            setTimeout(() => {
                                resolve({ abortCalled });
                            }, 100);
                        });

                        xhr.open("GET", url);
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.send();

                        // Abort the request shortly after it starts
                        setTimeout(() => {
                            xhr.abort();
                        }, 100);
                    }),
                { url, iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.abortCalled).toBe(true);

            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(1);
            expect(counter[0].url).toEqual(`http://${HOST}${testPath}`);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });

        test("should handle error event correctly", async ({ page, request, interceptor }) => {
            const iTestId = getTestId(test.info());

            await resetCounter(request, iTestId);

            const result = await page.evaluate(
                ({ iTestId, headerName }) =>
                    new Promise<{ errorCalled: boolean }>((resolve) => {
                        let errorCalled = false;

                        const xhr = new XMLHttpRequest();

                        xhr.onerror = () => {
                            errorCalled = true;
                        };

                        xhr.addEventListener("error", () => {
                            // because `onerror` is called after `error`
                            setTimeout(() => {
                                resolve({ errorCalled });
                            }, 100);
                        });

                        // Try to make a request to an invalid URL to trigger error
                        xhr.open("GET", "http://invalid-url-that-should-fail:1");
                        xhr.setRequestHeader(headerName, iTestId);
                        xhr.send();
                    }),
                { iTestId, headerName: I_TEST_ID_HEADER }
            );

            expect(result.errorCalled).toBe(true);

            // The invalid URL never reaches the test server, so nothing is logged.
            const counter = await getCounter(request, iTestId);

            expect(counter).toHaveLength(0);

            if (disableInterceptor) {
                expect(interceptor.getStats()).toHaveLength(0);
            }
        });
    });
};

// tests with the interceptor disabled (original fetch/xhr behaviour)
createTests(true);
// tests with the interceptor enabled
createTests(false);
